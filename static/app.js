'use strict';

const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────────────────
let selectedFile = null;
let activeJobId = null;
let pollInterval = null;
let elapsedStart = null;
let elapsedInterval = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const fileInput     = $('file-input');
const fileBtn       = $('file-btn');
const fileNameEl    = $('file-name');
const fileDrop      = $('file-drop');
const modelSelect   = $('model-select');
const submitBtn     = $('submit-btn');
const uploadSection = $('upload-section');

const progressSection  = $('progress-section');
const progressFilename = $('progress-filename');
const progressModel    = $('progress-model');
const elapsedTimer     = $('elapsed-timer');

const resultSection  = $('result-section');
const resultFilename = $('result-filename');
const resultDuration = $('result-duration');
const transcriptText = $('transcript-text');
const copyBtn        = $('copy-btn');
const newBtn         = $('new-btn');
const copyToast      = $('copy-toast');

const errorSection  = $('error-section');
const errorMessage  = $('error-message');
const errorRetryBtn = $('error-retry-btn');

const historyToggle = $('history-toggle');
const historyList   = $('history-list');
const historyCount  = $('history-count');
const emptyHistory  = $('empty-history');

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
  submitBtn.disabled = false;
}

// ── Upload & transcribe ───────────────────────────────────────────────────────
$('upload-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;

  submitBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('model', modelSelect.value);

  let res;
  try {
    res = await fetch('/api/transcribe', { method: 'POST', body: formData });
  } catch {
    showError('Could not reach the server. Is it still running?');
    submitBtn.disabled = false;
    return;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    showError(body.detail || `Upload failed (HTTP ${res.status})`);
    submitBtn.disabled = false;
    return;
  }

  const { job_id } = await res.json();
  startPolling(job_id, selectedFile.name, modelSelect.value);
});

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling(jobId, filename, model) {
  activeJobId = jobId;
  showProgress(filename, model);
  pollInterval = setInterval(() => pollStatus(jobId), 2500);
  pollStatus(jobId);
}

async function pollStatus(jobId) {
  let data;
  try {
    const res = await fetch(`/api/status/${jobId}`);
    if (!res.ok) return;
    data = await res.json();
  } catch {
    // Network blip — keep polling, show warning inline
    elapsedTimer.textContent = elapsedSeconds() + 's (connection lost, retrying…)';
    return;
  }

  if (data.status === 'queued' || data.status === 'processing') {
    elapsedTimer.textContent = elapsedSeconds() + 's';
    return;
  }

  clearInterval(pollInterval);
  clearInterval(elapsedInterval);
  pollInterval = null;

  if (data.status === 'done') {
    showResult(data);
    loadHistory();
  } else {
    showError(data.error || 'Unknown error during transcription.');
  }
}

// ── UI state transitions ──────────────────────────────────────────────────────
function showProgress(filename, model) {
  hide(resultSection);
  hide(errorSection);
  show(progressSection);

  progressFilename.textContent = filename;
  progressModel.textContent = `Model: ${model}`;

  elapsedStart = Date.now();
  elapsedTimer.textContent = '0s';
  clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    elapsedTimer.textContent = elapsedSeconds() + 's';
  }, 1000);
}

function showResult(job) {
  hide(progressSection);
  hide(errorSection);
  show(resultSection);

  resultFilename.textContent = job.filename;
  resultDuration.textContent = job.duration_sec
    ? `${formatDuration(job.duration_sec)} audio`
    : '';
  transcriptText.textContent = job.transcript || '(empty)';
}

function showError(msg) {
  hide(progressSection);
  hide(resultSection);
  show(errorSection);
  errorMessage.textContent = msg;
  submitBtn.disabled = false;
}

function resetForm() {
  hide(resultSection);
  hide(errorSection);
  hide(progressSection);
  selectedFile = null;
  fileInput.value = '';
  fileNameEl.textContent = 'No file selected';
  submitBtn.disabled = true;
  activeJobId = null;
}

