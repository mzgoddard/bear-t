import {Atom, SyncReturn} from "./Atom";
import { ThreadHash } from "./ThreadHash";

type Result<Main, ReturnValue> = (
    Main extends Atom<SyncReturn> ?
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

export class Thread<Main = Atom, ReturnValue = any> {
    hash: ThreadHash;
    frame: ThreadNode;
    origin: ThreadNode;
    back: Pick<Thread<Main, ReturnValue>, 'hash' | 'frame' | 'origin' | 'back'>;

    constructor(main: Main, input: any) {

    }

    answer(): Result<Main, ReturnValue> {}

    ifThen(then: Atom) {
        this.frame.next = new ThreadNode(then, this.frame.next);
    }

    elseThen(then: Atom) {}

    finally(then: Atom) {}

    rewind() {}
}
