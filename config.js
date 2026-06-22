const APP_VERSION = "1.6";

const APP_CHANGELOG = [
  {
    version: "1.6",
    groups: [
      {
        title: "Materialliste",
        items: [
          "Trikotsatz (Trikot, Hose, Stutzen) wird jetzt als ein aufklappbarer Satz angezeigt statt als einzelne Zeilen.",
          "Im aufklappbaren Satz lassen sich die einzelnen Teile weiterhin separat bearbeiten oder löschen."
        ]
      }
    ]
  },
  {
    version: "1.5",
    groups: [
      {
        title: "Fehlerbehebung",
        items: [
          "Beim Hinzufügen erscheint jetzt ein Hinweis, wenn nichts übernommen werden konnte (z.B. fehlender Name oder keine Trikot-Nummer/Menge bei Trikotsatz), statt dass scheinbar gar nichts passiert.",
          "Pflichtfeld-Validierung für Name wird jetzt per JavaScript statt über das (teils verstecke) HTML-Attribut geprüft."
        ]
      }
    ]
  },
  {
    version: "1.4",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Mannschaft-Auswahl beim Hinzufügen jetzt per Checkbox statt Dropdown (eine Mannschaft auswählbar)."
        ]
      }
    ]
  },
  {
    version: "1.3",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Material hinzufügen jetzt mit Art-Auswahl: Trikotsatz, Bälle oder Leibchen per Checkbox.",
          "Bei Trikotsatz: Trikot-Nummern 1–40 per Checkbox auswählen, Hosen und Stutzen über Mengenfeld.",
          "Ist Trikotsatz ausgewählt, verschwinden die Checkboxen für Bälle und Leibchen."
        ]
      }
    ]
  },
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
