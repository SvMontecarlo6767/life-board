# Life Board

Persönliches Board (iPhone und iPad, Safari): Hub, Check-in (Stimmung, Gedanken, 3 gute Dinge), Muster (Zusammenhänge), Heute (Dopamin-Konto), Recovery (Whoop), Training, Lernen (Notion), Kalender, Puzzle-Tracker. Ohne KI – alles fest gerechnet.
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

## Allround-Training (nach dem Sportler-Interview)
- **Noch ergänzen:** Whoop-Einheiten der letzten 14 Tage (z. B. „Functional Fitness“) bekommen Sportart (Kraft, Isometrie, Plyometrie, Fußball, Lauf …), Fokus (z. B. Pull, Sprungkraft, Spiel), Anstrengung 1–10 und Notiz. Gespeichert am Eintrag (`o`, `f`, `x`, `no`, `ok`). „Speichern + Übungen eintragen“ öffnet das Gym-Logbuch mit Vorlage; die Gym-Einheit wird mit der Whoop-Einheit verknüpft (`w`) und zählt nur einmal.
- **Balance-Ampel:** Kraft (Kraft, Isometrie), Ausdauer (Lauf, Rad …), Explosiv (Plyometrie, HIIT), Fußball pro Woche gegen Ziele (Standard 2/2/1/2, änderbar, `settings.balance`).
- **Bestwerte:** Klimmzüge (am Stück und mit Zusatzgewicht, aus dem Gym-Logbuch), 5 km und 10 km (passende Läufe, sonst aus dem schnellsten längeren Lauf hochgerechnet, dazu Prognose aus der Form).
- Test: `node tools/browser/test_training_allround.mjs`.

## Gym-Logbuch (im Training, Ansicht „Allround“)
- Vorlagen Push / Pull / Beine / Oberkörper / Unterkörper / Ganzkörper, „Wie zuletzt“ oder leer. Übungen frei hinzufügbar (Vorschläge aus deinen bisherigen Übungen).
- Pro Übung Sätze mit Gewicht und Wiederholungen; die Werte vom letzten Mal sind vorbelegt, dazu ein Vorschlag (Doppelprogression: alle Sätze ≥ 10 Wdh → Gewicht erhöhen). Pausen-Timer, Entwurf bleibt bei Neuladen erhalten.
- Auswertung: Rekorde (Gewicht, Wiederholungen, geschätztes 1RM nach Epley) mit Meldung beim Speichern, Verlaufskurve je Übung, Sätze pro Muskelgruppe (Zuordnung nach dem Namen), Einheitenverlauf. Jede Gym-Einheit zählt als Kraft-Einheit fürs Wochenziel und die Belastung.
- Daten: `users/{uid}/training/gym_JJJJ` (Firestore, in der Sicherung enthalten). Tests: `node tools/test-gym.mjs`, `python3 tools/browser/test_gym.py <Ordner>`.

## Tagesüberblick (Reiter-Kachel „Überblick“, `news.html`)
- Nur das Wichtige, kein Sport, etwa 8–10 Minuten: „Die wichtigsten Themen“ (3, ausführlich bis ~900 Zeichen), Deutschland (6), Welt (6), Wirtschaft (4), Technik & Wissen (6). Quellen: tagesschau, ZDFheute, Deutsche Welle, heise – in der Reihenfolge der Redaktionen, jede Meldung nur einmal. Text = Vorspann + Artikelanfang aus dem Feed (ohne KI), am Satzende gekürzt; Antippen öffnet den ganzen Artikel.
- Der Worker liest RSS/Atom (`/news`, neu nach 3 Stunden, `?refresh=1` sofort), mehrere Quellen pro Bereich als Ersatz; die Seite nennt ausgefallene Quellen und zeigt offline den letzten Stand.
- Push morgens (Standard 6:45, am Wochenende 9:30, im Check-in einstellbar); fällt sie mit der Morgen-Check-Erinnerung zusammen, kommt eine Nachricht. Nach dem Morgen-Check gibt es den Knopf „Tagesüberblick lesen“. Tests: `node worker/test.mjs`, `node tools/browser/test_news.mjs`.

## Erinnerungen (Push)
- Im Check-in unter „Erinnerungen“ einschalten (iPhone: Board vom Home-Bildschirm öffnen, iOS 16.4+). Tagesziele mit Uhrzeit bekommen eine 🔔 (antippen zum Ein-/Ausschalten), dazu optional der Morgen-Check, falls noch offen.
- Nie in der Ruhezeit (Standard Mo–Fr 8:00–15:30, einstellbar); was hineinfällt, kommt direkt danach. Höchstens 4 am Tag.
- Technik: `push-client.js` meldet das Gerät und die Ziele von heute/morgen an den Worker (`/push/*`), `sw.js` zeigt die Nachricht. Der Worker erzeugt seine VAPID-Schlüssel selbst (KV `push:vapid`), verschlüsselt nach RFC 8291 und verschickt per Cron. **Cron auf `*/5 * * * *` stellen.** Tests: `node worker/test.mjs`, `node tools/browser/test_push.mjs`.

