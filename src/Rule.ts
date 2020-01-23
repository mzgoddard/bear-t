import Pot from './Option';

// Arg, Value, Atom, Scope, Frame, Thread

type SyncReturn = boolean | void;
type AsyncReturn = Promise<SyncReturn>;
type AnyReturn = SyncReturn | AsyncReturn;

export class Arg<Name extends string = string, Type = any> {
    name: Name;
    make: new () => Type;
    ruleIndex: number = -1;

    constructor(name: Name, make: new () => Type = null) {
        this.name = name;
        this.make = make;
    }

    static type<Type>(make: new () => Type) {
        return <Name extends string>(name: Name) => new Arg(name, make);
    }

    static any<Name extends string>(name: Name) {
        return new Arg(name);
    }

    static boolean<Name extends string>(name: Name) {
        return new Arg(name, Boolean);
    }
}

export function arg<Name extends string, Type>(name: Name, make?: new () => Type): Arg<Name, Type>;
export function arg<Name extends Arg>(name: Name): Name;
export function arg<Name extends string | Arg, Type>(name: Name, make?: new () => Type): Name extends string ? Arg<Name, Type> : Name extends Arg<infer N, infer T> ? Arg<N, T> : Arg;
export function arg<Name extends string | Arg, Type>(name: Name, make: new () => Type = null) {
    return typeof name === 'string' ? new Arg(name, make) : name;
}

type SimpleType<Type> = Type extends Boolean ? boolean : Type extends String ? string : Type extends Number ? number : Type;
type ScopedArg<A> = A extends Arg<any, infer Type> ? {value: SimpleType<Type>} : A;
type RuleFuncArgs<Args extends any[]> = (
    Args extends [] ? [] :
    Args extends [any] ? [ScopedArg<Args[0]>] :
    Args extends [any, any] ? [ScopedArg<Args[0]>, ScopedArg<Args[1]>] :
    Args extends [any, any, any] ? [ScopedArg<Args[0]>, ScopedArg<Args[1]>, ScopedArg<Args[2]>] :
    Args extends [any, any, any, any] ? [ScopedArg<Args[0]>, ScopedArg<Args[1]>, ScopedArg<Args[2]>, ScopedArg<Args[3]>] :
    Args extends [any, any, any, any, any] ? [ScopedArg<Args[0]>, ScopedArg<Args[1]>, ScopedArg<Args[2]>, ScopedArg<Args[3]>, ScopedArg<Args[4]>] :
    ScopedArg<Args[Extract<keyof Args, number>]>[]
);
// {[key in Extract<keyof Args, number>]: ScopedArg<Args[key]>} & Args[keyof Args][];

type RuleFunc<Args extends TupleOf<Arg> = Arg[], Return extends AnyReturn = AnyReturn> = (thread: Thread, ...args: RuleFuncArgs<Args>) => Return;

type TupleOf<T> = ([] | [T] | [T, T] | [T, T, T] | [T, T, T, T] | [T, T, T, T, T] | T[]);

