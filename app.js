// =====================================================================
//  UlisSongbook – Hauptlogik
//  Login, Liste mit Titel-/Tag-Suche, Favoriten/Zuletzt,
//  Detailansicht mit Schriftgröße und Bildschirm-wach-halten.
// =====================================================================

// Verweise auf die Bereiche der Seite (siehe index.html).
const loginView = document.getElementById("login-view");
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");

const loginButton = document.getElementById("login-button");
const backButton = document.getElementById("back-button");

const searchInput = document.getElementById("search-input");
const tagChips = document.getElementById("tag-chips");
const listContainer = document.getElementById("list-container");
const refreshButton = document.getElementById("refresh-button");
const pullHint = document.getElementById("pull-hint");

const songTitleEl = document.getElementById("song-title");
const songContentEl = document.getElementById("song-content");
const songMeta = document.getElementById("song-meta");
const statusEl = document.getElementById("status");
const viewSwitch = document.getElementById("view-switch");

const favToggle = document.getElementById("fav-toggle");
const fontSmaller = document.getElementById("font-smaller");
const fontBigger = document.getElementById("font-bigger");
const nextButton = document.getElementById("next-button");

let tokenClient = null;
let allSongs = [];        // alle geladenen Lieder [{id, title}]
let currentSong = null;   // gerade geöffnetes Lied
let wakeLock = null;      // Bildschirm-wach-halten
let songTags = {};        // { Titel: [tag, tag, ...] }
let contentCache = {};    // { id: Liedtext } – spart erneutes Laden
let currentParsed = { original: "", translation: "" };
let viewMode = "original"; // "original" | "translation" | "both"
let playlists = [];          // [{ title, songTitles: [...] }]
let activePlaylist = null;   // gerade geöffnete Playlist (in der Liste)
let playlistContext = null;  // { playlist, index } – für "Weiter →"

// --- Dauerhaft gespeicherte Einstellungen (im Browser) ---------------
function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let favorites = loadJSON("songbook_favorites", []);
let recent = loadJSON("songbook_recent", []);
let fontSize = Number(localStorage.getItem("songbook_fontsize")) || 19;

// --- Ansicht umschalten ----------------------------------------------
function showOnly(view) {
  loginView.hidden = view !== loginView;
  listView.hidden = view !== listView;
  detailView.hidden = view !== detailView;
}

function setStatus(text) {
  statusEl.textContent = text || "";
}

// --- Login einrichten -------------------------------------------------
function initLogin() {
  if (
    !CONFIG.CLIENT_ID ||
    CONFIG.CLIENT_ID.startsWith("HIER_") ||
    !CONFIG.FOLDER_ID ||
    CONFIG.FOLDER_ID.startsWith("HIER_")
  ) {
    setStatus(
      "Bitte zuerst CLIENT_ID und FOLDER_ID in der Datei config.js eintragen."
    );
    loginButton.disabled = true;
    return;
  }

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES,
    callback: (response) => {
      if (response && response.access_token) {
        setAccessToken(response.access_token);
        loadAndShowList();
      } else {
        setStatus("Anmeldung nicht abgeschlossen. Bitte erneut versuchen.");
      }
    },
    error_callback: () => {
      // Automatische (stille) Anmeldung nicht möglich -> Knopf zeigen.
      setStatus("");
      showOnly(loginView);
    },
  });

  // Beim Öffnen automatisch versuchen, ohne Knopf-Klick anzumelden.
  trySilentLogin();
}

// Versucht eine Anmeldung im Hintergrund (kein Fenster, kein Klick).
// Klappt nur, wenn du bei Google angemeldet bist und schon zugestimmt hast.
function trySilentLogin() {
  setStatus("Anmeldung wird versucht …");
  try {
    tokenClient.requestAccessToken({ prompt: "none" });
  } catch {
    setStatus("");
    showOnly(loginView);
  }
}

function startLogin() {
  setStatus("");
  if (!tokenClient) {
    initLogin();
    if (!tokenClient) return;
  }
  tokenClient.requestAccessToken();
}

