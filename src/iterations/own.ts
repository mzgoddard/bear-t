type Own<T> = T;
type Borrow<T> = Readonly<T>;
type BorrowMut<T> = T & {__mut: true};

class OOption<T> {
    private _isSome: boolean;
    private readonly _value: Own<T>;

    constructor(isSome, value: Own<T>) {
        this._isSome = isSome;
        this._value = value;
    }

    static None() {
        return new OOption(false, null);
    }

    static Some<T>(value: Own<T>) {
        return new OOption(true, value);
    }

    take(): OOption<T> {
        return this._isSome ? OOption.Some(this._value) : OOption.None();
    }

    unwrap(): Own<T> {
        if (this._isSome) return this._value;
        throw new Error('Cannot unwrap none option');
    }

    isNone() {}

    isSome() {}
}
