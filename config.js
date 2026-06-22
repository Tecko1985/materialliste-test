const APP_VERSION = "1.9.9";

const APP_CHANGELOG = [
  {
    version: "1.9.9",
    groups: [
      {
        title: "Mannschaften",
        items: [
          "Mehrere Mannschaften mit gleichem Namen sind jetzt möglich (z.B. 3x \"U9\" mit unterschiedlichen Trainern) – Voraussetzung ist ein jeweils unterschiedlicher Trainer.",
          "Der Trainer wird dafür automatisch in den Anzeigenamen eingebaut (z.B. \"U9 (Trainer: Müller)\") und so überall eindeutig unterscheidbar – in der Mannschaft-Auswahl, der Materialliste und allen Dropdowns."
        ]
      }
    ]
  },
  {
    version: "1.9.8",
    groups: [
      {
        title: "Mannschaften",
        items: [
          "Neues Attribut \"Zuständiger Trainer\" pro Mannschaft – editierbar im Mannschaften-Tab und direkt neben der Mannschaft-Auswahl beim Hinzufügen.",
          "Der Trainer-Name wird jetzt zusätzlich in der Materialliste bei jeder Mannschaftsgruppe angezeigt."
        ]
      }
    ]
  },
  {
    version: "1.9.7",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Neue Checkbox \"Sonstiges\" neben Bälle/Leibchen für alle Material-Arten, die nicht Trikotsatz, Bälle oder Leibchen sind."
        ]
      }
    ]
  },
  {
    version: "1.9.6",
    groups: [
      {
        title: "Nextcloud-Verbindung",
        items: [
          "WebDAV-Adresse, Benutzername und CORS-Proxy-URL sind im Verbindungsformular bereits vorbelegt – nur noch das App-Passwort muss eingegeben werden."
        ]
      }
    ]
  },
  {
    version: "1.9.5",
    groups: [
      {
        title: "Nextcloud-Verbindung",
        items: [
          "Neues optionales Feld \"CORS-Proxy-URL\" beim Verbinden mit Nextcloud – nötig, falls der Server keine CORS-Zugriffe vom Browser aus erlaubt (z.B. bei manchen gehosteten Nextcloud-Anbietern).",
          "Beigelegter Cloudflare-Worker-Code (cors-proxy-worker.js) zum selbst Hosten eines kostenlosen CORS-Proxys."
        ]
      }
    ]
  },
  {
    version: "1.9.4",
    groups: [
      {
        title: "Materialliste",
        items: [
          "Neues Dropdown \"Springe zu Mannschaft\" oberhalb der Liste – springt direkt zur entsprechenden Mannschaftsgruppe."
        ]
      }
    ]
  },
  {
    version: "1.9.3",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Felder \"Einheit\" und \"Standort\" aus dem Hinzufügen-Formular entfernt (analog zur Materialliste-Ansicht)."
        ]
      }
    ]
  },
  {
    version: "1.9.2",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Mannschaften (z.B. U7, U9, U11, ...) werden jetzt nach Altersklasse sortiert statt alphabetisch angezeigt — auch in Materialliste und Mannschaften-Tab."
        ]
      }
    ]
  },
  {
    version: "1.9.1",
    groups: [
      {
        title: "Fehlerbehebung",
        items: [
          "Beim Aktivieren von \"Hosen haben Nummern\" rutscht das Stutzen-Feld jetzt korrekt unter das Nummern-Grid statt davor zu stehen."
        ]
      }
    ]
  },
  {
    version: "1.9",
    groups: [
      {
        title: "Materialliste",
        items: [
          "Trikotsätze werden in jeder Mannschaftsgruppe jetzt immer ganz oben angezeigt.",
          "Spalten \"Einheit\" und \"Standort\" aus der Materialliste-Ansicht entfernt (Daten bleiben erhalten, weiterhin über \"Hinzufügen\" editierbar)."
        ]
      }
    ]
  },
  {
    version: "1.8",
    groups: [
      {
        title: "Hinzufügen",
        items: [
          "Neue Checkbox \"Hosen haben Nummern\" beim Trikotsatz: zeigt ein 1–40 Nummern-Grid für Hosen statt nur eines Mengenfelds."
        ]
      }
    ]
  },
  {
    version: "1.7",
    groups: [
      {
        title: "Materialliste",
        items: [
          "Neuer Knopf \"Materialliste komplett löschen\" (mit doppelter Sicherheitsabfrage). Mannschaften bleiben dabei erhalten."
        ]
      }
    ]
  },
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
