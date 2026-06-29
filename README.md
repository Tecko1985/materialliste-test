# 🎒 Materialliste

Web-App zur Verwaltung des Vereinsmaterials (Trikots, Bälle, Leibchen, Sonstiges) pro Mannschaft. Läuft als statische PWA direkt im Browser, ohne Server-Backend.

Live: https://tecko1985.github.io/Materialliste/

## Funktionen

- **Materialliste**: Übersicht aller Material-Einträge, gruppiert nach Mannschaft. Suche nach Name, Filter nach Mannschaft/Kategorie, Sortierung nach Name oder Menge. Felder sind direkt in der Tabelle bearbeitbar.
- **Hinzufügen**: Neues Material erfassen — als Trikotsatz (mit Trikot-/Hosennummern, Stutzen), Bälle, Leibchen (mit Farbe) oder Sonstiges (freie Felder). Trikotsätze werden automatisch zu einzelnen Positionen (Trikot, Hose, Stutzen) aufgeteilt und als zusammengehöriger Satz dargestellt.
- **Text-Import**: Beliebigen Text (z.B. aus Notizen oder Whatsapp) einfügen und automatisch in Material-Einträge umwandeln lassen — erkennt Mengenangaben, Trikotnummern, Farben usw. Vorschau vor der Übernahme editierbar.
- **Mannschaften**: Mannschaften anlegen, umbenennen, löschen. Umbenennen aktualisiert automatisch alle zugehörigen Material-Einträge.
- **Excel-Import**: Material aus einer .xlsx/.xls/.csv-Datei importieren (Spalten: Name, Kategorie, Menge, Einheit, Standort, Zustand).
- **JSON-Export/-Import**: Manuelle Sicherungskopie der Daten als JSON-Datei herunterladen oder einspielen.
- **Automatisches Backup**: Backup-Ordner wählen, in den bei jedem App-Start automatisch eine datierte JSON-Sicherung geschrieben wird.
- **Reserve & Umbuchung**: Eigener Reserve-Materialbestand unabhängig von den Mannschaften, zum Ausgleich von Verlusten. Umbuchung von Material zwischen Reserve und einer Mannschaft in beide Richtungen, mit lückenlosem Umbuchungsprotokoll (Datum, Material, Menge, Richtung, Kommentar).
- **Inventur & Vergleich**: Stichtags-Inventur je Mannschaft oder Reserve – Soll-Bestand anzeigen, Ist-Menge erfassen, Abweichungen wahlweise pro Position übernehmen. Historie aller Stichtage sowie Vergleich zweier Stichtage derselben Mannschaft/Reserve mit Differenz-Darstellung.
- **Offline-fähig (PWA)**: Installierbar, Service Worker für Offline-Nutzung.

## Datenspeicherung

Die Daten liegen in einer einzigen JSON-Datei. Zwei Speicherorte sind möglich:

1. **Lokale Datei** (File System Access API) — Datei direkt im Nextcloud-synchronisierten Ordner öffnen/anlegen, Browser speichert automatisch beim Bearbeiten.
2. **Nextcloud per WebDAV** (auch am Handy/auf Geräten ohne File-System-API) — Verbindung über WebDAV-URL, Benutzername und App-Passwort. Falls der Nextcloud-Server keine CORS-Anfragen von dieser Seite erlaubt, wird ein Cloudflare-Worker als CORS-Proxy genutzt (siehe `cors-proxy-worker.js`).

## Tech-Stack

Statisches HTML/CSS/JavaScript ohne Build-Schritt, IndexedDB für lokale Einstellungen (`db.js`), Service Worker (`sw.js`), Excel-Parsing via [SheetJS/xlsx](https://github.com/SheetJS/sheetjs).

## Lokal starten

```
python -m http.server 8766 --directory Materialliste
```
