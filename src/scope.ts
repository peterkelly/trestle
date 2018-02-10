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

export class LexicalSlot {
    public _class_LexicalSlot: any;
    public type: any; // placeholder
    public index: number;
    public name: string;
    public constructor(index: number, name: string) {
        this.index = index;
        this.name = name;
    }
}

export interface LexicalRef {
    source: LexicalScope;
    name: string;
    depth: number;
    index: number;
    target: LexicalSlot;
}

export class LexicalScope {
    public _class_LexicalScope: any;
    public outer: LexicalScope | null;
    private slotsByName = new Map<string, LexicalSlot>();
    private numSlots = 0;
    public slots: LexicalSlot[] = [];

    public constructor(outer: LexicalScope | null) {
        this.outer = outer;
    }

    public lookup(name: string): LexicalRef | null {
        let cur: LexicalScope | null = this;
        let depth = 0;
        while (cur != null) {
            const slot = cur.slotsByName.get(name);
            if (slot !== undefined) {
                return {
                    source: this,
                    name: name,
                    depth: depth,
                    index: slot.index,
                    target: slot,
                };
            }
            cur = cur.outer;
            depth++;
        }
        return null;
    }

    public hasSlot(name: string): boolean {
        let cur: LexicalScope | null = this;
        while (cur !== null) {
            if (cur.hasOwnSlot(name))
                return true;
            cur = cur.outer;
        }
        return false;
    }

    public hasOwnSlot(name: string): boolean {
        return this.slotsByName.has(name);
    }

    public addOwnSlot(name: string): LexicalRef {
        if (this.hasOwnSlot(name))
            throw new Error("Slot for " + name + " already allocated");
        const index = this.numSlots++;
        const slot = new LexicalSlot(index, name);
        this.slotsByName.set(name, slot);
        this.slots.push(slot);
        return {
            source: this,
            name: name,
            depth: 0,
            index: index,
            target: slot
        };
    }
}
