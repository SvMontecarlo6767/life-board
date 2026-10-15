# Life Board

Persönliches Board (iPad, Safari): Hub, Heute (Dopamin-Konto), Recovery (Whoop), Lernen (Notion), Puzzle-Tracker, Jarvis.
Statische Seiten auf GitHub Pages, Daten in Firebase (Auth + Firestore), Schnittstellen über einen Cloudflare-Worker (`worker/worker.js`).

## Cloudflare-Worker aktualisieren
1. `worker/worker.js` auf GitHub öffnen → **Raw** → alles kopieren.
2. Cloudflare → Workers → dein Worker → **Edit code** → alles ersetzen → **Deploy**.
3. Secrets (einmalig, nie im Chat): `GEMINI_KEY`, `NOTION_TOKEN` sowie die Whoop-Werte.
Optionale Variablen: `GEMINI_MODEL` (bevorzugtes Modell), `GEMINI_VOICE` (Standard Charon, Alternative Orus), `AI_DAILY_LIMIT`, `AI_TTS_DAILY_LIMIT`.

## Training (Reiter „Training“)
Laufanalyse nach dem „Training OS“-Prompt von felsr.com · Sport KI, im HUD-Design des Boards. Alles regelbasiert, keine KI nötig.
- Dateien: `training.html`, `training.js` (Daten, Strava, CSV, Aufbau), `training-core.js` (Rechnen: VDOT, Belastung, Race Day …), `training-text.js` (Befund, Insights, Repair Guide, Coach-Antworten), `training-viz.js` (SVG-Diagramme).
- Daten: Firestore `users/{uid}/training/` (`acts_JAHR`, `settings`, `summary`), in der Sicherung enthalten.
- **Datenquelle A, Export:** Strava → Einstellungen → Mein Konto → Daten herunterladen → Archiv anfordern → `activities.csv` im Reiter „CSV auswählen“ (Garmin-CSV geht auch).
- **Datenquelle B, Strava direkt:** auf strava.com/settings/api eine App anlegen, *Authorization Callback Domain* = Worker-Adresse ohne `https://`; im Cloudflare-Worker die Secrets `STRAVA_CLIENT_ID` und `STRAVA_CLIENT_SECRET` setzen, aktuelle `worker.js` deployen. Im Reiter „Mit Strava verbinden“, danach „Jetzt synchronisieren“. Strava-Limit: 100 Anfragen / 15 Minuten, 1000 / Tag.
- Wetter und Ortssuche: einziger externer Abruf der Seite (Open-Meteo, nur Ort und Rennen-Datum).
- Tests: `node tools/test-training.mjs`, `node worker/test.mjs`, Browser: `node tools/browser/gen_training_seed.mjs seed.json` und `python3 tools/browser/test_training.py <Ordner> seed.json`.

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
