import { Context } from "vm";

/**
 * @typedef {function(any, Thread): Promise<void>} PredicateFunction
 */

/**
 * @typedef {boolean|PredicateFunction|Predicate} PredicateLike
 */

type PredicateFunction<ScopeMap> = (args: {[key in keyof ScopeMap]?: any}, thread: Thread) => (Promise<void> | void);
type PredicateLike<Args> = boolean | PredicateFunction<PredicateMapFromArgs<Args>> | Predicate<PredicateMapFromArgs<Args>>;

class Scope {
    prefix: string;
    next: Scope;
    map: {[key: string]: string};

    constructor (prefix, next = null) {
        this.prefix = prefix;
        this.next = next;
        this.map = {};
    }

    get (key) {
        if (!this.map[key]) {
            this.map[key] = this.prefix + key;
        }
        return this.map[key];
    }

    set (key, nextkey) {
        if (this.next) {
            this.map[key] = this.next.get(nextkey);
        }
    }
}

/** A predicate running thread. */
class Thread {
    query: any;
    scope: Scope;
    index: number;
    stack: Predicate<any>[];
    after: Pick<Thread, 'query' | 'scope' | 'index' | 'stack' | 'after'>;

    constructor (main: Predicate<any>, query) {
        this.query = {...query};
        this.scope = new Scope('', null);
        this.index = -1;
        /** @type {Array<Predicate>} */
        this.stack = [];
        /** @type {{query, index: number, stack, after}} */
        this.after = null;

        this.unshift(predicate(function (query, thread) {thread.pop();}));
        this.push(main);
        this.next();
    }

    getStackString () {
        return this.stack.slice(0, this.index + 1).filter(p => !p.context.hideFromStack).reverse()
            .map(pred => (pred.name || 'anonymous')).join('\n');
    }

    push (pred) {
        this.stack.splice(this.index + 1, 0, pred);
    }

    unshift (pred) {
        const query = {...this.query};
        this.after = {
            query,
            scope: this.scope,
            index: this.index,
            stack: [...this.stack.slice(0, this.index + 1), pred, ...this.stack.slice(this.index + 1)],
            after: this.after
        };
    }

    replace (pred) {
        const query = {...this.query};
        this.after = {
            query,
            scope: this.scope,
            index: this.index - 1,
            stack: [...this.stack.slice(0, this.index), pred, ...this.stack.slice(this.index + 1)],
            after: this.after
        };
    }

    next () {
        this.index += 1;
    }

    pop () {
        Object.assign(this, this.after);
        this.index += 1;
    }

    async run () {
        if (this.index >= this.stack.length) {
            this.pop();
        }
        while (this.index < this.stack.length) {
            await this.stack[this.index].call(this.query, this);
        }
        if (this.after === null) {
            return false;
        }
        return this.query;
    }
}

const remapQuery = <Args extends {[key in any]: any}>(query, remap: Args, scope: Scope) => {
    if (!remap) {
        return {};
    } else if (Array.isArray(remap)) {
        return remap.reduce((carry, key) => {
            const property = scope.get(key);
            Object.defineProperty(carry, key, {
                get() {return query[property];},
                set(value) {return query[property] = value;}
            });
            return carry;
        }, {});
    }
    return Object.entries(remap || {}).reduce((carry, [key, property]) => {
        let target = query;
        property = scope.get(property);
        Object.defineProperty(carry, key, {
            get() {return target[property];},
            set(value) {return target[property] = value;}
        });
        return carry;
    }, {});
};

type MustBeKey<S> = S extends string ? S : string;

type PredicateQueryFromArgs<K> = {[key in MustBeKey<K>]: any};
type PredicateMapFromArgs<Args> = Args extends (infer Elem)[] ?
    {[key in Extract<Elem, string>]?: key} :
    Args extends Readonly<(infer Elem)[]> ?
        {[key in Extract<Elem, string>]?: key} :
        {[key in Extract<keyof Args, string>]?: Extract<Args[key], string>};
