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

import { SExpr, BuildError } from "./sexpr";
import { SourceRange } from "./source";
import { LexicalRef, LexicalScope } from "./scope";
import { Value, ErrorValue, PairValue, NilValue, UnspecifiedValue } from "./value";
import { Environment, Continuation, SchemeException } from "./runtime";
import { BuiltinProcedureValue } from "./builtins";
import {
    DataflowNode,
    ConstantDataflowNode,
    AssignDataflowNode,
    IfDataflowNode,
    LambdaDataflowNode,
    SequenceDataflowNode,
    ApplyDataflowNode,
    VariableDataflowNode,
    LetrecDataflowNode,
} from "./dataflow";

let evalDirectEnabled = true;

// This function is called when running in reactive evaluation mode. It's a sanity check to
// ensure the interpreter doesn't "leak" into direct evaluation style.
export function disableEvalDirect(): void {
    evalDirectEnabled = false;
}

export abstract class ASTNode {
    public _class_ASTNode: any;
    public range: SourceRange;

    public constructor(range: SourceRange) {
        this.range = range;
    }

    public abstract dump(indent: string): void;

    public abstract evalCps(env: Environment, succeed: Continuation, fail: Continuation): void;

    public abstract evalDirect(env: Environment): Value;

    public abstract createDataflowNode(env: Environment): DataflowNode;

    protected checkEvalDirectEnabled(): void {
        if (!evalDirectEnabled)
            throw new Error("Attempt to call " + (<any> this).constructor.name + ".evalDirect()");
    }
}

export class ConstantNode extends ASTNode {
    public _class_ConstantNode: any;
    public value: SExpr;
    public constructor(range: SourceRange, value: SExpr) {
        super(range);
        this.value = value;
    }

    public dump(indent: string): void {
        console.log(indent + "Constant");
        this.value.dump(indent + "    ");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        succeed(this.value.toValue());
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        return this.value.toValue();
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new ConstantDataflowNode(this, env);
    }
}

export class TryNode extends ASTNode {
    public _class_TryNode: any;
    public tryBody: ASTNode;
    public catchBody: LambdaNode;

    public constructor(range: SourceRange, tryBody: ASTNode, catchBody: LambdaNode) {
        super(range);
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

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        this.tryBody.evalCps(env,
            // success continuation
            (value: Value): void => {
                succeed(value);
            },
            // failure continuation
            (value: Value): void => {
                const proc = new LambdaProcedureValue(env, this.catchBody);
                ApplyNode.evalLambdaCps(proc, [value], this.range, succeed, fail);
            });
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        try {
            return this.tryBody.evalDirect(env);
        }
        catch (e) {
            if (e instanceof SchemeException) {
                const value = e.value;
                const proc = new LambdaProcedureValue(env, this.catchBody);
                return ApplyNode.evalLambdaDirect(proc, [value], this.range);
            }
            else {
                throw e;
            }
        }
    }

    public createDataflowNode(env: Environment): DataflowNode {
        throw new BuildError(this.range, "Exceptions are unsupported in reactive evaluation mode");
    }
}

export class ThrowNode extends ASTNode {
    public _class_ThrowNode: any;
    public body: ASTNode;

    public constructor(range: SourceRange, body: ASTNode) {
        super(range);
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Throw");
        this.body.dump(indent + "    ");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        // If the throw succeeds (the exception expression was evaluated successfully), then we
        // call fail with the computed value.
        // If the throw fails (another exception occurred while trying to evaluate the expression),
        // then we call fail with that exception. Either way, we fail.
        this.body.evalCps(env, fail, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const value = this.body.evalDirect(env);
        throw new SchemeException(value);
    }

    public createDataflowNode(env: Environment): DataflowNode {
        throw new BuildError(this.range, "Exceptions are unsupported in reactive evaluation mode");
    }
}

export class AssignNode extends ASTNode {
    public _class_AssignNode: any;
    public ref: LexicalRef;
    public body: ASTNode;
    public constructor(range: SourceRange, ref: LexicalRef, body: ASTNode) {
        super(range);
        this.ref = ref;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Assign " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
        this.body.dump(indent + "    ");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (value: Value): void => {
            const variable = env.resolveRef(this.ref, this.range);
            variable.value = value;
            succeed(UnspecifiedValue.instance);
        };
        this.body.evalCps(env, succeed2, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const value = this.body.evalDirect(env);
        const variable = env.resolveRef(this.ref, this.range);
        variable.value = value;
        return UnspecifiedValue.instance;
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new AssignDataflowNode(this, env);
    }
}

export class IfNode extends ASTNode {
    public _class_IfNode: any;

