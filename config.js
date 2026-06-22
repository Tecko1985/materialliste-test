const APP_VERSION = "1.2";

const APP_CHANGELOG = [
  {
    version: "1.2",
    groups: [
      {
        title: "Bedienung",
        items: [
          "Text-Import in \"Hinzufügen\" ist jetzt aufklappbar (eingeklappt standardmäßig).",
          "Mannschaften-Tab in der Navigation nach rechts neben Einstellungen verschoben."
        ]
      }
    ]
  },
  {
    version: "1.1",
    groups: [
      {
        title: "Mannschaften",
        items: [
          "Neuer Tab \"Mannschaften\": Mannschaften anlegen, umbenennen und löschen.",
          "Mannschaft-Feld in Materialliste und Hinzufügen-Formular jetzt als Dropdown aus der Mannschaftsliste.",
          "Materialliste gruppiert nach Mannschaft."
        ]
      }
    ]
  },
  {
    version: "1.0",
    groups: [
      {
        title: "Material",
        items: [
          "Material anlegen, inline bearbeiten, suchen und filtern (Name, Kategorie, Standort).",
          "Mehrere Zeilen aus Excel/Tabellen direkt einfügen und auf einmal einlesen.",
          "Import aus Excel-Dateien (.xlsx) ohne benötigte Spaltenüberschrift."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Speicherort frei wählbar: lokale Datei per Datei-Picker (mit dauerhaft gemerkter Zugriffsberechtigung) oder Nextcloud (WebDAV) als mobile Alternative.",
          "Automatisches, datiertes Backup bei jedem App-Start.",
          "Zusätzlicher manueller JSON-Export/Import als Sicherheitskopie."
        ]
      }
    ]
  }
];
