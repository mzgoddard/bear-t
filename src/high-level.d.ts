// // -----

// declare abstract class Word<Name, Type> {
//     isNull(): this is WriteableWord<Type>;
//     abstract get(): Type;
//     clone(thread: Thread): Word<Name, Type>;
//     static create<Name, Type>(name: Name, newValue: new () => Type): Word<Name, Type>;
// }
// declare interface WriteableWord<Type> {
//     set(value: Type): Type;
// }

// // -----

// declare type Cloneable<Self> = {
//     clone(thread: Thread): Self
// };
// declare type TemplateArray<Self> = (Self extends any[] ? {[key in Extract<keyof Self, number>]: Template<Self[key]>} : never);
// declare type TemplateObject<Self> = (Self extends {[key in keyof Self]: any} ? {[key in keyof Self]: Template<Self[key]>} : never);
// declare type Template<Self> = boolean | string | number | symbol | Cloneable<Self> | TemplateArray<Self> | TemplateObject<Self>;
// declare class WordTemplate<Object> {
//     clone(thread: Thread): Object;
//     static create<Object>(template: Template<Object>): WordTemplate<Object>;
// }

// // -----

// declare type ScopeShape = {[key: string]: any};
// declare type MergeScope<First, Second> = {};
// declare type SyncReturn = boolean | void;
// declare type AsyncReturn = Promise<SyncReturn>;
// declare type PredicateReturn = SyncReturn | AsyncReturn;
// declare type MergeReturn<First, Second> = First extends SyncReturn ? Second extends SyncReturn ? SyncReturn : AsyncReturn : AsyncReturn;
// declare type PredicateFunction<Return = AsyncReturn> = (thread: Thread) => Return;
// declare interface PredicateMod<Args, Return, Scope> {}

// // -----

// declare type JoinThreadArg<Args> = (
//     Args extends [infer A1] ? [A1, Thread] :
//     Args extends [infer A1, infer A2] ? [A1, A2, Thread] :
//     Args extends [infer A1, infer A2, infer A3] ? [A1, A2, A3, Thread] :
//     Args extends [infer A1, infer A2, infer A3, infer A4] ? [A1, A2, A3, A4, Thread] :
//     Args extends [infer A1, infer A2, infer A3, infer A4, infer A5] ? [A1, A2, A3, A4, A5, Thread] :
//     [Thread]
// );
// declare interface PredicateFactory<Args, Return, Scope> {
//     create<FReturn>(func: (...args: JoinThreadArg<Args>) => FReturn): Predicate<MergeReturn<Return, FReturn>, Scope>;
//     create<MArgs, MReturn, ModScope>(mod: PredicateMod<MArgs, MReturn, ModScope>): PredicateFactory<MArgs, MergeReturn<Return, MReturn>, MergeScope<Scope, ModScope>>;
// }
// // declare type SyncPredicateFactory<Scope> = PredicateFactory<Args, SyncReturn, Scope>;
// declare abstract class Predicate<Return = AsyncReturn, Scope = any> {
//     newThread<ReturnValue>(input: any): Thread<Predicate<Return, Scope>, ReturnValue>;
//     call(thread: Thread): Return;
//     ifThen<FReturn, RightScope>(func: PredicateFunction<FReturn>): Predicate<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
//     ifThen<MArgs, MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
//     elseThen<FReturn, RightScope>(func: PredicateFunction<FReturn>): Predicate<MergeReturn<Return, FReturn>, MergeScope<Scope, RightScope>>;
//     elseThen<MArgs, MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
//     static create<Return, Scope>(func: PredicateFunction<Return>): Predicate<Return, Scope>;
//     static create<MArgs, MReturn, MScope>(mod: PredicateMod<MArgs, MReturn, MScope>): PredicateFactory<MArgs, MReturn, MScope>;
//     static args<Args extends any[], Scope>(...args: Args): PredicateFactory<Args, SyncReturn, Scope>;
//     static scope<CallScope, Scope>(...args): PredicateFactory<[CallScope], SyncReturn, Scope>;
// }

// // -----

// declare function withArgs<Args extends any[], Scope>(...args: Args): PredicateMod<Args, SyncReturn, Scope>;
// declare function withScope<CallScope, Scope>(map): PredicateMod<[CallScope], SyncReturn, Scope>;

// // -----

// declare class ThreadHash {
//     get(key: string): any;
//     set(key: string, value): any;
// }

// declare class Thread<Main = Predicate, ReturnValue = any> {
//     constructor(main: Main, input: any);
//     next(): Main extends Predicate<SyncReturn> ? {value: ReturnValue, done: boolean} : Promise<{value: ReturnValue, done: boolean}>;

//     ifThen(then: Predicate);
//     elseThen(then: Predicate);
//     finally(then: Predicate);
//     rewind();
// }

// // Predicate.create(() => true).newThread({}).next().value;
// // Predicate.create(() => Promise.resolve(true)).newThread({}).next().then(({value}) => value);
