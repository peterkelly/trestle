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

import { SourceRange } from "./source";
import { BuildError } from "./sexpr";
import { BuiltinProcedureValue } from "./builtins";
import {
    Environment,
    SchemeException,
} from "./runtime";
import {
    Value,
    UnspecifiedValue,
    ErrorValue,
} from "./value";
import {
    ConstantNode,
    AssignNode,
    IfNode,
    LambdaProcedureValue,
    LambdaNode,
    SequenceNode,
    ApplyNode,
    VariableNode,
    LetrecNode,
    bindLambdaArguments,
    bindLetrecValues,
} from "./ast";

export abstract class DataflowNode {
    public value: Value = UnspecifiedValue.instance;
}

export class ConstantDataflowNode extends DataflowNode {
    public constructor(public ast: ConstantNode, public env: Environment) {
        super();

        this.value = this.ast.value.toValue();
    }
}

export class AssignDataflowNode extends DataflowNode {
    public constructor(public ast: AssignNode, public env: Environment) {
        super();

        const value = this.ast.body.createDataflowNode(this.env).value;
        const variable = this.env.resolveRef(this.ast.ref, this.ast.range);
        variable.value = value;
        this.value = UnspecifiedValue.instance;
    }
}

export class IfDataflowNode extends DataflowNode {
    public constructor(public ast: IfNode, public env: Environment) {
        super();

        const condValue = this.ast.condition.createDataflowNode(this.env).value;
        if (condValue.isTrue())
            this.value = this.ast.consequent.createDataflowNode(this.env).value;
        else
            this.value = this.ast.alternative.createDataflowNode(this.env).value;
    }
}

export class LambdaDataflowNode extends DataflowNode {
    public constructor(public ast: LambdaNode, public env: Environment) {
        super();

        this.value = new LambdaProcedureValue(this.env, this.ast);
    }
}

export class SequenceDataflowNode extends DataflowNode {
    public constructor(public ast: SequenceNode, public env: Environment) {
        super();

        this.ast.body.createDataflowNode(this.env);
        this.value = this.ast.next.createDataflowNode(this.env).value;
    }
}

export class ApplyDataflowNode extends DataflowNode {
    public constructor(public ast: ApplyNode, public env: Environment) {
        super();

        const procValue: Value = this.ast.proc.createDataflowNode(this.env).value;
        const argArray: Value[] = [];
        for (let i = 0; i < this.ast.args.length; i++) {
            const arg = this.ast.args[i];
            argArray.push(arg.createDataflowNode(this.env).value);
        }

        if (procValue instanceof BuiltinProcedureValue) {
            this.value = procValue.direct(argArray);
        }
        else if (procValue instanceof LambdaProcedureValue) {
            this.value = ApplyDataflowNode.evalLambda(procValue, argArray, this.ast.range);
        }
        else {
            const msg = "Cannot apply " + procValue;
            const error = new BuildError(this.ast.range, msg);
            throw new SchemeException(new ErrorValue(error));
        }
    }

    public static evalLambda(procValue: LambdaProcedureValue, argArray: Value[], range: SourceRange): Value {
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
        const node = procValue.proc.body.createDataflowNode(innerEnv);
        return node.value;
    }
}

export class VariableDataflowNode extends DataflowNode {
    public constructor(public ast: VariableNode, public env: Environment) {
        super();

        const variable = this.env.resolveRef(this.ast.ref, this.ast.range);
        this.value = variable.value;
    }
}

export class LetrecDataflowNode extends DataflowNode {
    public constructor(public ast: LetrecNode, public env: Environment) {
        super();

        const innerEnv = new Environment(this.ast.innerScope, this.env);
        const bindingArray: Value[] = [];
        for (const binding of this.ast.bindings)
            bindingArray.push(binding.body.createDataflowNode(innerEnv).value);
        bindLetrecValues(bindingArray, this.ast, innerEnv);
        this.value = this.ast.body.createDataflowNode(innerEnv).value;
    }
}