type PredicateReverseMapFromArgs<Args> = Args extends (infer Elem)[] ?
    {[key: string]: Extract<Elem, string>} :
    Args extends Readonly<(infer Elem)[]> ?
        {[key: string]: Extract<Elem, string>} :
        {[key: string]: Extract<keyof Args, string>};    
type ArgsFromMap<ScopeMap> = ScopeMap[keyof ScopeMap][] | {[key in Extract<ScopeMap[keyof ScopeMap], string>]: string};

type KeysOrElements<O> = O extends (infer Elem)[] ? Elem : O extends Readonly<(infer Elem)[]> ? Elem : keyof O;

type PredicateContextArgKeys<C extends PredicateContext<any>, A = C extends PredicateContext<infer Args> ? Args : never> = KeysOrElements<A>;

type PredicateQueryFromContext<C extends PredicateContext<any>> = PredicateQueryFromArgs<PredicateContextArgKeys<C>>;

type PredicateArgs<Args> = (
    [string | PredicateLike<Args> | PredicateContext<Args>] |
    [string, PredicateLike<Args>] | [string, PredicateContext<Args>] | [PredicateLike<Args>, PredicateContext<Args>] |
    [string, PredicateLike<Args>, PredicateContext<Args>]
);

interface PredicateCast {
    (name: string): Predicate<{}>;
    (func: PredicateLike<{}>): Predicate<{}>;
    <C>(context: C): Predicate<C>;
    <C>(name: string, func: PredicateLike<C>): Predicate<C>;
    <C>(name: string, context: C): Predicate<C>;
    <C>(func: PredicateLike<C>, context: C): Predicate<C>;
    <C>(name: string, func: PredicateLike<C>, context: C): Predicate<C>;
}

const predicateArgs = function<Args>(...args: PredicateArgs<Args>): [string, PredicateLike<Args>, PredicateContext<ContextArgsFromMap<PredicateMapFromArgs<Args>>>] {
    let name: string = null;
    let func: PredicateLike<Args> = null;
    let context: PredicateContext<Args> = {};

    if (args.length === 1) {
        const [arg0] = args;
        if (typeof arg0 === 'string') {
            name = arg0;
        } else if (arg0 instanceof Predicate || typeof arg0 !== 'object') {
            func = arg0;
        } else {
            context = arg0;
        }
    } else if (args.length === 2) {
        const [arg0, arg1] = args;
        if (typeof arg0 === 'string') {
            name = arg0;
            if (arg1 instanceof Predicate || typeof arg1 !== 'object') {
                func = arg1;
            } else {
                context = arg1;
            }
        } else {
            func = arg0;
            if (!(arg1 instanceof Predicate) && typeof arg1 === 'object') {
                context = arg1;
            }
        }
    } else if (args.length === 3) {
        [name, func, context] = args;
    } else {
        throw new Error('Predicates are created with one to 3 arguments.');
    }

    let scopeMap = context.args;
    if (Array.isArray(context.args)) {
        scopeMap = context.args.reduce((args, key) => {
            args[key] = key;
            return args;
        }, {});
    }

    return [name, func, {...context, args: scopeMap}];
}

