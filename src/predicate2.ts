import { threadId } from "worker_threads";
import { timingSafeEqual } from "crypto";
import { RSA_PKCS1_OAEP_PADDING } from "constants";

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

    write(key: string | ArgImpl | Arg & {write(): void}, value: any) {
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

function pushScope(scopeMap: ScopeMap, thread: Thread): void {
    thread.fields = new FieldSet(scopeMap, thread.fields);
}
function popScope(scope: Scope, thread: Thread) {
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

function isReadonlyStringArray(array: any): array is Readonly<string[]> {
    return Array.isArray(array);
}

function scopeMapFromContext(context: PredicateContext): ScopeMap {
    if (typeof context === 'string') {
        return {};
    } else if (isReadonlyStringArray(context)) {
        return context.reduce((carry, key) => Object.assign(carry, {[key]: key}), {});
    } else if ('args' in context) {
        if (isReadonlyStringArray(context.args)) return scopeMapFromContext(context.args);
        return context.args;
    }
    return {};
}

function isBaseContext(context: PredicateContext): context is PredicateBaseContext<CArgsFrom<typeof context>> {
    return typeof context === 'object' && 'args' in context;
}

function isAndContext(context: PredicateContext): context is PredicateAndContext {
    return typeof context === 'object' && 'left' in context;
}

function normalizeContext<PS, C extends PredicateContext>(context: C): PredicateNormContext<PS, ScopeMapFrom<CArgsFrom<C>>> {
    let name: string = 'anonymous';
    let cargs: PredicateContextArgs;
    let args: ScopeMapFrom<CArgsFrom<C>>;
    let left: Predicate = null;
    let right: Predicate = null;
    if (typeof context === 'string') {
        name = context;
    } else if (isReadonlyStringArray(context)) {
        cargs = context;
    } else if (isBaseContext(context)) {
        name = context.name;
        cargs = context.args;
    } else if (isAndContext(context)) {
        ({name, left, right} = context);
    }
    if (isReadonlyStringArray(cargs)) {
        args = cargs.reduce((carry, key) => Object.assign(carry, {[key]: key}), {}) as typeof args;
    } else {
        args = cargs as typeof args;
    }
    return {
        name,
        args,
        left,
        right,
    };
}

function trueFunction() {return true;}
function falseFunction() {return false;}
function callNestedPredicate<P extends Predicate, S = P extends Predicate<infer PS> ? PS : Scope>(func: P): PredicateFunction<S> {
    return (scope, thread) => {
        thread.ifThen(popScopePredicate);
        thread.ifThen(func);
        pushScope(this.scopeMap, thread);
        return true;
    };
};

function funcFromPredicateLike<F extends PredicateLike, S = F extends PredicateLike<infer PS> ? PS : Scope>(func: F): PredicateFunction<S> {
    if (typeof func === 'function') {
        return func as PredicateFunction<S>;
    } else if (typeof func === 'boolean') {
        if (func === true) return trueFunction;
        return falseFunction;
    }
    return callNestedPredicate(func as Predicate<S>);
}

type PredicateFunction<S extends Scope = Scope> = (args: S, thread: Thread) => Promise<boolean> | boolean;
type PredicateLike<S extends Scope = Scope> = boolean | PredicateFunction<S> | Predicate<S>;

type PredicateNameContext = string;
type PredicateArgShortContext<K extends string = string> = Readonly<K[]>;
type PredicateContextArgs<K extends string = string, V extends string = string> = PredicateArgShortContext<K> | Readonly<{[key in K]: V}>;
type PredicateBaseContext<Args extends PredicateContextArgs> = {
    readonly name?: string;
    readonly args?: Args;
};
type PredicateAndContext = {
    readonly name?: string;
    left: Predicate;
    right: Predicate;
};
type PredicateContext<Args extends PredicateContextArgs = {}> = PredicateNameContext | PredicateArgShortContext | PredicateBaseContext<Args>;
type PredicateNormContext<PS, SM extends ScopeMap = ScopeMap> = {
    name: string;
    args: SM;
    left: Predicate<any>;
    right: Predicate<any>;
};

type PredicateArgs<C extends PredicateContext, S> = (
    [C, boolean | PredicateFunction<S>] |
    [C, Predicate<S>]
);

type CArgsFrom<C extends PredicateContext> = C extends Readonly<string[]> ? C : C extends PredicateContext<infer Args> ? Args : {};
type ScopeMapFrom<CArgs> = CArgs extends (infer Keys)[] ? Readonly<{[key in Extract<Keys, string>]: key}> : CArgs extends Readonly<(infer Keys)[]> ? Readonly<{[key in Extract<Keys, string>]: key}> : Readonly<{[key in Extract<keyof CArgs, string>]: CArgs[key] & string}>;
type ValueOutTarget<O, V, P = {[key in keyof O]: V extends O[key] ? never : key}> = Exclude<P[keyof P], never>;
type ValueInTarget<O, V, P = {[key in keyof O]: O[key] extends V ? key : never}> = Exclude<P[keyof P], never>;
type ScopeFrom<PS, SM extends {[key: string]: string}> = {[key in ValueInTarget<SM, keyof PS>]: PS[Extract<SM[key], keyof PS>]};
type ReverseMap<M extends {[key: string]: string}> = {[key in M[keyof M]]: PickValues<M, key>};

type _PV<N, K extends keyof N, V> = {[key in K]: V extends N[key] ? key : never};
type PickValues<O, V, R = _PV<O, keyof O, V>> = Exclude<R[keyof R], never>;

type RequireLiteral<A = 'a' | 'b'> = string extends A ? never : number extends A ? never : boolean extends A ? never : A;
type Merge<A, B, KA extends Extract<keyof A, string> = Extract<keyof A, string>, KB extends Extract<keyof B, string> = Extract<keyof B, string>, M = {[key in KA]: A[key]} & {[key in Exclude<KB, KA>]: B[key]}> = {[key in keyof M]: M[key]};
type TargetFrom<S, RM> = {[key in keyof RM]: S[Extract<RM[key], keyof S>]};
type MergeScope<PS, S, RM> = Merge<S extends {__fieldSet: infer FS} ? FS : {}, Merge<TargetFrom<S, RM>, {[key in RequireLiteral<keyof PS>]: PS[key]}>>;

type _ = {a: 0};
type __ = {[key in keyof _]: _[key]} | {};
const a = {a: 1};
const b = {b: 2};
const c: {[key in keyof typeof a | keyof typeof b]: typeof a extends {[k in key]: any} ? (typeof a)[Extract<key, keyof typeof a>] : (typeof b)[Extract<key, keyof typeof b>]} = {...a, ...b};

const l = <L>(v: L): L => v;
const s = ({a: 'b', c: 'd'}) as const;
const sv: (typeof s)[keyof typeof s][] = Object.values(s);
const sr: PickValues<typeof s, 'b'> = 'a';
const t: {[key in (Readonly<typeof s>)[keyof (Readonly<typeof s>)]]: PickValues<(typeof s), key>} = {b: 'a', d: 'c'};

// PS - ParentScope
// SM - ScopeMap
// S - Scope
class Predicate<
    PS extends {[key: string]: any} = any,
    C extends PredicateContext = PredicateContext,
    S = {[key in keyof ScopeFrom<PS, ScopeMapFrom<CArgsFrom<C>>>]: ScopeFrom<PS, ScopeMapFrom<CArgsFrom<C>>>[key]},
    OS = {[key in keyof MergeScope<PS, S, ReverseMap<ScopeMapFrom<CArgsFrom<C>>>>]: MergeScope<PS, S, ReverseMap<ScopeMapFrom<CArgsFrom<C>>>>[key]}
> {
    readonly func: PredicateFunction<S>;
    readonly context: PredicateNormContext<PS, ScopeMapFrom<CArgsFrom<C>>>;
    readonly scopeMap: ScopeMap;

    constructor(context: C, func: boolean | PredicateFunction<S>);
    constructor(context: C, func: Predicate<S>);
    constructor(...args: PredicateArgs<C, S>);
    constructor(...args: PredicateArgs<C, S>) {
        const [context, func] = args;
        this.func = funcFromPredicateLike(func);
        this.context = normalizeContext(context);
        this.scopeMap = this.context.args;
    }

    call(fields: FieldSet, thread: Thread) {
        return this.func.call(this, fields.remap(this.scopeMap), thread);
    }

    and<RPS = OS, C2 extends PredicateContext = PredicateContext, S2 = {[key in keyof ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>]: ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>[key]}, ROS = {[key in keyof MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>]: MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>[key]}>(context: C2, func: boolean | PredicateFunction<S2>): Predicate<PS, PredicateAndContext, {}, ROS>;
    and<RPS = OS, C2 extends PredicateContext = PredicateContext, S2 = {[key in keyof ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>]: ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>[key]}, ROS = {[key in keyof MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>]: MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>[key]}>(context: C2, func: Predicate<S2>): Predicate<PS, PredicateAndContext, {}, ROS>;
    and<RPS = OS, C2 extends PredicateContext = PredicateContext, S2 = {[key in keyof ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>]: ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>[key]}, ROS = {[key in keyof MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>]: MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>[key]}>(...args: PredicateArgs<C2, S2>): Predicate<PS, PredicateAndContext, {}, ROS>;
    and<RPS = OS, C2 extends PredicateContext = PredicateContext, S2 = {[key in keyof ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>]: ScopeFrom<RPS, ScopeMapFrom<CArgsFrom<C2>>>[key]}, ROS = {[key in keyof MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>]: MergeScope<RPS, S2, ReverseMap<ScopeMapFrom<CArgsFrom<C2>>>>[key]}>(...args: PredicateArgs<C2, S2>): Predicate<PS, PredicateAndContext, {}, ROS> {
        return new Predicate<PS, PredicateAndContext, {}, ROS>({left: this, right: new Predicate<RPS, C2, S2, ROS>(...args)}, andFunc);
    }

    // private static _and(left: Predicate, args: PredicateArgs[], index: number): Predicate {
    //     if (index < args.length) {
    //         return Predicate._and(left.and(...args[index]), args, index + 1);
    //     }
    //     return left;
    // }
    // static and(first: PredicateArgs, ...args: PredicateArgs[]) {
    //     return Predicate._and(new Predicate(...first), args, 0);
    //     // return new Predicate(...first).and
    //     // return args.reduce((p, pargs) => p.and(...pargs), new Predicate(...first));
    // }
}

// const {and} = Predicate;

const popScopePredicate = new Predicate({}, popScope);

type Immutable = string | number | boolean | symbol;
type StrictArg = Arg | Arg[] | {[key in string | number]: Arg};
type StrictArgSet = Arg[] | {[key in string | number]: Arg};
type BindArg = Arg | Immutable | BindArg[] | {[key in string | number]: BindArg};
type StaticArg = Immutable | StaticArg[] | {[key in string | number]: StaticArg};
type ObjectArg = StaticArg[] | {[key in string | number]: StaticArg};
type TemplateArg = ArgTemplate<Arg> | ArgTemplate<BindArg[]> | ArgTemplate<{[key in string | number]: BindArg}> | Immutable;
type TemplateMediumArg = Arg | TemplateArg[] | {[key in string | number]: TemplateArg};
type ContainsArg = Arg | ContainsArg[] | {[key in string | number]: ContainsArg};
// type TemplateArgFromBind<T extends BindArg> = T extends BindArg[] ? ArgTemplate<{[key in Extract<keyof T, number>]: TemplateArgFromBind<T[key]>}> : T extends {[key in string | number]: BindArg} ? ArgTemplate<{[key in keyof T]: TemplateArgFromBind<T[key]>}> : T extends Arg ? ArgTemplate<T> : T;
// type BindArgFromTemplate<T extends TemplateArg> = T extends TemplateArg[] ? {[key in Extract<keyof T, number>]: BindArgFromTemplate<T[key]>} : T extends {[key in string]: TemplateArg} ? {[key in keyof T]: BindArgFromTemplate<T[key]>} : T;
type ArrayElement<T> = T extends (infer E)[] ? E : any;
type Flatten<T> = T extends Immutable | Arg ? T : T extends (infer E)[] ? E : T extends {[key in string]: infer V} ? V : T;
type Flatten1<T> = Flatten<T>;
type Flatten2<T, A = Flatten<T>> = A extends Immutable | Arg ? A : Flatten1<A>;
type Flatten3<T, A = Flatten<T>> = A extends Immutable | Arg ? A : Flatten2<A>;
type Flatten4<T, A = Flatten<T>> = A extends Immutable | Arg ? A : Flatten3<A>;
type Flatten5<T, A = Flatten<T>> = A extends Immutable | Arg ? A : Flatten4<A>;
// type ArgsInBind<T extends BindArg> = T extends Arg<infer A> ? Arg<A> : T extends BindArg[] ? {[key in Extract<keyof T, number>]: ArgsInBind<T[key]>}[Extract<keyof T, number>] : T extends {[key in string | number]: BindArg} ? ArgsInBind<T[Extract<keyof T, string | number>]> : never;

interface WriteableArg {
    write(value: any): void;
}

enum ArgTemplateMode {
    Arg = 'ARG',
    Array = 'ARRAY',
    Object = 'OBJECT',
};

abstract class ArgTemplate<O extends BindArg, Args = Extract<Flatten5<O>, Arg>> {
    readonly mode: ArgTemplateMode;
    readonly args: unknown;
    readonly templates: unknown;
    readonly frozen: unknown;
    readonly object: unknown;

    constructor(mode: ArgTemplateMode.Arg, object: Arg);
    constructor(mode: ArgTemplateMode.Array, args: number[], teamplates: number[], object: TemplateArg[]);
    constructor(mode: ArgTemplateMode.Object, args: string[], teamplates: string[], object: {[key in string | number]: TemplateArg});
    constructor(mode: ArgTemplateMode, ...args: [Arg] | [number[] | string[], number[] | string[], TemplateMediumArg]) {
        this.mode = mode;
        if (args.length === 1) {
            [this.object] = args;
        } else {
            [this.args, this.templates, this.object] = args;
        }
    }

    // isMode<ObjectType = M extends ArgTemplateMode.Arg ? Arg : M extends ArgTemplateMode.Array ? TemplateArg[] : {[key in string | number]: TemplateArg}, IndexType = M extends ArgTemplateMode.Array ? number : M extends ArgTemplateMode.Object ? string : never>(mode: ArgTemplateMode): this is {args: IndexType[], templates: IndexType[], frozen: IndexType[], object: ObjectType} {
    //     return this.mode === mode;
    // }

    abstract bind(thread: Thread): O;

    get write() {
        return (scope: {a: O, __fieldSet: {[key in Exclude<Extract<Args extends Arg<infer K> ? K : never, string>, '_'>]: Arg<key>}}, thread: Thread) => {
            scope.a = this.bind(thread);
            return true;
        };
    }

    static create<A extends BindArg>(arg: A): A extends Arg<infer T> ? ArgTemplate<Arg<T>> : A extends BindArg[] | {[key in string | number]: BindArg} ? ArgTemplate<A> : A;
    static create(arg: BindArg): TemplateArg {
        if (arg instanceof Arg) {
            return new ArgArgTemplate(arg);
        } else if (Array.isArray(arg)) {
            let args: number[] = [];
            let templates: number[] = [];
            let object: TemplateArg[] = Array.from(arg, () => null);
            for (let i = 0; i < arg.length; i++) {
                const copy = object[i] = ArgTemplate.create(arg[i]);
                if (copy instanceof Arg) {
                    args.push(i);
                } else if (copy instanceof ArgTemplate) {
                    templates.push(i);
                }
            }
            return new ArrayArgTemplate(args, templates, object);
        } else if (typeof arg === 'object') {
            const args: string[] = [];
            const templates: string[] = [];
            const object: {[key in string | number]: TemplateArg} = {};
            for (const key in arg) {
                const copy = object[key] = ArgTemplate.create(arg[key]);
                if (copy instanceof Arg) {
                    args.push(key);
                } else if (copy instanceof ArgTemplate) {
                    templates.push(key);
                }
            }
            return new ObjectArgTemplate(args, templates, object);
        }
        return arg;
    }
}

class ArgArgTemplate extends ArgTemplate<Arg> {
    readonly mode: ArgTemplateMode.Arg;
    readonly object: Arg;

    constructor(object: Arg) {
        super(ArgTemplateMode.Arg, object);
    }

    bind(thread: Thread) {
        return this.object.clone(thread);
    }
}

class ArrayArgTemplate<O extends BindArg[]> extends ArgTemplate<O> {
    readonly mode: ArgTemplateMode.Array;
    readonly args: number[];
    readonly templates: number[];
    readonly frozen: number[];
    readonly object: TemplateArg[];

    constructor(args: number[], templates: number[], object: TemplateArg[]) {
        super(ArgTemplateMode.Array, args, templates, object);
        const frozen = object.map((_, index) => index);
        for (let i = 0; i < args.length; i++) {
            frozen[args[i]] = -1;
        }
        for (let i = 0; i < templates.length; i++) {
            frozen[templates[i]] = -1;
        }
        this.frozen = frozen.filter(index => index > -1);
    }

    bind(thread: Thread) {
        const copy: BindArg[] = new Array(this.object.length).fill(null);
        for (let i = 0; i < this.args.length; i++) {
            copy[this.args[i]] = (this.object[this.args[i]] as any as Arg).clone(thread);
        }
        for (let i = 0; i < this.templates.length; i++) {
            copy[this.templates[i]] = (this.object[this.templates[i]] as ArgTemplate<any, any>).bind(thread);
        }
        for (let i = 0; i < this.frozen.length; i++) {
            copy[this.frozen[i]] = this.object[this.frozen[i]] as StaticArg;
        }
        return copy as O;
    }
}

class ObjectArgTemplate<O extends {[key in string | number]: BindArg}> extends ArgTemplate<O> {
    readonly args: string[];
    readonly templates: string[];
    readonly frozen: string[];
    readonly object: {[key in string | number]: TemplateArg};

    constructor(args: string[], templates: string[], object: {[key in string | number]: TemplateArg}) {
        super(ArgTemplateMode.Object, args, templates, object);
        const frozen = Object.keys(object);
        for (let i = 0; i < args.length; i++) {
            frozen[args[i]] = null;
        }
        for (let i = 0; i < templates.length; i++) {
            frozen[templates[i]] = null;
        }
        this.frozen = frozen.filter(index => index !== null);
    }

    bind(thread: Thread) {
        const copy: {[key in string | number]: BindArg} = {};
        for (let i = 0; i < this.args.length; i++) {
            copy[this.args[i]] = (this.object[this.args[i]] as any as Arg).clone(thread);
        }
        for (let i = 0; i < this.templates.length; i++) {
            copy[this.templates[i]] = (this.object[this.templates[i]] as ArgTemplate<any, any>).bind(thread);
        }
        for (let i = 0; i < this.frozen.length; i++) {
            copy[this.frozen[i]] = this.object[this.frozen[i]] as StaticArg;
        }
        return copy as O;
    }
}

abstract class Arg<Name extends string = string> {
    readonly name: Name;

    protected fields: FieldSet = null;
    protected readonly thread: Thread;

    constructor(name: Name);
    constructor(name: Name, thread: Thread);
    constructor(...args: [Name] | [Name, Thread]) {
        if (args.length === 1) {
            [this.name] = args;
        } else if (args.length === 2) {
            [this.name, this.thread] = args;
        }
    }

    abstract get value(): any;

    isNull(): this is WriteableArg {
        return this.fields === null || this.fields.read(this) === null;
    }

    clone(thread: Thread): Arg {
        const alreadyCloned = thread.fields.read(this.name);
        if (alreadyCloned instanceof Arg) return alreadyCloned;

        const newlyCloned = new ArgImpl(this.name, thread);

        if (alreadyCloned !== null && typeof alreadyCloned !== 'undefined') {
            thread.fields.write(newlyCloned, alreadyCloned);
        } else {
            thread.fields.write(this.name, newlyCloned);
        }

        return newlyCloned;
    }

    static c<Name extends string>(name: Name): Arg<Name> {
        return new ArgImpl(name);
    }

    static _(): Arg<'_'> {
        return new AnonymousArg();
    }
}

class ArgImpl<Name extends string = string> extends Arg<Name> implements WriteableArg {
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

class AnonymousArg extends ArgImpl<'_'> {
    constructor() {
        super('_');
    }
    get value() {return null;}
    write(value: any): void {}
    isNull(): this is WriteableArg {return true;}
    clone(): Arg {
        return new AnonymousArg();
    }
}

interface ArgFactory {};
interface ProxyArgs extends ArgFactory {
    bind: (arg: any) => ArgImpl;
}

const Args = new Proxy<{[key in any]: Arg}>({
    _: new AnonymousArg(),
}, {
    get<P extends string>(target, property: P): Arg<P> {
        if (typeof property === 'string') {
            if (!target[property]) {
                return new ArgImpl(property);
            }
            return target[property];
        }
    }
});

function match<S extends {left, right}>(scope: S, thread: Thread) {
    return true;
}
function read(obj: Arg | StaticArg) {
    if (obj instanceof Arg && !obj.isNull()) {
        return obj.value;
    }
    return obj;
}
type A111 = (Arg<'k'> | Arg<'_'>) extends Arg<infer K> ? K : never;
type A112 = ArgTemplate<{key: Arg<'k'>, value: Arg<'_'>}> extends ArgTemplate<any, infer Args> ? {[key in Extract<Args extends Arg<infer K> ? K : never, string>]: Arg<key>} : unknown;
function writeTemplate<T extends ArgTemplate<any>, B = T extends ArgTemplate<infer O, any> ? O : never, A = T extends ArgTemplate<any, infer Args> ? {[key in Exclude<Extract<Args extends Arg<infer K> ? K : never, string>, '_'>]: Arg<key>} : unknown, S = {a: B} & A>(obj: T) {
    return (scope: {a: B, __fieldSet: A}, thread: Thread) => {
        scope.a = obj.bind(thread);
        return true;
    };
}
function writeStatic<T extends StaticArg>(obj: T) {
    return (scope: {a: T}, thread: Thread) => {
        scope.a = obj;
        return true;
    };
}
// function write<T extends StaticArg | ArgTemplate<any, any>, R = T extends StaticArg ? (scope: {a: T}) => boolean : T extends ArgTemplate<any, infer O> ? (scope: {a: O}) => boolean : never>(obj: T): R {
//     if (obj instanceof ArgTemplate) {
//         return writeTemplate(obj);
//     }
//     return writeStatic(obj as Exclude<T, ArgTemplate<any, any>>);
// }

const argTemplateTest = ArgTemplate.create({key: new ArgImpl('k'), value: Arg._()});
const templateTest = writeTemplate(ArgTemplate.create({key: Arg.c('k'), value: Arg._()}));

type FS = {a: any, b: any, k: any};
type MS = MergeScope<any, {a: any, b: any, k: any}, {a: 'a', b: 'b', k: 'k'}>;
type MMS = Merge<{a: {key: Arg<'k'>}}, MS>;
type MMSK = keyof MMS;
type MMS_ = {[key in keyof MMS]: MMS[key]};
type RM = ReverseMap<{a: 'b', c: 'd'}>;
type CA = CArgsFrom<{args: {left: 'a', right: 'b'}}>;
type SMCA = ScopeMapFrom<CA>;
type SCV = ValueInTarget<SMCA, keyof MMS>;
type SCVE = Extract<SCV, keyof MMS>;
type SCA = ScopeFrom<MMS, SMCA>;
type SCR = ReverseMap<SMCA>;
type SCT = TargetFrom<SCA, SCR>;
type SCTO = {[key in ValueOutTarget<FS, never>]: FS[key]};
type MSCTO = Merge<SCT, SCTO>;
type SCO = MergeScope<FS, SCA, SCR>;
type ASCO = MergeScope<any, SCA, SCR>;

const m1 = new Predicate(['a', 'b', 'k'] as const, true);
type m1OS = typeof m1 extends Predicate<any, any, any, infer OS> ? OS : any;
const m11 = m1.and(['a'] as const, ArgTemplate.create({key: Arg.c('k'), value: Arg._()}).write);
type m11OS = typeof m11 extends Predicate<m1OS, any, infer S, infer OS> ? OS : any;
const m2 = m11
.and(['a', 'k'] as const, scope => (scope.a, scope.k = scope.a.key, true));

new Predicate({args: ['a', 'b']}, match);
const matchKey = new Predicate({args: {b: 'c', k: 'd'} as const},
    new Predicate<{b: string}>(['b'] as const, true)
    .and(['a'] as const, ArgTemplate.create({key: Arg.c('k'), value: Arg._()}).write)
    // new Predicate(['a'] as const, ArgTemplate.create({key: Arg.c('k'), value: Arg._()}).write)
    .and(['a', 'k'] as const, scope => (scope.k, scope.k = scope.a.key, true))
    .and({args: {left: 'a', right: 'b'}} as const, ((...args) => match(...args)))
    .and(['b'] as const, (scope) => true)
);

const withFields = <F extends (...args) => any, K extends string>(f: F, map: (K)[]) => {};
withFields((scope) => scope.a, ['b']);

ArgTemplate.create(['abc']).write

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
    const arg = new ArgImpl('arg', null);
    assert.equals(arg.value, null);
    assert.throws(() => (arg.write('value')));
    const argt = new ArgImpl('argt', t);
    argt.write('value');
    assert.throws(() => (argt.write('value')));
    assert.equals(argt.value, 'value');
    assert.equals(t.fields.read(argt), 'value');
    const arg2 = new ArgImpl('2', t);
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
