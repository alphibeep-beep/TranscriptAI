import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2/dist/transformers.min.js';

// Only load from Hugging Face hub, not local files
env.allowLocalModels = false;

let transcriber = null;
let loadedModel = null;

// Track per-file download progress to show an aggregate bar
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
  } else if (p.status === 'done') {
    // individual file finished
  } else if (p.status === 'ready') {
    // all files ready
  }
}

self.onmessage = async (e) => {
  const { type, model, audio } = e.data;

  if (type === 'load') {
    // Skip if same model is already loaded
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
      const float32 = audio instanceof Float32Array ? audio : new Float32Array(audio);
      const result = await transcriber(
        { data: float32, sampling_rate: 16000 },
        { return_timestamps: false }
      );
      const text = (result.text || '').trim();
      self.postMessage({ type: 'result', text: text || '(no speech detected)' });
    } catch (err) {
      self.postMessage({ type: 'error', message: `Transcription failed: ${err.message}` });
    }
  }
};
