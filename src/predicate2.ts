import { threadId } from "worker_threads";

console.log('開始');

type ScopeMap = Readonly<{[key: string]: string}>;
type Scope = {[key: string]: any};

class FieldSet {
    readonly keys: Readonly<string[]>;
    readonly fromKeys: Readonly<string[]>;
    readonly extraKeys: (string | Arg)[] = [];
    values: any[];
    readonly next: FieldSet;

    changed: boolean = false;
    isDestroyed: boolean = false;

    constructor(map: ScopeMap, scope: {[key: string]: any});
    constructor(map: ScopeMap, next: FieldSet);
    constructor(keys: Readonly<string[]>, fromKeys: Readonly<string[]>, values: any[], next: FieldSet);
    constructor(...args: [ScopeMap, {[key: string]: any}] | [ScopeMap, FieldSet] | [Readonly<string[]>, Readonly<string[]>, any[], FieldSet]) {
        if (args.length === 2) {
            const [map, next] = args;
            this.keys = Object.keys(map);
            this.fromKeys = Object.values(map);
            if (next instanceof FieldSet) {
                this.values = this.fromKeys.map(key => next.read(key));
                this.next = next;
            } else {
                this.values = this.fromKeys.map(key => next[key]);
                this.next = null;
            }
        } else {
            [this.keys, this.fromKeys, this.values, this.next] = args;
        }
    }

    read(key: string | Arg) {
        if (this.isDestroyed) return null;
        let index = typeof key === 'string' ? this.keys.indexOf(key) : this.extraKeys.indexOf(key);
        if (index === -1) index = this.extraKeys.indexOf(key, this.keys.length);
        return this.values[index];
    }

    write(key: string | ArgImplementation | Arg & {write(): void}, value: any) {
        if (!this.changed) {
            this.values = this.values.slice();
            this.changed = true;
        }
        let index = typeof key === 'string' ? this.keys.indexOf(key) : this.extraKeys.indexOf(key);
        if (index === -1) {
            index = this.keys.length + this.extraKeys.length;
            this.extraKeys[index] = key;
        }
        return this.values[index] = value;
    }

    property(key: string) {
        return {
            get() {
                return this.read(key);
            },
            set(value) {
                return this.write(key, value);
            },
        };
    }

    remap(map: ScopeMap) {
        const query = {};
        for (const key in map) {
            Object.defineProperty(query, key, this.property(map[key]));
        }
        return query;
    }

    result() {
        const answer = {};
        for (const key of this.keys) {
            if (typeof key === 'string') {
                answer[key] = this.read(key);
            }
        }
        return answer;
    }

    clone() {
        this.changed = false;
        const newFields = new FieldSet(this.keys, this.fromKeys, this.values, this.next);
        newFields.extraKeys.push(...this.extraKeys);
        return newFields;
    }

    push(map: ScopeMap, next: FieldSet) {
        return new FieldSet(map, next);
    }

    pop() {
        const nextClone = this.next.clone();
        this.fromKeys.forEach((fromKey, index) => (
            nextClone.write(fromKey, this.read(this.keys[index]))
        ));
        return nextClone;
    }
}

class ThreadFrame {
    predicate: Predicate;
    next: ThreadFrame;
    after: ThreadFrame;

    constructor(predicate, next = sentinel, after = sentinel) {
        this.predicate = predicate;
        this.next = next;
        this.after = after;
    }
}

const sentinel = new ThreadFrame(null, null, null);

class Thread {
    fields: FieldSet;
    frame: ThreadFrame;
    previous: ThreadFrame;
    backtrack: Pick<Thread, 'fields' | 'frame' | 'previous' | 'backtrack'>;

    constructor(scope: {[key: string]: any}, main: Predicate) {
        this.backtrack = {fields: null, frame: null, previous: null, backtrack: null};
        this.fields = new FieldSet(main.scopeMap, scope);
        this.frame = new ThreadFrame(main);
        this.previous = sentinel;
    }

    ifThen(pred: Predicate) {
        this.frame.next = new ThreadFrame(pred, this.frame.next);
    }

