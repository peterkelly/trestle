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

import { SExpr } from "./sexpr";
import { LexicalRef, LexicalScope } from "./scope";
import { Value, StringValue, PairValue, NilValue, BooleanValue } from "./value";
import { Environment, Continuation } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";

export abstract class ASTNode {
    public _class_ASTNode: any;

    public constructor() {
    }

    public abstract dump(indent: string): void;

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        throw new Error((<any> this).constructor.name + ".evaluate() not implemented");
    }
}

export class ConstantNode extends ASTNode {
    public _class_ConstantNode: any;
    public value: SExpr;
    public constructor(value: SExpr) {
        super();
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "Constant");
        this.value.dump(indent + "    ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        succeed(this.value.toValue());
    }
}

export class TryNode extends ASTNode {
    public _class_TryNode: any;
    public tryBody: ASTNode;
    public catchBody: ASTNode;

    public constructor(tryBody: ASTNode, catchBody: ASTNode) {
        super();
        this.tryBody = tryBody;
        this.catchBody = catchBody;
    }

    public dump(indent: string): void {
        console.log(indent + "Try-Catch");
        console.log(indent + "    Try");
        this.tryBody.dump(indent + "        ");
        console.log(indent + "    Catch");
        this.catchBody.dump(indent + "        ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        this.tryBody.evaluate(env,
            // success continuation
            (value: Value): void => {
                succeed(value);
            },
            // failure continuation
            (value: Value): void => {
                // FIXME: the catch body should be a LambaNode, and we should pass the value to it
                this.catchBody.evaluate(env, succeed, fail);
            });
    }
}

export class ThrowNode extends ASTNode {
    public _class_ThrowNode: any;
    public body: ASTNode;

    public constructor(body: ASTNode) {
        super();
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Throw");
        this.body.dump(indent + "    ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        // If the throw succeeds (the exception expression was evaluated successfully), then we
        // call fail with the computed value.
        // If the throw fails (another exception occurred while trying to evaluate the expression),
        // then we call fail with that exception. Either way, we fail.
        this.body.evaluate(env, fail, fail);
    }
}

// export class QuoteNode extends ASTNode {
//     public _class_QuoteNode: any;

//     public constructor() {
//         super();
//     }
// }

export class AssignNode extends ASTNode {
    public _class_AssignNode: any;
    public ref: LexicalRef;
    public body: ASTNode;
    public constructor(ref: LexicalRef, body: ASTNode) {
        super();
        this.ref = ref;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Assign " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
        this.body.dump(indent + "    ");
    }
}

export class DefineNode extends ASTNode {
    public _class_DefineNode: any;
    public name: string;
    public body: ASTNode;

    public constructor(name: string, body: ASTNode) {
        super();
        this.name = name;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Define " + this.name);
        this.body.dump(indent + "    ");
    }
}

export class IfNode extends ASTNode {
    public _class_IfNode: any;

    public constructor(
        public condition: ASTNode,
        public consequent: ASTNode,
        public alternative: ASTNode | null
    ) {
        super();
    }

    public dump(indent: string): void {
        console.log(indent + "If");
        this.condition.dump(indent + "    ");
        this.consequent.dump(indent + "    ");
        if (this.alternative)
            this.alternative.dump(indent + "    ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (value: Value): void => {
            if (!(value instanceof BooleanValue) || (value.data !== false))
                this.consequent.evaluate(env, succeed, fail);
            else if (this.alternative !== null)
                this.alternative.evaluate(env, succeed, fail);
            else
                succeed(new BooleanValue(true));
        };
        this.condition.evaluate(env, succeed2, fail);
    }
}

export class LambdaProcedureValue extends Value {
    public _class_LambdaProcedureValue: any;
    public readonly env: Environment;
    public readonly proc: LambdaNode;

    public constructor(env: Environment, proc: LambdaNode) {
        super();
        this.env = env;
        this.proc = proc;
    }

    public print(output: string[], visiting: Set<Value>): void {
        output.push("<lambda ("  + this.proc.variables.join(" ") + ")>");
    }
}

export class LambdaNode extends ASTNode {
    public _class_LambdaNode: any;
    public readonly variables: string[];
    public readonly innerScope: LexicalScope;
    public readonly body: ASTNode;

    public constructor(variables: string[], innerScope: LexicalScope, body: ASTNode) {
        super();
        this.variables = variables;
        this.innerScope = innerScope;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Lambda" + this.variables.map(v => " " + v).join(""));
        this.body.dump(indent + "    ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        succeed(new LambdaProcedureValue(env, this));
    }
}

export class SequenceNode extends ASTNode {
    public _class_SequenceNode: any;
    public body: ASTNode;
    public next: ASTNode;

    public constructor(body: ASTNode, next: ASTNode) {
        super();
        this.body = body;
        this.next = next;
    }

    public dump(indent: string): void {
        console.log(indent + "Sequence");
        let cur: ASTNode = this;
        while (cur instanceof SequenceNode) {
            cur.body.dump(indent + "    ");
            cur = cur.next;
        }
        cur.dump(indent + "    ");
    }
}

// export class CondNode extends ASTNode {
//     public _class_CondNode: any;
//     public constructor() {
//         super();
//     }
// }

export class ApplyNode extends ASTNode {
    public _class_ApplyNode: any;
    public proc: ASTNode;
    public args: ASTNode[];

    public constructor(proc: ASTNode, args: ASTNode[]) {
        super();
        this.proc = proc;
        this.args = args;
    }

