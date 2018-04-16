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

function highlight(str: string): string {
    return "\x1b[7m" + str + "\x1b[0m";
}

export class SourceLocation {
    public constructor(public readonly offset: number) {
    }

    public clone(): SourceLocation {
        return new SourceLocation(this.offset);
    }

    public toString(): string {
        return "" + this.offset;
    }
}

export class SourceRange {
    public constructor(public start: SourceLocation, public end: SourceLocation) {
    }

    public clone(): SourceRange {
        return new SourceRange(this.start.clone(), this.end.clone());
    }

    public toString(): string {
        return this.start + "-" + this.end;
    }
}

export class SourceLine {
    public constructor(
        public readonly offset: number,
        public readonly data: string,
    ) {
    }
}

export class SourceCoords {
    // line and col are both 0-based
    public constructor(public line: number, public col: number) {
    }
}

export class SourceInput {
    public readonly str: string;
    public readonly lines: SourceLine[] = [];
    public constructor(str: string) {
        this.str = str;
        let start = 0;
        for (let i = 0; i <= str.length; i++) {
            if ((i === str.length) || ((i > 0) && (str[i - 1] === "\n"))) {
                this.lines.push(new SourceLine(start, str.substring(start, i)));
                start = i;
            }
        }
    }

    public coordsFromLocation(location: SourceLocation): SourceCoords {
        if (this.lines.length === 0)
            return new SourceCoords(0, 0);

        const lastLine = this.lines[this.lines.length - 1];
        if (location.offset > lastLine.offset + lastLine.data.length)
            return new SourceCoords(this.lines.length, 0);
        if (location.offset === lastLine.offset + lastLine.data.length)
            return new SourceCoords(this.lines.length - 1, lastLine.data.length);

        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            if ((location.offset >= line.offset) &&
                (location.offset < line.offset + line.data.length))
                return new SourceCoords(i, location.offset - line.offset);
        }

        return new SourceCoords(0, 0);
    }

    public locationFromCoords(coords: SourceCoords): SourceLocation {
        if (this.lines.length === 0)
            return new SourceLocation(0);

        if (coords.line >= this.lines.length) {
            const lastLine = this.lines[this.lines.length - 1];
            const offset = lastLine.offset + lastLine.data.length;
            return new SourceLocation(offset);
        }

        const line = this.lines[coords.line];
        if (coords.col >= line.data.length)
            throw new Error("col is beyond end of line");
        const offset = line.offset + coords.col;
        return new SourceLocation(offset);
    }

    public dump(hloffset: number | null): void {
        console.log("SourceInput: " + this.lines.length + " lines");
        for (let i = 0; i < this.lines.length; i++) {
            // const offsetStr = ("" + this.lines[i].offset).padStart(4);
            const offsetStr = ("(" + this.lines[i].offset + ")").padStart(5);

            let display = "";
            const line = this.lines[i].data;
            for (let col = 0; col < line.length; col++) {
                const stringified = JSON.stringify(line[col]);
                const escaped = stringified.substring(1, stringified.length - 1);
                if ((hloffset !== null) && (hloffset === this.lines[i].offset + col))
                    display += highlight(escaped);
                else
                    display += escaped;
            }

            console.log("line " + i + " " + offsetStr + ": \"" + display + "\"");
        }
    }

    public highlightRange(hlrange: SourceRange): string {
        const startOffset = hlrange.start.offset;
        const endOffset = hlrange.end.offset;

        const before = this.str.substring(0, startOffset);
        const during = this.str.substring(startOffset, endOffset);
        const after = this.str.substring(endOffset);

        const result = before + highlight(during) + after;
        return result;
    }
}

export class TextBufferData {
    public _class_TextBuffer: any;
    public readonly input: string;
    public readonly len: number;
    public constructor(input: string) {
        this.input = input;
        this.len = input.length;
    }

}

export class TextBuffer {
    public _class_TextBuffer: any;
    private data: TextBufferData;

    public constructor(input: string) {
        this.data = new TextBufferData(input);
    }

    public textInRange(range: SourceRange): string {
        return this.data.input.substring(range.start.offset, range.end.offset);
    }

    public createCursor(): Cursor {
        return new Cursor(this.data);
    }
}

export class Cursor {
    public _class_Cursor: any;
    private readonly data: TextBufferData;
    public pos: number;

    public constructor(data: TextBufferData) {
        this.data = data;
        this.pos = 0;
    }

    public saveLocation(): SourceLocation {
        return new SourceLocation(this.pos);
    }

    public getRangeFrom(start: SourceLocation): SourceRange {
        return new SourceRange(start, this.saveLocation());
    }

    public atEnd(): boolean {
        return (this.pos >= this.data.len);
    }

    public current(): string {
        if (this.atEnd())
            throw new Error("Attempt to read beyond end of input");
        return this.data.input[this.pos];
    }

    public advance(): void {
        this.pos++;
    }
}

export function testSourceCoords(): void {
    const testInput = "(define (fac n)\n  (if (= n 1)\r\n      1\n      (* n (fac (- n 1)))))\n";
    let hloffset: number | null = null;
    if (process.argv.length >= 4)
        hloffset = parseInt(process.argv[3]);

    const sourceInput = new SourceInput(testInput);
    sourceInput.dump(hloffset);

    for (let offset = 0; offset < testInput.length; offset++) {
        const origLocation = new SourceLocation(offset);
        const coords = sourceInput.coordsFromLocation(origLocation);
        const computedLocation = sourceInput.locationFromCoords(coords);
        const result = (origLocation.offset === computedLocation.offset) ? "PASS" : "FAIL";
        console.log("offset " + offset + " coords " + coords.line + "," + coords.col +
            " computed " + computedLocation.offset + " " + result);
    }
}