## Laden und Zwischenspeicher
- `whoop-cache.js`: Whoop-Daten liegen pro Nutzer in IndexedDB; nach dem ersten Laden holt jede Seite nur die letzten 7 Tage vom Worker, alle 12 Stunden im Hintergrund alles. Ohne Netz bleibt der gespeicherte Stand. Test: `node tools/browser/test_cache.mjs`.
- Der 3D-Hintergrund (three.js) lädt erst, wenn die Seite fertig ist.

## Graph-Vollbild
- `graph-full.js`: `layers` (Kurven ein-/ausschalten und vergleichen), `stack` (gestapelte Säulen mit Verteilung), `facts`/`note` (Kennzahlen und Erklärtext, auch für vergrößerte Kopien). Test: `node tools/browser/test_full.mjs`.

## App auf dem iPad
Safari → Teilen → **Zum Home-Bildschirm**. `manifest.webmanifest`, Symbole in `icons/` und `sw.js` (Service Worker: Netz zuerst, nur bei Ausfall die zuletzt geladene Seite; Firebase, Worker und Co. werden nie zwischengespeichert). Daten kommen weiterhin aus Firestore, brauchen also Netz. Nach Änderungen an Seiten steigt der Cache-Name in `sw.js` nur bei neuen Dateien in `SHELL`.

## Sicherung wiederherstellen
Im Hub unter „Sichern“: Datei auswählen, Vorschau prüfen, bestätigen. Gleiche Dokumente werden überschrieben, nichts wird gelöscht; Whoop-Rohdaten (liegen im Worker) sind nicht enthalten. Test: `python3 tools/browser/test_backup.py`.

## Dopamin-Konto
- Rechnung in `dop-account.js`, gemeinsam für „Heute“ und den Hub. Das Konto zählt lückenlos vom ersten Tag bis heute: Tage, an denen das Board nicht geöffnet war, bekommen ihre Whoop-, Puzzle- und Lernpunkte trotzdem und werden beim nächsten Öffnen von „Heute“ als Eintrag gespeichert.
- Beim Blättern zeigt „Konto“ den Stand bis einschließlich des gewählten Tags.
- Der Hub zeigt erst den gespeicherten Stand und rechnet ihn dann live nach (auch beim Zurückkehren aus „Heute“). Test: `node tools/browser/test_konto.mjs`.

## Check-in (Reiter „Check-in“, fürs iPhone gebaut)
- **Morgens, vor Whoop:** Stimmung, Energie, gefühlter Schlaf (je 1–5) und ein Gefühlswort. Erst nach dem Speichern lädt die Seite die Whoop-Recovery und zeigt beides nebeneinander („Dein Gefühl trifft die Whoop-Zone an X von Y Tagen“).
- **Über den Tag:** Stimmung und Gedanken jederzeit festhalten. **Eigene Tracker** (Kaffee, Wasser, Handyzeit, Zeit mit Freunden … oder frei angelegt) – Definition in `settings/main.trackers`.
- **Abends:** 3 gute Dinge (mit „weil …“), Stress 1–5, ein Satz zum Tag.
- **Ziele:** Tagesziele mit Uhrzeit (abends „Ziele für morgen“ oder direkt), Wochen- und Monatsziele; erscheinen im Morgen-Check und im Hub. Daten: `journal/{Tag}.g` und `goals/W{Montag}` / `goals/M{JJJJ-MM}`.
- Punkte im Dopamin-Konto (Regelwerk v2, Kategorie MEN, in `tools/build_v2.py`): Morgen-Check 400, Abend mit 3 guten Dingen 500, Notizen 3 × 100, Tracker 150, alle Tagesziele 300.
- Daten: Firestore `users/{uid}/journal/{Tag}` (in der Sicherung). Logik: `journal-core.js`.
- **Morgens automatisch öffnen:** iOS hat keinen Auslöser fürs Einschalten. Stattdessen Kurzbefehle-Automation „Whoop wird geöffnet“, die einmal pro Tag den Check-in öffnet – Anleitung unten auf der Check-in-Seite. `checkin.html?whoop=1` springt zurück zu Whoop (Kurzbefehl „Whoop öffnen“), wenn heute schon eingetragen ist.
- Hintergrund: Gefühle benennen (Affect Labeling, Lieberman 2007), „Three Good Things“ (Seligman 2005), Aktivität + Stimmung (Verhaltensaktivierung). Reines Stimmungs-Tracking bringt allein wenig – deshalb gibt das Board über die Muster etwas zurück.

