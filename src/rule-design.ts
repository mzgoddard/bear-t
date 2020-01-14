// // const boolAnd = jsRule([boolArg('left'), boolArg('right')], (a, b) => a.isValue() && b.isValue() && a.value && b.value)
// // const boolAnd2 = jsRule({left: Boolean, right: Boolean}, ({left, right}) => left && right)
// // const set = jsRule([anyArg('left'), anyArg('right')], (left, right) => left.isNull() && left.write(right) || left.isValue() && left.value === right.value)
// // const eq = jsRule([anyArg('left'), anyArg('right')], (left, right) => )
// // atom(set, anyArg('a'), 10);
// // run(
// //     set(anyArg('a'), 10)
// //     .then(set(anyArg('b'), add(anyArg('a'), 20))
// //     .then(is(anyArg('c'), anyArg('b'))
// // )
// // rule([anyArg('a'), anyArg('b')], atom(set, anyArg('b'), anyArg('a')))

// class Arg<Type = any> {
//     name: string;
// }

// type Value = boolean | string | number | symbol | Arg | Value[] | {[key: string]: Value};

// type Rule = {
//     (...args: any[]): Atom;
//     argNames: any[];
//     body: Atom | Function;
// };

// type Atom<Tag extends string | Rule = string | Rule, Args extends Value[] = any[]> = {
//     tag: Tag,
//     args: Args,

//     and(...args): Atom;
//     or(...args): Atom;
// };

// const atom = <Tag extends string | Rule, Args extends Value[]>(tag: Tag, ...args: Args): Atom => ({tag, args});

// const rule = (argNames: any[], body: Atom | Function): Rule => {
//     const f = Object.assign((...args: any[]) => atom(f, ...args), {
//         argNames,
//         body,
//     });
//     return f;
// };

// const arg = (name: string) => ({});

// const value = (v) => ({});

// class ArgSet {
//     puts: Arg[];
//     locals: Arg[];

//     get(key: string | Arg) {
//         const name = key instanceof Arg ? key.name : key;
//         for (let i = 0; i < this.puts.length; i++) {
//             if (this.puts[i].name === name) return this.puts[i];
//         }
//         for (let i = 0; i < this.locals.length; i++) {
//             if (this.puts[i].name === name) return this.puts[i];
//         }
//         const newArg = new Arg();
//         this.locals.push(newArg);
//         return newArg;
//     }

//     scope(keys: string[]) {
//         const scope = {};
//         for (let i = 0; i < keys.length; i++) {
//             scope[keys[i]] = this.get(keys[i]);
//         }
//         return scope;
//     }
// }

// const and = (...args) => atom('and', ...args);
// const or = (...args) => atom('and', ...args);
// const bound = (...args) => atom('and', ...args);

// rule(
//     ['a', 'b', 'c'],
//     and(bound('a'), and(bound('b'),
//         or(
//             and(bound('c'), atom(rule(['a', 'b', 'c'], (t, a, b, c) => (c.value === a.value + b.value))),
//             atom(rule(['a', 'b', 'c'], (t, a, b, c) => {c.value = a.value + b.value;}))
//         )
//     )))
// )
// // (((a; , b; ), c; ), c is a + b)
// // (
// //    (a, ((b, ((c, c = a + b); c is a + b)); b is c - a));
// //    (
// //        (
// //            b,
// //            (
// //                (c, a is c - b);
// //                false
// //            )
// //        );
// //        false
// //    )
// // )
// bound('a')
//     .and(bound('b')
//         .and(bound('c')
//             .and(atom(rule(['a', 'b', 'c'], (t, a, b, c) => (c.value === a.value + b.value)), 'a', 'b', 'c'))
//             .or(atom(rule([], () => {})))
//         )
//         .or(atom(rule([], () => {})))
//     )
//     .or(bound('b')
//         .and()
//     )

// bound('a')
//     .and()

// const add = rule([arg('a'), arg('b'), arg('c')], (thread, a, b, c) => {
//     if (a.isBound()) {
//         if (b.isBound()) {
//             if (c.isBound()) {
//                 return c.value === a.value + b.value;
//             } else {
//                 c.value = a.value + b.value;
//             }
//         } else {
//             if (c.isBound()) {
//                 b.value = c.value - a.value;
//             } else {
//                 return false;
//             }
//         }
//     } else {
//         if (b.isBound()) {
//             if (c.isBound()) {
//                 a.value = c.value - b.value;
//             } else {
//                 return false;
//             }
//         } else {
//             return false;
//         }
//     }
// })
// const neg = rule([arg('i'), arg('o')], (thread, i, o) => {
//     if (i.isBound()) {
//         if (o.isBound()) {
//             return o.value === -i.value;
//         } else {
//             o.value = -i.value;
//         }
//     } else {
//         if (o.isBound()) {
//             i.value = -o.value;
//         } else {
//             return false;
//         }
//     }
// })
// const sub = rule([arg('a'), arg('b'), arg('c')], and(neg(arg('b'), arg('nb')), add(arg('a'), arg('nb'), arg('c'))))
// const add2 = rule([arg('a'), arg('c')],
//     and(
//         add(value(2), value(2), arg('b')),
//         add(arg('a'), arg('b'), arg('c'))
//     ))

// and({left: add(2, 2, 'b'), right: add('a', 'b', 'c')})