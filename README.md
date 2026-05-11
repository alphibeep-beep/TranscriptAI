# TranscriptAI

Transcribe audio files in your browser — no installation, no API key, no uploads. Whisper runs entirely on your device using WebAssembly.

## How to use

### Step 1 — Enable the website (one-time, ~30 seconds)

1. Go to **[Settings → Pages](https://github.com/alphibeep-beep/TranscriptAI/settings/pages)**
2. Under **Source**, choose **Deploy from a branch**
3. Set **Branch** to `claude/voice-transcription-app-9m4fy` and **Folder** to `/docs`
4. Click **Save**
5. Wait ~60 seconds, then your site is live at:
   **https://alphibeep-beep.github.io/TranscriptAI/**

### Step 2 — Transcribe

1. Open the URL above in **Chrome, Firefox, or Safari**
2. Wait for "Model ready" (first visit downloads ~75 MB — cached after that)
3. Tap **Choose Audio File** and pick a recording
4. Click **Transcribe**
5. Copy the result

Works on iPhone/iPad too — open the URL in Safari.

---

## Privacy

Audio never leaves your device. The Whisper model runs locally in your browser via WebAssembly. The only network request is the one-time model download from Hugging Face.

## Models

| Option | Size | Speed | Languages |
|---|---|---|---|
| tiny (English) | ~75 MB | Fastest | English only |
| base (multilingual) | ~145 MB | Balanced | 99 languages |

Models are cached in your browser after the first download.

## Supported formats

m4a, mp3, wav, mp4, ogg, flac, webm — anything your browser can play.

---

## Advanced: local Python server

For power users who want to run Whisper on their own machine without size limits:

**Prerequisites:** Python 3.10+, [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg` on Mac)

```bash
pip install -r requirements.txt
python main.py
```

This starts a server at `http://localhost:8000`. The startup output shows a network URL you can open on any device on the same WiFi.