## Muster (Reiter „Muster“)
- **Was dir guttut / was dich bremst:** vergleicht Tage mit und ohne einen Faktor (Heute-Knöpfe, Sport, eigene Tracker) mit Stimmung, Energie, Stress, Recovery, HRV, Ruhepuls und Schlaf – am selben Tag und am Folgetag. Ein Muster erscheint nur bei mindestens 5 Tagen je Seite, Effektstärke ≥ 0,5 und t ≥ 2,2.
- **Vergleichen:** zwei beliebige Werte als Kurven (30/90/365 Tage) mit Gleichlauf (r).
- **Rückblick:** Woche/Monat mit Durchschnitten zum vorigen Zeitraum, bester Tag, Serien, häufigste Gefühle, zufällige „gute Dinge“.
- Logik: `insights-core.js` (Tests: `node tools/test-insights.mjs`).

## Einstellungen (Zahnrad bzw. „Optionen“)
Performance-Modus (schwächt 3D, Unschärfe, Animationen ab – nur per Schalter), UI-Sounds, Geräteneigung, FPS-Anzeige.

## Tests
- `node worker/test.mjs`, `node tools/test-learn.mjs`, `node tools/test-insights.mjs`
- Browser (Node + Playwright): `node tools/browser/test_checkin.mjs`, `test_muster.mjs`, `test_konto.mjs`
- Browser (Playwright, Chromium): `tools/browser/test_hud.py`, `test_heute.py`, `test_learn.py`, Screenshots mit `shot_hud.py`.
- Notion ist nur mit Mocks getestet. Die KI-Routen im Worker (`/ask`, `/stt`, `/tts`) werden vom Board nicht mehr benutzt.

## Hinweis zu Versionsnummern
Die Seiten hängen `?v=N` an Skripte und Links, damit Safari nach Änderungen neu lädt. Bei Änderungen an einer Datei die Nummer erhöhen.

## Schlaf-Hebel (Recovery-Reiter)

Die Karte „😴 Schlaf-Hebel“ im Recovery-Reiter beantwortet eine Frage: Was beeinflusst Schlaf und Erholung am stärksten, und was ändere ich deshalb? Ergebnis ist genau **ein** Hebel mit Zahlen, oder „Die Daten geben das noch nicht her“.

- **Rechnet fest nach Regeln** in `sleep-lever.js` (keine KI, gleiche Daten = gleiches Ergebnis, Tests: `node tools/test-sleep.mjs`).
- **Sechs Verdächtige:** späte harte Einheit, unregelmäßige Bettzeit, kurze Nächte, Trainingssprung, Alkohol am Abend, späte große Mahlzeit. Verglichen wird der Median des Wirkungswerts (Standard HRV) mit/ohne Merkmal, je Gruppe mindestens 5 Nächte, Schwelle nach Gruppengröße, dazu die „strengste Probe“.
- **Daten:** Whoop (Schlaf, HRV, Ruhepuls, Workouts) plus Heute-Einträge: Alkohol, neu **„Letzte große Mahlzeit“** und **„Krank“** (Heute → Schlaf-Daten). Fehlende Angaben sind „unbekannt“, nie „nein“. Unter 14 Nächten wird nicht geprüft, stattdessen gibt es den Zwei-Wochen-Zettel.
- **Sicherheitsfrage** (Schnarchen, Atemaussetzer, massive Tagesmüdigkeit): wird nie angenommen. „Ja“ stellt eine ärztliche Abklärung vor jeden Hebel. Keine Diagnose, keine Empfehlung für Melatonin, Schlafmittel oder Supplemente.
- **Schlaf-Karte** wird in `users/{uid}/sleepcards/{Datum}` gespeichert (Verlauf), Einstellungen in `sleepcfg/main`. Beides ist in der Sicherung enthalten.

## Graph-Vollbild

Jeder Graph hat oben rechts ein Vergrößern-Symbol (48 px). Es öffnet ein Vollbild im Akzent des Reiters, der Graph wächst dabei aus seinem Platz im Panel; Schließen mit ✕ oder Wischen nach unten am oberen Griff (nie auf der Graphfläche). Das Vollbild liest nur und verändert keine Daten.

