# Life Board

Persönliches Board (iPad, Safari): Hub, Heute (Dopamin-Konto), Recovery (Whoop), Lernen (Notion), Puzzle-Tracker, Jarvis.
Statische Seiten auf GitHub Pages, Daten in Firebase (Auth + Firestore), Schnittstellen über einen Cloudflare-Worker (`worker/worker.js`).

## Cloudflare-Worker aktualisieren
1. `worker/worker.js` auf GitHub öffnen → **Raw** → alles kopieren.
2. Cloudflare → Workers → dein Worker → **Edit code** → alles ersetzen → **Deploy**.
3. Secrets (einmalig, nie im Chat): `GEMINI_KEY`, `NOTION_TOKEN` sowie die Whoop-Werte.
Optionale Variablen: `GEMINI_MODEL` (bevorzugtes Modell), `GEMINI_VOICE` (Standard Charon, Alternative Orus), `AI_DAILY_LIMIT`, `AI_TTS_DAILY_LIMIT`.

## Jarvis
- Antippen öffnet, **halten = sprechen, loslassen = senden**. Tippen im Textfeld antwortet nur schriftlich.
- Schalter „Jarvis spricht“ (Optionen) bzw. „nur schriftlich“ / „sprich mit mir“ per Zuruf.
- Aktionen (immer erst Rückfrage, bestätigen per Knopf oder „ja“): Reiter wechseln, Einträge in Heute, Puzzle-Ergebnisse, Einstellungen. Die Handler liegen auf den Seiten (`window.JarvisHandlers`), Jarvis nutzt dieselben Funktionen wie die normale Bedienung.
- Neue Aktion: Werkzeug in `jarvis-actions.js` (`tools()` + `handle()`), Handler auf der Zielseite registrieren.

## Einstellungen (Zahnrad bzw. „Optionen“)
Performance-Modus (schwächt 3D, Unschärfe, Animationen ab – nur per Schalter), UI-Sounds, Geräteneigung, Jarvis spricht, FPS-Anzeige.

## Tests
- `node worker/test.mjs`, `node tools/test-learn.mjs`, `node tools/test-voice.mjs`
- Browser (Playwright, Chromium): `tools/browser/test_hud.py`, `test_heute.py`, `test_learn.py`, `test_jarvis.py`, `test_actions.py`, Screenshots mit `shot_hud.py`.
- Notion, Gemini und Sprachausgabe sind nur mit Mocks getestet.

## Hinweis zu Versionsnummern
Die Seiten hängen `?v=N` an Skripte und Links, damit Safari nach Änderungen neu lädt. Bei Änderungen an einer Datei die Nummer erhöhen.