type ArgNamed<A extends string | Arg> = A extends string ? Arg<A, any> : A extends Arg<infer Name, infer Type> ? Arg<Name, Type> : Arg;
type ArgNamedFrom<CArgs extends TupleOf<string | Arg>> = {[key in Extract<keyof CArgs, number>]: ArgNamed<CArgs[key]>};
type ArgTupleFrom<CArgs extends TupleOf<string | Arg>> = (
    CArgs extends [] ? [] :
    CArgs extends [string | Arg] ? [ArgNamed<CArgs[0]>] :
    CArgs extends [string | Arg, string | Arg] ? [ArgNamed<CArgs[0]>, ArgNamed<CArgs[1]>] :
    CArgs extends [string | Arg, string | Arg, string | Arg] ? [ArgNamed<CArgs[0]>, ArgNamed<CArgs[1]>, ArgNamed<CArgs[2]>] :
    CArgs extends [string | Arg, string | Arg, string | Arg, string | Arg] ? [ArgNamed<CArgs[0]>, ArgNamed<CArgs[1]>, ArgNamed<CArgs[2]>, ArgNamed<CArgs[3]>] :
    CArgs extends [string | Arg, string | Arg, string | Arg, string | Arg, string | Arg] ? [ArgNamed<CArgs[0]>, ArgNamed<CArgs[1]>, ArgNamed<CArgs[2]>, ArgNamed<CArgs[3]>, ArgNamed<CArgs[4]>] :
    ArgNamed<CArgs[Extract<keyof CArgs, number>]>[]
);
type ValueArg<A extends Arg> = A extends Arg<any, infer Type> ? SimpleType<Type> | Arg<any, Type> : never;
type ValueTupleFrom<Args extends TupleOf<any>> = (
    Args extends [] ? [] :
    Args extends [any] ? [ValueArg<Args[0]>] :
    Args extends [any, any] ? [ValueArg<Args[0]>, ValueArg<Args[1]>] :
    Args extends [any, any, any] ? [ValueArg<Args[0]>, ValueArg<Args[1]>, ValueArg<Args[2]>] :
    Args extends [any, any, any, any] ? [ValueArg<Args[0]>, ValueArg<Args[1]>, ValueArg<Args[2]>, ValueArg<Args[3]>] :
    Args extends [any, any, any, any, any] ? [ValueArg<Args[0]>, ValueArg<Args[1]>, ValueArg<Args[2]>, ValueArg<Args[3]>, ValueArg<Args[4]>] :
    ValueArg<Args[Extract<keyof Args, number>]>[]
);
const f = (a: 1) => a;
type f = Parameters<typeof f>;
type f0 = f[0];
const g: (...args: f) => f[0] = a => a;
const h: (...args: {[key in 'abc']: string} & any[]) => boolean = () => false;
type RuleFuncReturn<Func> = Func extends RuleFunc<any, infer Return> ? Return : AnyReturn;

type Rule<Args extends TupleOf<Arg> = Arg[], Body extends Atom | RuleFunc<Args> = Atom | RuleFunc<Args>, Return extends AnyReturn = RuleFuncReturn<Body>> = {
    (...args: AtomMembers<AtomTarget<Args, Return>>): Atom<AtomTarget<Args, Return>>;
    // (): 
    // (...args): Promise<Values<{[key in Extract<keyof Args, number>]: Args[key] extends Arg<infer Name, infer Type> ? {[key in Name]: Type} : any}>>;
    args: Args & Arg[];
    locals: Arg[];
    body: Body;
};

type RuleBody<Args extends TupleOf<Arg>, Return extends SyncReturn | AsyncReturn> = Atom | RuleFunc<Args, Return>;

export const rule = <CArgs extends TupleOf<string | Arg>, Args extends ArgTupleFrom<CArgs>, Body extends RuleBody<Args, any>, Return extends SyncReturn | AsyncReturn = Body extends RuleFunc<any, infer R> ? R : any>(args: CArgs, body: Body): Rule<Args, Body, Return> => {
    const r: Rule<Args, Body, Return> = Object.assign((...args: AtomMembers<AtomTarget<Args>>) => atom(r, ...args), {
        args: (args as (string | Arg)[]).map(carg => {
            if (typeof carg === 'string') {
                return arg(carg);
            }
            return carg;
        }) as Args,
        locals: [],
        body,
    });
    return r;
};

const a = Arg.any;
const b = Arg.type(Boolean);
const n = Arg.type(Number);
  
rule(['a'], (t, a) => {}).args;
rule([arg('a')], (t, a) => {}).args;
rule([arg('a', Boolean), arg('b', Number)], (t, a, b) => {b.value = Number(a.value)}).args;
rule([b('a'), n('b')], (t, a, b) => {b.value = Number(a.value)}).args;
rule([arg('a', Boolean), arg('b', Number)], (t, a, b) => {}).args;
const am = rule([arg('a', Boolean), arg('b', Number)], (t, a, b) => {});
const am1 = am(a('a'), a('b'));

type tm1 = Parameters<typeof am>;

// const l = <V extends string | Arg, A extends V[]>(...v: A): A => v;
// const a = l('a', 'b');
// const b = l(arg('a'), arg('b', Boolean));

const ll = <V extends string | Arg, A extends V[]>(...v: A) => v;
rule(ll(arg('a', Boolean), arg('b', Number)), (t, a, b) => {}).args;
const lll = <V extends Arg, A extends [] | [V] | [V, V] | [V, V, V] | [V, V, V, V] | [V, V, V, V, V] | V[]>(v: A) => v;
rule(lll([arg('a', Boolean), arg('b', Number)]), (t, a, b) => {}).args;

type TupleN<T, N extends number> = (N extends 0 ? [] : N extends 1 ? [T] : N extends 2 ? [T, T] : N extends 3 ? [T, T, T] : N extends 4 ? [T, T, T, T] : T[]);

