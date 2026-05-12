'use strict';

const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let worker = null;
let modelReady = false;
let selectedFile = null;
let currentModel = 'Xenova/whisper-tiny.en';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const modelStatus     = $('model-status');
const modelStatusText = $('model-status-text');
const downloadBar     = $('download-bar');
const downloadFill    = $('download-fill');
const downloadPct     = $('download-pct');

const fileInput   = $('file-input');
const fileBtn     = $('file-btn');
const fileNameEl  = $('file-name');
const fileDrop    = $('file-drop');
const modelSelect = $('model-select');
const submitBtn   = $('submit-btn');

const progressSection = $('progress-section');
const progressStatus  = $('progress-status');

const resultSection  = $('result-section');
const transcriptText = $('transcript-text');
const copyBtn        = $('copy-btn');
const newBtn         = $('new-btn');
const copyToast      = $('copy-toast');

const errorSection = $('error-section');
const errorMessage = $('error-message');
const errorRetry   = $('error-retry-btn');

// ── Worker setup ──────────────────────────────────────────────────────────────
function initWorker(model) {
  if (worker) worker.terminate();
  modelReady = false;
  currentModel = model;
  submitBtn.disabled = true;

  worker = new Worker('./worker.js', { type: 'module' });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (e) => showError(`Worker error: ${e.message}`);

  setModelStatus('loading', 'Downloading model… (first visit only)');
  showDownloadBar(true);
  worker.postMessage({ type: 'load', model });
}

function handleWorkerMessage(e) {
  const { type, pct, text, message } = e.data;

  if (type === 'loading') {
    setModelStatus('loading', 'Downloading model… (first visit only)');

  } else if (type === 'download_progress') {
    downloadFill.style.width = `${pct}%`;
    downloadPct.textContent = `${pct}%`;

  } else if (type === 'ready') {
    modelReady = true;
    showDownloadBar(false);
    setModelStatus('ready', 'Model ready');
    if (selectedFile) submitBtn.disabled = false;

  } else if (type === 'transcribing') {
    progressStatus.textContent = 'Transcribing…';

  } else if (type === 'result') {
    showResult(text);

  } else if (type === 'error') {
    showError(message);
  }
}

// ── File selection ────────────────────────────────────────────────────────────
fileBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) selectFile(fileInput.files[0]);
});

fileDrop.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileDrop.classList.add('drag-over');
});
fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));
fileDrop.addEventListener('drop', (e) => {
  e.preventDefault();
  fileDrop.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]);
});

function selectFile(file) {
  selectedFile = file;
  fileNameEl.textContent = file.name;
  submitBtn.disabled = !modelReady;
}

// ── Model switching ───────────────────────────────────────────────────────────
modelSelect.addEventListener('change', () => {
  const chosen = modelSelect.value;
  if (chosen !== currentModel) {
    initWorker(chosen);
  }
});

// ── Transcribe ────────────────────────────────────────────────────────────────
$('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile || !modelReady) return;

  submitBtn.disabled = true;
  hide(errorSection);
  hide(resultSection);
  show(progressSection);
  progressStatus.textContent = 'Decoding audio…';

  let audio;
  try {
    audio = await decodeAudio(selectedFile);
  } catch (err) {
    showError(`Could not decode audio: ${err.message}. Try a different file format.`);
    return;
  }

  progressStatus.textContent = 'Transcribing…';
  // Don't transfer — copy instead. Transferring can leave a neutered buffer in Safari.
  worker.postMessage({ type: 'transcribe', audio: audio.slice() });
});

async function decodeAudio(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Decode at native sample rate (Safari ignores the sampleRate constructor option)
  const ctx = new AudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const TARGET_SR = 16000;
  if (audioBuffer.sampleRate === TARGET_SR) {
    return new Float32Array(audioBuffer.getChannelData(0));
  }

  // Resample to 16 kHz using OfflineAudioContext
  const numFrames = Math.round(audioBuffer.duration * TARGET_SR);
  const offlineCtx = new OfflineAudioContext(1, numFrames, TARGET_SR);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const resampled = await offlineCtx.startRendering();
  return new Float32Array(resampled.getChannelData(0));
}

// ── Result / error display ────────────────────────────────────────────────────
function showResult(text) {
  hide(progressSection);
  hide(errorSection);
  show(resultSection);
  transcriptText.textContent = text || '(empty transcript)';
  submitBtn.disabled = false;
}

function showError(msg) {
  hide(progressSection);
  hide(resultSection);
  show(errorSection);
  errorMessage.textContent = msg;
  submitBtn.disabled = !modelReady || !selectedFile;
}

newBtn.addEventListener('click', resetForm);
errorRetry.addEventListener('click', resetForm);

function resetForm() {
  hide(resultSection);
  hide(errorSection);
  hide(progressSection);
  selectedFile = null;
  fileInput.value = '';
  fileNameEl.textContent = 'No file selected';
  submitBtn.disabled = true;
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  const text = transcriptText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    flashCopied();
  } catch {
    // Safari fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); flashCopied(); } catch {}
    document.body.removeChild(ta);
  }
});

function flashCopied() {
  copyToast.classList.remove('hidden');
  setTimeout(() => copyToast.classList.add('hidden'), 2000);
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setModelStatus(state, text) {
  modelStatus.dataset.state = state;
  modelStatusText.textContent = text;
}

function showDownloadBar(visible) {
  downloadBar.classList.toggle('hidden', !visible);
}

// ── Init ──────────────────────────────────────────────────────────────────────
initWorker(currentModel);
