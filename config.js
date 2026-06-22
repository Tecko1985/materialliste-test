const APP_VERSION = "1.0";

const APP_CHANGELOG = [
  {
    version: "1.0",
    groups: [
      {
        title: "Materialliste",
        items: [
          "Übersicht gruppiert nach Mannschaft, alle Felder (Name, Kategorie, Mannschaft, Menge, Trainer, Zustand) direkt anklicken und bearbeiten.",
          "Suche nach Name sowie Filter nach Mannschaft, Kategorie und Standort, dazu Sortieren nach Name oder Menge.",
          "\"Springe zu Mannschaft\"-Dropdown springt direkt zur entsprechenden Mannschaftsgruppe.",
          "Trikotsätze (Trikot, Hose, Stutzen) werden als ein aufklappbarer Satz angezeigt, einzelne Teile bleiben separat bearbeitbar.",
          "Materialliste komplett löschen (mit doppelter Sicherheitsabfrage) – Mannschaften bleiben dabei erhalten."
        ]
      },
      {
        title: "Hinzufügen",
        items: [
          "Material-Art per Checkbox wählbar: Trikotsatz, Bälle, Leibchen oder Sonstiges.",
          "Mannschaft-Auswahl per Checkbox, dazu freies Eingabefeld \"Zuständiger Trainer\" je Material-Eintrag – dieselbe Mannschaft kann so mehrere Mengen mit unterschiedlichen Trainern haben.",
          "Bei Trikotsatz: Trikot-Nummern 1–40 per Checkbox-Grid, optional auch Hosen-Nummern, sonst Hosen/Stutzen über Mengenfeld.",
          "Text-Import (automatische Erkennung): beliebige Notizen, Listen oder Excel-Zeilen einfügen, automatisch analysieren lassen und vor der Übernahme in der Vorschau prüfen/anpassen."
        ]
      },
      {
        title: "Mannschaften",
        items: [
          "Mannschaften anlegen, umbenennen und löschen.",
          "Mannschaft-Zuordnung wird beim Umbenennen automatisch auf alle zugeordneten Material-Einträge übertragen."
        ]
      },
      {
        title: "Daten & Speicherung",
        items: [
          "Speicherort frei wählbar: lokale Datei per Datei-Picker (mit dauerhaft gemerkter Zugriffsberechtigung) oder Nextcloud per WebDAV (optional über einen CORS-Proxy) als mobile Alternative.",
          "Automatisches, datiertes Backup in einem wählbaren Ordner bei jedem App-Start.",
          "Zusätzlicher manueller JSON-Export/Import als Sicherheitskopie.",
          "Import aus Excel-Dateien (.xlsx) ohne benötigte Spaltenüberschrift."
        ]
      }
    ]
  }
];
