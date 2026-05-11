import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js';

env.allowLocalModels = false;

let transcriber = null;
let loadedModel = null;

const fileProgress = new Map();

function onProgress(p) {
  if (p.status === 'initiate') {
    fileProgress.set(p.file, { loaded: 0, total: 0 });
  } else if (p.status === 'progress') {
    fileProgress.set(p.file, { loaded: p.loaded, total: p.total });
    const totals = [...fileProgress.values()];
    const loaded = totals.reduce((s, f) => s + f.loaded, 0);
    const total  = totals.reduce((s, f) => s + f.total, 0);
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    self.postMessage({ type: 'download_progress', pct, loaded, total });
  }
}

self.onmessage = async (e) => {
  const { type, model, audio } = e.data;

  if (type === 'load') {
    if (transcriber && loadedModel === model) {
      self.postMessage({ type: 'ready' });
      return;
    }

    fileProgress.clear();
    self.postMessage({ type: 'loading' });

    try {
      transcriber = await pipeline('automatic-speech-recognition', model, {
        quantized: true,
        progress_callback: onProgress,
      });
      loadedModel = model;
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', message: `Failed to load model: ${err.message}` });
    }
    return;
  }

  if (type === 'transcribe') {
    if (!transcriber) {
      self.postMessage({ type: 'error', message: 'Model not loaded yet.' });
      return;
    }

    self.postMessage({ type: 'transcribing' });

    try {
      const result = await transcriber(
        { data: audio, sampling_rate: 16000 },
        { chunk_length_s: 30, stride_length_s: 5, return_timestamps: false }
      );
      self.postMessage({ type: 'result', text: result.text.trim() });
    } catch (err) {
      self.postMessage({ type: 'error', message: `Transcription failed: ${err.message}` });
    }
  }
};
