enum PotEnum {
    None,
    Error,
    Some,
    Promise
}

class Pot<V> {
    readonly value: unknown;
    readonly type: PotEnum;

    constructor(value: Promise<null>);
    constructor(value: Promise<Error>);
    constructor(value: Promise<Pot<V>>);
    constructor(value: Promise<V>);
    constructor(value: null);
    constructor(value: Error);
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
    isNone(): this is {value: null, type: PotEnum.None} {
        return this.type === PotEnum.None;
    }
    isError(): this is {value: Error, type: PotEnum.Error} {
        return this.type === PotEnum.Error;
    }
    isSome(): this is {value: V, type: PotEnum.Some} {
        return this.type === PotEnum.Some;
    }
    isPromise(): this is {value: Promise<Pot<V>>, type: PotEnum.Promise} {
        return this.type === PotEnum.Promise;
    }
    map<S>(isSome: (value: V) => S, isNone: () => S, isError: (e: Error) => S): Pot<S> {
        try {
            if (this.isPromise()) {
                return new Pot(this.value.then(pot => pot.map(isSome, isNone, isError), Pot.error));
            } else if (this.isSome() && isSome) {
                return new Pot(isSome(this.value));
            } else if (this.isError() && isError) {
                return new Pot(isError(this.value));
            } else if (this.isNone() && isNone) {
                return new Pot(isNone());
            }
        } catch (err) {
            return Pot.error(err);
        }
        return Pot.none();
    }
    static create<V>(value: Promise<null>): Pot<null>;
    static create<V>(value: Promise<Error>): Pot<null>;
    static create<V>(value: Promise<Pot<V>>): Pot<V>;
    static create<V>(value: Promise<V>): Pot<V>;
    static create(value: null): Pot<null>;
    static create(value: Error): Pot<null>;
    static create<V>(value: Pot<V>): Pot<V>;
    static create<V>(value: V): Pot<V>;
    static create<V>(value: Promise<null | Error | Pot<V> | V> | null | Error | Pot<V> | V): Pot<V>;
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