    elseThen(pred: Predicate) {
        const fields = this.fields;
        this.fields = this.fields.clone();
        this.backtrack = {
            fields,
            frame: new ThreadFrame(pred, this.frame.next),
            previous: new ThreadFrame(this.frame.predicate, this.previous),
            backtrack: this.backtrack,
        };
    }

    again(pred: Predicate) {
        const fields = this.fields;
        this.fields = this.fields.clone();
        this.backtrack = {
            fields,
            frame: new ThreadFrame(pred, this.frame.next),
            previous: this.previous,
            backtrack: this.backtrack,
        };
    }

    rewind() {
        let oldFields = this.fields;
        Object.assign(this, this.backtrack);
        while (oldFields && (!this.fields || oldFields !== this.fields.next)) {
            oldFields.isDestroyed = true;
            oldFields = oldFields.next;
        }
    }

    async run() {
        if (!this.frame.predicate) {
            this.rewind();
        }
        while (this.frame.predicate) {
            const result = await this.frame.predicate.call(this.fields, this);
            if (result === false) {
                this.rewind();
            } else {
                this.previous = new ThreadFrame(this.frame.predicate, this.previous);
                this.frame = this.frame.next;
            }
        }
        return this.fields.result();
    }
}

type PredicateFunction = (args: Scope, thread: Thread) => Promise<boolean> | boolean;
type PredicateLike = boolean | PredicateFunction | Predicate;
type PredicateArgShortContext = Readonly<string[]>;
type PredicateBaseContext = {
    readonly args?: Readonly<string[] | {[key: string]: string}>;
};
type PredicateAndContext = {
    left: Predicate;
    right: Predicate;
};
type PredicateContext = PredicateArgShortContext | PredicateBaseContext | PredicateAndContext;

function pushScope(scopeMap: ScopeMap, thread: Thread) {
    thread.fields = new FieldSet(scopeMap, thread.fields);
    return true;
}
function popScope(thread: Thread) {
    thread.fields = thread.fields.pop();
    return true;
}
function andFunc() {return true;}
function orFunc() {return true;}
function set(scope) {
    const value = scope.right instanceof Arg && scope.right.value !== null ? scope.right.value : scope.right;
    if (scope.left instanceof Arg) {
        const left: Arg = scope.left;
        if (left.isNull()) {
            left.write(value);
            return true;
        }
        return false;
    }
    else scope.left = value;
}
function replace(scope) {
    scope.left = scope.right;
    return true;
}

type PredicateArgs = (
    [PredicateContext, boolean | PredicateFunction] |
    [PredicateContext, Predicate]
);

class Predicate {
    func: PredicateFunction;
    context: PredicateContext;
    scopeMap: ScopeMap;

    constructor(context: PredicateContext, func: boolean | PredicateFunction);
    constructor(context: PredicateContext, func: Predicate);
    constructor(...args: PredicateArgs);
    constructor(...args: PredicateArgs) {
        const [context, func] = args;
        this.context = context;
        if (typeof func === 'function') {
            this.func = func;
        } else if (typeof func === 'boolean') {
            this.func = () => func;
        } else {
            this.func = (scope, thread) => {
                thread.ifThen(func);
                return true;
            };
        }

        if (Array.isArray(context)) {
            context;
        } else if ('args' in context) {
            if (Array.isArray(context.args)) {
                this.scopeMap = context.args.reduce((carry, key) => (carry[key] = key, carry), {});
            } else {
                const scopeMap = {};
                for (const key in context.args) {
                    scopeMap[key] = context.args[key];
                }
                this.scopeMap = scopeMap;
            }
        } else {
            this.scopeMap = {};
        }
    }

    call(fields: FieldSet, thread: Thread) {
        return this.func.call(this, fields.remap(this.scopeMap), thread);
    }

    and(context: PredicateContext, func: boolean | PredicateFunction): Predicate;
    and(context: PredicateContext, func: Predicate): Predicate;
    and(...args: PredicateArgs): Predicate;
    and(...args: PredicateArgs) {
        return new Predicate({left: this, right: new Predicate(...args)}, andFunc);
    }

    static and(first: PredicateArgs, ...args: PredicateArgs[]) {
        return args.reduce((p, pargs) => p.and(...pargs), new Predicate(...first));
    }
}

