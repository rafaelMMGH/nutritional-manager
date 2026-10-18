// Speech-to-text that runs entirely in the browser (Whisper through Transformers.js), off the main thread.
// The library comes from jsDelivr and the model from Hugging Face; both are cached by the browser after the first use.
import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

const MODEL = "Xenova/whisper-base";
env.allowLocalModels = false;

let transcriber = null;
const files = new Map();

function load() {
  transcriber ??= pipeline("automatic-speech-recognition", MODEL, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (event) => {
      if (event.status !== "progress" || !event.total) return;
      files.set(event.file, { loaded: event.loaded, total: event.total });
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      self.postMessage({ type: "progress", progress: Math.round((loaded / total) * 100) });
    }
  }).catch((error) => {
    transcriber = null;
    throw error;
  });
  return transcriber;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "load") {
      await load();
      self.postMessage({ type: "ready" });
    } else if (data.type === "transcribe") {
      const run = await load();
      self.postMessage({ type: "ready" });
      const output = await run(data.audio, { language: "spanish", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
      self.postMessage({ type: "result", id: data.id, text: String(output.text ?? "").trim() });
    }
  } catch (error) {
    self.postMessage({ type: "error", id: data.id, message: String(error?.message ?? error) });
  }
};