// --- Songliste laden -------------------------------------------------
async function loadAndShowList() {
  showOnly(listView);
  listContainer.innerHTML = "";
  setStatus("Lade Lieder …");

  try {
    allSongs = await fetchSongList();
    setStatus("");

    if (allSongs.length === 0) {
      setStatus("Keine Lieder im Ordner gefunden.");
      return;
    }
    renderList(searchInput.value);
    preloadTags(); // Tags im Hintergrund einlesen (für die Tag-Suche)
  } catch (error) {
    handleError(error);
  }
}

// --- Liste neu laden (ohne erneutes Anmelden) ------------------------
async function refreshList() {
  setStatus("Liste wird aktualisiert …");
  // Zwischenspeicher leeren, damit auch geänderte Texte/Tags frisch kommen.
  songTags = {};
  contentCache = {};
  try {
    allSongs = await fetchSongList();
    renderList(searchInput.value);
    setStatus("");
    preloadTags();
  } catch (error) {
    handleError(error);
  }
}

// --- Inhalte im Hintergrund einlesen (Tags + Playlisten) -------------
async function preloadTags() {
  playlists = [];
  const playlistTitles = new Set();

  for (const song of allSongs) {
    try {
      const text = await fetchSongContent(song.id);
      contentCache[song.id] = text;
      const meta = parseFrontmatter(text);
      if (meta.typ === "playlist") {
        playlists.push({ title: song.title, songTitles: parsePlaylistBody(text) });
        playlistTitles.add(song.title);
      } else {
        songTags[song.title] = parseTags(text);
      }
    } catch {
      // Einzelne fehlerhafte Datei überspringen.
    }
  }

  // Playlist-Dateien sind keine Lieder -> aus der Songliste nehmen.
  if (playlistTitles.size > 0) {
    allSongs = allSongs.filter((s) => !playlistTitles.has(s.title));
  }
  playlists.sort((a, b) => a.title.localeCompare(b.title, "de"));

  renderTagChips();
  if (!listView.hidden) renderList(searchInput.value);
}

// Liest aus einer Playlist-Notiz die Songtitel in Reihenfolge.
function parsePlaylistBody(text) {
  let norm = text.replace(/\r\n/g, "\n");
  norm = norm.replace(/^---\n[\s\S]*?\n---\n?/, ""); // Frontmatter weg
  const titles = [];
  for (const raw of norm.split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue; // leere Zeilen / Überschriften
    line = line.replace(/^[-*]\s*/, ""); // Listenpunkt "- "
    line = line.replace(/^\[\[|\]\]$/g, ""); // Wikilink [[ ]]
    line = line.replace(/\.md$/i, "").trim();
    if (line) titles.push(line);
  }
  return titles;
}

// Playlist-Titel auf vorhandene Lieder abbilden (Reihenfolge bleibt).
function resolvePlaylistSongs(pl) {
  return pl.songTitles.map((t) => ({
    title: t,
    song: allSongs.find((s) => s.title.toLowerCase() === t.toLowerCase()) || null,
  }));
}

