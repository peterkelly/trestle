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
    NumberExpr,
    StringExpr,
    SymbolExpr,
    QuoteExpr,
    PairExpr,
    NilExpr,
} from "./sexpr";
import {
    SourceLocation,
    SourceRange,
} from "./source";

function isDigitChar(c: string): boolean {
    return ((c.length === 1) && (c >= "0") && (c <= "9"));
}

function isWhitespaceChar(c: string): boolean {
    switch (c) {
        case " ":
        case "\t":
        case "\r":
        case "\n":
            return true;
        default:
            return false;
    }
}

function isSymbolChar(c: string): boolean {
    switch (c) {
        case "\"":
        case "'":
        case "(":
        case ")":
        case " ":
        case "\t":
        case "\r":
        case "\n":
            return false;
        default:
            return true;
    }
}

class ParseError extends Error {
    public readonly location: SourceLocation;
    public readonly detail: string;
    public constructor(location: SourceLocation, detail: string) {
        super(location + ": " + detail);
        this.location = location;
        this.detail = detail;
    }
}

export class Parser {
    public readonly input: string;
    public readonly len: number;
    public pos: number;

    public constructor(input: string) {
        this.input = input;
        this.len = input.length;
        this.pos = 0;
    }

    public getLocation(): SourceLocation {
        return new SourceLocation(this.pos);
    }

    public getRangeFrom(start: SourceLocation): SourceRange {
        return new SourceRange(start, this.getLocation());
    }

    public matchWhitespace(): void {
        if ((this.pos < this.len) && isWhitespaceChar(this.input[this.pos])) {
            this.skipWhitespace();
        }
        else {
            throw new ParseError(this.getLocation(), "Expected whitespace");
        }
    }

    public skipWhitespace(): void {
        while ((this.pos < this.len) && isWhitespaceChar(this.input[this.pos]))
            this.pos++;
    }

    public parseNumber(): NumberExpr {
        const start = this.pos;
        while ((this.pos < this.len) && this.input[this.pos].match(/^[0-9]$/))
            this.pos++;
        if ((this.pos < this.len) && (this.input[this.pos] === ".")) {
            this.pos++;
            const decimalPartStart = this.pos;
            while ((this.pos < this.len) && this.input[this.pos].match(/^[0-9]$/))
                this.pos++;
            if (this.pos === decimalPartStart)
                throw new ParseError(this.getLocation(), "Malformed number: " + this.input.substring(start, this.pos));
        }
        const str = this.input.substring(start, this.pos);
        const num = parseFloat(str);
        const range = this.getRangeFrom(new SourceLocation(start));
        return new NumberExpr(range, num);
    }

    public parseString(): StringExpr {
        const start = this.pos;
        if (!((this.pos < this.len) && (this.input[this.pos] === "\"")))
            throw new ParseError(this.getLocation(), "Expected \"");
        this.pos++;
        let value = "";
        while (true) {
            if (this.pos >= this.len)
                throw new ParseError(this.getLocation(), "Unexpected end of input");
            if (this.input[this.pos] === "\\") {
                this.pos++;
                if (this.pos >= this.len)
                    throw new ParseError(this.getLocation(), "Unexpected end of input");
                value += this.input[this.pos];
            }
            else if (this.input[this.pos] === "\"") {
                this.pos++;
                const range = this.getRangeFrom(new SourceLocation(start));
                return new StringExpr(range, value);
            }
            else {
                value += this.input[this.pos];
            }
            this.pos++;
        }
    }

    public parseSymbol(): SymbolExpr {
        const start = this.pos;
        while ((this.pos < this.len) && isSymbolChar(this.input[this.pos]))
            this.pos++;
        const name = this.input.substring(start, this.pos);
        const range = this.getRangeFrom(new SourceLocation(start));
        return new SymbolExpr(range, name);
    }

    public parseQuote(): QuoteExpr {
        const start = this.pos;
        if (!((this.pos < this.len) && (this.input[this.pos] === "'")))
            throw new ParseError(this.getLocation(), "Expected '");
        this.pos++;
        const body = this.parseExpression();
        const range = this.getRangeFrom(new SourceLocation(start));
        return new QuoteExpr(range, body);
    }

    public parseList(): PairExpr | NilExpr {
        const listStart = new SourceLocation(this.pos);
        const items: SExpr[] = [];
        if (!((this.pos < this.len) && (this.input[this.pos] === "(")))
            throw new ParseError(this.getLocation(), "Expected (");
        this.pos++;
        this.skipWhitespace();
        while (true) {
            if (this.pos >= this.len)
                throw new ParseError(this.getLocation(), "Unexpected end of input");
            if (this.input[this.pos] === ")") {
                this.pos++;
                break;
            }
            items.push(this.parseExpression());
            this.skipWhitespace();
        }

        const endRange = this.getRangeFrom(new SourceLocation(this.pos - 1));
        let result: PairExpr | NilExpr = new NilExpr(endRange);
        for (let i = items.length - 1; i >= 0; i--) {
            const itemStart = (i === 0) ? listStart : items[i].range.start;
            const itemRange = new SourceRange(itemStart.clone(), endRange.end.clone());
            result = new PairExpr(itemRange, items[i], result);
        }
        return result;
    }

    public parseExpression(): SExpr {
        if (isDigitChar(this.input[this.pos]))
            return this.parseNumber();
        else if (this.input[this.pos] === "\"")
            return this.parseString();
        else if (isSymbolChar(this.input[this.pos]))
            return this.parseSymbol();
        else if (this.input[this.pos] === "'")
            return this.parseQuote();
        else if (this.input[this.pos] === "(")
            return this.parseList();
        else
            throw new ParseError(this.getLocation(), "Unexpected character: " + this.input[this.pos]);
    }

    public parseTopLevel(): SExpr[] {
        const items: SExpr[] = [];
        this.skipWhitespace();
        while (this.pos < this.len) {
            items.push(this.parseExpression());
            this.skipWhitespace();
        }
        return items;
    }
}
