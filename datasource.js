// =====================================================================
//  Datenabfrage (gekapselt)
//
//  Hier – und NUR hier – liegt der Zugriff auf die Liedtexte.
//  Aktuell: direkter Google-Drive-Zugriff.
//
//  >>> SPÄTER AUF n8n UMSTELLEN? <<<
//  Dann müssen nur die zwei Funktionen unten (fetchSongList und
//  fetchSongContent) umgeschrieben werden – z. B. ein fetch() auf einen
//  n8n-Webhook. Der Rest der App (app.js) bleibt unangetastet.
//
//  Jede der beiden Funktionen liefert:
//    fetchSongList()        -> [ { id: "...", title: "Songtitel" }, ... ]
//    fetchSongContent(id)   -> "der vollständige Liedtext als Text"
// =====================================================================

// Wird von app.js gesetzt, sobald der Login erfolgreich war.
let ACCESS_TOKEN = null;

function setAccessToken(token) {
  ACCESS_TOKEN = token;
}

// Eigener Fehler-Typ, damit app.js erkennt: "Token abgelaufen -> Re-Login".
class AuthExpiredError extends Error {}

// Kleiner Helfer für Drive-Anfragen mit dem Login-Token.
async function driveRequest(url) {
  const response = await fetch(url, {
    headers: { Authorization: "Bearer " + ACCESS_TOKEN },
  });

  // 401/403 = Token abgelaufen oder ungültig -> sauberer Re-Login.
  if (response.status === 401 || response.status === 403) {
    throw new AuthExpiredError("Sitzung abgelaufen");
  }
  if (!response.ok) {
    throw new Error("Google Drive antwortet mit Fehler " + response.status);
  }
  return response;
}

// --- Liste aller Songs im konfigurierten Ordner -----------------------
async function fetchSongList() {
  const query = encodeURIComponent(
    "'" + CONFIG.FOLDER_ID + "' in parents and trashed = false"
  );
  const url =
    "https://www.googleapis.com/drive/v3/files" +
    "?q=" + query +
    "&fields=files(id,name,createdTime)" +
    "&orderBy=name" +
    "&pageSize=1000";

  const response = await driveRequest(url);
  const data = await response.json();
  const files = data.files || [];

  return files
    // nur Markdown-Dateien
    .filter((file) => file.name.toLowerCase().endsWith(".md"))
    // Dateiname ohne ".md" = Songtitel
    .map((file) => ({
      id: file.id,
      title: file.name.replace(/\.md$/i, ""),
      createdTime: file.createdTime || "",
    }))
    // alphabetisch sortieren (deutsche Sortierung)
    .sort((a, b) => a.title.localeCompare(b.title, "de"));
}

// --- Inhalt eines einzelnen Songs -------------------------------------
async function fetchSongContent(id) {
  const url =
    "https://www.googleapis.com/drive/v3/files/" + id + "?alt=media";
  const response = await driveRequest(url);
  return await response.text();
}

// --- Playlisten aus dem Unterordner "Playlist" ------------------------
// Liefert: [ { title: "ZAK", text: "...Dateiinhalt..." }, ... ]
async function fetchPlaylists() {
  // 1) Unterordner namens "Playlist" suchen
  const folderQuery = encodeURIComponent(
    "'" + CONFIG.FOLDER_ID + "' in parents and name = 'Playlist' and " +
      "mimeType = 'application/vnd.google-apps.folder' and trashed = false"
  );
  const fRes = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?q=" + folderQuery + "&fields=files(id)"
  );
  const folders = (await fRes.json()).files || [];
  if (folders.length === 0) return []; // kein Unterordner -> keine Playlisten dort
  const playlistFolderId = folders[0].id;

  // 2) .md-Dateien im Unterordner auflisten
  const q = encodeURIComponent(
    "'" + playlistFolderId + "' in parents and trashed = false"
  );
  const res = await driveRequest(
    "https://www.googleapis.com/drive/v3/files?q=" + q +
      "&fields=files(id,name)&orderBy=name&pageSize=1000"
  );
  const files = ((await res.json()).files || []).filter((f) =>
    f.name.toLowerCase().endsWith(".md")
  );

  // 3) Inhalt jeder Playlist-Datei laden
  const result = [];
  for (const f of files) {
    const text = await fetchSongContent(f.id);
    result.push({ title: f.name.replace(/\.md$/i, ""), text });
  }
  return result;
}