// Tags aus Frontmatter (tags:) UND aus #tags im Text herausziehen.
function parseTags(text) {
  const tags = new Set();
  const norm = text.replace(/\r\n/g, "\n");

  // Frontmatter-Block oben (zwischen --- und ---)
  const fm = norm.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const block = fm[1];

    // a) tags: [weihnachten, ballade]  oder  tags: weihnachten, ballade
    //    (nur wenn auf derselben Zeile etwas steht – nicht über Zeilenumbruch)
    const inline = block.match(/^tags:[ \t]+(\S.*)$/m);
    if (inline) {
      inline[1]
        .replace(/[\[\]"']/g, "")
        .split(",")
        .forEach((t) => {
          const v = t.trim().replace(/^#/, "");
          if (v) tags.add(v.toLowerCase());
        });
    }

    // b) tags:
    //      - weihnachten
    //      - ballade
    const listMatch = block.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
    if (listMatch) {
      listMatch[1].split("\n").forEach((line) => {
        const m = line.match(/-\s*(.+)/);
        if (m) {
          const v = m[1].trim().replace(/^#/, "");
          if (v) tags.add(v.toLowerCase());
        }
      });
    }
  }

  // #tags direkt im Text (z. B. #weihnachten). Überschriften "# Text"
  // werden nicht erfasst, weil dort ein Leerzeichen auf # folgt.
  for (const m of norm.matchAll(/(?:^|\s)#([A-Za-z0-9äöüÄÖÜß/_-]+)/g)) {
    const v = m[1].toLowerCase();
    if (v && !/^\d+$/.test(v)) tags.add(v);
  }

  return [...tags];
}

// Tags, die auf praktisch jedem Lied stehen und nichts filtern.
const NOISE_TAGS = ["musik", "lied", "songtext", "song"];

// Interpreten-Namen aus den Dateinamen ("Interpret - Titel") als Tag-Form.
function artistSlugSet() {
  const set = new Set();
  for (const song of allSongs) {
    const idx = song.title.indexOf(" - ");
    if (idx > 0) {
      const artist = song.title.slice(0, idx);
      set.add(artist.toLowerCase().trim().replace(/\s+/g, "-").replace(/[.,]/g, ""));
    }
  }
  return set;
}

// --- Kategorie-Filter (aufgeräumte Tag-Chips) ------------------------
function renderTagChips() {
  const artists = artistSlugSet();
  const all = new Set();
  Object.values(songTags).forEach((list) =>
    list.forEach((t) => {
      if (NOISE_TAGS.includes(t)) return; // Allerwelts-Tags weglassen
      if (artists.has(t)) return; // Interpreten-Namen weglassen
      all.add(t);
    })
  );

  tagChips.innerHTML = "";
  if (all.size === 0) {
    tagChips.hidden = true;
    return;
  }
  tagChips.hidden = false;

  [...all].sort().forEach((tag) => {
    const chip = document.createElement("button");
    chip.className = "tag-chip";
    chip.textContent = "#" + tag;
    chip.addEventListener("click", () => {
      // Bereits aktiver Chip -> Filter aufheben.
      if (searchInput.value.trim().toLowerCase() === tag) {
        searchInput.value = "";
      } else {
        searchInput.value = tag;
      }
      renderList(searchInput.value);
    });
    tagChips.appendChild(chip);
  });
}

// --- Liste anzeigen (Titel- und Tag-Suche, Favoriten, Zuletzt) -------
function renderList(filterText) {
  // Ist eine Playlist geöffnet, zeigen wir nur deren Lieder.
  if (activePlaylist) {
    renderPlaylistView();
    return;
  }

  const query = (filterText || "").trim().toLowerCase();
  listContainer.innerHTML = "";

  // Chips optisch markieren, welcher gerade aktiv ist.
  [...tagChips.children].forEach((chip) => {
    chip.classList.toggle("active", chip.textContent === "#" + query);
  });

  const matches = allSongs.filter((s) => {
    if (s.title.toLowerCase().includes(query)) return true;
    const tags = songTags[s.title] || [];
    return tags.some((t) => t.includes(query));
  });

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Kein Lied gefunden.";
    listContainer.appendChild(empty);
    return;
  }

  // Beim Suchen: nur die Treffer.
  if (query !== "") {
    appendSection(null, matches);
    return;
  }

  // Ohne Suche: Playlisten, Favoriten, Zuletzt hinzugefügt, Zuletzt geöffnet, alle.
  if (playlists.length > 0) {
    appendPlaylistSection();
  }

  const favSongs = matches.filter((s) => favorites.includes(s.title));
  if (favSongs.length > 0) {
    appendSection("⭐ Favoriten", favSongs);
  }

  const recentlyAdded = matches
    .filter((s) => s.createdTime)
    .sort((a, b) => (a.createdTime < b.createdTime ? 1 : -1))
    .slice(0, 5);
  if (recentlyAdded.length > 0) {
    appendSection("🆕 Zuletzt hinzugefügt", recentlyAdded);
  }

  const recentSongs = recent
    .map((title) => matches.find((s) => s.title === title))
    .filter(Boolean)
    .slice(0, 5);
  if (recentSongs.length > 0) {
    appendSection("🕘 Zuletzt geöffnet", recentSongs);
  }

  appendSection(
    favSongs.length || recentlyAdded.length || recentSongs.length
      ? "Alle Lieder"
      : null,
    matches
  );
}

function appendSection(title, songs) {
  if (title) {
    const heading = document.createElement("h3");
    heading.className = "section-heading";
    heading.textContent = title;
    listContainer.appendChild(heading);
  }

  const ul = document.createElement("ul");
  ul.className = "song-list";

  for (const song of songs) {
    const li = document.createElement("li");
    li.className = "song-row";

    const titleBtn = document.createElement("button");
    titleBtn.className = "song-item";
    titleBtn.textContent = song.title;
    titleBtn.addEventListener("click", () => openSong(song));

    const star = document.createElement("button");
    star.className = "star-button";
    star.textContent = favorites.includes(song.title) ? "★" : "☆";
    star.title = "Als Favorit merken";
    star.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(song.title);
    });

    li.appendChild(titleBtn);
    li.appendChild(star);
    ul.appendChild(li);
  }
  listContainer.appendChild(ul);
}

// --- Playlisten ------------------------------------------------------
function appendPlaylistSection() {
  const heading = document.createElement("h3");
  heading.className = "section-heading";
  heading.textContent = "▶️ Playlisten";
  listContainer.appendChild(heading);

  const ul = document.createElement("ul");
  ul.className = "song-list";
  for (const pl of playlists) {
    const li = document.createElement("li");
    li.className = "song-row";
    const btn = document.createElement("button");
    btn.className = "song-item playlist-item";
    btn.textContent = "▶️ " + pl.title;
    btn.addEventListener("click", () => openPlaylist(pl));
    li.appendChild(btn);
    ul.appendChild(li);
  }
  listContainer.appendChild(ul);
}

function openPlaylist(pl) {
  activePlaylist = pl;
  searchInput.hidden = true;
  refreshButton.hidden = true;
  tagChips.hidden = true;
  window.scrollTo(0, 0);
  renderPlaylistView();
}

function leavePlaylist() {
  activePlaylist = null;
  searchInput.hidden = false;
  refreshButton.hidden = false;
  renderTagChips();
  renderList(searchInput.value);
}

function renderPlaylistView() {
  listContainer.innerHTML = "";

  const back = document.createElement("button");
  back.className = "back-button";
  back.textContent = "← Alle Lieder";
  back.addEventListener("click", leavePlaylist);
  listContainer.appendChild(back);

  const heading = document.createElement("h3");
  heading.className = "section-heading";
  heading.textContent = "▶️ " + activePlaylist.title;
  listContainer.appendChild(heading);

  const resolved = resolvePlaylistSongs(activePlaylist);
  const ul = document.createElement("ul");
  ul.className = "song-list";

  resolved.forEach((entry, idx) => {
    const li = document.createElement("li");
    li.className = "song-row";
    const btn = document.createElement("button");
    btn.className = "song-item";

    if (entry.song) {
      btn.textContent = idx + 1 + ". " + entry.song.title;
      btn.addEventListener("click", () =>
        openSong(entry.song, { playlist: activePlaylist, index: idx })
      );
    } else {
      btn.textContent = idx + 1 + ". " + entry.title + " (nicht gefunden)";
      btn.disabled = true;
      btn.classList.add("missing");
    }
    li.appendChild(btn);
    ul.appendChild(li);
  });
  listContainer.appendChild(ul);
}

// --- Favoriten -------------------------------------------------------
function toggleFavorite(title) {
  if (favorites.includes(title)) {
    favorites = favorites.filter((t) => t !== title);
  } else {
    favorites.push(title);
  }
  saveJSON("songbook_favorites", favorites);

  if (!listView.hidden) renderList(searchInput.value);
  if (currentSong && currentSong.title === title) updateFavToggle();
}

function updateFavToggle() {
  const isFav = currentSong && favorites.includes(currentSong.title);
  favToggle.textContent = isFav ? "★" : "☆";
  favToggle.classList.toggle("active", !!isFav);
}

// --- Zuletzt geöffnet merken -----------------------------------------
function rememberRecent(title) {
  recent = [title, ...recent.filter((t) => t !== title)].slice(0, 10);
  saveJSON("songbook_recent", recent);
}

// --- Einzelnen Song öffnen -------------------------------------------
async function openSong(song, context) {
  currentSong = song;
  playlistContext = context || null;
  showOnly(detailView);
  songTitleEl.textContent = song.title;
  songContentEl.innerHTML = "";
  applyFontSize();
  updateFavToggle();
  setStatus("Lade Text …");
  window.scrollTo(0, 0);

  try {
    // Falls schon beim Tag-Einlesen geladen: aus dem Zwischenspeicher.
    const text =
      contentCache[song.id] || (await fetchSongContent(song.id));
    contentCache[song.id] = text;
    setStatus("");

    currentParsed = parseSong(text);
    renderMeta(text); // Infos aus dem Datei-Kopf (summary, tags, Quelle)
    // Umschalter nur zeigen, wenn es eine Übersetzung gibt.
    const hasTranslation = currentParsed.translation !== "";
    viewSwitch.hidden = !hasTranslation;
    viewMode = "original";
    updateSwitchButtons();
    renderSong();
    setupNextButton();

    rememberRecent(song.title);
    requestWakeLock();
  } catch (error) {
    handleError(error);
  }
}

// "Weiter →"-Knopf, wenn das Lied aus einer Playlist geöffnet wurde.
function setupNextButton() {
  if (playlistContext) {
    const resolved = resolvePlaylistSongs(playlistContext.playlist);
    let nextIdx = playlistContext.index + 1;
    while (nextIdx < resolved.length && !resolved[nextIdx].song) nextIdx++;
    if (nextIdx < resolved.length) {
      nextButton.hidden = false;
      nextButton.onclick = () =>
        openSong(resolved[nextIdx].song, {
          playlist: playlistContext.playlist,
          index: nextIdx,
        });
      return;
    }
  }
  nextButton.hidden = true;
}

// --- Lied in Original + Übersetzung aufteilen ------------------------
// Trenner ist eine Zeile, die (ohne #, -, *) nur "Übersetzung" lautet.
function parseSong(text) {
  let norm = text.replace(/\r\n/g, "\n");
  // Frontmatter oben (zwischen --- und ---) für die Anzeige entfernen.
  norm = norm.replace(/^---\n[\s\S]*?\n---\n?/, "");

  const lines = norm.split("\n");
  let splitAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].replace(/[#\-*\s]/g, "").toLowerCase();
    if (bare === "übersetzung" || bare === "uebersetzung" || bare === "translation") {
      splitAt = i;
      break;
    }
  }

  if (splitAt === -1) {
    return { original: norm.trim(), translation: "" };
  }
  return {
    original: lines.slice(0, splitAt).join("\n").trim(),
    translation: lines.slice(splitAt + 1).join("\n").trim(),
  };
}

// --- Infos aus dem Datei-Kopf (Frontmatter) auslesen -----------------
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  const fm = norm.match(/^---\n([\s\S]*?)\n---/);
  const meta = { summary: "", source: "", typ: "" };
  if (!fm) return meta;
  const block = fm[1];

  const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");

  const s = block.match(/^summary:\s*(.+)$/m);
  if (s) meta.summary = unquote(s[1]);

  const t = block.match(/^typ:[ \t]+(\S.*)$/m);
  if (t) meta.typ = unquote(t[1]).toLowerCase();

  // Quelle: Feld "source" oder "quelle"
  const src = block.match(/^(?:source|quelle):\s*(.+)$/m);
  if (src) meta.source = unquote(src[1]);

  return meta;
}

