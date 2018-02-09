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
    public readonly pos: number;
    public readonly detail: string;
    public constructor(pos: number, detail: string) {
        super("position " + pos + ": " + detail);
        this.pos = pos;
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

    public matchWhitespace(): void {
        if ((this.pos < this.len) && isWhitespaceChar(this.input[this.pos])) {
            this.skipWhitespace();
        }
        else {
            throw new ParseError(this.pos, "Expected whitespace");
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
                throw new ParseError(this.pos, "Malformed number: " + this.input.substring(start, this.pos));
        }
        const str = this.input.substring(start, this.pos);
        const num = parseFloat(str);
        return new NumberExpr(num);
    }

    public parseString(): StringExpr {
        if (!((this.pos < this.len) && (this.input[this.pos] === "\"")))
            throw new ParseError(this.pos, "Expected \"");
        this.pos++;
        let value = "";
        while (true) {
            if (this.pos >= this.len)
                throw new ParseError(this.pos, "Unexpected end of input");
            if (this.input[this.pos] === "\\") {
                this.pos++;
                if (this.pos >= this.len)
                    throw new ParseError(this.pos, "Unexpected end of input");
                value += this.input[this.pos];
            }
            else if (this.input[this.pos] === "\"") {
                this.pos++;
                return new StringExpr(value);
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
        return new SymbolExpr(name);
    }

    public parseQuote(): QuoteExpr {
        if (!((this.pos < this.len) && (this.input[this.pos] === "'")))
            throw new ParseError(this.pos, "Expected '");
        this.pos++;
        const body = this.parseExpression();
        return new QuoteExpr(body);
    }

    public parseList(): PairExpr | NilExpr {
        const items: SExpr[] = [];
        if (!((this.pos < this.len) && (this.input[this.pos] === "(")))
            throw new ParseError(this.pos, "Expected (");
        this.pos++;
        this.skipWhitespace();
        while (true) {
            if (this.pos >= this.len)
                throw new ParseError(this.pos, "Unexpected end of input");
            if (this.input[this.pos] === ")") {
                this.pos++;
                break;
            }
            items.push(this.parseExpression());
            this.skipWhitespace();
        }

        let result: PairExpr | NilExpr = new NilExpr();
        for (let i = items.length - 1; i >= 0; i--)
            result = new PairExpr(items[i], result);
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
            throw new ParseError(this.pos, "Unexpected character: " + this.input[this.pos]);
    }
}