    public constructor(
        range: SourceRange,
        public condition: ASTNode,
        public consequent: ASTNode,
        public alternative: ASTNode
    ) {
        super(range);
    }

    public dump(indent: string): void {
        console.log(indent + "If");
        this.condition.dump(indent + "    ");
        this.consequent.dump(indent + "    ");
        if (this.alternative)
            this.alternative.dump(indent + "    ");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (value: Value): void => {
            if (value.isTrue())
                this.consequent.evalCps(env, succeed, fail);
            else
                this.alternative.evalCps(env, succeed, fail);
        };
        this.condition.evalCps(env, succeed2, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const condValue = this.condition.evalDirect(env);
        if (condValue.isTrue())
            return this.consequent.evalDirect(env);
        else
            return this.alternative.evalDirect(env);
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new IfDataflowNode(this, env);
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

    public constructor(range: SourceRange, variables: string[], innerScope: LexicalScope, body: ASTNode) {
        super(range);
        this.variables = variables;
        this.innerScope = innerScope;
        this.body = body;
    }

    public dump(indent: string): void {
        console.log(indent + "Lambda" + this.variables.map(v => " " + v).join(""));
        this.body.dump(indent + "    ");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        succeed(new LambdaProcedureValue(env, this));
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        return new LambdaProcedureValue(env, this);
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new LambdaDataflowNode(this, env);
    }
}

export class SequenceNode extends ASTNode {
    public _class_SequenceNode: any;
    public body: ASTNode;
    public next: ASTNode;

    public constructor(range: SourceRange, body: ASTNode, next: ASTNode) {
        super(range);
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

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (value: Value): void => {
            this.next.evalCps(env, succeed, fail);
        };
        this.body.evalCps(env, succeed2, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        this.body.evalDirect(env);
        return this.next.evalDirect(env);
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new SequenceDataflowNode(this, env);
    }
}

export class ApplyNode extends ASTNode {
    public _class_ApplyNode: any;
    public proc: ASTNode;
    public args: ASTNode[];

    public constructor(range: SourceRange, proc: ASTNode, args: ASTNode[]) {
        super(range);
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

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        const succeed2: Continuation = (procValue: Value): void => {
            this.evalCpsArg(procValue, 0, NilValue.instance, env, succeed, fail);
        };
        this.proc.evalCps(env, succeed2, fail);
    }

    public evalCpsArg(procValue: Value, argno: number, prev: Value, env: Environment, succeed: Continuation, fail: Continuation): void {
        if (argno >= this.args.length) {
            this.evalCpsProc(procValue, prev, env, succeed, fail);
            return;
        }

        const succeed2: Continuation = (argValue: Value): void => {
            const lst = new PairValue(argValue, prev);
            this.evalCpsArg(procValue, argno + 1, lst, env, succeed, fail);
        };
        this.args[argno].evalCps(env, succeed2, fail);
    }

    public evalCpsProc(procValue: Value, argList: Value, env: Environment, succeed: Continuation, fail: Continuation): void {
        const argArray = backwardsListToArray(argList);

        if (procValue instanceof BuiltinProcedureValue) {
            procValue.proc(argArray, succeed, fail);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            ApplyNode.evalLambdaCps(procValue, argArray, this.range, succeed, fail);
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.range, msg);
            fail(new ErrorValue(error));
            return;
        }
    }

    public static evalLambdaCps(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange,
        succeed: Continuation, fail: Continuation): void {
        const outerEnv = procValue.env;
        const lambdaNode = procValue.proc;

        const expectedArgCount = lambdaNode.variables.length;
        const actualArgCount = argArray.length;
        if (actualArgCount !== expectedArgCount) {
            const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
            const error = new BuildError(range, msg);
            fail(new ErrorValue(error));
            return;
        }

        const innerEnv = bindLambdaArguments(argArray, lambdaNode, outerEnv);
        procValue.proc.body.evalCps(innerEnv, succeed, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const procValue: Value = this.proc.evalDirect(env);
        const argArray: Value[] = [];
        for (let i = 0; i < this.args.length; i++) {
            const arg = this.args[i];
            argArray.push(arg.evalDirect(env));
        }

        if (procValue instanceof BuiltinProcedureValue) {
            return procValue.direct(argArray);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            return ApplyNode.evalLambdaDirect(procValue, argArray, this.range);
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new ApplyDataflowNode(this, env);
    }

    public static evalLambdaDirect(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): Value {
        const outerEnv = procValue.env;
        const lambdaNode = procValue.proc;

        const expectedArgCount = lambdaNode.variables.length;
        const actualArgCount = argArray.length;
        if (actualArgCount !== expectedArgCount) {
            const msg = "Incorrect number of arguments; have " + actualArgCount + ", expected " + expectedArgCount;
            const error = new BuildError(range, msg);
            throw new SchemeException(new ErrorValue(error));
        }

        const innerEnv = bindLambdaArguments(argArray, lambdaNode, outerEnv);
        return procValue.proc.body.evalDirect(innerEnv);
    }
}

export function bindLambdaArguments(argArray: Value[], lambdaNode: LambdaNode, outerEnv: Environment): Environment {
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
    return innerEnv;
}

export class VariableNode extends ASTNode {
    public _class_VariableNode: any;
    public ref: LexicalRef;

    public constructor(range: SourceRange, ref: LexicalRef) {
        super(range);
        this.ref = ref;
    }

    public dump(indent: string): void {
        console.log(indent + "Variable " + this.ref.target.name + " (" + this.ref.depth + "," + this.ref.index + ")");
    }

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        try {
            succeed(this.evalDirect(env));
        }
        catch (e) {
            if (e instanceof SchemeException)
                fail(e.value);
            else
                throw e;
        }
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const variable = env.resolveRef(this.ref, this.range);
        return variable.value;
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new VariableDataflowNode(this, env);
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

    public constructor(range: SourceRange, innerScope: LexicalScope, bindings: LetrecBinding[], body: ASTNode) {
        super(range);
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

    public evalCps(env: Environment, succeed: Continuation, fail: Continuation): void {
        const innerEnv = new Environment(this.innerScope, env);
        this.evalCpsBinding(0, NilValue.instance, innerEnv, succeed, fail);
    }

    public evalCpsBinding(bindingIndex: number, prev: Value, innerEnv: Environment, succeed: Continuation, fail: Continuation): void {
        if (bindingIndex >= this.bindings.length) {
            this.evalCpsBody(prev, innerEnv, succeed, fail);
            return;
        }

        const succeed2: Continuation = (value: Value): void => {
            const lst = new PairValue(value, prev);
            this.evalCpsBinding(bindingIndex + 1, lst, innerEnv, succeed, fail);
        };
        this.bindings[bindingIndex].body.evalCps(innerEnv, succeed2, fail);
    }

    public evalCpsBody(bindingList: Value, innerEnv: Environment, succeed: Continuation, fail: Continuation): void {
        const bindingArray = backwardsListToArray(bindingList);
        bindLetrecValues(bindingArray, this, innerEnv);
        this.body.evalCps(innerEnv, succeed, fail);
    }

    public evalDirect(env: Environment): Value {
        this.checkEvalDirectEnabled();
        const innerEnv = new Environment(this.innerScope, env);
        const bindingArray: Value[] = [];
        for (const binding of this.bindings)
            bindingArray.push(binding.body.evalDirect(innerEnv));
        bindLetrecValues(bindingArray, this, innerEnv);
        return this.body.evalDirect(innerEnv);
    }

    public createDataflowNode(env: Environment): DataflowNode {
        return new LetrecDataflowNode(this, env);
    }
}

export function bindLetrecValues(values: Value[], letrecNode: LetrecNode, innerEnv: Environment): void {
    for (let i = 0; i < values.length; i++) {
        if (i >= letrecNode.bindings.length) { // sanity check
            throw new Error("Invalid argument number: more than # bindings");
        }
        if (i >= letrecNode.innerScope.slots.length) { // sanity check
            throw new Error("Invalid argument number: more than # slots");
        }
        const variable = innerEnv.getVar(i, letrecNode.bindings[i].ref.target.name, letrecNode.innerScope.slots[i]);
        variable.value = values[i];
    }
}

function backwardsListToArray(list: Value): Value[] {
    const array: Value[] = [];
    while ((list instanceof PairValue)) {
        array.push(list.car);
        list = list.cdr;
    }
    if (!(list instanceof NilValue))
        throw new Error("list should be terminated by nil");
    array.reverse();
    return array;
}