// --- Datei-Kopf anzeigen (Zusammenfassung, Tags, Quelle) -------------
function renderMeta(text) {
  const meta = parseFrontmatter(text);
  const tags = parseTags(text);
  songMeta.innerHTML = "";

  if (meta.summary) {
    const p = document.createElement("div");
    p.className = "meta-summary";
    p.textContent = meta.summary;
    songMeta.appendChild(p);
  }

  if (tags.length) {
    const t = document.createElement("div");
    t.className = "meta-tags";
    t.textContent = tags.map((x) => "#" + x).join("  ");
    songMeta.appendChild(t);
  }

  if (meta.source && /^https?:\/\//.test(meta.source)) {
    const a = document.createElement("a");
    a.className = "meta-source";
    a.href = meta.source;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "Quelle öffnen";
    songMeta.appendChild(a);
  }

  songMeta.hidden = songMeta.children.length === 0;
}

// --- Anzeige je nach gewähltem Modus ---------------------------------
function renderSong() {
  songContentEl.innerHTML = "";
  const { original, translation } = currentParsed;

  if (viewMode === "translation" && translation) {
    renderMarkdownInto(translation);
  } else {
    renderMarkdownInto(original);
  }
}

function updateSwitchButtons() {
  [...viewSwitch.children].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === viewMode);
  });
}