type AtomMembers<AT extends AtomTarget> = AT extends AtomTarget<infer Args> ? ValueTupleFrom<Args> : never;

type Values<V> = V[keyof V];

type AtomTarget<Args extends TupleOf<Arg> = Arg[], Return extends AnyReturn = AnyReturn> = {
    args: Args & Arg[];
    locals: Arg[];
};

type MergeReturn<A, B> = A extends Promise<infer RA> ? B extends Promise<infer RB> ? Promise<RA & RB> : Promise<RA & B> : B extends Promise<infer RB> ? Promise<A & RB> : A & B;
type MergeAtom<A extends Atom, B extends Atom> = A extends Atom<AtomTarget<any, infer AReturn>> ? B extends Atom<AtomTarget<any, infer BReturn>> ? Atom<AtomTarget<any[], MergeReturn<AReturn, BReturn>>> : never : never;

class Atom<AT extends AtomTarget = AtomTarget, M extends AtomMembers<AT> = AtomMembers<AT>> {
    target: AT;
    members: M;

    constructor(target: AT, members: M) {
        this.target = target;
        this.members = members;
    }

    and<Then extends Atom>(then: Then): MergeAtom<this, Then> {
        return and(this, then);
    }

    or<Other extends Atom>(otherwise: Other) {
        return or(this, otherwise);
    }
}

const atom = <AT extends AtomTarget>(target: AT, ...members: AtomMembers<AT>) => {
    return Object.assign(() => ({}), {target: target, members} as Atom<AT, AtomMembers<AT>>);
};

const tm = Arg.type(Atom as new () => Atom);

const and = rule([tm('a'), tm('b')], (t, a, b) => (t.ifTrue(b.value), t.ifTrue(a.value)));
const or = rule([tm('a'), tm('b')], (t, a, b) => (t.ifFalse(b.value), t.ifTrue(a.value)));

atom(rule([], () => {}));
atom(rule(['a'], () => {}), arg('a'));
rule([], atom(rule(['a'], () => {}), arg('a')));
rule([], atom(rule(['a'], () => {}), 'a'));
atom(rule(['a'], () => {}), 'b')

const trued = rule([], () => true)();
const falsed = rule([], () => false)();

and(trued, falsed);
trued.and(falsed);

class Scope {
    caller: Atom;
    values: any[];
    parent: Scope;

    private cloned: boolean = false;

    constructor(atom: Atom);
    constructor(atom: Atom, parent: Scope);
    constructor(atom: Atom, values: any[], parent: Scope);
    constructor() {

    }

    private findIndex(f: (v: Arg) => boolean) {
        for (let i = 0; i < this.caller.target.locals.length; i++) {
            if (f(this.caller.target.locals[i])) return i;
        }
        return -1;
    }

    get(key: string): any;
    get<T>(key: Arg<any, T>): SimpleType<T>;
    get(key: Arg): any;
    get(key: string | Arg) {
        if (key instanceof Arg) {
            if (key.ruleIndex === -1) return this.get(key.name);
            return this.getAt(key.ruleIndex);
        }
        return this.getAt(this.findIndex(a => a.name === key));
    }

    getAt(index: number) {
        return this.values[index];
    }

    getAll<T = any>(keys: (string | Arg<any, T>)[]): SimpleType<T>[] {
        return keys.map(this.get, this);
    }

    set(key: string, value: any): void;
    set<T>(key: Arg<any, T>, value: SimpleType<T>): void;
    set(key: Arg, value: any): void;
    set(key: string | Arg, value: any) {
        if (key instanceof Arg) {
            if (key.ruleIndex === -1) return this.set(key.name, value);
            return this.setAt(key.ruleIndex, value);
        }
        this.setAt(this.findIndex(a => a.name === key), value);
    }

    setAt(index: number, value: any) {
        if (this.cloned) {
            this.cloned = false;
            this.values = this.values.slice();
        }
        this.values[index] = value;
    }

    // call(thread, atom: Atom<Rule<any, any, RuleFunc>>) {
    //     if (atom.members.length === 0) {
    //         return atom.rule.body(thread);
    //     } else if (atom.members.length === 1) {
    //         const a = atom.members[0] instanceof Arg ? {value: this.values[atom.members[0].ruleIndex]} : atom.members[0];
    //         return atom.rule.body(thread, a);
    //     }
    //     return atom.rule.body(thread, ...atom.members.map(member => member instanceof Arg ? {value: this.values[member.ruleIndex]} : member));
    // }

