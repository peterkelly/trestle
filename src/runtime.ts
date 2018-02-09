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

import { Value } from "./value";

export class Variable {
    public _class_Variable: any;
    public value: Value;
    public constructor(value: Value) {
        this.value = value;
    }
}

export class Environment {
    public _class_Environment: any;
    public outer: Environment | null;
    private entries = new Map<string, Variable>();
    public constructor(outer: Environment | null) {
        this.outer = outer;
        console.log(new Map<string, string>());
    }

    public lookup(name: string): Variable | null {
        const entry = this.entries.get(name);
        if (entry !== undefined)
            return entry;
        if (this.outer !== null)
            return this.outer.lookup(name);
        return null;
    }

    public define(name: string, value: Value): void {
        let entry = this.entries.get(name);
        if (entry !== undefined)
            throw new Error("Variabe " + JSON.stringify(name) + " is already defined");
        entry = new Variable(value);
        this.entries.set(name, entry);
    }

    public get(name: string): Value {
        const entry = this.lookup(name);
        if (entry === null)
            throw new Error(name + ": no such variable");
        return entry.value;
    }

    public set(name: string, value: Value): void {
        const entry = this.lookup(name);
        if (entry === null)
            throw new Error(name + ": no such variable");
        entry.value = value;
    }

}
