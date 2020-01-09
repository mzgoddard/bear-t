import {Thread} from './thread';

export type Scope = {[key: string]: any};
export type MergeScope<First, Second> = {};
export type SyncReturn = boolean | void;
export type AsyncReturn = Promise<SyncReturn>;
export type AtomReturn = SyncReturn | AsyncReturn;
export type MatchReturn<Return extends AtomReturn, Value> = Return extends AsyncReturn ? Promise<Value> : Value;
export type MergeReturn<First, Second> = First extends SyncReturn ? Second extends SyncReturn ? SyncReturn : AsyncReturn : AsyncReturn;
export type AtomFunction<Return extends AtomReturn> = (thread: Thread) => Return;
export interface AtomMod<Args extends any[], Return, Scope> {
    modify<FReturn extends AtomReturn>(func: (...args: Args) => FReturn): AtomFunction<MergeReturn<Return, FReturn>>;
}
export interface AtomModMod {
    extend<IArgs extends any[], IReturn, IScope, OArgs extends any[], OReturn, OScope>(mod: AtomMod<IArgs, IReturn, IScope>): AtomMod<OArgs, OReturn, OScope>;
}

class AtomModModArgs<Args extends any[], Return, Scope> implements AtomModMod {
    extend<IArgs extends any[], IReturn, IScope, OArgs extends any[] = [Args, IArgs], OReturn = MergeReturn<Return, IReturn>, OScope = MergeScope<Scope, IScope>>(mod: AtomMod<IArgs, IReturn, IScope>): AtomMod<OArgs, OReturn, OScope> {
        return null;
    }
}

// -----

type JoinThreadArg<Args> = (
    Args extends [infer A1] ? [A1, Thread] :
    Args extends [infer A1, infer A2] ? [A1, A2, Thread] :
    Args extends [infer A1, infer A2, infer A3] ? [A1, A2, A3, Thread] :
    Args extends [infer A1, infer A2, infer A3, infer A4] ? [A1, A2, A3, A4, Thread] :
    Args extends [infer A1, infer A2, infer A3, infer A4, infer A5] ? [A1, A2, A3, A4, A5, Thread] :
    [Thread]
);

// interface AtomFactory<Args extends any[], Return, Scope> {
//     do<FReturn>(func: (...args: Args) => FReturn): Atom<MergeReturn<Return, FReturn>, Scope>;
//     extend<MArgs extends any[], MReturn, ModScope>(mod: AtomMod<MArgs, MReturn>): AtomFactory<MArgs, MergeReturn<Return, MReturn>, MergeScope<Scope, ModScope>>;
// }

export abstract class Atom<Return extends AtomReturn = any, Scope = any> {
    readonly func: AtomFunction<Return>;
    readonly children: Atom[];

    constructor(func: AtomFunction<Return>, children: Atom[] = []) {
        this.func = func;
        this.children = children;
    }

    ask<ReturnValue = Scope>(input: any): Thread<Return, ReturnValue> {
        return new Thread(this, input);
    }

    run<ReturnValue = Scope>(input: any): MatchReturn<Return, ReturnValue> {
        return null;
    }

    call(thread: Thread): Return {
        return this.func(thread);
    }

    thenIf<FReturn extends AtomReturn, RightScope>(func: AtomFunction<FReturn>): Atom<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    thenIf<MArgs extends any[], MReturn extends AtomReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope>;
    thenIf<MArgs extends any[], MReturn extends AtomReturn, MScope>(arg: AtomFunction<MReturn> | AtomMod<MArgs, MReturn, MScope>): Atom<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | AtomFactory<MArgs, MReturn, MScope> {
        return null;
    }

    elseThen<FReturn extends AtomReturn, RightScope>(func: AtomFunction<FReturn>): Atom<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    elseThen<MArgs extends any[], MReturn extends AtomReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope>;
    elseThen<MArgs extends any[], MReturn extends AtomReturn, MScope>(arg: AtomFunction<MReturn> | AtomMod<MArgs, MReturn, MScope>): Atom<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | AtomFactory<MArgs, MReturn, MScope> {
        return null;
    }

    static if<Return extends AtomReturn, Scope>(func: AtomFunction<Return>): Atom<Return, Scope> {
        return new AtomImpl(func);
    }

    static extend<MArgs extends any[], MReturn extends AtomReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope> {
        return new AtomFactory(mod);
    }

    static args<Args extends any[], Scope>(...args: Args): AtomFactory<JoinThreadArg<Args>, SyncReturn, Scope> {
        return new AtomFactory({
            modify<FReturn extends AtomReturn>(func: (...args: JoinThreadArg<Args>) => FReturn): AtomFunction<MergeReturn<SyncReturn, FReturn>> {
                return (thread: Thread): MergeReturn<SyncReturn, FReturn> => {
                    const out: unknown = func(...([...args, thread] as JoinThreadArg<Args>));
                    if (out instanceof Promise) {
                        return out as MergeReturn<SyncReturn, FReturn>;
                    }
                    return out as MergeReturn<SyncReturn, FReturn>;
                };
            }
        });
    }

    static scope<CallScope, Scope>(...args): AtomFactory<[CallScope], SyncReturn, Scope> {
        return null;
    }
}

function mergeReturn(){}

class AtomImpl<Return extends AtomReturn, Scope> extends Atom<Return, Scope> {
}

class AtomFactory<Args extends any[], Return extends AtomReturn, Scope> implements AtomFactory<Args, Return, Scope> {
    // extension: (...args: JoinThreadArg<Args>) => (thread: Thread) => Return;
    readonly mod: AtomMod<Args, Return, Scope>;

    constructor(mod: AtomMod<Args, Return, Scope>) {
        this.mod = mod;
    }

    do<FReturn extends AtomReturn>(func: (...args: Args) => FReturn): Atom<MergeReturn<Return, FReturn>, Scope> {
        return new AtomImpl<MergeReturn<Return, FReturn>, Scope>(this.mod.modify(func));
    }

    // extend<ModMod extends AtomModMod, ModOut>(modMod: ModMod): ModOut {
    //     return new AtomFactory(modMod.extend(this.mod));
    // }
    extend<MArgs extends any[], MReturn extends AtomReturn, MScope>(modMod: AtomModMod): AtomFactory<MArgs, MReturn, MScope> {
        return new AtomFactory(modMod.extend(this.mod));
    }
}
