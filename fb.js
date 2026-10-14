// Gemeinsame Firebase-Anbindung für alle Seiten des Life Boards.
// Der apiKey ist bei Firebase kein Geheimnis (er identifiziert nur das Projekt);
// geschützt werden die Daten durch die Firestore-Regeln.
const firebaseConfig = {
  apiKey: "AIzaSyCWy9IQQ8gVn7qa__u4eAPJnbM0JuaHD1E",
  authDomain: "life-board-81b90.firebaseapp.com",
  projectId: "life-board-81b90",
  storageBucket: "life-board-81b90.firebasestorage.app",
  messagingSenderId: "733849458240",
  appId: "1:733849458240:web:a097a25b68ec1cdc3b71a5",
  databaseURL: "https://life-board-81b90-default-rtdb.europe-west1.firebasedatabase.app"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const fs = firebase.firestore();
// Eingeloggten Nutzer holen; ohne Login geht es zurück zur Startseite.
function requireUser() {
  return new Promise(resolve => {
    const off = auth.onAuthStateChanged(u => {
      off();
      if (!u) location.replace('index.html');
      else resolve(u);
    });
  });
}