// --- Dezentes Markdown -> Anzeige (hängt Zeilen an songContentEl an) -
function renderMarkdownInto(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = document.createElement("div");
      heading.className = "md-heading md-h" + level;
      heading.textContent = headingMatch[2];
      songContentEl.appendChild(heading);
    } else if (line.trim() === "") {
      const spacer = document.createElement("div");
      spacer.className = "md-blank";
      songContentEl.appendChild(spacer);
    } else {
      const p = document.createElement("div");
      p.className = "md-line";
      p.textContent = line;
      songContentEl.appendChild(p);
    }
  }
}

// --- Schriftgröße ----------------------------------------------------
function applyFontSize() {
  songContentEl.style.fontSize = fontSize + "px";
}
function changeFontSize(delta) {
  fontSize = Math.min(34, Math.max(13, fontSize + delta));
  localStorage.setItem("songbook_fontsize", String(fontSize));
  applyFontSize();
}

// --- Bildschirm wach halten ------------------------------------------
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {
    // Nur Komfort – kein Drama, wenn es nicht klappt.
  }
}
function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !detailView.hidden) {
    requestWakeLock();
  }
});

// --- Fehler behandeln (inkl. abgelaufener Sitzung) -------------------
function handleError(error) {
  if (error instanceof AuthExpiredError) {
    showOnly(loginView);
    setStatus("Sitzung abgelaufen – bitte neu anmelden.");
  } else {
    setStatus("Es ist ein Fehler aufgetreten: " + error.message);
  }
}

