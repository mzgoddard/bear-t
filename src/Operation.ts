import Pot from './Option';

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
    scopeIndex: number = -1;

    constructor(name: Name, type: new () => Type) {
        this.name = name;
        this.type = type;
    }
}

const arg = <Name extends string, Type>(name: Name, type: new () => Type = null) => new Arg(name, type);

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

type AtomArg = Arg | Atom | boolean | number | string | symbol;

type AtomArgs = AtomArg[];

type AtomTarget = {};

class Atom {
    rule: Rule;
    args: AtomArgs;
}

enum RuleType {
    JS = 'JS',
    Atom = 'ATOM',
    Primitive = 'PRIMITIVE',
}

interface RuleBase {
    (...args: AtomArgs): Atom;
    readonly args: Arg[];
}

interface JSRule extends RuleBase {
    readonly type: RuleType.JS;
    args: Arg[],
    body: JSBody<ArgAddresses<Arg[]>>,
}

interface AtomRule extends RuleBase {
    readonly type: RuleType.Atom;
    operations: Operation[];
}

type PrimitiveName = 'and' | 'or' | 'cut';

interface PrimitiveRule extends RuleBase {
    readonly type: RuleType.Primitive;
    readonly primitive: PrimitiveName;
}

type Rule = JSRule | AtomRule | PrimitiveRule;

type JSBody<Addresses extends Addr[]> = (...args: Addresses) => Promise<boolean | void> | boolean | void;

type ArgAddress<A> = A extends Arg<string, infer Type> ? Addr<Type> : A;

type ArgAddresses<Args extends Arg[]> = {[key in keyof Args]: ArgAddress<Args[key]>};

const jsrule = <Args extends Arg[], Body extends JSBody<ArgAddresses<Args>>>(args: Args, body: Body): JSRule => {
    return Object.assign((...atomArgs) => new Atom(), {
        type: RuleType.JS as const,
        args,
        body,
    });
};

const compilePrimArm = (arm: AtomArg, scope) => {
    if (arm instanceof Atom) {
        return compile(arm, scope);
    } else if (arm instanceof Arg) {
        // operations.push(...compile(arm, scope).operations);
    } else {
        // operations.push(...compile(arm, scope).operations);
    }
};

const compile = (atom: Atom, scope = {}) => {
    const operations = [] as Operation[];

    if (atom.rule.type === RuleType.JS) {
        const call = new JSCall(atom.rule.args, atom.rule.body);
        operations.push(call);
    } else if (atom.rule.type === RuleType.Atom) {
        const call = new Call();
        operations.push(call);
    } else if (atom.rule.type === RuleType.Primitive) {
        switch (atom.rule.primitive) {
            case 'and':
                operations.push(...compilePrimArm(atom.args[0], scope).operations);
                operations.push(...compilePrimArm(atom.args[1], scope).operations);
                break;
            case 'or':
                const branchOp = new Branch();
                const branchElse = new BranchElse();
                const index = operations.length;
                operations.push(branchOp);
                operations.push(...compilePrimArm(atom.args[0], scope).operations);
                const indexElse = operations.length;
                branchOp.else = indexElse - index;
                branchElse.branch = index - indexElse;
                operations.push(branchElse);
                operations.push(...compilePrimArm(atom.args[1], scope).operations);
                break;
            case 'cut':
                operations.push(new Cut());
                break;
            default:
            throw new Error('Unknown primitive atom. ' + atom.rule.name);
        }
    }

    return {scope, operations};
};

const rule = <Args extends Arg[], Body extends Atom>(args: Args, body: Body): AtomRule => {
    const {scope, operations} = compile(body);
    return Object.assign((...atomArgs) => new Atom(), {
        type: RuleType.Atom as const,
        args,
        body,
        scope,
        operations: [new CallStart(), ...operations],
    });
};

const primRule = <Args extends Arg[], Prim extends PrimitiveName>(args: Args, primitive: Prim): PrimitiveRule => {
    return Object.assign((...atomArgs) => new Atom(), {
        type: RuleType.Primitive as const,
        args,
        primitive,
    });
};

const and = primRule([arg('left', Atom), arg('right', Atom)], 'and');
const or = primRule([arg('left', Atom), arg('right', Atom)], 'or');
const cut = primRule([], 'cut');

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
    readonly rule: AtomRule;
    instruction: number = 0;

    scope: Address[];
    writes: WriteStack = null;

    constructor(rule: AtomRule) {
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
        const lastActive = activeThread;
        activeThread = this;
        const result = Pot.create(guard());
        activeThread = lastActive;
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
    rule: AtomRule;
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
    jsFunc: (...args: Addr[]) => Promise<boolean | void> | boolean | void;
    args: (Arg | Atom | boolean | number | string | symbol)[];

    constructor(args: JSCall['args'], jsFunc: JSCall['jsFunc']) {
        this.args = args;
        this.jsFunc = jsFunc;
    }

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
        thread.stack.frame.instruction += this.else + 1;
    }
}

class BranchElse implements Operation {
    branch: number;

    down = null;
    up(thread: Thread) {
        thread.stack.frame.instruction += this.branch - 1;
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
