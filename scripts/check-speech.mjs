import assert from 'node:assert/strict';
import {synthesize} from '../electron/speech.mjs';
const wav=await synthesize('Welcome to PrimeLedger. Your work, in order.');
assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');assert.ok(wav.length>10000);assert.equal(wav.readUInt32LE(40),wav.length-44);assert.ok(wav.subarray(44).some(x=>x!==0));
console.log(`eSpeak generated ${wav.length} bytes of PCM WAV audio.`);