// --- Knöpfe verbinden -------------------------------------------------
loginButton.addEventListener("click", startLogin);
backButton.addEventListener("click", () => {
  releaseWakeLock();
  setStatus("");
  showOnly(listView);
  renderList(searchInput.value);
});

searchInput.addEventListener("input", () => renderList(searchInput.value));
favToggle.addEventListener("click", () => {
  if (currentSong) toggleFavorite(currentSong.title);
});
fontSmaller.addEventListener("click", () => changeFontSize(-2));
fontBigger.addEventListener("click", () => changeFontSize(2));

refreshButton.addEventListener("click", refreshList);

// --- "Runterziehen zum Aktualisieren" (Pull to refresh) --------------
let pullStartY = 0;
let pullActive = false;
let pullReady = false;
const PULL_THRESHOLD = 90; // so weit ziehen, dann loslassen

document.addEventListener(
  "touchstart",
  (e) => {
    if (listView.hidden || window.scrollY > 0) return;
    pullStartY = e.touches[0].clientY;
    pullActive = true;
    pullReady = false;
  },
  { passive: true }
);

document.addEventListener(
  "touchmove",
  (e) => {
    if (!pullActive || listView.hidden) return;
    const delta = e.touches[0].clientY - pullStartY;
    if (delta > 15 && window.scrollY <= 0) {
      pullReady = delta > PULL_THRESHOLD;
      pullHint.hidden = false;
      pullHint.textContent = pullReady
        ? "Loslassen zum Aktualisieren …"
        : "Zum Aktualisieren weiter ziehen …";
    } else {
      pullHint.hidden = true;
    }
  },
  { passive: true }
);

document.addEventListener(
  "touchend",
  () => {
    if (!pullActive) return;
    pullActive = false;
    pullHint.hidden = true;
    if (pullReady) {
      pullReady = false;
      refreshList();
    }
  },
  { passive: true }
);

[...viewSwitch.children].forEach((btn) => {
  btn.addEventListener("click", () => {
    viewMode = btn.dataset.mode;
    updateSwitchButtons();
    renderSong();
    window.scrollTo(0, 0);
  });
});

// Login vorbereiten, sobald die Google-Bibliothek geladen ist.
window.addEventListener("load", initLogin);
