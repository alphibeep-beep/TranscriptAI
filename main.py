import os
import shutil
import socket
import tempfile
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import uvicorn
import whisper
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ALLOWED_EXTENSIONS = {".m4a", ".mp3", ".wav", ".mp4", ".ogg", ".flac", ".webm"}
MAX_FILE_BYTES = 500 * 1024 * 1024  # 500 MB

app = FastAPI(title="TranscriptAI")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

executor = ThreadPoolExecutor(max_workers=1)

# In-memory job store: job_id -> dict
jobs: dict[str, dict] = {}

STATIC_DIR = Path(__file__).parent / "static"


def _get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def _transcribe_task(job_id: str, tmp_path: str, model_name: str) -> None:
    jobs[job_id]["status"] = "processing"
    try:
        print(f"[TranscriptAI] Loading model '{model_name}'... (first run downloads weights)")
        model = whisper.load_model(model_name)
        print(f"[TranscriptAI] Transcribing {jobs[job_id]['filename']}...")
        result = model.transcribe(tmp_path, verbose=False)
        transcript = result["text"].strip()
        segments = result.get("segments", [])
        duration = segments[-1]["end"] if segments else None
        jobs[job_id].update(
            status="done",
            transcript=transcript,
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_sec=duration,
        )
        print(f"[TranscriptAI] Done: {jobs[job_id]['filename']}")
    except Exception as exc:
        jobs[job_id].update(
            status="error",
            error=str(exc),
            completed_at=datetime.now(timezone.utc).isoformat(),
        )
        print(f"[TranscriptAI] Error transcribing {jobs[job_id]['filename']}: {exc}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@app.post("/api/transcribe", status_code=202)
async def transcribe(file: UploadFile, model: str = "base"):
    if model not in ("tiny", "base", "small", "medium"):
        raise HTTPException(400, "model must be one of: tiny, base, small, medium")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    # Stream to temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    total = 0
    try:
        while chunk := await file.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_FILE_BYTES:
                tmp.close()
                os.unlink(tmp.name)
                raise HTTPException(413, "File exceeds 500 MB limit")
            tmp.write(chunk)
    finally:
        tmp.close()

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "job_id": job_id,
        "filename": file.filename or "upload",
        "status": "queued",
        "model": model,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "transcript": None,
        "error": None,
        "duration_sec": None,
    }

    executor.submit(_transcribe_task, job_id, tmp.name, model)
    return {"job_id": job_id, "status": "queued"}


@app.get("/api/status/{job_id}")
def get_status(job_id: str):
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.get("/api/jobs")
def list_jobs():
    result = []
    for job in sorted(jobs.values(), key=lambda j: j["created_at"], reverse=True):
        preview = None
        if job["transcript"]:
            preview = job["transcript"][:100] + ("…" if len(job["transcript"]) > 100 else "")
        result.append({**job, "transcript": preview})
    return result


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    del jobs[job_id]


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    return FileResponse(str(STATIC_DIR / "index.html"))


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        print("ERROR: ffmpeg not found. Install it first:")
        print("  Mac:    brew install ffmpeg")
        print("  Ubuntu: sudo apt install ffmpeg")
        raise SystemExit(1)

    port = int(os.environ.get("PORT", 8000))
    lan_ip = _get_lan_ip()

    print("\n" + "=" * 50)
    print("  TranscriptAI")
    print("=" * 50)
    print(f"  Local:    http://127.0.0.1:{port}")
    print(f"  Network:  http://{lan_ip}:{port}  <-- open on iPhone")
    print("=" * 50 + "\n")

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
