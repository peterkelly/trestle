# About Trestle

Trestle is an experimental interpreter for a programming language based on
[Scheme](http://www.schemers.org). It is a research vehicle for exploring
various language features and implementation techniques, with a particular
focus on reactive programming.

This project is in the early stages of development and isn't really useful for
anything yet.

# Building

    git clone git@github.com:peterkelly/trestle.git
    cd trestle
    npm run setup
    npm run build

# Running

Three modes of evaluation are supported. Direct evaluation performs a pre-order
traversal of the AST, evaluating subexpressions and then passing the results to
the containing expressions. The evaluation relies on the host JavaScript VM's
stack.

    node dist/main.js --eval-direct samples/fac.scm

CPS (continuation passing) evaluation is implemented in a similar way to the
above, except that instead of returning the result of evaluating an expression
directly, it passes it to a success or failure continuation. Currently this
also relies on the host VM's stack, which will be exhausted pretty quickly for
non-trivial programs.

    node dist/main.js --eval-cps samples/fizzbuzz.scm

Reactive evaluation allows the program to read from a series of *inputs*, each
of which is a value that can change over time. At present, there is one
hard-coded input called "test", which starts at 0 and increases by 1 every
second.

The first time the program's top-level expression is evaluated, the interpreter
constructs a dataflow graph and returns the value of the root node. Each time
the input changes, the necessary parts of the dataflow graph are re-evaluated,
and the updated value is displayed. When the result is a (nested) list
structure, the parts that have changed are highlighted.

    node dist/main.js --eval-reactive samples/reactive/if4.scm
