import {Thread} from './thread';

export type Scope = {[key: string]: any};
export type MergeScope<First, Second> = {};
export type SyncReturn = boolean | void;
export type AsyncReturn = Promise<SyncReturn>;
export type PredicateReturn = SyncReturn | AsyncReturn;
export type MergeReturn<First, Second> = First extends SyncReturn ? Second extends SyncReturn ? SyncReturn : AsyncReturn : AsyncReturn;
export type PredicateFunction<Return = AsyncReturn> = (thread: Thread) => Return;
export interface PredicateMod<Args extends any[], Return, Scope> {
    modify<FReturn>(func: (...args: Args) => FReturn): Predicate<MergeReturn<Return, FReturn>, Scope>;
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
interface PredicateFactory<Args extends any[], Return, Scope> {
    body<FReturn>(func: (...args: JoinThreadArg<Args>) => FReturn): Predicate<MergeReturn<Return, FReturn>, Scope>;
    create<MArgs extends any[], MReturn, ModScope>(mod: PredicateMod<MArgs, MReturn, ModScope>): PredicateFactory<MArgs, MergeReturn<Return, MReturn>, MergeScope<Scope, ModScope>>;
}

export abstract class Predicate<Return = AsyncReturn, Scope = any> {
    newThread<ReturnValue = Scope>(input: any): Thread<Predicate<Return, Scope>, ReturnValue> {

    }

    call(thread: Thread): Return {

    }

    ifThen<FReturn, RightScope>(func: PredicateFunction<FReturn>): Predicate<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    ifThen<MArgs extends any[], MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
    ifThen<MArgs extends any[], MReturn, MScope>(arg: PredicateFunction<MReturn> | PredicateMod<MArgs, MReturn, MScope>): Predicate<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | PredicateFactory<MArgs, MReturn, MScope> {

    }

    elseThen<FReturn, RightScope>(func: PredicateFunction<FReturn>): Predicate<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
    elseThen<MArgs extends any[], MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
    elseThen<MArgs extends any[], MReturn, MScope>(arg: PredicateFunction<MReturn> | PredicateMod<MArgs, MReturn, MScope>): Predicate<MergeReturn<Return, MReturn>, MergeScope<Scope, Scope>> | PredicateFactory<MArgs, MReturn, MScope> {

    }

    static create<Return, Scope>(func: PredicateFunction<Return>): Predicate<Return, Scope>;
    static create<MArgs extends any[], MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
    static create<MArgs extends any[], MReturn, MScope>(arg: PredicateFunction<MReturn> | PredicateMod<MArgs, MReturn, MScope>): Predicate<MReturn, MScope> | PredicateFactory<MArgs, MReturn, MScope> {

    }

    static args<Args extends any[], Scope>(...args: Args): PredicateFactory<Args, SyncReturn, Scope> {

    }

    static scope<CallScope, Scope>(...args): PredicateFactory<[CallScope], SyncReturn, Scope> {
        
    }
}
