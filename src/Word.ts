import { Thread } from "./Thread";
import { ThreadHash } from "./ThreadHash";

type SimpleType<Type> = (
    Type extends Boolean ? boolean :
    Type extends String ? string :
    Type extends Number ? number :
    Type extends Symbol ? symbol :
    Type
);

export abstract class Word<Name extends string = string, Type = any> {
    readonly name: Name;
    readonly valueType: new () => Type;

    constructor(name: Name, valueType: new () => Type) {
        this.name = name;
        this.valueType = valueType;
    }

    abstract isNull(): this is WriteableWord<Type>;

    abstract get(): SimpleType<Type>;

    abstract clone(thread: Thread): Word<Name, Type>;

    static create<Name extends string, Type = any>(name: Name, newValue: new () => Type = null): Word<Name, Type> {
        return new WordImpl<Name, Type>(name, newValue);
    }
}

export interface WriteableWord<Type> {
    set(value: SimpleType<Type>);
}

class WordImpl<Name extends string, Type = any> extends Word<Name, Type> implements WriteableWord<Type> {
    private hash: ThreadHash = null;
    private thread: Thread = null;

    constructor(name: Name, valueType: new () => Type, thread?: Thread) {
        super(name, valueType);
        if (thread) {
            this.thread = thread;
        }
    }

    isNull(): this is WriteableWord<Type> {
        return this.thread && this.hash === null;
    }

    get(): SimpleType<Type> {
        return this.hash.get(this.name) as SimpleType<Type>;
    }

    set(value: SimpleType<Type>) {
        if (this.isNull()) {
            this.hash = this.thread.hash;
            this.hash.set(this, value);
        } else {
            throw new Error('Cannot set a value to a Word that already has a value.');
        }
    }

    clone(thread: Thread): Word<Name, Type> {
        return new WordImpl<Name, Type>(this.name, this.valueType);
    }
}
