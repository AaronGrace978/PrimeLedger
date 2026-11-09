import { parentPort } from "node:worker_threads";
import { synthesize } from "./speech.mjs";
parentPort.on("message", async (text) => {
  try {
    const wav = await synthesize(text);
    parentPort.postMessage({ audio: wav.toString("base64") });
  } catch {
    parentPort.postMessage({ error: "eSpeak could not synthesize this text." });
  }
});
