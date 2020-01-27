enum PotEnum {
    None,
    Error,
    Some,
    Promise
}

type Potable<V> = Promise<Pot<V> | V> | Pot<V> | V;

type PotIs<Value = unknown, Type = PotEnum> = {
    readonly value: Value;
    readonly type: Type;
};

type PotNone = PotIs<null, PotEnum.None> & {
    map<S>(isSome?: () => never, isNone?: () => Potable<S>, isError?: () => never): Pot<S>;
    unwrap(): null;
};
type PotError = PotIs<Error, PotEnum.Error> & {
    map<S>(isSome?: () => never, isNone?: () => never, isError?: (err: Error) => Potable<S>): Pot<S>;
    unwrap(): never;
};
type PotSome<V> = PotIs<V, PotEnum.Some> & {
    map<S>(isSome?: (some: V) => Potable<S>, isNone?: () => never, isError?: () => never): Pot<S>;
    unwrap(): V;
};
type PotPromise<V> = PotIs<Promise<Pot<V>>, PotEnum.Promise> & {
    map<S>(isSome?: (some: V) => Potable<S>, isNone?: () => Potable<S>, isError?: (err: Error) => Potable<S>): Pot<S>;
    unwrap(): Promise<V>;
};

export default class Pot<V> {
    readonly value: unknown;
    readonly type: PotEnum;

    constructor(value: null);
    constructor(value: Error);
    constructor(value: Promise<null>);
    constructor(value: Promise<Error>);
    constructor(value: Promise<Pot<V>>);
    constructor(value: Promise<V>);
    constructor(value: Pot<V>);
    constructor(value: V);
    constructor(value: Promise<null | Error | Pot<V> | V> | null | Error | Pot<V> | V);
    constructor(value: Promise<null | Error | Pot<V> | V> | null | Error | Pot<V> | V) {
        if (value instanceof Promise) {
            this.value = value.then(Pot.create, Pot.error);
            this.type = PotEnum.Promise;
        } else if (value instanceof Pot) {
            this.value = value.value;
            this.type = value.type;
        } else if (value instanceof Error) {
            this.value = value;
            this.type = PotEnum.Error;
        } else if (value != null) {
            this.value = value;
            this.type = PotEnum.Some;
        } else {
            this.type = PotEnum.None;
        }
    }
    isNone(): this is PotNone {
        return this.type === PotEnum.None;
    }
    isError(): this is PotError {
        return this.type === PotEnum.Error;
    }
    isSome(): this is PotSome<V> {
        return this.type === PotEnum.Some;
    }
    isPromise(): this is PotPromise<V> {
        return this.type === PotEnum.Promise;
    }
    map<S>(isSome: (value: V) => Potable<S> = null, isNone: () => Potable<S> = null, isError: (e: Error) => Potable<S> = null): Pot<S> {
        try {
            if (this.isPromise()) {
                return new Pot(this.value.then(pot => pot.map(isSome, isNone, isError), Pot.error));
            } else if (this.isSome() && isSome) {
                return new Pot<S>(isSome(this.value));
            } else if (this.isError() && isError) {
                return new Pot<S>(isError(this.value));
            } else if (this.isNone() && isNone) {
                return new Pot<S>(isNone());
            }
        } catch (err) {
            return Pot.error(err);
        }
        return Pot.none();
    }
    unwrap(): Promise<V> | V {
        if (this.isPromise()) return this.value.then(pot => pot.unwrap());
        else if (this.isSome()) return this.value;
        else if (this.isError()) throw this.value;
        return null;
    }
    static create<V>(value: Pot<V>): Pot<V>;
    static create<V>(value: Pot<V> | V): Pot<V>;
    static create<V>(value: Promise<null>): Pot<null>;
    static create<V>(value: Promise<Error>): Pot<null>;
    static create<V>(value: Promise<Pot<V>>): Pot<V>;
    static create<V>(value: Promise<Pot<V> | V>): Pot<V>;
    static create<V>(value: Promise<V>): Pot<V>;
    static create<V>(value: Promise<V> | V): Pot<V>;
    static create(value: null): Pot<null>;
    static create(value: Error): Pot<null>;
    static create<V>(value: Promise<null | Error | Pot<V> | V> | null | Error | Pot<V> | V): Pot<V>;
    static create<V>(value: V): Pot<V>;
    static create<V>(value: Promise<null | Error | Pot<V> | V> | null | Error | Pot<V> | V): Pot<V> {
        if (value instanceof Error) {
            return Pot.error(value);
        } else if (value instanceof Promise) {
            return new Pot(value.then(pvalue => {
                if (pvalue instanceof Pot) {
                    return pvalue;
                } else if (pvalue instanceof Error) {
                    return Pot.error(pvalue);
                }
                return new Pot(pvalue);
            }));
        } else if (value instanceof Pot) {
            return value;
        }
        return new Pot(value);
    }
    static error(e: Error): Pot<null> {
        if (e instanceof Error) return new Pot(e);
        return new Pot(new Error(e));
    }
    static none(): Pot<null> {
        return new Pot(null);
    }
}

export const pot = Pot.create;
