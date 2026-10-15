# Life Board

Persönliches Board (iPad, Safari): Hub, Heute (Dopamin-Konto), Recovery (Whoop), Lernen (Notion), Puzzle-Tracker, Jarvis.
Statische Seiten auf GitHub Pages, Daten in Firebase (Auth + Firestore), Schnittstellen über einen Cloudflare-Worker (`worker/worker.js`).

## Cloudflare-Worker aktualisieren
1. `worker/worker.js` auf GitHub öffnen → **Raw** → alles kopieren.
2. Cloudflare → Workers → dein Worker → **Edit code** → alles ersetzen → **Deploy**.
3. Secrets (einmalig, nie im Chat): `GEMINI_KEY`, `NOTION_TOKEN` sowie die Whoop-Werte.
Optionale Variablen: `GEMINI_MODEL` (bevorzugtes Modell), `GEMINI_VOICE` (Standard Charon, Alternative Orus), `AI_DAILY_LIMIT`, `AI_TTS_DAILY_LIMIT`.

## Training (Reiter „Training“)
**Zwei Ansichten** (Schalter oben auf der Seite): **Allround** (Standard) für alle Sportarten und **Läufer** (VDOT, Race Day, Schuhe, Plan).
- Allround: Einheiten eintragen (Sportart, Dauer, Anstrengung 1–10, optional Strecke/Puls), Wochenziel in Einheiten, Form und Belastung, Sportarten-Verteilung, Jahr als 3D-Stadt, Rekorde, Logbuch mit Löschen. Ohne Puls wird die Belastung aus Dauer und Anstrengung geschätzt.
- **Whoop:** Workouts (mit Puls, Strain, Kalorien) kommen automatisch aus den Whoop-Daten des Boards; „Jetzt abgleichen“ holt neue, „12 Monate nachholen“ die Vergangenheit. Gelöschte Whoop-Einträge bleiben gelöscht. Kein Strava nötig.
- Tests: `python3 tools/browser/test_training_multi.py <Ordner>`.

Laufanalyse nach dem „Training OS“-Prompt von felsr.com · Sport KI, im HUD-Design des Boards. Alles regelbasiert, keine KI nötig.
- Dateien: `training.html`, `training.js` (Daten, Strava, CSV, Aufbau), `training-core.js` (Rechnen: VDOT, Belastung, Race Day …), `training-text.js` (Befund, Insights, Repair Guide, Coach-Antworten), `training-viz.js` (SVG-Diagramme).
- Daten: Firestore `users/{uid}/training/` (`acts_JAHR`, `settings`, `summary`), in der Sicherung enthalten.
- **Datenquelle A, Export:** Strava → Einstellungen → Mein Konto → Daten herunterladen → Archiv anfordern → `activities.csv` im Reiter „CSV auswählen“ (Garmin-CSV geht auch).
- **Datenquelle B, Strava direkt:** auf strava.com/settings/api eine App anlegen, *Authorization Callback Domain* = Worker-Adresse ohne `https://`; im Cloudflare-Worker die Secrets `STRAVA_CLIENT_ID` und `STRAVA_CLIENT_SECRET` setzen, aktuelle `worker.js` deployen. Im Reiter „Mit Strava verbinden“, danach „Jetzt synchronisieren“. Strava-Limit: 100 Anfragen / 15 Minuten, 1000 / Tag.
- Wetter und Ortssuche: einziger externer Abruf der Seite (Open-Meteo, nur Ort und Rennen-Datum).
- Tests: `node tools/test-training.mjs`, `node worker/test.mjs`, Browser: `node tools/browser/gen_training_seed.mjs seed.json` und `python3 tools/browser/test_training.py <Ordner> seed.json`.

## KI-Anbieter umstellen
In **Optionen → KI-Anbieter** zwischen Gemini (Standard), Groq (Llama), OpenRouter und Mistral wählen. Der Chat und Jarvis' Antworten laufen dann über den gewählten Anbieter, inklusive Aktionen mit Rückfrage. Spracheingabe (STT) und Sprachausgabe (TTS) bleiben bei Gemini.
- Im Cloudflare-Worker als Secret anlegen (nie im Chat posten): `GROQ_KEY`, `OPENROUTER_KEY`, `MISTRAL_KEY`. Optional Modelle per Variable `GROQ_MODEL`, `OPENROUTER_MODEL`, `MISTRAL_MODEL`.
- Aktuelle `worker/worker.js` deployen. Fehlt ein Schlüssel, meldet die KI das im Chat.
- Nur mit Mocks getestet.

## Gym-Logbuch (im Training, Ansicht „Allround“)
- Vorlagen Push / Pull / Beine / Oberkörper / Unterkörper / Ganzkörper, „Wie zuletzt“ oder leer. Übungen frei hinzufügbar (Vorschläge aus deinen bisherigen Übungen).
- Pro Übung Sätze mit Gewicht und Wiederholungen; die Werte vom letzten Mal sind vorbelegt, dazu ein Vorschlag (Doppelprogression: alle Sätze ≥ 10 Wdh → Gewicht erhöhen). Pausen-Timer, Entwurf bleibt bei Neuladen erhalten.
- Auswertung: Rekorde (Gewicht, Wiederholungen, geschätztes 1RM nach Epley) mit Meldung beim Speichern, Verlaufskurve je Übung, Sätze pro Muskelgruppe (Zuordnung nach dem Namen), Einheitenverlauf. Jede Gym-Einheit zählt als Kraft-Einheit fürs Wochenziel und die Belastung.
- Daten: `users/{uid}/training/gym_JJJJ` (Firestore, in der Sicherung enthalten). Tests: `node tools/test-gym.mjs`, `python3 tools/browser/test_gym.py <Ordner>`.

## App auf dem iPad
Safari → Teilen → **Zum Home-Bildschirm**. `manifest.webmanifest`, Symbole in `icons/` und `sw.js` (Service Worker: Netz zuerst, nur bei Ausfall die zuletzt geladene Seite; Firebase, Worker und Co. werden nie zwischengespeichert). Daten kommen weiterhin aus Firestore, brauchen also Netz. Nach Änderungen an Seiten steigt der Cache-Name in `sw.js` nur bei neuen Dateien in `SHELL`.

## Sicherung wiederherstellen
Im Hub unter „Sichern“: Datei auswählen, Vorschau prüfen, bestätigen. Gleiche Dokumente werden überschrieben, nichts wird gelöscht; Whoop-Rohdaten (liegen im Worker) sind nicht enthalten. Test: `python3 tools/browser/test_backup.py`.

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
