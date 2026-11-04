# Erklärvideo: „Was wäre, wenn wir keinen Schlaf bräuchten?“

- `schlaf-video.mp4`: fertiges Video, 1920×1080, 30 fps, 68 s (60 s Inhalt + Quellen-Abspann), deutsche Untertitel fest eingeblendet, ruhige Hintergrundmusik
- `schlaf-video.html`: dieselbe Animation als abspielbare HTML-Datei mit Start-Button (Canvas + JavaScript). Die Musik wird aus `schlaf-musik.m4a` im selben Ordner geladen.
- `FAKTENLISTE.md`: alle Aussagen mit je ≥ 2 Quellen, Widersprüchen und Zahlenprüfung
- `schlaf-musik.m4a`: Hintergrundmusik, mit ffmpeg synthetisch erzeugt (keine fremden Rechte)

Export: Die Seite stellt `renderAt(t)` bereit. Ein Playwright-Skript ruft das für jedes Frame auf (t = i/30), liest das Canvas aus und leitet es per Pipe an ffmpeg weiter (libx264, CRF 18).
Eine Sprecherstimme fehlt: In dieser Umgebung ließ sich kein Text-to-Speech-Modell herunterladen.