    public dump(indent: string): void {
        console.log(indent + "Apply");
        this.proc.dump(indent + "    ");
        for (let i = 0; i < this.args.length; i++) {
            console.log(indent + "    arg " + i);
            this.args[i].dump(indent + "        ");
        }
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (procValue: Value): void => {
            this.evaluateArg(procValue, 0, NilValue.instance, env, succeed, fail);
        };
        this.proc.evaluate(env, succeed2, fail);
    }

    public evaluateArg(procValue: Value, argno: number, prev: Value, env: Environment, succeed: Continuation, fail: Continuation): void {
        if (argno >= this.args.length) {
            this.evaluateProc(procValue, prev, env, succeed, fail);
            return;
        }

        const succeed2: Continuation = (argValue: Value): void => {
            const lst = new PairValue(argValue, prev);
            this.evaluateArg(procValue, argno + 1, lst, env, succeed, fail);
        };
        this.args[argno].evaluate(env, succeed2, fail);
    }

    public evaluateProc(procValue: Value, argList: Value, env: Environment, succeed: Continuation, fail: Continuation): void {
        const argArray: Value[] = [];
        while ((argList instanceof PairValue)) {
            argArray.push(argList.car);
            argList = argList.cdr;
        }
        if (!(argList instanceof NilValue))
            throw new Error("argList should be nil");
        argArray.reverse();

        if (procValue instanceof BuiltinProcedureValue) {
            procValue.proc(argArray, succeed, fail);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            const outerEnv = procValue.env;
            const lambdaNode = procValue.proc;

            const expectedArgCount = lambdaNode.variables.length;
            const actualArgCount = argArray.length;
            if (actualArgCount !== expectedArgCount) {
                fail(new StringValue("Incorrect number of arguments; have " + actualArgCount + ", expecetd " +
                    expectedArgCount));
                return;
            }

            const innerEnv = new Environment(lambdaNode.innerScope, outerEnv);
            for (let i = 0; i < argArray.length; i++) {
                if (i >= lambdaNode.variables.length) { // sanity check
                    throw new Error("Invalid argument number: more than # variables");
                }
                if (i >= lambdaNode.innerScope.slots.length) { // sanity check
                    throw new Error("Invalid argument number: more than # slots");
                }
                const variable = innerEnv.getVar(i, lambdaNode.variables[i], lambdaNode.innerScope.slots[i]);
                variable.value = argArray[i];
            }

            procValue.proc.body.evaluate(innerEnv, succeed, fail);
        }
        else {
            fail(new StringValue("Cannot apply " + procValue));
            return;
        }
   }
}

export class VariableNode extends ASTNode {
    public _class_VariableNode: any;
    public ref: LexicalRef;

    public constructor(ref: LexicalRef) {
        super();
        this.ref = ref;
    }

    public dump(indent: string): void {
        console.log(indent + "Variable " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        let curDepth = 0;
        while (curDepth < this.ref.depth) {
            if (env.outer === null) {
                fail(new StringValue("ref depth exhausted; current " + curDepth + " wanted " + this.ref.depth));
                return;
            }
            env = env.outer;
            curDepth++;
        }
        const variable = env.getVar(this.ref.index, this.ref.name, this.ref.target);
        succeed(variable.value);
    }
}

export interface LetrecBinding {
    ref: LexicalRef;
    body: ASTNode;
}

export class LetrecNode extends ASTNode {
    public _class_LetrecNode: any;
    public innerScope: LexicalScope;
    public bindings: LetrecBinding[];
    public body: ASTNode;

    public constructor(innerScope: LexicalScope, bindings: LetrecBinding[], body: ASTNode) {
        super();
        this.innerScope = innerScope;
        this.bindings = bindings;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Letrec");
        for (const binding of this.bindings) {
            console.log(indent + "    Binding " + binding.ref.target.name);
            binding.body.dump(indent + "        ");
        }
        console.log(indent + "    Body");
        this.body.dump(indent + "        ");
    }

    public evaluate(env: Environment, succeed: Continuation, fail: Continuation): void {
        const innerEnv = new Environment(this.innerScope, env);
        this.evalBinding(0, NilValue.instance, innerEnv, succeed, fail);
    }

    public evalBinding(bindingIndex: number, prev: Value, innerEnv: Environment, succeed: Continuation, fail: Continuation): void {
        if (bindingIndex >= this.bindings.length) {
            this.evalBody(prev, innerEnv, succeed, fail);
            return;
        }

        const succeed2: Continuation = (value: Value): void => {
            const lst = new PairValue(value, prev);
            this.evalBinding(bindingIndex + 1, lst, innerEnv, succeed, fail);
        };
        this.bindings[bindingIndex].body.evaluate(innerEnv, succeed2, fail);
    }

    public evalBody(bindingList: Value, innerEnv: Environment, succeed: Continuation, fail: Continuation): void {
        const bindingArray: Value[] = [];
        while ((bindingList instanceof PairValue)) {
            bindingArray.push(bindingList.car);
            bindingList = bindingList.cdr;
        }
        if (!(bindingList instanceof NilValue))
            throw new Error("bindingList should be nil");
        bindingArray.reverse();

        for (let i = 0; i < bindingArray.length; i++) {
            if (i >= this.bindings.length) { // sanity check
                throw new Error("Invalid argument number: more than # bindings");
            }
            if (i >= this.innerScope.slots.length) { // sanity check
                throw new Error("Invalid argument number: more than # slots");
            }
            const variable = innerEnv.getVar(i, this.bindings[i].ref.target.name, this.innerScope.slots[i]);
            variable.value = bindingArray[i];
        }

        this.body.evaluate(innerEnv, succeed, fail);
    }
}
