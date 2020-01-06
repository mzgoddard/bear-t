import {Thread} from './Thread';

type Cloneable<Self> = {
    clone(thread: Thread): Self;
};

type TemplateArray<Self> = (Self extends any[] ? {[key in Extract<keyof Self, number>]: Template<Self[key]>} : never);
type TemplateObject<Self> = (Self extends {[key in keyof Self]: any} ? {[key in keyof Self]: Template<Self[key]>} : never);
type Template<Self = any> = boolean | string | number | symbol | Cloneable<Self> | TemplateArray<Self> | TemplateObject<Self>;

abstract class WordTemplate<Object extends Template> {
    abstract clone(thread: Thread): Object;

    static create<Object extends Template>(template: Object): WordTemplate<Object> {

    }
}

class WordArrayTemplate {}

class WordObjectTemplate {}