const {and} = Predicate;

type StrictArg = Arg | Arg[] | {[key in string | number]: Arg};
type StrictArgSet = Arg[] | {[key in string | number]: Arg};
type BindArg = Arg | string | number | boolean | symbol | BindArg[] | {[key in string | number]: BindArg};
type StaticArg = string | number | boolean | symbol | StaticArg[] | {[key in string | number]: StaticArg};
type ObjectArg = StaticArg[] | {[key in string | number]: StaticArg};

interface WriteableArg {
    write(value: any): void;
}

abstract class Arg {
    readonly name: string;

    protected fields: FieldSet = null;
    protected readonly thread: Thread;

    protected readonly _args: StrictArgSet;
    protected readonly _normal: ObjectArg;

    constructor(name: string);
    constructor(name: string, thread: Thread);
    constructor(args: StrictArgSet, normal: ObjectArg);
    constructor(name: string, args: StrictArgSet, normal: ObjectArg);
    constructor(name: string, args: StrictArgSet, normal: ObjectArg, thread: Thread);
    constructor(...args: [string] | [string, Thread] | [StrictArgSet, ObjectArg] | [string, StrictArgSet, ObjectArg] | [string, StrictArgSet, ObjectArg, Thread]) {
        if (args.length === 1) {
            [this.name] = args;
        } else if (args.length === 2) {
            const [arg0, arg1] = args;
            if (typeof arg0 === 'string' && arg1 instanceof Thread) {
                this.name = arg0;
                this.thread = arg1;
            } else if (typeof arg0 !== 'string' && !(arg1 instanceof Thread)) {
                this._args = arg0;
                this._normal = arg1;
                this.initObjectValue();
            }
        } else {
            [this.name, this._args, this._normal, this.thread] = args;
            this.initObjectValue();
        }
    }

    abstract get value(): any;

    isNull(): this is WriteableArg {
        return this.fields === null || this.fields.read(this) === null;
    }

    initObjectValue() {
        const {_args: args, _normal: normal} = this;
        if (Array.isArray(args) && Array.isArray(normal)) {
            const value: (Arg | StaticArg)[] = normal.slice();
            for (let i = 0; i < value.length; i++) {
                if (args[i]) value[i] = args[i];
            }
            if (this.thread && this.isNull()) this.write(value);
        } else {
            const value = {...normal, ...args};
            for (const key in args) {
                value[key] = args[key].clone(this.thread);
            }
            if (this.thread && this.isNull()) this.write(value);
        }
    }

    clone(thread?: Thread): Arg {
        if (this._args) {
            return new ArgImplementation(this.name, this._args, this._normal, thread);
        }
        return new ArgImplementation(this.name, thread);
    }

    static bind(arg: BindArg): Arg | StaticArg;
    static bind(name: string, arg: BindArg): Arg | StaticArg;
    static bind(...args: [BindArg] | [string, BindArg]): Arg | StaticArg {
        let name: string;
        let arg: BindArg;
        if (args.length === 1) {
            [arg] = args;
        } else {
            [name, arg] = args;
        }

        if (arg instanceof ArgImplementation) {
            return arg.clone();
        } else if (Array.isArray(arg)) {
            let args: Arg[];
            let normal: StaticArg[] = Array.from(arg, () => null);
            for (let i = 0; i < arg.length; i++) {
                const copy = Arg.bind(arg[i]);
                if (copy instanceof Arg) {
                    if (!args) args = Array.from(arg, () => null);
                    args[i] = copy;
                } else {
                    if (!normal) normal = Array.from(arg, () => null);
                    normal[i] = copy;
                }
            }
            if (args) {
                return new ArgImplementation(name, args, normal);
            } else {
                return normal;
            }
        } else if (typeof arg === 'object') {
            let args: {[key in string | number]: Arg};
            let normal: {[key in string | number]: StaticArg} = {};
            for (const key in arg) {
                const copy = Arg.bind(arg[key]);
                if (copy instanceof Arg) {
                    if (!args) args = {};
                    args[key] = copy;
                } else {
                    if (!normal) normal = {};
                    normal[key] = copy;
                }
            }
            if (args) {
                return new ArgImplementation(name, args, normal);
            } else {
                return normal;
            }
        }
        return arg;
    }
}

