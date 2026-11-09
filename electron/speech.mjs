import createEngine from "@echogarden/espeak-ng-emscripten";
let engine;
export async function synthesize(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw Error("Speech requires between 1 and 12,000 characters.");
  engine ||= createEngine().then((module) => {
    const worker = new module.eSpeakNGWorker();
    worker.set_voice("", "en-us", 0, 0, 0);
    worker.set_rate(175);
    return worker;
  });
  const worker = await engine;
  const chunks = [];
  worker.synthesize(text, (pcm) => {
    if (pcm.length)
      chunks.push(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    return false;
  });
  const samples = Buffer.concat(chunks);
  if (!samples.length) throw Error("eSpeak generated no audio.");
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(samples.length + 36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  const rate = worker.get_samplerate();
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}
