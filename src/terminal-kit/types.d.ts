declare module "terminal-kit" {
    export const globalConfig: any;
    export const image: any;
    export const realTerminal: any;
    export const spChars: any;
    export const terminal: any;
    export const tty: any;

    // Widget classes
    export const Button: any;
    export const ColumnMenu: any;
    export const Container: any;
    export const Document: any;
    export const DropDownMenu: any;
    export const Element: any;
    export const Form: any;
    export const Layout: any;
    export const RowMenu: any;
    export const Text: any;
    export const TextInput: any;

    // Other classes
    interface RectOptions {
        xmin?: number;
        ymin?: number;
        xmax?: number;
        ymax?: number;
    }

    export class Rect {
        public readonly xmin: number;
        public readonly ymin: number;
        public readonly xmax: number;
        public readonly ymax: number;
        public readonly width: number;
        public readonly height: number;
        public readonly isNull: boolean;

        public static create( terminal: Terminal ): Rect;
        public static create( buffer: ScreenBuffer ): Rect;
        public static create( buffer: TextBuffer ): Rect;
        public static create( options: RectOptions ): Rect;
        public static create( xmin?: number , ymin?: number , xmax?: number , ymax?: number ): Rect;
    }

    interface ScreenBufferOptions {
        dst?: any;
        width?: number;
        height?: number;
        x?: number;
        y?: number;
        blending?: boolean;
        wrap?: boolean;
        noFill?: boolean;
    }

    interface ScreenBufferFillOptions {
        char?: any;
        attr?: any;
        clearBuffer?: Buffer;
        buffer?: Buffer;
        start?: number;
        end?: number;
    }

    interface ScreenBufferPutOptions {
        x?: number;
        y?: number;
        attr?: any;
        wrap?: boolean;
        direction?: "right" | "left" | "up" | "down" | "none" | null;
        dx?: number;
        dy?: number;
    }

    interface ScreenBufferDrawOptions {
        dst?: ScreenBuffer | Terminal;
        x?: number;
        y?: number;
        dstClipRect?: RectOptions;
        srcClipRect?: RectOptions;
        delta?: any;
        blending?: any;
        wrap?: any;
        tile?: any;
    }

    interface BlitterStats {
        cells: number;
        moves: number;
        attrs: number;
        writes: number;
    }

    export class ScreenBuffer {
        public dst: any;
        public readonly width: number;
        public readonly height: number;
        public x: number;
        public y: number;
        public cx: number;
        public cy: number;
        public lastBuffer: any;
        public lastBufferUpToDate: any;
        public blending: boolean;
        public wrap: boolean;
        public buffer: Buffer;
        public static create(options: ScreenBufferOptions): ScreenBuffer;
        public static loadSync(filePath: string): ScreenBuffer;
        public fill(options: ScreenBufferFillOptions): void;
        public put(options: ScreenBufferPutOptions , str: any , ...args: any[]): void;
        public draw(options?: ScreenBufferDrawOptions): BlitterStats | undefined;
    }

    export class ScreenBufferHD extends ScreenBuffer {}
    export class Terminal {}
    export class TextBuffer {}

    // Functions
    export function autoComplete( array: any , startString: any , returnAlternatives: any , prefix: any , postfix: any ): any;
    export function color2index( color: string ): number | undefined;
    export function colorNameToIndex( color: string ): number | undefined;
    export function createTerminal( createOptions: any ): any;
    export function getDetectedTerminal( callback: any ): any;
    export function getParentTerminalInfo( callback: any ): any;
    export function guessTerminal(): any;
    export function hexToColor( hex: string ): { r: number, g: number, b: number, a: number };
    export function hexToRgba( hex: string ): { r: number, g: number, b: number, a: number };

    export function index2color( index: number ): string | undefined;
    export function indexToColorName( index: number ): string | undefined;
    export function stringWidth( str: string ): number;
    export function stripControlChars( str: string , newline?: boolean ): string;
    export function stripEscapeSequences( str: string ): string;
    export function truncateString( str: string , maxWidth: number ): string;

    // Modules

}
