// =====================================================================
//  UlisSongbook – Einstellungen
//  Das ist die EINZIGE Datei, die du selbst anpassen musst.
//  Trage unten deine beiden Werte zwischen die Anführungszeichen ein.
// =====================================================================

const CONFIG = {

  // 1) Deine Google OAuth-Client-ID (aus der Google Cloud Console).
  //    Sieht ungefähr so aus: 1234567890-abcdef.apps.googleusercontent.com
  CLIENT_ID: "841626532501-ogd64m4q66hcuvlg82q94vlp6e98d3lh.apps.googleusercontent.com",

  // 2) Die ID des Google-Drive-Ordners mit deinen Liedtexten.
  //    Findest du in der Adresszeile, wenn du den Ordner in Drive öffnest:
  //    https://drive.google.com/drive/folders/DIESER_TEIL_IST_DIE_ID
  FOLDER_ID: "1T03kPxbEro1fpeNM4aaJGSmwBnIgPbpX",

  // 3) Berechtigung: nur Lesen aus deinem Drive. Bitte nicht ändern.
  SCOPES: "https://www.googleapis.com/auth/drive.readonly",

};
