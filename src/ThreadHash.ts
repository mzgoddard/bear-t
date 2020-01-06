import { Word } from "./word";

type Scope = {[key: string]: any};
type ScopeMap = {[key: string]: string};

export class ThreadHash {
    readonly keys: Readonly<string[]>;
    readonly nextKeys: Readonly<string[]>;
    readonly extraKeys: (string | Word)[] = [];
    values: any[];
    readonly next: ThreadHash;

    changed: boolean = false;
    isDestroyed: boolean = false;

    constructor(map: ScopeMap, next: ThreadHash);
    constructor(map: ScopeMap, scope: Scope);
    constructor(keys: Readonly<string[]>, nexteys: Readonly<string[]>, values: any[], next: ThreadHash);
    constructor(...Words: [ScopeMap, ThreadHash] | [ScopeMap, Scope] | [Readonly<string[]>, Readonly<string[]>, any[], ThreadHash]) {
        if (Words.length === 2) {
            let map: ScopeMap;
            let next: ThreadHash;
            let nextScope: Scope;

            if (Words[1] instanceof ThreadHash) {
                [map, next] = Words as [ScopeMap, ThreadHash];
            } else {
                [map, nextScope] = Words as [ScopeMap, Scope];
            }
            this.keys = Object.keys(map) as string[];
            this.nextKeys = Object.values(map) as string[];

            if (next instanceof ThreadHash) {
                this.values = this.nextKeys.map(key => next.get(key));
                this.next = next;
            } else {
                this.values = this.nextKeys.map(key => nextScope[key]);
                this.next = null;
            }
        } else {
            [this.keys, this.nextKeys, this.values, this.next] = Words;
        }
    }

    get(key: string): any {
        if (this.isDestroyed) return null;
        let index = typeof key === 'string' ? this.keys.indexOf(key) : this.extraKeys.indexOf(key);
        if (index === -1) index = this.extraKeys.indexOf(key, this.keys.length);
        return this.values[index];
    }

    getNext(key: string): any {
        if (this.isDestroyed) return null;
        let index = typeof key === 'string' ? this.keys.indexOf(key) : this.extraKeys.indexOf(key);
        if (index === -1) index = this.extraKeys.indexOf(key, this.keys.length);
        return this.values[index];
    }

    set(key: string, value: any): void;
    set(key: Word, value: any): void;
    set(key: string | Word, value: any) {
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
        const _this = this;
        return {
            get() {
                return _this.get(key);
            },
            set(value: any) {
                _this.set(key, value);
            },
        };
    }

    remap(map: ScopeMap): Scope {
        const query: any = {};
        for (const key in map) {
            Object.defineProperty(query, key, this.property(map[key]));
        }
        return query;
    }

    result(): Scope {
        const answer: any = {};
        for (const key of this.keys) {
            if (typeof key === 'string') {
                answer[key] = this.get(key);
            }
        }
        return answer;
    }

    clone(): ThreadHash {
        this.changed = false;
        const newFields = new ThreadHash(this.keys, this.nextKeys, this.values, this.next);
        newFields.extraKeys.push(...this.extraKeys);
        return newFields as ThreadHash;
    }

    push(map: ScopeMap) {
        return new ThreadHash(map, this);
    }

    pop() {
        const nextClone = this.next.clone();
        this.nextKeys.forEach((nextKey, index) => (
            nextClone.set(nextKey, this.get(this.keys[index]))
        ));
        return nextClone;
    }
}
