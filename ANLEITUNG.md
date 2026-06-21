# UlisSongbook – Anleitung

Eine einfache Webseite, die deine Liedtexte aus einem Google-Drive-Ordner anzeigt.

---

## Schritt 1: Zwei Werte eintragen (Datei `config.js`)

Öffne die Datei **`config.js`** und trage zwei Dinge ein:

### a) `CLIENT_ID` – dein Google-Login-Schlüssel

1. Gehe auf **console.cloud.google.com** und melde dich an.
2. Oben links dein **Projekt** auswählen (dasselbe, in dem dein n8n liegt).
3. Links: **„APIs und Dienste" → „Anmeldedaten"**.
4. Oben **„+ Anmeldedaten erstellen" → „OAuth-Client-ID"**.
5. Typ: **„Webanwendung"**, Name z. B. **„UlisSongbook"**.
6. Bei **„Autorisierte JavaScript-Quellen"** eintragen:
   - `http://localhost:8000`  (fürs Testen am Mac)
   - später zusätzlich deine GitHub-Adresse, z. B. `https://deinname.github.io`
7. **Erstellen** → die angezeigte **Client-ID** kopieren und in `config.js` einsetzen.
   (Das „Client-Secret" brauchst du **nicht**.)

> Steht dein Zustimmungsbildschirm auf „Testing"? Dann dich selbst noch als
> **Testnutzer** eintragen (unter „OAuth-Zustimmungsbildschirm").

### b) `FOLDER_ID` – dein Liedtext-Ordner

1. Öffne in Google Drive den Ordner mit deinen `.md`-Liedtexten.
2. Schau in die Adresszeile des Browsers:
   `https://drive.google.com/drive/folders/`**`DIESER_TEIL`**
3. Diesen Teil als `FOLDER_ID` in `config.js` einsetzen.

---

## Schritt 2: Lokal am Mac testen

Öffne das Terminal (oder lass es Claude für dich starten) und gib ein:

```
cd "/Users/ulrikegunther/Documents/Claude/ClaudeCode/UlisSongbook"
python3 -m http.server 8000
```

Dann im Browser öffnen: **http://localhost:8000**

- „Mit Google anmelden" klicken → Google-Fenster → zustimmen
- Die Liste deiner Lieder erscheint (alphabetisch)
- Auf ein Lied tippen → der Text erscheint, „← Zurück zur Liste" führt zurück

Zum Beenden des Servers im Terminal: **Strg + C**.

> Wichtig: Die Seite **nicht** per Doppelklick öffnen (das wäre `file://`),
> der Google-Login braucht die `http://localhost:8000`-Adresse.

---

## Schritt 3: Später online stellen (GitHub Pages)

Wenn alles lokal läuft: die Dateien in dein GitHub-Repo legen. Danach in
`config.js` noch deine GitHub-Adresse als Quelle ergänzen (siehe Schritt 1, Punkt 6)
und in der Google Cloud Console ebenfalls bei „Autorisierte JavaScript-Quellen"
hinzufügen. Dann ist die Seite auf dem iPhone in Safari nutzbar – inkl.
„Zum Home-Bildschirm hinzufügen".

---

## Gut zu wissen

- Der Login gilt **etwa 1 Stunde**. Danach erscheint „Sitzung abgelaufen – bitte
  neu anmelden". Einfach auf den Knopf tippen.
- Texte werden **nur gelesen**, nie verändert. Bearbeiten machst du weiter in Obsidian.
- Willst du später statt Google Drive einen **n8n-Webhook** nutzen? Dann müssen nur
  die zwei Funktionen in **`datasource.js`** angepasst werden – sonst nichts.
