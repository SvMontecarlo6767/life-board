---
name: audio-ohren
description: Gives Claude "ears" for voiceovers and videos. Use it whenever you create or check a narration, voiceover, text-to-speech, video soundtrack or audio file. It generates speech with the free Kokoro voice (English, whole scene in one pass so nothing sounds choppy) and checks audio objectively, because Claude cannot hear. The checks are a Whisper transcript compared word by word with the script, speaking rate, pitch movement, long pauses, loudness, and whether music or effects mask the voice. Trigger words: Stimme, Sprecher, Voiceover, TTS, vorlesen, Ton prüfen, klingt, verständlich, Audio, Kokoro, Whisper.
---

# audio-ohren: hearing for narration and video sound

Claude cannot hear audio. This skill replaces hearing with measurements that can be repeated.
**The user's own ear still decides.** Measurements catch masked and mispronounced words and wrong pacing. They do NOT catch "sounds tired/bored". So take the user's feedback on finished videos seriously and adjust the voice settings.

## 0. Setup (once per session, about 2–4 minutes)
```bash
bash ${CLAUDE_SKILL_DIR}/scripts/setup.sh        # installs kokoro-onnx, sherpa-onnx, librosa; models to $EARS_DIR (default /opt/ears)
```
The script skips anything already present (for example if the environment's setup script ran it).

## 1. Generate the voice: script first, then the voice
Script file (UTF-8), one line per scene: `scene_name | text`. Lines starting with `#` are comments.
Numbers as `{display|spoken}`, for example `{7.5|seven and a half}`. The caption shows the display form, the voice speaks the spoken form.
```bash
python3 -I ${CLAUDE_SKILL_DIR}/scripts/tts.py script.txt out_dir/ [--voice af_heart] [--speed 1.22] [--energy]
```
- **The user's voice (2026-11-05): always use 1B** unless they ask for something else: `--voice af_heart --speed 1.22 --energy`.
  - Alternative only on request, "1C": `--voice af_heart:0.65,af_bella:0.35 --speed 1.22 --energy`.
  - Do NOT send voice samples beforehand (the user does not want that). The quality check (section 2) still always runs.
- `--energy` adds a brighter, denser sound (presence boost, compression, slight lift).
- The script should also carry the punch: short sentences, `!`, and `...` before punchlines.
- Each scene is synthesized as ONE piece (no gluing sentences together, which sounds choppy).
- Output: `scene_XX.wav`, `voice.wav` (all scenes, 0.12 s gap) and `timeline.json` (scene start/end + estimated word times for captions, from the same tokens as the voice).

## 2. Check: run this before EVERY delivery
```bash
python3 -I ${CLAUDE_SKILL_DIR}/scripts/check.py --timeline out_dir/timeline.json --audio out_dir/voice.wav  [--mix final_mix.wav] [--lang en]
```
Report per scene:
- **Whisper match** (character error, robust to "7.5" vs. "seven and a half")
- **Words per second, pitch movement, pauses > 1 s**
- **Loudness** (LUFS)
- **With `--mix`:** the same check on the finished mix, so masking by music or effects becomes visible.

Pass criteria (exit code 1 if any scene fails):
- Character error ≤ 3 % (voice) / ≤ 5 % (mix)
- Words per second 2.4–4.2 (English, counted as spoken words)
- No pause > 1.0 s inside a scene

If a scene fails, generate it again (the voice varies slightly per run) or rephrase that one sentence. Then check again.

## 3. Rules for sound in videos
- Effects (whoosh, pop, impact) must never sit on spoken words: place them before the cut, or make them short.
- Duck the music under the voice (sidechain); voice around −16 LUFS, final mix −14 to −16 LUFS.
- Voice: 1B by default (see section 1). Only send samples if the user asks for them.
