import test from 'node:test';
import assert from 'node:assert/strict';
import {translationParagraphs,translationChunks} from '../extension/core.js';
test('translation layout follows only source line breaks; inference chunks do not become paragraphs',()=>{
 const source='Opening bell for @BNBStandard, with @cz_binance.\n\nLive at 9:15am 👉 https://nasdaq.com/marketsite/bell\nOne more line.';
 const {sourceLines,sourceBreaks}=translationParagraphs(source);
 assert.equal(sourceLines.length,3);assert.deepEqual(sourceBreaks,['','\n\n','\n']);assert.equal(sourceLines.map((line,i)=>sourceBreaks[i]+line).join(''),source);
 assert.deepEqual(translationParagraphs('one\r\n\r\ntwo').sourceBreaks,['','\n\n']);
 const long='word '.repeat(700)+'😀end',chunks=translationChunks(long);
 assert.ok(chunks.length>1);assert.equal(chunks.join(''),long);assert.ok(chunks.every(chunk=>chunk.length<=2000&&!/[\uD800-\uDBFF]$/.test(chunk)));
 assert.equal(translationParagraphs(long).sourceLines.length,1);
});
