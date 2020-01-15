// Arg, Value, Atom, Scope, Frame, Thread

type SyncReturn = boolean | void;
type AsyncReturn = Promise<SyncReturn>;

class Arg<Name extends string = any, Type = any> {
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

function arg<Name extends string, Type>(name: Name, make?: new () => Type): Arg<Name, Type>;
function arg<Name extends Arg>(name: Name): Name;
function arg<Name extends string | Arg, Type>(name: Name, make?: new () => Type): Name extends string ? Arg<Name, Type> : Name extends Arg<infer N, infer T> ? Arg<N, T> : Arg;
function arg<Name extends string | Arg, Type>(name: Name, make: new () => Type = null) {
    return typeof name === 'string' ? new Arg(name, make) : name;
}

type SimpleType<Arg> = Arg extends Boolean ? boolean : Arg extends String ? string : Arg extends Number ? number : Arg;
type TypeArg<A> = {value: A extends Arg<any, infer Type> ? SimpleType<Type> : any};
type RuleFuncArgs<Args extends any[]> = {[key in keyof Args]: TypeArg<Args[key]>} & Args[keyof Args][];

type RuleFunc<Args extends TupleOf<Arg> = Arg[], Return extends SyncReturn | AsyncReturn = any> = (thread, ...args: RuleFuncArgs<Args>) => Return;

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

class Rule<CArgs extends TupleOf<string | Arg> = (string | Arg)[], Args extends ArgTupleFrom<CArgs> = ArgTupleFrom<CArgs>, Body extends Atom | RuleFunc<Args, any> = RuleFunc<Args, any>, Return extends SyncReturn | AsyncReturn = Body extends RuleFunc<any, infer R> ? R : any> {
    args: Args;
    locals: Arg[];
    body: Body;

    constructor(args: CArgs, body: Body) {
        this.args = (args as (string | Arg)[]).map(carg => {
            if (typeof carg === 'string') {
                return arg(carg);
            }
            return carg;
        }) as Args;
        this.body = body;
    }
}

type RuleBody<Args extends TupleOf<Arg>, Return extends SyncReturn | AsyncReturn> = Atom | RuleFunc<Args, Return>;

const rule = <CArgs extends TupleOf<string | Arg>, Args extends ArgTupleFrom<CArgs>, Body extends RuleBody<Args, any>, Return extends SyncReturn | AsyncReturn = Body extends RuleFunc<any, infer R> ? R : any>(args: CArgs, body: Body): Rule<CArgs, Args, Body, Return> => new Rule(args, body);

const a = Arg.any;
const b = Arg.type(Boolean);
const n = Arg.type(Number);

new Rule(['a'], (t, a) => {}).args;
new Rule([arg('a')], (t, a) => {}).args;
new Rule([arg('a', Boolean), arg('b', Number)], (t, a, b) => {b.value = Number(a.value)}).args;
new Rule([b('a'), n('b')], (t, a, b) => {b.value = Number(a.value)}).args;
rule([arg('a', Boolean), arg('b', Number)], (t, a, b) => {}).args;

// const l = <V extends string | Arg, A extends V[]>(...v: A): A => v;
// const a = l('a', 'b');
// const b = l(arg('a'), arg('b', Boolean));

const ll = <V extends string | Arg, A extends V[]>(...v: A) => v;
rule(ll(arg('a', Boolean), arg('b', Number)), (t, a, b) => {}).args;
const lll = <V extends Arg, A extends [] | [V] | [V, V] | [V, V, V] | [V, V, V, V] | [V, V, V, V, V] | V[]>(v: A) => v;
rule(lll([arg('a', Boolean), arg('b', Number)]), (t, a, b) => {}).args;

type AtomMembers<R extends Rule> = R extends Rule<any, infer Args, any, any> ? (Arg | Atom)[] & {length: Args['length']} : (Arg | Atom)[];
type CAtomMembers<R extends Rule> = R extends Rule<any, infer Args, any, any> ? (string | Arg | Atom)[] & {length: Args['length']} : (string | Arg | Atom)[];

class Atom<R extends Rule = Rule, M extends AtomMembers<R> = any> {
    rule: R;
    members: M;

    constructor(rule: R, members: CAtomMembers<R>) {
        this.rule = rule;
        this.members = members as M;
    }
}

const atom = <R extends Rule, M extends AtomMembers<R>>(rule: R, ...members: CAtomMembers<R>) => new Atom<R, M>(rule, members);

atom(rule([], () => {}));
atom(rule(['a'], () => {}), arg('a'));
rule([], atom(rule(['a'], () => {}), arg('a')));
rule([], atom(rule(['a'], () => {}), 'a'));

class Scope {
    caller: Atom;
    values: any[];
    parent: Scope;

    constructor(atom: Atom);
    constructor(atom: Atom, parent: Scope);
    constructor(atom: Atom, values: any[], parent: Scope);
    constructor() {

    }

    private findIndex(f: (v: Arg) => boolean) {
        for (let i = 0; i < this.caller.rule.locals.length; i++) {
            if (f(this.caller.rule.locals[i])) return i;
        }
        return -1;
    }

    get(key: string) {
        return this.getAt(this.findIndex(a => a.name === key));
    }

    getAt(index: number) {
        return this.values[index];
    }

    set(key: string, value: any) {
        this.setAt(this.findIndex(a => a.name === key), value);
    }

    setAt(index: number, value: any) {
        this.values[index] = value;
    }

    call(thread, atom: Atom<Rule<any, any, RuleFunc>>) {
        if (atom.members.length === 0) {
            return atom.rule.body(thread);
        } else if (atom.members.length === 1) {
            const a = atom.members[0] instanceof Arg ? {value: this.values[atom.members[0].ruleIndex]} : atom.members[0];
            return atom.rule.body(thread, a);
        }
        return atom.rule.body(thread, ...atom.members.map(member => member instanceof Arg ? {value: this.values[member.ruleIndex]} : member));
    }

    clone() {
        return new Scope(this.caller, this.values.slice(), this.parent);
    }

    pop() {
        const parent = this.parent.clone();
        const caller = this.caller;
        for (let i = 0; i < caller.members.length; i++) {
            parent.set
        }
    }
}
