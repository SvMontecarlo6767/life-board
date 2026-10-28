# Life-Board-MCP-Server (Cloudflare Worker, nur lesend)

Gibt Claude Lesezugriff auf dein Board. Er kann nichts ändern oder löschen.

| Tool | Inhalt |
|---|---|
| `get_today` | Whoop (Recovery, Schlaf, Strain, Workouts), Check-in, Lernstand heute |
| `get_week` | Verlauf der letzten 7 Tage (bis 30) mit Durchschnitten |
| `get_learning` | Fragen pro Stufe, neu, fällig, überfällig, pro Thema |
| `get_range` | Kompakte Tagestabelle für bis zu 400 Tage: Whoop, Check-in und Gym in einer Zeile pro Tag |
| `get_gym` | Krafteinheiten mit Sätzen, Bestwerte pro Übung |
| `get_correlations` | Rechnet Zusammenhänge im Worker (z. B. Alkohol gestern → Recovery heute) und liefert nur das Ergebnis |

Für Jahresfragen ruft Claude `get_correlations` oder `get_range` auf. Die Tabelle ist knapp gehalten (eine Zeile pro Tag),
damit ein ganzes Jahr in eine Antwort passt.

Der Server hat keine eigene Whoop-Verbindung. Er liest die Whoop-Daten aus dem KV-Speicher, den dein
bestehender Whoop-Worker füllt, und alles andere aus Firestore.

## Einrichtung (alles im Browser, kostenlos)

### 1. Nur-Lese-Schlüssel für Firestore
1. console.cloud.google.com öffnen, oben das Projekt **life-board-81b90** wählen.
2. IAM & Verwaltung → Dienstkonten → **Dienstkonto erstellen**, Name `life-board-mcp`.
3. Rolle: **Cloud Datastore-Betrachter** (englisch: *Cloud Datastore Viewer*). Keine andere Rolle.
4. Das neue Dienstkonto öffnen → Schlüssel → Schlüssel hinzufügen → JSON. Die Datei wird heruntergeladen.
   Sie ist wie ein Passwort: nirgends hochladen außer in Cloudflare (Schritt 3), nicht in Chats oder GitHub.

### 2. Deine Nutzer-ID
Firebase-Konsole → Authentication → Nutzer → deine Zeile → Spalte **Nutzer-UID** kopieren.

### 3. Worker in Cloudflare
1. Workers & Pages → Create → Create Worker, Name `life-board-mcp`, Deploy.
2. Edit code → kompletten Inhalt von `worker.js` einfügen → Deploy.
3. Settings → Bindings → Add → KV namespace → **denselben** Speicher wie beim Whoop-Worker wählen, Variablenname **`WB`**.
4. Settings → Variables and Secrets:
   - Secret `SA_JSON`: kompletter Inhalt der JSON-Datei aus Schritt 1
   - Secret `MCP_TOKEN`: ein langes Zufallspasswort (mindestens 24 Zeichen), z. B. erzeugt mit `openssl rand -hex 32`
   - Text `OWNER_UID`: die Nutzer-ID aus Schritt 2
   - Text `FIREBASE_PROJECT_ID`: `life-board-81b90`

### 4. Mit Claude verbinden
- **Claude Code** (Rechner):
  `claude mcp add --transport http life-board https://life-board-mcp.<dein-name>.workers.dev/mcp --header "Authorization: Bearer <MCP_TOKEN>"`
- **Claude im Browser/App** (Einstellungen → Connectors → Eigenen Connector hinzufügen):
  URL `https://life-board-mcp.<dein-name>.workers.dev/mcp/<MCP_TOKEN>`. Hier steckt das Passwort in der Adresse,
  also die Adresse niemandem zeigen. Ob eigene Connectors möglich sind, hängt vom Tarif ab.

Dann fragen: „Wie war meine Woche?" oder „Was ist beim Lernen überfällig?"

## Update einspielen
Neuen `worker.js` im Cloudflare-Worker einfügen und **Deploy** drücken. Secrets, Variablen und KV bleiben erhalten.
Danach in Claude den Connector kurz aus- und wieder einschalten (oder einen neuen Chat starten), damit die neuen Tools erscheinen.

Falls bei großen Abfragen "Worker exceeded CPU time limit" erscheint: Im kostenlosen Tarif sind pro Aufruf nur wenige
Millisekunden Rechenzeit erlaubt. Dann kleinere Zeiträume abfragen oder auf den Workers-Paid-Tarif (ca. 5 $/Monat) wechseln.

## Sicherheit
- Ohne richtiges `MCP_TOKEN` antwortet der Server mit 401. Ist das Token kürzer als 24 Zeichen, sperrt er alles.
- Das Dienstkonto darf nur lesen. Auch bei einem Leck kann niemand Daten ändern.
- Passwort verloren oder Adresse weitergegeben? In Cloudflare einfach ein neues `MCP_TOKEN` setzen.

## Test
`node test.mjs` prüft Zugriffsschutz, Protokoll und alle Tools lokal mit simulierten Daten.
