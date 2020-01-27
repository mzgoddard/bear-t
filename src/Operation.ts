import Pot from './Option';
import { write } from 'fs';

type Primitive<Type> = (
    Type extends Boolean ? boolean :
    Type extends Number ? number :
    Type extends String ? string :
    Type extends Symbol ? symbol :
    Type
);

class Arg<Name extends string = string, Type = any> {
    readonly name: Name;
    readonly type: new () => Type;
    scopeIndex: number;
}

interface Write {
    readonly instruction: number;

    undo(): void;
}

class SingleWrite<Value = any> implements Write {
    readonly instruction: number;
    readonly address: Address<Value>;
    readonly oldValue: Primitive<Value>;

    constructor(instruction: number, address: Address<Value>, oldValue: Primitive<Value>) {
        this.instruction = instruction;
        this.address = address;
        this.oldValue = oldValue;
    }

    undo() {
        this.address.value = this.oldValue;
    }
}

class MultiWrite implements Write {
    readonly instruction: number;
    readonly stack: WriteStack;

    constructor(instruction: number, stack: WriteStack) {
        this.instruction = instruction;
        this.stack = stack;
    }

    undo() {
        this.stack.undoAll();
    }
}

interface Addr<Type = any> {
    get(): Primitive<Type>;
    set(value: Primitive<Type>): void;
}

class Address<Type = any> implements Addr<Type> {
    value: Primitive<Type>;
    get() {
        return this.value;
    }
    set(value: Primitive<Type>) {
        const frame = Thread.active.stack.frame;
        frame.writes.push(new SingleWrite(frame.instruction, this, this.value));
        this.value  = value;
    }
}

class Scope {
    values: any[];
}

interface ScopedArg<Value = any> {
    get(): Primitive<Value>;
    set(value: Primitive<Value>): void;
}

interface Operation {
    down: (thread: Thread) => Pot<void> | void;
    up: (thread: Thread) => Pot<void> | void;
}

type AtomArgs = {};

class Atom {}

interface Rule {
    args: Arg[];
    scope: Arg[];
    operations: Operation[];
}

class IndexMemo<Input, Output> {
    cache: Output[] = [];

    indexOf: (input: Input) => number;
    create: (input: Input) => Output;

    constructor(indexOf: IndexMemo<Input, Output>['indexOf'], create: IndexMemo<Input, Output>['create']) {
        this.indexOf = indexOf;
        this.create = create;
    }

    get(input: Input) {
        const index = this.indexOf(input);
        if (this.cache[index]) return this.cache[index];
        return this.cache[index] = this.create(input);
    }
}

class Frame {
    readonly rule: Rule;
    instruction: number = 0;

    scope: Address[];
    writes: WriteStack = null;

    constructor(rule: Rule) {
        this.rule = rule;

        this.scope = [];
        this.writes = null;
    }

    address<Type>(arg: Arg<string, Type>): Address<Type> {
        if (this.scope[arg.scopeIndex]) return this.scope[arg.scopeIndex];
        return this.scope[arg.scopeIndex] = new Address();
    }

    down(thread: Thread) {
        this.popWrites();
        const op = this.rule.operations[this.instruction];
        if (op.down) return op.down(thread);
        this.instruction += 1;
    }

    up(thread: Thread) {
        this.popWrites();
        const op = this.rule.operations[this.instruction];
        if (op.up) return op.up(thread);
        this.instruction -= 1;
    }

    popWrites() {
        if (this.writes !== null) this.writes.undoSince(this.instruction);
    }

    lastWrite() {
        return this.writes === null ?
            new SingleWrite(Number.MIN_SAFE_INTEGER, new Address(), null) :
            this.writes.last();
    }
}

class WriteLink {
    readonly write: Write;
    readonly previous: WriteLink;

    constructor(write: Write, previous: WriteLink) {
        this.write = write;
        this.previous = previous;
    }
}

class WriteStack {
    link: WriteLink = null;

    last() {
        return this.link ? this.link.write : new SingleWrite(Number.MIN_SAFE_INTEGER, new Address(), null);
    }

    push(write: SingleWrite) {
        this.link = new WriteLink(write, this.link);
    }

    pushStack(writeStack: MultiWrite) {
        this.link = new WriteLink(writeStack, this.link);
    }

    pop() {
        if (this.link) this.link = this.link.previous;
    }

    undoSince(instruction: number) {
        let lastWrite = this.last();
        while (lastWrite.instruction >= instruction) {
            lastWrite.undo();
            this.pop();
            lastWrite = this.last();
        }
    }

    undoAll() {
        this.undoSince(0);
    }
}

class FrameLink {
    readonly frame: Frame;
    readonly caller: FrameLink;
    next: FrameLink;