function predicate<Args>(name: string): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(func: PredicateLike<PredicateMapFromArgs<Args>>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(context: PredicateContext<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(func: boolean | PredicateFunction<PredicateMapFromArgs<Args>>, context: PredicateContext<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(func: Predicate<PredicateMapFromArgs<Args>>, context: PredicateContext<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(name: string, func: boolean | PredicateFunction<PredicateMapFromArgs<Args>>, context: PredicateContext<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<NestScope, Args = ArgsFromMap<NestScope>>(name: string, func: Predicate<NestScope>, context: PredicateContext<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(...args: PredicateArgs<Args>): Predicate<PredicateMapFromArgs<Args>>;
function predicate<Args>(...args: PredicateArgs<Args>): Predicate<PredicateMapFromArgs<Args>> {
    let [name, func, context] = predicateArgs(...args);

    if (func instanceof Predicate) {
        if (context) {
            return new Predicate(name, function (query, thread) {
                if (this.context.args) {
                    thread.push(predicate(popScope));
                    pushScope.call(this, null, thread);
                }
                this.context.wrap.call(query, thread);
            }, {...context, wrap: func});
        }
        return func;
    } else if (func === null) {
        return new Predicate('_context', function (query, thread) {
            thread.next();
        }, context);
    } else if (func === true) {
        if (typeof name !== 'string') name = 'true';
        func = (_, thread) => thread.next();
    } else if (func === false) {
        if (typeof name !== 'string') name = 'false';
        func = function (_, thread) {thread.pop();};
    } else if (typeof func === 'function') {
        if (typeof name !== 'string') name = func.name;
    }

    return new Predicate(name || 'blank', func, context);
};

class Predicate<ScopeMap> {
    name: string;
    func: PredicateFunction<ScopeMap>;
    context: PredicateContext<ContextArgsFromMap<ScopeMap>>;
    args: {[key in Extract<keyof ScopeMap, string>]?: ScopeMap[key]};

    constructor (name: string, func: PredicateFunction<ScopeMap>, context: PredicateContext<ContextArgsFromMap<ScopeMap>>) {
        /** @type {string} */
        this.name = name;

        /** @type {PredicateFunction} */
        if (typeof func !== 'function') throw new Error('Predicate.func must be a function');
        this.func = func;

        /** @type {object} */
        if (typeof context !== 'object' && !null) throw new Error('Predicate.context must be an object'); 
        this.context = context;

        if (Array.isArray(context.args)) {
            this.args = context.args.reduce((args, key) => {
                args[key] = key;
                return args;
            }, {} as {[key in Extract<keyof ScopeMap, string>]?: ScopeMap[key]});
        } else {
            this.args = context.args;
        }
    }

    /**
     * 
     * @param {string|PredicateLike} name
     * @param {PredicateLike} [func]
     * @param {any} [context]
     * @returns {Predicate}
     */
    /** @type {PredicateCast} */

    static cast = predicate;

    toString () {
        return `[Predicate ${this.name}(${this.context.args || []})]`;
    }

    /**
     * 
     * @param {*} query 
     * @param {Thread} thread 
     * @returns {Promise<void>}
     */
    call (query, thread) {
        // if (this.context.args && this.context.args !== thread.scope.args) {
        //     thread.push(predicate(popScope));
        //     pushScope.call(this.context, null, thread);
        // }
        return this.func(remapQuery(query, this.args, thread.scope), thread);
    }

    and <Args_>(name: string): Predicate<ScopeMap>;
    and <Args_>(func: PredicateLike<PredicateMapFromArgs<Args_>>): Predicate<ScopeMap>;
    and <Args_>(context: PredicateContext<Args_>): Predicate<ScopeMap>;
    and <Args_>(func: boolean | PredicateFunction<PredicateMapFromArgs<Args_>>, context: PredicateContext<Args_>): Predicate<ScopeMap>;
    and <Args_>(func: Predicate<PredicateMapFromArgs<Args_>>, context: PredicateContext<Args_>): Predicate<ScopeMap>;
    and <Args_>(name: string, func: boolean | PredicateFunction<PredicateMapFromArgs<Args_>>, context: PredicateContext<Args_>): Predicate<ScopeMap>;
    and <Args_>(name: string, func: Predicate<PredicateMapFromArgs<Args_>>, context: PredicateContext<Args_>): Predicate<ScopeMap>;
    and <Args_>(...args: PredicateArgs<Args_>): Predicate<ScopeMap>;
    and <Args_>(...args: PredicateArgs<Args_>): Predicate<ScopeMap> {
        return new Predicate('and', andHandle, {hideFromStack: true, left: this, right: predicate(...args)});
        // const pred = Predicate.cast(fn);
        // this.branches.push(pred);
        // return pred;
    }

    or <Args_>(...args: PredicateArgs<Args_>) {
        return new Predicate('or', orHandle, {hideFromStack: true, left: this, right: predicate(...args)});
        // this.branches.push(Predicate.cast(fn));
        // return this;
    }
}

function pushScope (query, thread) {
    const args = this.context.args;
    const scope = new Scope(`\$${thread.index}_`, thread.scope);
    for (const key in args) {
        scope.set(key, args[key]);
    }
    thread.scope = scope;
}

function popScope (query, thread) {
    const map = thread.scope.map;
    for (const key in map) {
        delete thread.query[`${thread.scope.prefix}${key}`];
    }
    thread.scope = thread.scope.next;
    thread.next();
}

function callRef (query, thread) {
    thread.push(this.context.ref);
    thread.next();
}

// type PredicateContextArgKeys<T> = T extends (infer K)[] ? K : keyof T;
// type PredicateContextArgs<K> = Exclude<K extends string ? K : never, string>[] | {[key in Exclude<K extends string ? K : never, string>]: string};

type ContextArgsFromMap<ScopeMap> = {[key in Extract<keyof ScopeMap, string>]?: Extract<ScopeMap[key], string>};

type PredicateContext<K> = {
    args?: K;
    wrap?: Predicate<any>;
    hideFromStack?: boolean;
    left?: Predicate<any>;
    right?: Predicate<any>;
};

function andHandle (query, thread) {
    thread.push(this.context.right);
    thread.push(this.context.left);
    thread.next();
}

function orHandle (query, thread) {
    thread.unshift(this.context.right);
    thread.push(this.context.left);
    thread.next();
}

(async function () {
    const task = predicate({args: ['a', 'c'] as const})
    .and(function addAB (args, thread) {
        args.d = args.a + (args.b | 0);
        thread.replace(this);
        thread.next();
    }, {args: {a: 'a', b: 'b', d: 'b'} as const})
    .and(function assign (args, thread) {
        args.b = args.a;
        thread.next();
    }, {args: {a: 'b', b: 'c'} as const})
    .and(function equal10 (args, thread) {
        if (args.c >= 10) thread.next();
        else thread.pop();
    }, {args: ['c'] as const});

    const t = new Thread(predicate('task', task, {args: {'a': 'd', 'd': 'f'} as const}), {d: 1, e: 0, f: null});
    console.log(await t.run());
    console.log(t.getStackString());
    console.log(await t.run());
}());

// (async function () {
//     const task = predicate({args: ['a', 'b']})
//     .and(predicate(false)
//         .or((args, thread) => {args.a = 'y'; thread.next()}, {args: ['a']})
//         .or((args, thread) => {args.a = 'u'; thread.next()}, {args: ['a']})
//         .or((args, thread) => {args.a = 'i'; thread.next()}, {args: ['a']}), {args: {'a': 'c'}})
//     .and(function addAB (args, thread) {
//         args.d = args.a + args.b;
//         thread.next();
//     }, {args: {a: 'a', b: 'c', d: 'd'}})
//     .and(predicate(false)
//         .or((args, thread) => {args.a = 'q'; thread.next()}, {args: ['a']})
//         .or((args, thread) => {args.a = 'w'; thread.next()}, {args: ['a']})
//         .or((arg Ps, thread) => {args.a = 'e'; thread.next()}, {args: ['a']}), {args: {'a': 'e'}})
//     .and(function addAB (args, thread) {
//         args.d = args.a + args.b;
//         thread.next();
//     }, {args: {a: 'd', b: 'e', d: 'b'}});

//     const t = new Thread(predicate('task', task, {args: {'a': 'd', 'b': 'e'}}), {d: 'a', e: null});
//     console.log(await t.run());
//     console.log(t.getStackString());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
//     console.log(await t.run());
// }());

export {
    Thread,
    Predicate,
    predicate
};
