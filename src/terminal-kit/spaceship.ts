#!/usr/bin/env node
/*
    The Cedric's Swiss Knife (CSK) - CSK terminal demo

    Copyright (c) 2009 - 2014 Cédric Ronvel

    The MIT License (MIT)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/



// import * as fs from "fs";
import * as termkit from "terminal-kit";
let term: any;
const ScreenBuffer = termkit.ScreenBuffer;



// Buffers
let viewport: termkit.ScreenBuffer;
const sprites : {
    background: termkit.ScreenBuffer;
    planet: termkit.ScreenBuffer;
    spaceship: termkit.ScreenBuffer;
} = <any> {};



function init( callback: any ): void {
    termkit.getDetectedTerminal( function( error: any , detectedTerm: any ): void {

        if ( error ) { throw new Error( "Cannot detect terminal." ); }

        term = detectedTerm;

        viewport = ScreenBuffer.create( {
            dst: term ,
            width: Math.min( term.width ) ,
            height: Math.min( term.height - 1 ) ,
            y: 2
        } );

        createBackground();
        createSpaceship();

        // term.fullscreen();
        term.moveTo.eraseLine.bgWhite.green( 1 , 1 , "Arrow keys: move the ship - Q/Ctrl-C: Quit\n" );
        term.hideCursor();
        term.grabInput();
        term.on( "key" , inputs );
        callback();
    } );
}



function terminate(): void {
    // term.fullscreen( false );
    term.hideCursor( false );
    term.grabInput( false );

    setTimeout(() => {
        term.moveTo( 1 , term.height , "\n\n" );
        process.exit();
    }, 100);
}



function createBackground(): void {
    sprites.background = ScreenBuffer.create( {
        width: viewport.width * 4 ,
        height: viewport.height ,
        noFill: true
    } );

    sprites.background.fill( { attr: { color: "white" , bgColor: "black" } } );
    // sprites.background.fill( { attr: { defaultColor: true , bgDefaultColor: true } } );

    /*
    sprites.planet = ScreenBuffer.createFromChars(
        { attr: { color: "yellow" , bold: false } , transparencyChar: " " } ,
        fs.readFileSync( __dirname + "/data/saturn.txt" )
    );
    //*/

    sprites.planet = ScreenBuffer.loadSync(__dirname + "/../../node_modules/terminal-kit/demo/data/saturn.sbuf");

    createBackgroundStars(sprites.background.width * sprites.background.height * 0.004);
    createBackgroundTrails(sprites.background.width * sprites.background.height * 0.008);
    createBackgroundPlanets(sprites.background.width * sprites.background.height * 0.0001);
}



function createBackgroundTrails( nTrails: number ): void {
    let i , j , x , y , length;

    for ( i = 0; i < nTrails; i ++ ) {
        x = Math.floor( Math.random() * sprites.background.width );
        y = Math.floor( Math.random() * sprites.background.height );
        length = 3 + Math.floor( Math.random() * 8 );

        for ( j = 0; j < length; j ++ ) {
            sprites.background.put( {
                x: ( x + j ) % sprites.background.width ,
                y: y ,
                attr: { color: 8 }
            } , "-" );
        }
    }
}



function createBackgroundStars( nStars: number ): void {
    let i , x , y , c , char;
    const stars = [ "*" , "." , "o" , "+" , "°" ];

    for ( i = 0; i < nStars; i ++ ) {
        x = Math.floor( Math.random() * sprites.background.width );
        y = Math.floor( Math.random() * sprites.background.height );
        char = stars[ Math.floor( Math.random() * stars.length ) ];
        c = Math.floor( Math.random() * 16 );

        sprites.background.put( {
            x: x ,
            y: y ,
            attr: { color: c }
        } , char );
    }
}



function createBackgroundPlanets( nPlanets: number ): void {
    let i , x , y;

    for (i = 0; i < nPlanets; i++) {
        x = Math.floor(Math.random() * sprites.background.width);
        y = Math.floor(Math.random() * sprites.background.height);

        sprites.planet.draw( {
            dst: sprites.background ,
            x: Math.floor(x - sprites.planet.width / 2),
            y: Math.floor(y - sprites.planet.height / 2),
            blending: true ,
            wrap: "x"
        } );
    }
}



function createSpaceship(): void {
    /*
    sprites.spaceship = ScreenBuffer.createFromChars(
        { attr: { color: "cyan" , bold: true } , transparencyChar: "#" , transparencyType: ScreenBuffer.TRANSPARENCY } ,
        fs.readFileSync( __dirname + "/data/spaceship1.txt" )
    );
    */

    sprites.spaceship = ScreenBuffer.loadSync( __dirname + "/../../node_modules/terminal-kit/demo/data/spaceship1.sbuf" );

    sprites.spaceship.x = 3;
    sprites.spaceship.y = Math.floor( viewport.height / 2 - sprites.spaceship.height / 2 );
}



function inputs( key: string ): void {
    switch ( key ) {
        case "UP" :
            sprites.spaceship.y --;
            break;
        case "DOWN" :
            sprites.spaceship.y ++;
            break;
        case "LEFT" :
            sprites.spaceship.x --;
            break;
        case "RIGHT" :
            sprites.spaceship.x ++;
            break;
        case "q":
        case "CTRL_C":
            terminate();
            break;
    }
}



function nextPosition(): void {
    sprites.background.x --;
}



// let frames = 0;

function draw(): void {
    sprites.background.draw( { dst: viewport , tile: true } );
    sprites.spaceship.draw( { dst: viewport , blending: true , wrap: "both" } );
    // let stats = viewport.draw( { delta: true } );
    const stats = viewport.draw();

    if (stats) {
        term.moveTo.eraseLine.bgWhite.green( 1 , 1 ,
            "Arrow keys: move the ship - Q/Ctrl-C: Quit - Redraw stats: %d cells, %d moves, %d attrs, %d writes\n" ,
            stats.cells , stats.moves , stats.attrs , stats.writes
        );
    }

    // frames ++;
}



function animate(): void {
    draw();
    nextPosition();
    setTimeout( animate , 50 );
}



init(() => {
    animate();
});