    constructor(frame: Frame, caller: FrameLink, next: FrameLink) {
        this.frame = frame;
        this.caller = caller;
        this.next = next;
    }
}

class FrameStack {
    link: FrameLink;

    get frame() {
        return this.link ? this.link.frame : null;
    }

    down() {
        this.link = this.link.next;
    }

    up() {
        this.link = this.link.caller;
    }

    push(frame: Frame) {
        this.link.next = new FrameLink(frame, this.link, this.link.next);
        this.link = this.link.next;
    }

    pop() {
        this.link = this.link.caller;
        this.link.next = this.link.next.next;
    }
}

let activeThread: Thread = null;

class Thread {
    stack: FrameStack;
    direction: -1 | 0 | 1 = 1;
    _answer = null;

    static get active() {
        if (activeThread === null) {
            throw new Error('Must set an active thread with lockActive to make it writeable.');
        }
        return activeThread;
    }

    lockActive(guard: () => Pot<void> | void): Pot<void> {
        const lastCurrent = activeThread;
        activeThread = this;
        const result = Pot.create(guard());
        activeThread = lastCurrent;
        return result;
    }

    step(): Pot<any> {
        if (this.direction === 1) {
            return this.lockActive(() => this.stack.frame.down(this));
        } else if (this.direction === -1) {
            return this.lockActive(() => this.stack.frame.up(this));
        } else return Pot.create(this._answer);
    }

    loop() {
        return this.step().map(answer => this.direction === 0 ? answer : this.loop());
    }

    answer(): Pot<any> {
        if (this.direction === 0 && this._answer.length === 0) return Pot.create(this._answer);
        this._answer = null;
        return this.loop();
    }

    syncAnswer(): any {
        const job = this.answer();
        if (job.isPromise()) throw new Error('Tried to get a synchronous answer from an asynchronous thread.');
        return job.unwrap();
    }

    asyncAnswer(): Promise<any> {
        return Promise.resolve(this.answer().unwrap());
    }
}

class Call implements Operation {
    rule: Rule;
    args: (Arg | Atom | boolean | number | string | symbol)[];

    down(thread: Thread) {
        const caller = thread.stack.frame;

        const frame = new Frame(this.rule);
        let i = 0;
        for (const arg of this.args) {
            let addr: Address;
            if (arg instanceof Arg) {
                addr = caller.address(arg);
            } else if (arg instanceof Atom) {
                addr = arg.toAddress(caller);
            } else {
                addr = new Address();
                addr.value = arg;
            }
            frame.scope[this.rule.args[i].scopeIndex] = addr;
            i += 1;
        }

        thread.stack.push(frame);
    }
    up(thread: Thread) {
        // Pop the multi stack pushed when the call returned.
        thread.stack.frame.writes.pop();
        thread.stack.down();
    }
}

class CallStart implements Operation {
    down = null;
    up(thread: Thread) {
        thread.stack.pop();
        thread.stack.frame.instruction -= 1;
    }
}

class Return implements Operation {
    down(thread: Thread) {
        const writeStack = thread.stack.frame.writes;
        thread.stack.up();
        const multiWrite = new MultiWrite(thread.stack.frame.instruction - 1, writeStack);
        thread.stack.frame.writes.pushStack(multiWrite);
        thread.stack.frame.instruction += 1;
    }
    up = null;
}

class JSCall implements Operation {
    jsFunc: (...args: Addr[]) => Pot<boolean | void> | boolean | void;
    args: (Arg | Atom | boolean | number | string | symbol)[];

    down(thread: Thread) {
        const caller = thread.stack.frame;

        const addrs = this.args.map(arg => {
            let addr: Address;
            if (arg instanceof Arg) {
                addr = caller.address(arg);
            } else if (arg instanceof Atom) {
                addr = arg.toAddress(caller);
            } else {
                addr = new Address();
                addr.value = arg;
            }
            return addr;
        });

        return Pot.create(this.jsFunc(...addrs))
        .map(value => {
            if (value === false) {
                thread.direction = -1;
            } else {
                thread.stack.frame.instruction += 1;
            }
        });
    };
    up: null;
}

class Branch implements Operation {
    else: number;

    down = null;
    up(thread: Thread) {
        thread.direction = 1;
        thread.stack.frame.instruction = this.else + 1;
    }
}

class BranchElse implements Operation {
    branch: number;

    down = null;
    up(thread: Thread) {
        thread.stack.frame.instruction = this.branch - 1;
    }
}

class Repeat implements Operation {
    down = null;
    up(thread: Thread) {
        thread.direction = 1;
        thread.stack.frame.instruction += 1;
    }
}

class Cut implements Operation {
    down = null;
    up(thread: Thread) {
        thread.stack.frame.instruction = 0;
        thread.stack.frame.popWrites();
    }
}
