import { ADDRGETNETWORKPARAMS } from "dns";

type ScopeMap = Readonly<{[key: string]: string}>;
type Scope = {[key: string]: any};

class FieldSet {
    readonly keys: Readonly<string[]>;
    readonly fromKeys: Readonly<string[]>;
    values: any[];
    readonly next: FieldSet;

    changed: boolean = false;

    constructor(map: ScopeMap, next: FieldSet);
    constructor(keys: Readonly<string[]>, fromKeys: Readonly<string[]>, values: any[], next: FieldSet);
    constructor(...args: [ScopeMap, FieldSet] | [Readonly<string[]>, Readonly<string[]>, any[], FieldSet]) {
        if (args.length === 2) {
            const [map, next] = args;
            this.keys = Object.keys(map);
            this.fromKeys = Object.values(map);
            this.values = this.fromKeys.map(key => next.read(key));
            this.next = next;    
        } else {
            [this.keys, this.fromKeys, this.values, this.next] = args;
        }
    }

    read(key: string) {
        return this.values[this.keys.indexOf(key)];
    }

    write(key: string, value: any) {
        if (!this.changed) {
            this.values = this.values.slice();
            this.changed = true;
        }
        return this.values[this.keys.indexOf(key)] = value;
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
            answer[key] = this.read(key);
        }
        return answer;
    }

    clone() {
        this.changed = false;
        return new FieldSet(this.keys, this.fromKeys, this.values, this.next);
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

class Thread {
    fields: FieldSet;
    index: number;
    stack: Predicate[];
    backtrack: Pick<Thread, 'fields' | 'index' | 'stack' | 'backtrack'>;

    constructor() {}

    ifThen() {}

    elseThen() {}

    again() {}

    async run() {
        if (this.index >= this.stack.length) {
            Object.assign(this, this.backtrack);
            this.index += 1;
        }
        while (this.index > -1 && this.index < this.stack.length) {
            const result = await this.stack[this.index].call(this.fields, this);
            if (result === false) {
                Object.assign(this, this.backtrack);
            }
            this.index += 1;
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
type PredicateContext = PredicateArgShortContext | PredicateBaseContext & ({} | PredicateAndContext);

function and() {return true;}
function or() {return true;}

class Predicate {
    func: PredicateFunction;
    context: PredicateContext;
    scopeMap: ScopeMap;

    constructor(context: PredicateContext, func: boolean | PredicateFunction);
    constructor(context: PredicateContext, func: Predicate);
    constructor() {}

    call(fields: FieldSet, thread: Thread) {
        return this.func(fields.remap(this.scopeMap), thread);
    }

    and(...args: [any, any]) {
        return new Predicate({left: this, right: new Predicate(...args)}, and);
    }

    static and(first: [any, any], ...args) {
        return args.reduce((p, pargs) => p.and(pargs), new Predicate(...first));
    }
}

class Arg {
    bind(fields: FieldSet) {
        
    }
}

const Args = new Proxy<{bind: <T>(arg: T) => T, [key: string]: Arg}>({
    bind: arg => arg,
    _: new Arg(),
}, {
    get(target, property) {
        if (typeof property === 'string') {
            if (!target[property]) {
                return new Arg();
            }
            return target[property];
        }
    }
});

function match() {return true;}
function write(obj) {
    return (query, thread) => {
        query.a = obj;
        return true;
    };
};
new Predicate({args: ['a', 'b']}, match);
const matchKey = new Predicate(['b', 'k'],
    Predicate.and(
        [['a'], write(Args.bind({key: Args.k, value: Args._}))],
        [['a', 'b'], match],
    )
);
