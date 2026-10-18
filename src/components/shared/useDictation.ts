"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Minimal typing for the Web Speech API (Chrome/Edge expose it prefixed as webkitSpeechRecognition).
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;
type Engine = "native" | "whisper";
export type DictationPhase = "idle" | "listening" | "transcribing";

const ENGINE_KEY = "nm-dictation-engine";

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord() {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof Worker !== "undefined";
}

// Brave ships webkitSpeechRecognition but has no speech service behind it, so it always fails with "network".
function pickEngine(): Engine | null {
  let remembered: string | null = null;
  try { remembered = localStorage.getItem(ENGINE_KEY); } catch {}
  const isBrave = typeof (navigator as unknown as { brave?: { isBrave?: unknown } }).brave?.isBrave === "function";
  if (recognitionCtor() && !isBrave && remembered !== "whisper") return "native";
  return canRecord() ? "whisper" : null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "Permite el acceso al micrófono para dictar.",
  "service-not-allowed": "Permite el acceso al micrófono para dictar.",
  NotAllowedError: "Permite el acceso al micrófono para dictar.",
  "audio-capture": "No encontré un micrófono.",
  NotFoundError: "No encontré un micrófono.",
  "no-speech": "No escuché nada. Intenta de nuevo."
};

// ---------- Whisper worker (shared by every chat on the page, kept alive so the model loads once) ----------

type WorkerMessage =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "result"; id: number; text: string }
  | { type: "error"; id?: number; message: string };

let worker: Worker | null = null;
let nextId = 1;
const progressListeners = new Set<(progress: number | null) => void>();
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function whisperWorker() {
  if (worker) return worker;
  worker = new Worker("/dictation-worker.js", { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
    if (data.type === "progress") progressListeners.forEach((listener) => listener(data.progress));
    else if (data.type === "ready") progressListeners.forEach((listener) => listener(null));
    else if (data.type === "result") {
      pending.get(data.id)?.resolve(data.text);
      pending.delete(data.id);
    } else if (data.type === "error") {
      progressListeners.forEach((listener) => listener(null));
      if (data.id != null) {
        pending.get(data.id)?.reject(new Error(data.message));
        pending.delete(data.id);
      }
    }
  };
  worker.onerror = () => {
    pending.forEach(({ reject }) => reject(new Error("worker")));
    pending.clear();
    worker = null;
  };
  return worker;
}

function transcribe(audio: Float32Array) {
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    whisperWorker().postMessage({ type: "transcribe", id, audio }, [audio.buffer]);
  });
}

// Whisper wants 16 kHz mono samples.
async function toSamples(blob: Blob) {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return decoded.getChannelData(0).slice();
  } finally {
    context.close();
  }
}

// Speech-to-text for the chat composer. Uses the browser's live recognizer where it works (Chrome, Edge, Safari) and a
// Whisper model running in the browser elsewhere (Brave, Firefox): record, then transcribe on stop.
export function useDictation(onText: (text: string) => void, lang = "es-ES") {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [phase, setPhase] = useState<DictationPhase>("idle");
  const [download, setDownload] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  useEffect(() => {
    setEngine(pickEngine());
    const onProgress = (progress: number | null) => setDownload(progress);
    progressListeners.add(onProgress);
    return () => {
      progressListeners.delete(onProgress);
      recognition.current?.abort();
      recorder.current?.state === "recording" && recorder.current.stop();
    };
  }, []);

  const startWhisper = useCallback(async (base: string) => {
    const prefix = base.trim() ? `${base.trim()} ` : "";
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setError(ERRORS[(err as Error).name] ?? "No pude usar el micrófono.");
      return;
    }
    // Start fetching the model while the person talks.
    whisperWorker().postMessage({ type: "load" });
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    rec.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      recorder.current = null;
      if (!chunks.length) return setPhase("idle");
      setPhase("transcribing");
      try {
        const text = await transcribe(await toSamples(new Blob(chunks, { type: rec.mimeType })));
        if (text) onTextRef.current(prefix + text);
        else setError(ERRORS["no-speech"]);
      } catch {
        setError("No pude transcribir el audio. Revisa tu conexión la primera vez, mientras se descarga el modelo de voz.");
      } finally {
        setPhase("idle");
      }
    };
    recorder.current = rec;
    rec.start();
    setPhase("listening");
  }, []);

  const startNative = useCallback((base: string) => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    const prefix = base.trim() ? `${base.trim()} ` : "";
    let finalText = "";
    let heard = false;
    rec.onresult = (event) => {
      heard = true;
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      onTextRef.current((prefix + finalText + interim).replace(/\s+/g, " ").trimStart());
    };
    rec.onerror = (event) => {
      if (event.error === "network" && !heard && canRecord()) {
        // No speech service behind the API in this browser: remember that and switch to the local model.
        try { localStorage.setItem(ENGINE_KEY, "whisper"); } catch {}
        rec.onend = null;
        recognition.current = null;
        setEngine("whisper");
        setPhase("idle");
        startWhisper(base);
        return;
      }
      if (event.error !== "aborted") setError(ERRORS[event.error] ?? "No pude usar el micrófono.");
    };
    rec.onend = () => {
      recognition.current = null;
      setPhase("idle");
    };
    recognition.current = rec;
    try {
      rec.start();
      setPhase("listening");
    } catch {
      recognition.current = null;
      setError("No pude usar el micrófono.");
    }
  }, [lang, startWhisper]);

  const start = useCallback((base: string) => {
    if (phase !== "idle" || !engine) return;
    setError(null);
    if (engine === "native") startNative(base);
    else startWhisper(base);
  }, [engine, phase, startNative, startWhisper]);

  const stop = useCallback(() => {
    recognition.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  return {
    supported: engine !== null,
    listening: phase === "listening",
    transcribing: phase === "transcribing",
    /** Model download progress (0–100) while the voice model is fetched the first time. */
    download,
    error,
    start,
    stop
  };
}
