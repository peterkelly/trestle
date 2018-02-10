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

import { Value, NilValue } from "./value";
import { LexicalSlot, LexicalScope } from "./scope";

export type Continuation = (value: Value) => void;

export class Variable {
    public _class_Variable: any;
    public slot: LexicalSlot;
    public value: Value;
    public constructor(slot: LexicalSlot, value: Value) {
        this.slot = slot;
        this.value = value;
    }
}

export class Environment {
    public _class_Environment: any;
    public scope: LexicalScope;
    public outer: Environment | null;
    private variables: Variable[];
    public constructor(scope: LexicalScope, outer: Environment | null) {
        this.scope = scope;
        this.outer = outer;
        this.variables = [];
        for (let i = 0; i < scope.slots.length; i++)
            this.variables.push(new Variable(scope.slots[i], NilValue.instance));

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

    public getVar(index: number, name: string, slot: LexicalSlot): Variable {
        if ((index < 0) || (index >= this.variables.length))
            throw new Error("getVar " + name + ": invalid index");
        const variable = this.variables[index];
        if (variable.slot.name !== name)
            throw new Error("getVar " + name + ": name mismatch: expected " + name + ", actual " + variable.slot.name);
        if (variable.slot !== slot)
            throw new Error("getVar " + name + ": slot mismatch");
        return variable;
    }
}