newBtn.addEventListener('click', resetForm);
errorRetryBtn.addEventListener('click', resetForm);

// ── Copy to clipboard ─────────────────────────────────────────────────────────
copyBtn.addEventListener('click', async () => {
  const text = transcriptText.textContent;
  try {
    await navigator.clipboard.writeText(text);
    flashCopied();
  } catch {
    // iOS Safari fallback
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

// ── History ───────────────────────────────────────────────────────────────────
historyToggle.addEventListener('click', () => {
  const open = historyToggle.getAttribute('aria-expanded') === 'true';
  historyToggle.setAttribute('aria-expanded', String(!open));
  historyList.classList.toggle('hidden', open);
});

async function loadHistory() {
  let jobs;
  try {
    const res = await fetch('/api/jobs');
    if (!res.ok) return;
    jobs = await res.json();
  } catch {
    return;
  }

  // If there's an active in-progress job not in the history polling yet, resume
  const inProgress = jobs.find(j => j.status === 'queued' || j.status === 'processing');
  if (inProgress && !pollInterval && inProgress.job_id !== activeJobId) {
    startPolling(inProgress.job_id, inProgress.filename, inProgress.model);
  }

  // Update count badge
  if (jobs.length > 0) {
    historyCount.textContent = jobs.length;
    historyCount.classList.remove('hidden');
  } else {
    historyCount.classList.add('hidden');
  }

  // Render list
  const doneJobs = jobs.filter(j => j.status !== 'queued' && j.status !== 'processing');
  emptyHistory.classList.toggle('hidden', doneJobs.length > 0);

  // Remove stale items
  const existing = new Set(Array.from(historyList.querySelectorAll('[data-job-id]')).map(el => el.dataset.jobId));
  const incoming = new Set(jobs.map(j => j.job_id));
  existing.forEach(id => {
    if (!incoming.has(id)) historyList.querySelector(`[data-job-id="${id}"]`)?.remove();
  });

  jobs.forEach(job => {
    let el = historyList.querySelector(`[data-job-id="${job.job_id}"]`);
    if (!el) {
      el = buildHistoryItem(job);
      historyList.appendChild(el);
    } else {
      updateHistoryItem(el, job);
    }
  });
}

function buildHistoryItem(job) {
  const el = document.createElement('div');
  el.className = 'history-item';
  el.dataset.jobId = job.job_id;
  el.innerHTML = `
    <div class="history-item-body">
      <div class="history-item-name"></div>
      <div class="history-item-meta"></div>
      <div class="history-item-preview"></div>
    </div>
    <span class="history-item-status"></span>
    <button class="history-delete" title="Delete" aria-label="Delete">✕</button>
  `;
  el.querySelector('.history-item-body').addEventListener('click', () => {
    if (job.status === 'done') loadJobIntoView(job.job_id);
  });
  el.querySelector('.history-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    await fetch(`/api/jobs/${job.job_id}`, { method: 'DELETE' });
    el.remove();
    loadHistory();
  });
  updateHistoryItem(el, job);
  return el;
}

function updateHistoryItem(el, job) {
  el.querySelector('.history-item-name').textContent = job.filename;
  el.querySelector('.history-item-meta').textContent =
    `${job.model} · ${formatDate(job.created_at)}`;
  el.querySelector('.history-item-preview').textContent = job.transcript || statusLabel(job.status);
  const statusEl = el.querySelector('.history-item-status');
  statusEl.textContent = statusLabel(job.status);
  statusEl.className = `history-item-status status-${job.status}`;
}

async function loadJobIntoView(jobId) {
  try {
    const res = await fetch(`/api/status/${jobId}`);
    if (!res.ok) return;
    const job = await res.json();
    if (job.status === 'done') showResult(job);
  } catch {}
}

function statusLabel(status) {
  return { queued: 'Queued', processing: 'Processing…', done: 'Done', error: 'Error' }[status] || status;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function elapsedSeconds() {
  return Math.floor((Date.now() - (elapsedStart || Date.now())) / 1000);
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadHistory();
