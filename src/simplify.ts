// Copyright 2018 Peter Kelly <peter@pmkelly.net>
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {
    SExpr,
    BooleanExpr,
    // NumberExpr,
    // StringExpr,
    SymbolExpr,
    // QuoteExpr,
    PairExpr,
    NilExpr,
    UnspecifiedExpr,
} from "./sexpr";
import {
    gensym,
} from "./cps-transform";

// '(if ,e1 ,e2) -> '(if ,e1 ,e2 *unspecified*)
export function simplifyOneArmedIf(root: SExpr): SExpr {
    const transformer = (expr: SExpr): SExpr => {
        if (!(expr instanceof PairExpr))
            return expr;
        const firstCar = expr.car;
        const firstCdr = expr.cdr;
        if (!(firstCar instanceof SymbolExpr))
            return expr;
        if (firstCar.name !== "if")
            return expr;
        if (!(firstCdr instanceof PairExpr))
            return expr;
        const secondCar = firstCdr.car;
        const secondCdr = firstCdr.cdr;
        if (!(secondCdr instanceof PairExpr))
            return expr;

        const thirdCar = secondCdr.car;
        const thirdCdr = secondCdr.cdr;


        if (!(thirdCdr instanceof NilExpr))
            return expr;

        return expr.pair(firstCar,
            firstCdr.pair(secondCar,
                secondCdr.pair(thirdCar,
                    thirdCdr.pair(new UnspecifiedExpr(thirdCdr.range),
                        thirdCdr))));
    };
    return root.transform(transformer);
}

// (define-syntax and
//       (syntax-rules ()
//         ((and) #t)
//         ((and test) test)
//         ((and test1 test2 ...)
//          (if test1 (and test2 ...) #f))))
export function simplifyAnd(root: SExpr): SExpr {
    const transformer = (expr: SExpr): SExpr => {
        const range = expr.range;
        if (!(expr instanceof PairExpr))
            return expr;
        const firstCar = expr.car;
        const firstCdr = expr.cdr;
        if (!(firstCar instanceof SymbolExpr))
            return expr;
        if (firstCar.name !== "and")
            return expr;

        if (firstCdr instanceof NilExpr)
            return new BooleanExpr(range, true);


        if (!(firstCdr instanceof PairExpr))
            return expr;
        const secondCar = firstCdr.car;
        const secondCdr = firstCdr.cdr;

        if (secondCdr instanceof NilExpr)
            return secondCar;

        if (!(secondCdr instanceof PairExpr))
            return expr;

        return simplifyAnd(
            new PairExpr(range,
                new SymbolExpr(range, "if"),
                new PairExpr(range,
                    secondCar,
                    new PairExpr(range,
                        new PairExpr(range,
                            new SymbolExpr(range, "and"),
                                secondCdr),
                        new PairExpr(range,
                            new BooleanExpr(range, false),
                            new NilExpr(range))))));
    };
    return root.transform(transformer);
}

// (define-syntax or
//       (syntax-rules ()
//         ((or) #f)
//         ((or test) test)
//         ((or test1 test2 ...)
//          (let ((x test1))
//            (if x x (or test2 ...))))))
export function simplifyOr(root: SExpr): SExpr {
    const transformer = (expr: SExpr): SExpr => {
        if (!(expr instanceof PairExpr))
            return expr;
        const firstCar = expr.car;
        const firstCdr = expr.cdr;
        if (!(firstCar instanceof SymbolExpr))
            return expr;
        if (firstCar.name !== "or")
            return expr;
        if (firstCdr instanceof NilExpr)
            return new BooleanExpr(expr.range, false);
        if (!(firstCdr instanceof PairExpr))
            return expr;
        const secondCar = firstCdr.car;
        const secondCdr = firstCdr.cdr;
        if (!(secondCdr instanceof PairExpr)) {
            return secondCar;
        }

        const range = expr.range;

        const varname = gensym();

        return simplifyOr(new PairExpr(range,
            new SymbolExpr(range, "letrec"),
            new PairExpr(range,
                new PairExpr(range,
                    new PairExpr(range,
                        new SymbolExpr(range, varname),
                        new PairExpr(range,
                            secondCar,
                            new NilExpr(range))),
                    new NilExpr(range)),
                new PairExpr(range,
                    new PairExpr(range,
                        new SymbolExpr(range, "if"),
                        new PairExpr(range,
                            new SymbolExpr(range, varname),
                            new PairExpr(range,
                                new SymbolExpr(range, varname),
                                new PairExpr(range,
                                    new PairExpr(range,
                                        new SymbolExpr(range, "or"),
                                        secondCdr),
                                    new NilExpr(range))))),
                    new NilExpr(range)))));
    };
    return root.transform(transformer);
}

export function simplify(expr: SExpr): SExpr {
    expr = simplifyOneArmedIf(expr);
    expr = simplifyAnd(expr);
    expr = simplifyOr(expr);
    return expr;
}
