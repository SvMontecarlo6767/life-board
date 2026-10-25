# Whoop-Zwischenserver (Cloudflare Worker)

Dieser Worker verbindet das Life Board mit Whoop. Er hält das Client-Secret und die Tokens geheim,
holt die Daten regelmäßig ab und liefert sie nur an den eingeloggten Besitzer aus.

## Einrichtung (alles im Browser, kostenlos)
1. Cloudflare-Konto anlegen: dash.cloudflare.com. Dann Workers & Pages → Create → Create Worker, Name `life-board-whoop`, Deploy.
2. Im Worker "Edit code": den kompletten Inhalt von `worker.js` einfügen, Deploy.
3. KV anlegen (Storage & Databases → KV → Create), Name z. B. `life-board-wb`.
   Im Worker unter Settings → Bindings → Add → KV namespace, Variablenname **`WB`**.
4. Settings → Variables and Secrets:
   - Secrets: `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `OWNER_EMAIL` (deine Google-Adresse, mit der du im Board angemeldet bist)
   - Text: `FIREBASE_PROJECT_ID` = `life-board-81b90`
   - Text: `ALLOWED_ORIGIN` = `https://svmontecarlo6767.github.io`
   - Text: `BOARD_URL` = `https://svmontecarlo6767.github.io/life-board/index.html`
5. Settings → Triggers → Cron: `*/5 * * * *` (Erinnerungen pünktlich; Whoop wird trotzdem nur alle 30 Minuten abgeholt)
6. Whoop Developer Dashboard: Redirect-URL `https://<dein-worker>.workers.dev/callback` eintragen.
   Scopes: read:recovery, read:sleep, read:cycles, read:workout, read:profile, read:body_measurement (und offline für den Login).

Das Client-Secret nur in Cloudflare eintragen, nie in Chats, Code oder GitHub.

## Test
`node test.mjs` testet die Logik lokal mit simulierten Whoop-Antworten (kein echter Whoop-Zugriff).