- **Zeitreihen** (Recovery: Recovery, HRV, Ruhepuls, Schlafdauer, Schlaf-Performance, Strain, Atemfrequenz, Blutsauerstoff, Hauttemperatur, Kalorien, Schritte; Training: Form, Trainingslast pro Tag, Stunden pro Woche): Tippen zeigt Datum mit Wochentag, Wert und Einheit; Wischen bewegt eine Markierung; Zeitraum 7 Tage / 30 Tage / 3 Monate / 1 Jahr / Alles (nur wo Daten existieren); Zwei-Finger-Zoom und Verschieben; Kalender mit nur wählbaren Tagen mit Daten; Knöpfe Heute, Bestwert, Tiefstwert, Zurücksetzen. Lücken bleiben Lücken (schraffiert, „keine Daten“).
- **Statistiken** (`graph-stats.js`, deterministisch, immer aus den Originaldaten, Tests: `node tools/test-graphstats.mjs`): Durchschnitt, Median, Bestwert/Tiefstwert (Richtung beachtet), Trend gegen den gleich langen Zeitraum davor, Datenpunkte gegen Tage, Summe, gute Tage und Serie, Wochentage.
- **Alle übrigen Diagramme** (Radar, Zonen, Gym, Puzzle …) erkennt `GraphFull.auto()` selbst und zeigt sie vergrößert, ohne Zeitachsen-Bedienung und ohne neue Statistik.
- **Neuer Graph = eine Zeile:** `GraphFull.attach('#id',{id:'x',title:'…',unit:'kg',dir:1,series:()=>[{date:'2026-10-01',value:70}]})`.
- Im Performance-Modus oder bei „Bewegung reduzieren“ gibt es nur ein kurzes Einblenden statt der Animation.

## Kalender (Reiter „Kalender“)
Eigener Kalender im Life Board (keine Verbindung zu Google/Apple). Ansichten: **Monat, Woche, Tag, Jahr**. Antippen eines Tages zeigt rechts (iPad) bzw. darunter (iPhone) den Tag: Termine, **Rückblick** (Heute-Rang, Recovery/HRV, Schlaf, Strain, Training, Puzzle, Lernen – nur was es wirklich gibt, nichts erfunden) und **Notiz/Tagebuch mit Stimmung**.
- **Termine:** Titel, Tag oder mehrere Tage, ganztägig oder mit Beginn/Ende, Kategorie, Notiz, Wiederholung (täglich, wöchentlich mit Wochentagen, monatlich, jährlich, alle n …, bis Datum), Erinnerung, „Zum Abhaken“ für Planung (Training, Lernen, Puzzle). Bei Serien lässt sich ein einzelner Tag löschen. Ein Tipp in die Zeitleiste (Woche/Tag) legt einen Termin zur angetippten Uhrzeit an.
- **Einfärbung** (Auswahl oben): Heute-Rang, Recovery, Strain, Training, Puzzle, Stimmung oder Termine. Tage ohne Daten bleiben leer, nie „0“.
- **Plan aus Heute:** Der „Fokus für morgen" aus dem Tagesabschluss erscheint am Folgetag im Kalender (Tagesfeld, 🎯 im Monat).
- **Daten:** Firestore `users/{uid}/calendar` (`ev_JAHR` mit den Terminen, `notes_JAHR` mit den Tagesnotizen); gehört zur Datensicherung. Whoop-Werte werden monatsweise geladen.
- **Erinnerungen:** erscheinen als Hinweis im Life Board (auf jeder Seite) und, wenn erlaubt, als Benachrichtigung – **nur solange die App geöffnet ist**. Eine Seite ohne Server kann keine Push-Nachrichten bei geschlossener App schicken. Dafür unter „⋯“ alle Termine als `.ics` laden und im Apple Kalender öffnen: Dort setzt das iPad die Alarme selbst.
- Rechenkern: `calendar-core.js` (Tests: `node tools/test-calendar.mjs`), Speicher/Erinnerungen: `calendar-store.js`, Browsertest: `tools/browser/test_calendar.py <Ordner> [ipad|phone|all]`.

## Designs (Zahnrad → „Design“)
- Zwei Designs: **Cockpit** (Standard) und **Dschungel**. Ein Design ändert **nur Farben, Hintergrund und Formen**; Seiten, Knöpfe, Graphen, Vollbild und Statistiken sind identisch.
- Wechsel mit weichem Überblenden (View Transitions, Safari/iOS ab 18; sonst kurzes Farbüberblenden; im Performance-Modus oder bei „Bewegung reduzieren“ sofort). Die Wahl steht in `lb_ui.theme` (localStorage + Firestore `settings/main.ui`) und wird vor dem ersten Zeichnen gesetzt (kleines Skript vor `theme.css`), damit nichts flackert.
- Technik: `theme.js` (`THEMES`: Name, Farbmuster, Akzent je Reiter), `theme.css` (Block `html[data-hud][data-theme="id"]` überschreibt nur Variablen und einige Restflächen), `bg3d.js` (Dschungel: Glühwürmchen statt Gitter, grüner Nebel).
- **Neues Design:** in `THEMES` eintragen, in `theme.css` einen Block für `data-theme="id"` ergänzen, fertig. Ein Knopf im Zahnrad entsteht automatisch.
- Test: `python3 tools/browser/test_theme.py <Ordner>` (Umschalten, Speichern, alle Seiten, Graph-Vollbild).
