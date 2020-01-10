const boolAnd = jsRule([boolArg('left'), boolArg('right')], (a, b) => a.isValue() && b.isValue() && a.value && b.value)
const boolAnd2 = jsRule({left: Boolean, right: Boolean}, ({left, right}) => left && right)
const set = jsRule([anyArg('left'), anyArg('right')], (left, right) => left.isNull() && left.write(right) || left.isValue() && left.value === right.value)
const eq = jsRule([anyArg('left'), anyArg('right')], (left, right) => )
atom(set, anyArg('a'), 10);
run(
    set(anyArg('a'), 10)
    .then(set(anyArg('b'), add(anyArg('a'), 20))
    .then(is(anyArg('c'), anyArg('b'))
)
rule([anyArg('a'), anyArg('b')], atom(set, anyArg('b'), anyArg('a')))