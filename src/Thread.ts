import {Atom, SyncReturn, AsyncReturn, AtomReturn} from "./Atom";
import { ThreadHash } from "./ThreadHash";

type Result<Return, ReturnValue> = (
    Return extends SyncReturn ?
    {value: ReturnValue, done: boolean} :
    Promise<{value: ReturnValue, done: boolean}>
);

class ThreadNode {
    then: Atom;
    next: ThreadNode;

    constructor(then: Atom, next: ThreadNode = null) {
        this.then = then;
        this.next = next;
    }
}

export class Thread<Return extends AtomReturn = SyncReturn, ReturnValue = any> {
    hash: ThreadHash;
    frame: ThreadNode;
    origin: ThreadNode;
    back: Pick<Thread<Return, ReturnValue>, 'hash' | 'frame' | 'origin' | 'back'>;

    constructor(main: Atom<Return>, input: any) {

    }

    answer(): Result<Return, ReturnValue> {
        return null;
    }

    ifThen(then: Atom) {
        this.frame.next = new ThreadNode(then, this.frame.next);
    }

    elseThen(then: Atom) {}

    finally(then: Atom) {}

    rewind() {}
}
