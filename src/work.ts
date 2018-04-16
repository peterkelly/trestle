import { removeEscapeCodes } from "./eval-tracing";

export function main(): void {
    // const initial = "\x1b[7mTEST\x1b[0m";
    const initial = "\x1b[97;44;1mTEST\x1b[0m";
    console.log(initial);
    console.log(JSON.stringify(initial));
    console.log(JSON.stringify(removeEscapeCodes(initial)));
}

main();