class ArgImplementation extends Arg implements WriteableArg {
    get value() {
        if (this.fields) return this.fields.read(this);
        return null;
    }

    write(value: any): void {
        if (this.isNull()) {
            this.fields = this.thread.fields;
            this.fields.write(this, value);
        } else {
            throw new Error('Cannot write to an already set argument. It must be cleared while backtracking.');
        }
    }
}

class AnonymousArg extends ArgImplementation {
    constructor(name: string = 'anonymous') {
        super(name);
    }
    get value() {return null;}
    write(value: any): void {}
    isNull(): this is WriteableArg {return true;}
    clone(): Arg {
        return new AnonymousArg(this.name);
    }
}

interface ArgFactory {};
interface ProxyArgs extends ArgFactory {
    bind: (arg: any) => ArgImplementation;
}

const Args = new Proxy<{[key: string]: Arg}>({
    _: new AnonymousArg('anonymous'),
}, {
    get(target, property) {
        if (typeof property === 'string') {
            if (!target[property]) {
                return new ArgImplementation(property, null);
            }
            return target[property];
        }
    }
});

function match(scope: Scope & {a: any, b: any}) {
    return true;
}
function write(obj: Arg | StaticArg) {
    return (scope: Scope, thread: Thread) => {
        scope.a = obj instanceof ArgImplementation ? obj.clone(thread) : obj;
        return true;
    };
}
new Predicate({args: ['a', 'b']}, match);
const matchKey = new Predicate(['b', 'k'],
    and(
        [['a'], write(Arg.bind({key: Args.k, value: Args._}))],
        [['a', 'b'], match],
    )
);

function assertLine(n = 3) {
    return new Error().stack.split('\n')[n].split('.ts:')[1];
}

function assert(truthy: boolean, msg: string) {
    if (!truthy) console.warn(msg);
    else process.stdout.write('.');
}

assert.equals = (a, b, msg: string = `${a} === ${b} (${assertLine()})`) => assert(a === b, msg);
assert.throws = (f, e_ = Error, msg: string = `${f.name} throws ${e_} (${assertLine()})`) => {
    try {
        f();
    } catch (e) {
        assert(e instanceof e_, msg);
    }
}

{
    console.log('FieldSet');
    const fields = new FieldSet({a: 'a', b: 'b'}, {a: 1, b: 2});
    assert(fields.read('a') === 1, 'fields.read(a) === 1');
    fields.write('b', 3);
    assert(fields.read('b') === 3, 'fields.write(b, 3) overwrites 2');
    const fields2 = new FieldSet({b: 'a', a: 'c'}, fields);
    assert(fields2.read('a') === undefined, `a (${fields.read('a')}) === c (undefined)`);
    assert(fields2.read('b') === 1, `b (${fields.read('b')}) === a (1)`);
    fields2.write('a', 5);
    const fields1s = fields2.pop();
    assert.equals(fields.read('c'), undefined);
    assert.equals(fields1s.read('c'), 5);
    console.log(fields1s.result());
}

{
    console.log('Arg');
    const t = new Thread({}, new Predicate({args: {}}, true));
    t.elseThen(new Predicate({}, true));
    const arg = new ArgImplementation('arg', null);
    assert.equals(arg.value, null);
    assert.throws(() => (arg.write('value')));
    const argt = new ArgImplementation('argt', t);
    argt.write('value');
    assert.throws(() => (argt.write('value')));
    assert.equals(argt.value, 'value');
    assert.equals(t.fields.read(argt), 'value');
    const arg2 = new ArgImplementation('2', t);
    // pushScope({}, t);
    arg2.write('2');
    // console.log(t.fields);
    t.elseThen(new Predicate({}, true));
    // console.log(t.fields);
    assert.equals(arg2.value, '2');
    // pushScope({}, t);
    assert.equals(arg2.value, '2');
    t.rewind();
    // console.log(t.fields);
    assert.equals(arg2.value, '2');
    t.rewind();
    assert.equals(arg2.value, null);
    arg2.write('3');
    assert.equals(arg2.value, '3');
}

console.log('\n終わり');
