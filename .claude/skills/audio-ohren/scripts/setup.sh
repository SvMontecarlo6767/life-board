#!/usr/bin/env bash
# Installs the tools for audio-ohren. Idempotent: skips anything already present.
set -euo pipefail
EARS_DIR="${EARS_DIR:-/opt/ears}"
mkdir -p "$EARS_DIR"

python3 -c "import kokoro_onnx, sherpa_onnx, librosa, soundfile" 2>/dev/null \
  || pip install -q kokoro-onnx sherpa-onnx librosa soundfile

K=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "$EARS_DIR/$f" ] || curl -sSL -o "$EARS_DIR/$f" "$K/$f"
done

if [ ! -s "$EARS_DIR/sherpa-onnx-whisper-small/small-encoder.int8.onnx" ]; then
  curl -sSL https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-whisper-small.tar.bz2 \
    | tar xj -C "$EARS_DIR"
fi
command -v ffmpeg >/dev/null || echo "WARNUNG: ffmpeg fehlt (für Lautheit/Mix-Prüfung nötig)"
echo "audio-ohren bereit in $EARS_DIR"