    private scopeArg(member) {
        const scope = this;
        if (member instanceof Arg) {
            return {
                get value() {
                    return scope.get(member);
                },
                set value(value) {
                    scope.set(member, value);
                },
            };
        } else {
            return {
                get value() {return member;}
            };
        }
    }

    args<Args extends TupleOf<Arg>>(atom: Atom<AtomTarget<Args>>): TupleOf<{value: any}> {
        const {members} = atom;
        // if (members.length === 0) return [];
        // else if (members.length === 1) return [this.scopeArg(members[0])];
        // else if (members.length === 2) return [this.scopeArg(members[0]), this.scopeArg(members[1])];
        // else if (members.length === 3) return [this.scopeArg(members[0]), this.scopeArg(members[1]), this.scopeArg(members[2])];
        // else if (members.length === 4) return [this.scopeArg(members[0]), this.scopeArg(members[1]), this.scopeArg(members[2]), this.scopeArg(members[3])];
        // else if (members.length === 5) return [this.scopeArg(members[0]), this.scopeArg(members[1]), this.scopeArg(members[2]), this.scopeArg(members[3]), this.scopeArg(members[4])];
        return (members as any[]).map(this.scopeArg, this);
    }

    clone() {
        this.cloned = true;
        return new Scope(this.caller, this.values, this.parent);
    }

    push(atom: Atom) {
        const child = new Scope(atom, this);
        const {members, target: rule} = atom;
        const {args} = rule;
        for (let i = 0; i < args.length; i++) {
            const member = members[i];
            if (member instanceof Arg) {
                child.set(args[i], this.get(member));
            } else {
                child.set(args[i], member);
            }
        }
        return child;
    }

    pop() {
        const parent = this.parent.clone();
        const {members, target: rule} = this.caller;
        for (let i = 0; i < members.length; i++) {
            if (members[i] instanceof Arg) {
                parent.set(members[i], this.get(rule.args[i]));
            }
        }
        return parent;
    }
}

class Frame {
    atom: Atom;
    next: Frame;

    constructor(atom: Atom, next: Frame = null) {
        this.atom = atom;
        this.next = next;
    }
}

const popScope = rule([], t => {
    t.scope = t.scope.pop();
})();

class Thread<Return extends AnyReturn = AnyReturn> {
    scope: Scope;
    frame: Frame;
    history: Pick<Thread<Return>, 'scope' | 'frame' | 'history'>;

    constructor(atom: Atom);
    constructor(rule: AtomTarget, args);
    constructor(...args: [Atom] | [AtomTarget, any[]]) {
        this.history = {
            scope: this.scope,
            frame: this.frame,
            history: this.history,
        };
        if (args.length === 1) {
            this.scope = new Scope(args[0]);
            this.frame = new Frame(args[0]);
        }
    }

    ifTrue(atom: Atom) {
        this.frame.next = new Frame(atom, this.frame);
    }

    ifFalse(atom: Atom) {
        this.history = {
            scope: this.scope.clone(),
            frame: new Frame(atom, this.frame.next),
            history: this.history,
        };
    }

    true() {
        this.frame = this.frame.next;
    }

    false() {
        this.scope = this.history.scope;
        this.frame = this.history.frame;
        this.history = this.history.history;
    }

    call(): Promise<boolean> | boolean {
        const {target} = this.frame.atom;
        const rule = (target as any) as Rule;
        if (rule.body instanceof Atom) {
            this.ifTrue(popScope);
            this.ifTrue(rule.body);
            this.scope = this.scope.push(rule.body);
            return true;
        } else {
            const body = rule.body;
            return Pot.create(body(this, ...this.scope.args(this.frame.atom)))
            .map(Boolean, () => false)
            .unwrap();
        }
    }

    loop(): Pot<boolean> {
        if (this.frame) {
            return Pot.create(this.call())
            .map(truthy => {
                if (truthy === false) this.false();
                else this.true();

                if (this.frame) return this.loop();
                return truthy;
            });
        }
        return Pot.create(false);
    }

    answer() {
        if (!this.frame) this.false();
        return this.loop()
        .map(value => value ? this.scope.getAll(this.scope.caller.members) : null)
        .unwrap();
        // while (this.frame) {
        //     if (this.call() === false) this.false();
        //     else this.true();
        // }
    }
}
