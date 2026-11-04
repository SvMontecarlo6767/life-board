# Erklärvideo: „Was wäre, wenn wir keinen Schlaf bräuchten?“

- `schlaf-video.mp4`: fertiges Video, 1920×1080, 30 fps, 81 s (74 s Inhalt + 7 s Quellen-Abspann)
  - Sprecherstimme liest die Untertitel wortgleich vor, die Untertitel sind fest eingeblendet
  - ruhige Hintergrundmusik, die unter der Stimme leiser wird
- `schlaf-video.html`: dieselbe Animation als abspielbare HTML-Datei mit Start-Button. Sie lädt `schlaf-ton.m4a` aus demselben Ordner.
- `schlaf-ton.m4a`: Tonspur aus Stimme und Musik
- `FAKTENLISTE.md`: alle Aussagen mit je ≥ 2 Quellen, Widersprüchen und Zahlenprüfung
- `tools/narration.json`: je Szene der Untertitel und die gesprochene Fassung (Zahlen ausgeschrieben)
- `tools/timing.json`: Szenengrenzen, abgeleitet aus den gemessenen Sprechzeiten

## Wie es gebaut wurde
1. **Stimme:** Piper-TTS mit der deutschen Stimme „Thorsten“ (de_DE-thorsten-high, Lizenz CC0), Tempo `length_scale=1.05`.
2. **Timing:** Szenenlänge = max(ursprüngliche Länge, 0,3 s + Sprechzeit + 0,55 s). Die Untertitel übernehmen genau diese Grenzen.
3. **Musik:** mit ffmpeg synthetisch erzeugt (Akkordfläche Am–F–C–G). Unter der Stimme wird sie per Sidechain-Kompression abgesenkt.
4. **Bild:** Die Seite stellt `renderAt(t)` bereit. Ein Playwright-Skript rendert jedes Frame (t = i/30) und leitet es per Pipe an ffmpeg weiter (libx264, CRF 18).
