# TranscriptAI

Local Whisper-powered audio transcription. Run the server on your Mac or PC, then open it in iPhone Safari over WiFi — no cloud, no API key needed.

## Prerequisites

- Python 3.10+
- ffmpeg

```bash
# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg
```

## Setup

```bash
git clone <repo-url>
cd TranscriptAI
pip install -r requirements.txt
```

## Run

```bash
python main.py
```

At startup you'll see something like:

```
==================================================
  TranscriptAI
==================================================
  Local:    http://127.0.0.1:8000
  Network:  http://192.168.1.42:8000  <-- open on iPhone
==================================================
```

Type the **Network** URL into iPhone Safari (must be on the same WiFi network as your computer).

## First run

Whisper downloads model weights automatically on first use. Sizes:

| Model  | Size    | Speed       | Accuracy |
|--------|---------|-------------|----------|
| tiny   | ~75 MB  | Fastest     | Lower    |
| base   | ~150 MB | Fast        | Good     |
| small  | ~500 MB | Moderate    | Better   |
| medium | ~1.5 GB | Slow        | Best     |

Models are cached in `~/.cache/whisper/` after the first download.

## Usage

1. Tap **Choose Audio File** and pick a Voice Memo or recording (m4a, mp3, wav, mp4, ogg, flac, webm supported).
2. Select a model size.
3. Tap **Transcribe**.
4. Wait for the spinner to finish — progress is shown with an elapsed timer.
5. Copy the transcript with the **Copy to Clipboard** button.
6. Past transcripts appear in the **History** section for the current server session.

## Options

**Change the port** (if 8000 is already in use):

```bash
PORT=8001 python main.py
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `ERROR: ffmpeg not found` | Install ffmpeg (see Prerequisites) |
| Port 8000 already in use | `PORT=8001 python main.py` |
| iPhone can't connect | Ensure Mac and iPhone are on the same WiFi; check firewall settings |
| Model download is slow | Only happens once; weights are cached afterward |
| Transcription is very slow | Switch to the `tiny` or `base` model |
