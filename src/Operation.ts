import Pot from './Option';

type Primitive<Type> = (
    Type extends Boolean ? boolean :
    Type extends Number ? number :
    Type extends String ? string :
    Type extends Symbol ? symbol :
    Type
);

class Arg<Name extends string = string, Type = any> {
    name: Name;
    type: new () => Type;
    scopeIndex: number;
}

class Write<Value = any> {
    instruction: number;
    scopeIndex: number;
    oldValue: Value;

    constructor(instruction: number, scopeIndex: number, oldValue: Value) {
        this.instruction = instruction;
        this.scopeIndex = scopeIndex;
        this.oldValue = oldValue;
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

class Call implements Operation {

}

class Return implements Operation {

}

class Statement implements Operation {
    task;

    down(thread: Thread) {
        return Pot.create(this.task())
        .map(value => {
            if (value === false) {
                thread.direction = -1;
            } else {
                thread.frame.instruction += 1;
            }
        });
    };
    up: null;
}

class Branch implements Operation {
    next: number;

    down: null;
    up(thread) {
        thread.direction = 1;
        thread.frame.instruction = this.next;
    }
}

class Repeat implements Operation {
    down: null;
    up(thread) {
        thread.direction = 1;
        thread.frame.instruction += 1;
    }
}

/** A Cut is a Return that happens when going back up. */
class Cut implements Operation {
    down(thread) {
        let frame;
        while (frame = thread.frame.next) {
            frame.instruction = Number.MAX_SAFE_INTEGER;
        }
    }
    up(thread) {

    }
}

type AtomArgs = {};

class Atom {}

class Rule {
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
    rule: Rule;
    parent: Frame;
    next: Frame = null;

    instruction: number = 0;

    scope: any[];
    scopedArgs: IndexMemo<Arg, ScopedArg>;
    writes: Write[] = null;

    constructor(rule: Rule, parent: Frame = null) {
        this.rule = rule;
        this.parent = parent;

        this.scope = [];
        this.scopedArgs = new IndexMemo(arg => arg.scopeIndex, arg => ({
            get: () => this.read(arg),
            set: value => this.write(arg, value),
        }));
        this.writes = null;
    }

    get root(): Frame {
        if (this.parent) return this.parent.root;
        return this;
    }

    read<Type>(arg: Arg<string, Type>): Primitive<Type> {
        return this.scope[arg.scopeIndex];
    }

    write<Type>(arg: Arg<string, Type>, value: Primitive<Type>) {
        if (this.writes === null) this.writes = [];
        this.writes.push(new Write(this.instruction, arg.scopeIndex, this.read(arg)));
        this.scope[arg.scopeIndex] = value;
    }

    scopeArg<Type>(arg: Arg<string, Type>): ScopedArg<Type> {
        return this.scopedArgs.get(arg);
    }

    down(thread: Thread) {
        this.popWrites();
        return this.rule.operations[this.instruction].down(thread);
    }

    up(thread: Thread) {
        return this.rule.operations[this.instruction].up(thread);
    }

    popWrites() {
        let lastWrite = this.lastWrite();
        while (lastWrite.instruction >= this.instruction) {
            this.scope[lastWrite.scopeIndex] = lastWrite.oldValue;
            this.writes.pop();
            lastWrite = this.lastWrite();
        }
    }

    lastWrite() {
        return this.writes === null ? new Write(Number.MAX_SAFE_INTEGER, -1, null) : this.writes[this.writes.length - 1];
    }
}

class  Thread {
    frame: Frame;
    direction: -1 | 1 = 1;
    _answer = null;

    step(): Pot<any> {
        let job: Pot<void> | void;
        if (this.direction === 1) job = this.frame.down(this);
        else job = this.frame.up(this);

        return Pot.create(job).map(() => {
            if (this._answer === null) this.step();
            else this._answer;
        });
    }

    answer(): Pot<any> {
        if (Array.isArray(this._answer) && this._answer.length === 0) return Pot.create(this._answer);
        this._answer = null;
        return this.step();
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
