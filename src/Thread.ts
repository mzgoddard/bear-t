import {Predicate, SyncReturn} from "./Predicate";
import { ThreadHash } from "./ThreadHash";

type Result<Main, ReturnValue> = (
    Main extends Predicate<SyncReturn> ?
    {value: ReturnValue, done: boolean} :
    Promise<{value: ReturnValue, done: boolean}>
);

class ThreadNode {
    then: Predicate;
    next: ThreadNode;

    constructor(then: Predicate, next: ThreadNode = null) {
        this.then = then;
        this.next = next;
    }
}

export class Thread<Main = Predicate, ReturnValue = any> {
    hash: ThreadHash;
    frame: ThreadNode;
    origin: ThreadNode;
    back: Pick<Thread<Main, ReturnValue>, 'hash' | 'frame' | 'origin' | 'back'>;

    constructor(main: Main, input: any) {

    }

    answer(): Result<Main, ReturnValue> {}

    ifThen(then: Predicate) {
        this.frame.next = new ThreadNode(then, this.frame.next);
    }

    elseThen(then: Predicate) {}

    finally(then: Predicate) {}

    rewind() {}
}
