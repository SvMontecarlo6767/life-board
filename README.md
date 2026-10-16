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

## Schlaf-Hebel (Recovery-Reiter)

Die Karte „😴 Schlaf-Hebel“ im Recovery-Reiter beantwortet eine Frage: Was beeinflusst Schlaf und Erholung am stärksten, und was ändere ich deshalb? Ergebnis ist genau **ein** Hebel mit Zahlen, oder „Die Daten geben das noch nicht her“.

- **Rechnet fest nach Regeln** in `sleep-lever.js` (kein Gemini, gleiche Daten = gleiches Ergebnis, Tests: `node tools/test-sleep.mjs`). Jarvis liest nur die gespeicherte Karte vor.
- **Sechs Verdächtige:** späte harte Einheit, unregelmäßige Bettzeit, kurze Nächte, Trainingssprung, Alkohol am Abend, späte große Mahlzeit. Verglichen wird der Median des Wirkungswerts (Standard HRV) mit/ohne Merkmal, je Gruppe mindestens 5 Nächte, Schwelle nach Gruppengröße, dazu die „strengste Probe“.
- **Daten:** Whoop (Schlaf, HRV, Ruhepuls, Workouts) plus Heute-Einträge: Alkohol, neu **„Letzte große Mahlzeit“** und **„Krank“** (Heute → Schlaf-Daten). Fehlende Angaben sind „unbekannt“, nie „nein“. Unter 14 Nächten wird nicht geprüft, stattdessen gibt es den Zwei-Wochen-Zettel.
- **Sicherheitsfrage** (Schnarchen, Atemaussetzer, massive Tagesmüdigkeit): wird nie angenommen. „Ja“ stellt eine ärztliche Abklärung vor jeden Hebel. Keine Diagnose, keine Empfehlung für Melatonin, Schlafmittel oder Supplemente.
- **Schlaf-Karte** wird in `users/{uid}/sleepcards/{Datum}` gespeichert (Verlauf), Einstellungen in `sleepcfg/main`. Beides ist in der Sicherung enthalten.
- **Jarvis:** „Was ist mein Schlaf-Hebel?“, „Letzte Mahlzeit war um 21:15“ (mit Rückfrage), Antwort auf die Sicherheitsfrage.

## Graph-Vollbild

Jeder Graph hat oben rechts ein Vergrößern-Symbol (48 px). Es öffnet ein Vollbild im Akzent des Reiters, der Graph wächst dabei aus seinem Platz im Panel; Schließen mit ✕ oder Wischen nach unten am oberen Griff (nie auf der Graphfläche). Das Vollbild liest nur und verändert keine Daten.

- **Zeitreihen** (Recovery: Recovery, HRV, Ruhepuls, Schlafdauer, Schlaf-Performance, Strain, Atemfrequenz, Blutsauerstoff, Hauttemperatur, Kalorien, Schritte; Training: Form, Trainingslast pro Tag, Stunden pro Woche): Tippen zeigt Datum mit Wochentag, Wert und Einheit; Wischen bewegt eine Markierung; Zeitraum 7 Tage / 30 Tage / 3 Monate / 1 Jahr / Alles (nur wo Daten existieren); Zwei-Finger-Zoom und Verschieben; Kalender mit nur wählbaren Tagen mit Daten; Knöpfe Heute, Bestwert, Tiefstwert, Zurücksetzen. Lücken bleiben Lücken (schraffiert, „keine Daten“).
- **Statistiken** (`graph-stats.js`, deterministisch, immer aus den Originaldaten, Tests: `node tools/test-graphstats.mjs`): Durchschnitt, Median, Bestwert/Tiefstwert (Richtung beachtet), Trend gegen den gleich langen Zeitraum davor, Datenpunkte gegen Tage, Summe, gute Tage und Serie, Wochentage.
- **Alle übrigen Diagramme** (Radar, Zonen, Gym, Puzzle …) erkennt `GraphFull.auto()` selbst und zeigt sie vergrößert, ohne Zeitachsen-Bedienung und ohne neue Statistik.
- **Neuer Graph = eine Zeile:** `GraphFull.attach('#id',{id:'x',title:'…',unit:'kg',dir:1,series:()=>[{date:'2026-10-01',value:70}]})`.
- **Jarvis:** „Jarvis fragen“ übergibt Graph, Zeitraum und die berechneten Werte; Jarvis öffnet Graphen („zeig mir meinen Schlaf der letzten 30 Tage“), wechselt den Zeitraum und springt zu Daten, ohne Rückfrage.
- Im Performance-Modus oder bei „Bewegung reduzieren“ gibt es nur ein kurzes Einblenden statt der Animation.

## Kalender (Reiter „Kalender“)
Eigener Kalender im Life Board (keine Verbindung zu Google/Apple). Ansichten: **Monat, Woche, Tag, Jahr**. Antippen eines Tages zeigt rechts (iPad) bzw. darunter (iPhone) den Tag: Termine, **Rückblick** (Heute-Rang, Recovery/HRV, Schlaf, Strain, Training, Puzzle, Lernen – nur was es wirklich gibt, nichts erfunden) und **Notiz/Tagebuch mit Stimmung**.
- **Termine:** Titel, Tag oder mehrere Tage, ganztägig oder mit Beginn/Ende, Kategorie, Notiz, Wiederholung (täglich, wöchentlich mit Wochentagen, monatlich, jährlich, alle n …, bis Datum), Erinnerung, „Zum Abhaken“ für Planung (Training, Lernen, Puzzle). Bei Serien lässt sich ein einzelner Tag löschen. Ein Tipp in die Zeitleiste (Woche/Tag) legt einen Termin zur angetippten Uhrzeit an.
- **Einfärbung** (Auswahl oben): Heute-Rang, Recovery, Strain, Training, Puzzle, Stimmung oder Termine. Tage ohne Daten bleiben leer, nie „0“.
- **Plan aus Heute:** Der „Fokus für morgen" aus dem Tagesabschluss erscheint am Folgetag im Kalender (Tagesfeld, 🎯 im Monat).
- **Daten:** Firestore `users/{uid}/calendar` (`ev_JAHR` mit den Terminen, `notes_JAHR` mit den Tagesnotizen); gehört zur Datensicherung. Whoop-Werte werden monatsweise geladen.
- **Erinnerungen:** erscheinen als Hinweis im Life Board (auf jeder Seite) und, wenn erlaubt, als Benachrichtigung – **nur solange die App geöffnet ist**. Eine Seite ohne Server kann keine Push-Nachrichten bei geschlossener App schicken. Dafür unter „⋯“ alle Termine als `.ics` laden und im Apple Kalender öffnen: Dort setzt das iPad die Alarme selbst.
- **Jarvis:** „Trag morgen um 15 Uhr Zahnarzt ein“ (mit Bestätigung und Warnung bei Überschneidung), „Was steht heute/diese Woche an?“, „Öffne den Kalender im Wochenmodus“, „Schreib in die Notiz von heute …“. Rechenkern: `calendar-core.js` (Tests: `node tools/test-calendar.mjs`), Speicher/Erinnerungen: `calendar-store.js`, Browsertest: `tools/browser/test_calendar.py <Ordner> [ipad|phone|all]`.
