import {Thread} from './thread';

export type Scope = {[key: string]: any};
export type MergeScope<First, Second> = {};
export type SyncReturn = boolean | void;
export type AsyncReturn = Promise<SyncReturn>;
export type AtomReturn = SyncReturn | AsyncReturn;
export type MergeReturn<First, Second> = First extends SyncReturn ? Second extends SyncReturn ? SyncReturn : AsyncReturn : AsyncReturn;
export type AtomFunction<Return extends AtomReturn> = (thread: Thread) => Return;
export interface AtomMod<Args extends any[], Return, Scope> {
    modify<FReturn extends AtomReturn, MReturn extends AtomReturn = MergeReturn<Return, FReturn>>(func: (...args: Args) => FReturn): AtomFunction<MReturn>;
}
export interface AtomModMod<Args extends any[], Return, Scope> {
    extend<MArgs extends any[], MReturn, MScope, EArgs extends any[]>(mod: AtomMod<MArgs, MReturn, MScope>): AtomMod<EArgs, MergeReturn<Return, MReturn>, MergeScope<Scope, MScope>>;
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

export abstract class Atom<Return = any, Scope = any> {
    readonly func: AtomFunction<Return>;
    readonly children: Atom[];

    constructor(func: AtomFunction<Return>, children: Atom[] = []) {
        this.func = func;
        this.children = children;
    }

    ask<ReturnValue = Scope>(input: any): Thread<Atom<Return, Scope>, ReturnValue> {
        return new Thread(this, input);
    }

    call(thread: Thread): Return {
        return this.func(thread);
    }

    ifThen<FReturn, RightScope>(func: AtomFunction<FReturn>): Atom<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    ifThen<MArgs extends any[], MReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope>;
    ifThen<MArgs extends any[], MReturn, MScope>(arg: AtomFunction<MReturn> | AtomMod<MArgs, MReturn, MScope>): Atom<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | AtomFactory<MArgs, MReturn, MScope> {

    }

    elseThen<FReturn, RightScope>(func: AtomFunction<FReturn>): Atom<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    elseThen<MArgs extends any[], MReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope>;
    elseThen<MArgs extends any[], MReturn, MScope>(arg: AtomFunction<MReturn> | AtomMod<MArgs, MReturn, MScope>): Atom<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | AtomFactory<MArgs, MReturn, MScope> {

    }

    static do<Return, Scope>(func: AtomFunction<Return>): Atom<Return, Scope> {
        return new AtomImpl(func);
    }

    static extend<MArgs extends any[], MReturn extends AtomReturn, MScope>(mod: AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope> {
        return new AtomFactory(mod);
    }

    static args<Args extends any[], Scope>(...args: Args): AtomFactory<Args, SyncReturn, Scope> {
        return new AtomFactory({
            modify(func: (thread: Thread) => SyncReturn) {
                return func;
            }
        });
    }

    static scope<CallScope, Scope>(...args): AtomFactory<[CallScope], SyncReturn, Scope> {
        
    }
}

class AtomImpl<Return, Scope> extends Atom<Return, Scope> {
}

class AtomFactory<Args extends any[], Return extends AtomReturn, Scope> implements AtomFactory<Args, Return, Scope> {
    // extension: (...args: JoinThreadArg<Args>) => (thread: Thread) => Return;
    readonly mod: AtomMod<Args, Return, Scope>;

    constructor(mod: AtomMod<Args, Return, Scope>) {
        this.mod = mod;
    }

    do<FReturn>(func: (...args: Args) => FReturn): Atom<MergeReturn<Return, FReturn>, Scope> {
        return new AtomImpl<MergeReturn<Return, FReturn>, Scope>(this.mod.modify(func));
    }

    // extend<ModMod extends AtomModMod, ModOut>(modMod: ModMod): ModOut {
    //     return new AtomFactory(modMod.extend(this.mod));
    // }
    extend<MArgs extends any[], MReturn extends AtomReturn, MScope>(modMod: (mod: AtomMod<Args, Return, Scope>) => AtomMod<MArgs, MReturn, MScope>): AtomFactory<MArgs, MReturn, MScope> {
        return new AtomFactory(modMod(this.mod));
    }
}
