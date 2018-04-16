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

import { Value, UnspecifiedValue } from "./value";
import { LexicalSlot, LexicalScope, LexicalRef } from "./scope";
import { BuildError } from "./sexpr";
import { ErrorValue } from "./value";
import { SourceRange } from "./source";
import { DataflowNode, EnvSlotDataflowNode } from "./dataflow";
import { Cell } from "./eval-tracing";

export type Continuation = (value: Value) => void;

export class Variable {
    public _class_Variable: any;
    public slot: LexicalSlot;
    public node: DataflowNode;
    public cell?: Cell;
    public builtin: boolean = false;
    public constructor(slot: LexicalSlot, value: Value) {
        this.slot = slot;
        this.node = new EnvSlotDataflowNode();
        this.node.value = value;
    }

    public get value(): Value {
        return this.node.value;
    }

    public set value(value: Value) {
        this.node.value = value;
    }
}

export class Environment {
    public _class_Environment: any;
    public scope: LexicalScope;
    public outer: Environment | null;
    public variables: Variable[];

    public constructor(scope: LexicalScope, outer: Environment | null, values?: Value[]) {
        this.scope = scope;
        this.outer = outer;
        this.variables = [];
        for (let i = 0; i < scope.slots.length; i++)
            this.variables.push(new Variable(scope.slots[i], UnspecifiedValue.instance));
        if (values !== undefined) {
            if (values.length !== this.variables.length)
                throw new Error("Incorrect number of variable values");
            for (let i = 0; i < scope.slots.length; i++)
                this.variables[i].value = values[i];
        }

        if ((outer !== null) && (scope.outer !== null)) {
            if (outer.scope !== scope.outer) {
                const runtimeNames = outer.scope.slots.map(s => s.name);
                const staticNames = scope.outer.slots.map(s => s.name);
                throw new Error("Environment: mismatch in outer environment/scope;" +
                    " outer.scope " + JSON.stringify(runtimeNames) +
                    ", scope.outer " + JSON.stringify(staticNames));
            }
        }
        else if ((outer === null) && (scope.outer !== null)) {
            throw new Error("Environment: scope has outer but environment doesn't");
        }
        else if ((outer !== null) && (scope.outer === null)) {
            throw new Error("Environment: environment has outer but scope doesn't");
        }
    }

    public setVariableValues(values: Value[]): void {
        if (values.length !== this.variables.length)
            throw new Error("Incorrect number of variable values");
        for (let i = 0; i < values.length; i++)
            this.variables[i].value = values[i];
    }

    public setVariableDataflowNodes(nodes: DataflowNode[]): void {
        if (nodes.length !== this.variables.length)
            throw new Error("Incorrect number of variable nodes");
        for (let i = 0; i < nodes.length; i++)
            this.variables[i].node = nodes[i];
    }

    public resolveRef(ref: LexicalRef, range: SourceRange): Variable {
        let env: Environment | null = this;
        let curDepth = 0;
        while (curDepth < ref.depth) {
            if (env.outer === null) {
                const msg = "ref depth exhausted; current " + curDepth + " wanted " + ref.depth;
                const error = new BuildError(range, msg);
                throw new SchemeException(new ErrorValue(error));
            }
            env = env.outer;
            curDepth++;
        }
        return env.variables[ref.index];
    }
}

export class SchemeException {
    public _class_SchemeException: any;
    public value: Value;

    public constructor(value: Value) {
        this.value = value;
    }
}
