let appData = { materials: [], teams: [], reserve: [], inventuren: [], umbuchungen: [] };
const RESERVE_KEY = "__RESERVE__";
let fileHandle = null;
let pendingHandle = null;
let backupDirHandle = null;
let storageMode = "fs"; // "fs" | "gateway"
let autoBackupDoneThisSession = false;
let saveTimer = null;

let listeSearchQuery = "";
let listeKategorieFilter = "";
let listeMannschaftFilter = "";
let listeSortOrder = "name-asc";

let umbuchungFilterZiel = "";
let umbuchungFilterRichtung = "";
let inventurAktiv = null;

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function todayStr() {
  // Lokales Datum statt UTC – sonst zeigt z.B. eine Umbuchung/Inventur kurz nach
  // Mitternacht in Deutschland (UTC+1/+2) noch das Datum des Vortags.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function ensureMaterialFields(m, { withMannschaft } = { withMannschaft: true }) {
  if (m.id === undefined) m.id = uuid();
  if (m.name === undefined) m.name = "";
  if (m.kategorie === undefined) m.kategorie = "";
  if (withMannschaft && m.mannschaft === undefined) m.mannschaft = "";
  if (m.menge === undefined) m.menge = "";
  if (m.einheit === undefined) m.einheit = "";
  if (m.standort === undefined) m.standort = "";
  if (m.trainer === undefined) m.trainer = "";
  if (m.zustand === undefined) m.zustand = "";
  if (m.satzId === undefined) m.satzId = "";
  if (m.satzLabel === undefined) m.satzLabel = "";
}

function migrateData(data) {
  if (!Array.isArray(data.materials)) data.materials = [];
  if (!Array.isArray(data.teams)) data.teams = [];
  if (!Array.isArray(data.reserve)) data.reserve = [];
  if (!Array.isArray(data.inventuren)) data.inventuren = [];
  if (!Array.isArray(data.umbuchungen)) data.umbuchungen = [];
  data.teams.forEach((t) => {
    if (t.id === undefined) t.id = uuid();
    if (typeof t.name !== "string") t.name = "";
  });
  data.materials.forEach((m) => ensureMaterialFields(m, { withMannschaft: true }));
  data.reserve.forEach((m) => ensureMaterialFields(m, { withMannschaft: false }));
  data.inventuren.forEach((inv) => {
    if (inv.id === undefined) inv.id = uuid();
    if (inv.datum === undefined) inv.datum = todayStr();
    if (inv.ziel === undefined) inv.ziel = "";
    if (!Array.isArray(inv.positionen)) inv.positionen = [];
  });
  data.umbuchungen.forEach((u) => {
    if (u.id === undefined) u.id = uuid();
    if (u.datum === undefined) u.datum = todayStr();
    if (u.name === undefined) u.name = "";
    if (u.kategorie === undefined) u.kategorie = "";
    if (u.menge === undefined) u.menge = 0;
    if (u.richtung === undefined) u.richtung = "reserve->team";
    if (u.ziel === undefined) u.ziel = "";
    if (u.kommentar === undefined) u.kommentar = "";
  });
  // Bestehende Freitext-Mannschaften ohne Stammdatensatz automatisch als Mannschaft anlegen
  const existingNames = new Set(data.teams.map((t) => t.name.toLowerCase()));
  data.materials.forEach((m) => {
    if (m.mannschaft && !existingNames.has(m.mannschaft.toLowerCase())) {
      data.teams.push({ id: uuid(), name: m.mannschaft });
      existingNames.add(m.mannschaft.toLowerCase());
    }
  });
  return data;
}

function resolveTeamByName(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) return null;
  let t = appData.teams.find((x) => x.name.toLowerCase() === trimmed.toLowerCase());
  if (!t) {
    t = { id: uuid(), name: trimmed };
    appData.teams.push(t);
  }
  return t;
}

function compareTeamNames(a, b) {
  const numA = a.match(/\d+/);
  const numB = b.match(/\d+/);
  if (numA && numB) {
    const diff = parseInt(numA[0], 10) - parseInt(numB[0], 10);
    if (diff !== 0) return diff;
  } else if (numA) {
    return -1;
  } else if (numB) {
    return 1;
  }
  return a.localeCompare(b, "de");
}

function teamOptionsHtml(selected) {
  const names = appData.teams.map((t) => t.name);
  const options = [{ value: "", label: "— keine —" }];
  if (selected && !names.includes(selected)) {
    options.push({ value: selected, label: `${selected} (nicht angelegt)` });
  }
  names.sort(compareTeamNames).forEach((n) => options.push({ value: n, label: n }));
  return options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
}

function getSelectedMannschaft() {
  const grid = document.getElementById("mannschaft-checkbox-grid");
  if (!grid) return "";
  const checked = grid.querySelector('input[type="checkbox"]:checked');
  return checked ? checked.dataset.name : "";
}

function renderMannschaftCheckboxes() {
  const grid = document.getElementById("mannschaft-checkbox-grid");
  if (!grid) return;
  const prevSelected = getSelectedMannschaft();
  const teams = appData.teams.slice().sort((a, b) => compareTeamNames(a.name, b.name));
  grid.innerHTML = teams.map((t) => `
    <label><input type="checkbox" data-name="${escapeHtml(t.name)}" ${t.name === prevSelected ? "checked" : ""} /> ${escapeHtml(t.name)}</label>
  `).join("");
  grid.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.closest("label").classList.toggle("checked", cb.checked);
    cb.addEventListener("change", () => {
      if (cb.checked) {
        grid.querySelectorAll('input[type="checkbox"]').forEach((other) => {
          if (other !== cb) {
            other.checked = false;
            other.closest("label").classList.remove("checked");
          }
        });
      }
      cb.closest("label").classList.toggle("checked", cb.checked);
    });
  });
}

// ---------- Persistenz ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.error(e));
  });
}

async function init() {
  document.getElementById("btn-connect-existing").addEventListener("click", connectExisting);
  document.getElementById("btn-connect-new").addEventListener("click", connectNew);
  document.getElementById("btn-change-location-existing").addEventListener("click", connectExisting);
  document.getElementById("btn-change-location-new").addEventListener("click", saveCurrentDataToNewLocation);
  document.getElementById("btn-reconnect").addEventListener("click", reconnectStoredHandle);
  document.getElementById("btn-reconnect-other").addEventListener("click", connectExisting);

  if (!fsApiSupported()) {
    document.getElementById("fs-api-warning").style.display = "block";
  }

  // Cloud-Sync über die zentrale Anmeldung (Tools-Übersicht): sobald ein
  // Login-Token vorliegt, wird es genutzt — unabhängig von einem früher
  // gespeicherten lokalen Datei-Modus. Das Token liegt in derselben Origin
  // (tecko1985.github.io) und wird wiederverwendet. Nur ohne gültiges Login
  // greift unten der lokale Datei-Modus.
  if (getSessionToken()) {
    try {
      const data = await gatewayLoad();
      storageMode = "gateway";
      appData = data && Array.isArray(data.materials) ? data : { materials: [], teams: [] };
      migrateData(appData);
      await FileStore.setStorageMode("gateway");
      await FileStore.clearWebdavConfig(); // alte, im Klartext gespeicherte Zugangsdaten aufräumen
      startApp();
      return;
    } catch (e) {
      if (!(e instanceof NotLoggedInError)) {
        console.error("Nextcloud-Zugriff über Login fehlgeschlagen", e);
        showGatewayError("Zugriff auf Nextcloud fehlgeschlagen: " + e.message);
        showConnectScreen(false);
        return;
      }
      // kein gültiges Login → unten lokaler Modus bzw. Anmelde-Hinweis
    }
  }

  storageMode = "fs";
  const handle = await FileStore.getHandle();
  if (handle) {
    const granted = await verifyPermissionSilent(handle);
    if (granted) {
      fileHandle = handle;
      await loadAndStart();
      return;
    }
    pendingHandle = handle;
    showConnectScreen(true);
    return;
  }
  showConnectScreen(false);
}

function showGatewayError(text) {
  const el = document.getElementById("cloud-error");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

async function verifyPermissionSilent(handle) {
  try {
    return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch (e) {
    return false;
  }
}

async function reconnectStoredHandle() {
  if (!pendingHandle) return;
  try {
    if (!(await verifyPermission(pendingHandle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = pendingHandle;
    pendingHandle = null;
    storageMode = "fs";
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(fileHandle);
    await loadAndStart();
  } catch (e) {
    console.error(e);
  }
}

function showConnectScreen(hasStoredHandle) {
  document.getElementById("connect-screen").style.display = "block";
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("reconnect-block").style.display = hasStoredHandle ? "block" : "none";
  document.getElementById("connect-default-actions").style.display = hasStoredHandle ? "none" : "flex";
}

async function connectExisting() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    await loadAndStart();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function connectNew() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "materialdaten.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    appData = { materials: [], teams: [] };
    migrateData(appData);
    await writeDataFile(fileHandle, appData);
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    startApp();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function saveCurrentDataToNewLocation() {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "materialdaten.json",
      types: [{ description: "JSON", accept: { "application/json": [".json"] } }]
    });
    if (!(await verifyPermission(handle, true))) {
      alert("Zugriff auf die Datei wurde nicht erlaubt.");
      return;
    }
    fileHandle = handle;
    storageMode = "fs";
    await writeDataFile(fileHandle, appData);
    await FileStore.setStorageMode("fs");
    await FileStore.setHandle(handle);
    startApp();
  } catch (e) {
    if (e.name !== "AbortError") console.error(e);
  }
}

async function loadAndStart() {
  try {
    const data = await readDataFile(fileHandle);
    appData = data && Array.isArray(data.materials) ? data : { materials: [], teams: [] };
  } catch (e) {
    console.error("Fehler beim Lesen der Datei", e);
    appData = { materials: [], teams: [] };
  }
  migrateData(appData);
  startApp();
}

function startApp() {
  document.getElementById("connect-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "block";
  const status = document.getElementById("file-status");
  status.classList.add("connected");
  const fileLabel = storageMode === "gateway" ? "Nextcloud (über Anmeldung)" : fileHandle ? fileHandle.name : "Datei";
  status.querySelector(".label").textContent = "Verbunden: " + fileLabel;
  const settingsFileName = document.getElementById("settings-file-name");
  if (settingsFileName) settingsFileName.textContent = fileLabel;
  setSaveStatus("Autospeichern aktiv · Autoladen beim nächsten Öffnen aktiv");
  const fsActions = document.getElementById("settings-fs-actions");
  const webdavActions = document.getElementById("settings-webdav-actions");
  if (fsActions) fsActions.style.display = storageMode === "fs" ? "flex" : "none";
  if (webdavActions) webdavActions.style.display = "none";
  renderAll();
  updateBackupFolderStatus();
  tryAutoBackupOnStart();
}

function setSaveStatus(text) {
  const el = document.getElementById("settings-save-status");
  if (el) el.textContent = text;
}

function persist() {
  setSaveStatus("Speichert…");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      if (storageMode === "gateway") {
        await gatewaySave(appData);
      } else {
        if (!fileHandle) return;
        await writeDataFile(fileHandle, appData);
      }
      const time = new Date().toLocaleTimeString("de-DE");
      setSaveStatus(`Zuletzt automatisch gespeichert um ${time} · Autoladen beim nächsten Öffnen aktiv`);
    } catch (e) {
      if (e instanceof NotLoggedInError) {
        setSaveStatus("Sitzung abgelaufen — bitte in der Tools-Übersicht neu anmelden.");
      } else {
        console.error("Speichern fehlgeschlagen", e);
        setSaveStatus("Speichern fehlgeschlagen — siehe Konsole.");
      }
    }
  }, 300);
}

// ---------- Navigation ----------

function setupNav() {
  document.querySelectorAll("nav button").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(tab) {
  document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "liste") renderListe();
  if (tab === "mannschaften") renderTeams();
  if (tab === "reserve") { renderReserve(); populateUmbuchungSelects(); renderUmbuchungsLog(); }
  if (tab === "inventur") { populateInventurZielSelect(); renderInventurHistorie(); populateVergleichSelects(); }
}

function renderAll() {
  renderVersionInfo();
  renderMannschaftCheckboxes();
  renderListe();
}

function renderVersionInfo() {
  document.querySelectorAll("#version-badge, #version-badge-2").forEach((el) => {
    if (el) el.textContent = "v" + APP_VERSION;
  });
  const list = document.getElementById("changelog-list");
  if (!list) return;
  list.innerHTML = APP_CHANGELOG.map((entry) => `
    <div class="changelog-entry">
      <div class="cv">Version ${escapeHtml(entry.version)}</div>
      ${entry.groups.map((g) => `
        <div class="changelog-group">
          <div class="cg-title">${escapeHtml(g.title)}</div>
          <ul class="cg-items">${g.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
        </div>
      `).join("")}
    </div>
  `).join("");
}

// ---------- Materialliste ----------

function uniqueValues(field) {
  const set = new Set();
  appData.materials.forEach((m) => {
    if (m[field]) set.add(m[field]);
  });
  return [...set].sort((a, b) => a.localeCompare(b, "de"));
}

function populateListeFilters() {
  const kategorieSelect = document.getElementById("liste-kategorie-filter");
  const mannschaftSelect = document.getElementById("liste-mannschaft-filter");
  const kategorien = uniqueValues("kategorie");
  const mannschaften = uniqueValues("mannschaft");
  // Aktiven Filter zurücksetzen, wenn sein Wert nicht mehr existiert – sonst zeigt
  // das Dropdown "Alle", filtert aber weiter auf den verschwundenen Wert (leere Liste).
  if (listeKategorieFilter && !kategorien.includes(listeKategorieFilter)) listeKategorieFilter = "";
  if (listeMannschaftFilter && !mannschaften.includes(listeMannschaftFilter)) listeMannschaftFilter = "";
  kategorieSelect.innerHTML = '<option value="">Alle Kategorien</option>' +
    kategorien.map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
  mannschaftSelect.innerHTML = '<option value="">Alle Mannschaften</option>' +
    mannschaften.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  kategorieSelect.value = listeKategorieFilter;
  mannschaftSelect.value = listeMannschaftFilter;
}

function filteredSortedMaterials() {
  let list = appData.materials.slice();
  if (listeSearchQuery) {
    const q = listeSearchQuery.toLowerCase();
    list = list.filter((m) => (m.name || "").toLowerCase().includes(q));
  }
  if (listeKategorieFilter) list = list.filter((m) => m.kategorie === listeKategorieFilter);
  if (listeMannschaftFilter) list = list.filter((m) => m.mannschaft === listeMannschaftFilter);
  list.sort((a, b) => {
    if (listeSortOrder === "name-asc") return (a.name || "").localeCompare(b.name || "", "de");
    if (listeSortOrder === "name-desc") return (b.name || "").localeCompare(a.name || "", "de");
    if (listeSortOrder === "menge-desc") return (Number(b.menge) || 0) - (Number(a.menge) || 0);
    if (listeSortOrder === "menge-asc") return (Number(a.menge) || 0) - (Number(b.menge) || 0);
    return 0;
  });
  return list;
}

function groupByMannschaft(list) {
  const groups = new Map();
  list.forEach((m) => {
    const key = m.mannschaft || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const keys = [...groups.keys()].sort((a, b) => {
    if (!a && b) return 1;
    if (a && !b) return -1;
    return compareTeamNames(a, b);
  });
  return keys.map((key) => ({ mannschaft: key, items: groups.get(key) }));
}

function buildRenderGroups(items) {
  const rendered = new Set();
  const saetze = [];
  const singles = [];
  items.forEach((m) => {
    if (m.satzId) {
      if (rendered.has(m.satzId)) return;
      rendered.add(m.satzId);
      saetze.push({ type: "satz", satzId: m.satzId, label: m.satzLabel, items: items.filter((x) => x.satzId === m.satzId) });
    } else {
      singles.push({ type: "single", material: m });
    }
  });
  return saetze.concat(singles);
}

function setupDeleteAllButton() {
  document.getElementById("btn-delete-all-materials").addEventListener("click", () => {
    const count = appData.materials.length;
    if (count === 0) {
      alert("Die Materialliste ist bereits leer.");
      return;
    }
    if (!confirm(`Wirklich ALLE ${count} Material-Einträge unwiderruflich löschen? Mannschaften bleiben erhalten.`)) return;
    if (!confirm("Letzte Sicherheitsabfrage: Materialliste jetzt endgültig leeren?")) return;
    appData.materials = [];
    persist();
    renderListe();
  });
}

function setupListeFilters() {
  document.getElementById("liste-search-input").addEventListener("input", (e) => {
    listeSearchQuery = e.target.value;
    renderListe();
  });
  document.getElementById("liste-kategorie-filter").addEventListener("change", (e) => {
    listeKategorieFilter = e.target.value;
    renderListe();
  });
  document.getElementById("liste-mannschaft-filter").addEventListener("change", (e) => {
    listeMannschaftFilter = e.target.value;
    renderListe();
  });
  document.getElementById("liste-sort-select").addEventListener("change", (e) => {
    listeSortOrder = e.target.value;
    renderListe();
  });
}

function materialRowHtml(m, opts = {}) {
  const showTrainer = opts.showTrainer !== false;
  const showMannschaft = opts.showMannschaft !== false;
  const extraClass = [showTrainer ? "" : "no-trainer", showMannschaft ? "" : "no-mannschaft"].filter(Boolean).join(" ");
  return `
    <div class="material-edit-row${extraClass ? " " + extraClass : ""}" data-id="${m.id}">
      <input type="text" data-field="name" value="${escapeHtml(m.name)}" />
      <input type="text" data-field="kategorie" value="${escapeHtml(m.kategorie)}" />
      ${showMannschaft ? `<select data-field="mannschaft">${teamOptionsHtml(m.mannschaft)}</select>` : ""}
      <input type="number" data-field="menge" value="${escapeHtml(m.menge)}" />
      ${showTrainer ? `<input type="text" data-field="trainer" value="${escapeHtml(m.trainer)}" placeholder="Trainer" />` : ""}
      <input type="text" data-field="zustand" value="${escapeHtml(m.zustand)}" />
      <div class="row-actions">
        <button class="btn danger small" data-action="delete">Löschen</button>
      </div>
    </div>
  `;
}

function satzRowHtml(satz, opts = {}) {
  const showMannschaft = opts.showMannschaft !== false;
  const trainerValue = (satz.items[0] && satz.items[0].trainer) || "";
  return `
    <details class="satz-group">
      <summary>
        🎽 ${escapeHtml(satz.label || "Trikotsatz")} <span class="muted">(Satz · ${satz.items.length} ${satz.items.length === 1 ? "Teil" : "Teile"})</span>
        <input type="text" class="satz-trainer-input" data-satz-id="${escapeHtml(satz.satzId)}" value="${escapeHtml(trainerValue)}" placeholder="Trainer" />
      </summary>
      <div class="material-edit-row material-edit-header no-trainer${showMannschaft ? "" : " no-mannschaft"}">
        <span>Name</span><span>Kategorie</span>${showMannschaft ? "<span>Mannschaft</span>" : ""}<span>Menge</span><span>Zustand</span><span></span>
      </div>
      <div class="player-grid">${satz.items.map((m) => materialRowHtml(m, { showTrainer: false, showMannschaft })).join("")}</div>
    </details>
  `;
}

function renderListe() {
  populateListeFilters();
  const list = filteredSortedMaterials();
  const container = document.getElementById("liste-groups");
  const empty = document.getElementById("liste-empty");
  if (appData.materials.length === 0) {
    empty.textContent = 'Noch kein Material angelegt. Wechsle zu "Hinzufügen".';
    empty.style.display = "block";
  } else if (list.length === 0) {
    empty.textContent = "Keine Einträge passen zu den aktuellen Filtern.";
    empty.style.display = "block";
  } else {
    empty.style.display = "none";
  }

  const groups = groupByMannschaft(list);
  container.innerHTML = groups.map((g) => `
    <div class="material-group" data-mannschaft="${escapeHtml(g.mannschaft)}">
      <div class="material-group-title">${escapeHtml(g.mannschaft || "Ohne Mannschaft")} (${g.items.length})</div>
      <div class="material-edit-row material-edit-header">
        <span>Name</span><span>Kategorie</span><span>Mannschaft</span><span>Menge</span><span>Trainer</span><span>Zustand</span><span></span>
      </div>
      <div class="player-grid">${buildRenderGroups(g.items).map((rg) => rg.type === "satz" ? satzRowHtml(rg) : materialRowHtml(rg.material)).join("")}</div>
    </div>
  `).join("");

  container.querySelectorAll("input:not(.satz-trainer-input), select").forEach((input) => {
    input.addEventListener("change", () => commitMaterialEdit(input));
  });
  container.querySelectorAll(".satz-trainer-input").forEach((input) => {
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => commitSatzTrainerEdit(input));
  });
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".material-edit-row").dataset.id;
      deleteMaterial(id);
    });
  });
}

function commitSatzTrainerEdit(input, list = appData.materials) {
  const satzId = input.dataset.satzId;
  const value = input.value.trim();
  list.forEach((m) => {
    if (m.satzId === satzId) m.trainer = value;
  });
  persist();
}

function commitMaterialEdit(input) {
  const row = input.closest(".material-edit-row");
  const id = row.dataset.id;
  const material = appData.materials.find((m) => m.id === id);
  if (!material) return;
  const field = input.dataset.field;
  material[field] = field === "menge" ? input.value : input.value.trim();
  persist();
  renderListe();
  populateUmbuchungMaterialSelect();
}

function deleteMaterial(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  appData.materials = appData.materials.filter((m) => m.id !== id);
  persist();
  renderListe();
  populateUmbuchungMaterialSelect();
}

// ---------- Mannschaften ----------

function setupTeamForm() {
  document.getElementById("team-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("team-name");
    const name = input.value.trim();
    if (!name) return;
    if (appData.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      alert("Diese Mannschaft existiert bereits.");
      return;
    }
    appData.teams.push({ id: uuid(), name });
    persist();
    renderTeams();
    renderMannschaftCheckboxes();
    e.target.reset();
    input.focus();
  });
}

function renderTeams() {
  const empty = document.getElementById("teams-empty");
  const container = document.getElementById("teams-list");
  const teams = appData.teams.slice().sort((a, b) => compareTeamNames(a.name, b.name));
  empty.style.display = teams.length === 0 ? "block" : "none";
  container.innerHTML = teams.map((t) => {
    const count = appData.materials.filter((m) => m.mannschaft === t.name).length;
    return `
      <div class="team-edit-row" data-id="${t.id}">
        <input type="text" data-field="name" value="${escapeHtml(t.name)}" />
        <span class="team-count">${count} Material-Eintrag/Einträge</span>
        <button class="btn danger small" data-action="delete-team">Löschen</button>
      </div>
    `;
  }).join("");

  container.querySelectorAll('input[data-field="name"]').forEach((input) => {
    input.addEventListener("change", () => commitTeamEdit(input));
  });
  container.querySelectorAll('[data-action="delete-team"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".team-edit-row").dataset.id;
      deleteTeam(id);
    });
  });
}

function commitTeamEdit(input) {
  const row = input.closest(".team-edit-row");
  const id = row.dataset.id;
  const team = appData.teams.find((t) => t.id === id);
  if (!team) return;
  const newName = input.value.trim();
  if (!newName) {
    input.value = team.name;
    return;
  }
  if (appData.teams.some((t) => t.id !== id && t.name.toLowerCase() === newName.toLowerCase())) {
    alert("Eine Mannschaft mit diesem Namen existiert bereits.");
    input.value = team.name;
    return;
  }
  const oldName = team.name;
  team.name = newName;
  if (oldName !== newName) {
    appData.materials.forEach((m) => {
      if (m.mannschaft === oldName) m.mannschaft = newName;
    });
    // Umbenennung auch auf Protokoll und Inventur-Stichtage übertragen, sonst
    // verlieren Log-Filter und Vergleich nach dem Umbenennen ihre Zuordnung.
    appData.umbuchungen.forEach((u) => {
      if (u.ziel === oldName) u.ziel = newName;
    });
    appData.inventuren.forEach((inv) => {
      if (inv.ziel === oldName) inv.ziel = newName;
    });
  }
  persist();
  renderTeams();
  renderListe();
  renderMannschaftCheckboxes();
}

function deleteTeam(id) {
  const team = appData.teams.find((t) => t.id === id);
  if (!team) return;
  const count = appData.materials.filter((m) => m.mannschaft === team.name).length;
  const msg = count > 0
    ? `"${team.name}" löschen? ${count} Material-Eintrag/Einträge sind dieser Mannschaft zugeordnet und erscheinen danach unter "Ohne Mannschaft".`
    : `Mannschaft "${team.name}" wirklich löschen?`;
  if (!confirm(msg)) return;
  appData.materials.forEach((m) => {
    if (m.mannschaft === team.name) m.mannschaft = "";
  });
  appData.teams = appData.teams.filter((t) => t.id !== id);
  persist();
  renderTeams();
  renderListe();
  renderMannschaftCheckboxes();
}

// ---------- Reserve ----------

function renderReserve() {
  const empty = document.getElementById("reserve-empty");
  const container = document.getElementById("reserve-groups");
  const list = appData.reserve.slice().sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  empty.style.display = list.length === 0 ? "block" : "none";
  container.innerHTML = list.length === 0 ? "" : `
    <div class="material-edit-row material-edit-header no-mannschaft">
      <span>Name</span><span>Kategorie</span><span>Menge</span><span>Trainer</span><span>Zustand</span><span></span>
    </div>
    <div class="player-grid">${buildRenderGroups(list).map((rg) => rg.type === "satz" ? satzRowHtml(rg, { showMannschaft: false }) : materialRowHtml(rg.material, { showMannschaft: false })).join("")}</div>
  `;

  container.querySelectorAll("input:not(.satz-trainer-input)").forEach((input) => {
    input.addEventListener("change", () => commitReserveEdit(input));
  });
  container.querySelectorAll(".satz-trainer-input").forEach((input) => {
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => commitSatzTrainerEdit(input, appData.reserve));
  });
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".material-edit-row").dataset.id;
      deleteReserveItem(id);
    });
  });
}

function commitReserveEdit(input) {
  const row = input.closest(".material-edit-row");
  const id = row.dataset.id;
  const item = appData.reserve.find((m) => m.id === id);
  if (!item) return;
  const field = input.dataset.field;
  item[field] = field === "menge" ? input.value : input.value.trim();
  persist();
  renderReserve();
  populateUmbuchungMaterialSelect();
}

function deleteReserveItem(id) {
  if (!confirm("Diesen Reserve-Eintrag wirklich löschen?")) return;
  appData.reserve = appData.reserve.filter((m) => m.id !== id);
  persist();
  renderReserve();
  populateUmbuchungMaterialSelect();
}

function setupReserveForm() {
  buildReserveTrikotNumberGrid();
  setupMaterialTypeToggle(RESERVE_TYPE_IDS);

  document.getElementById("reserve-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const trikot = document.getElementById("r-chk-trikotsatz").checked;
    const baelle = document.getElementById("r-chk-baelle").checked;
    const leibchen = document.getElementById("r-chk-leibchen").checked;
    const sonstiges = document.getElementById("r-chk-sonstiges").checked;
    let addedAny = false;

    if (trikot) {
      const bezeichnung = document.getElementById("r-mt-bezeichnung").value.trim();
      const zustand = document.getElementById("r-mt-zustand").value.trim();
      const numbers = Array.from(document.querySelectorAll('#r-trikot-number-grid input[type="checkbox"]:checked')).map((c) => c.dataset.num);
      const hosenHatNummern = document.getElementById("r-chk-hosen-nummern").checked;
      const hosenNumbers = Array.from(document.querySelectorAll('#r-hosen-number-grid input[type="checkbox"]:checked')).map((c) => c.dataset.num);
      const hosen = document.getElementById("r-mt-hosen").value;
      const stutzen = document.getElementById("r-mt-stutzen").value;
      const satzLabel = ["Trikotsatz", bezeichnung].filter(Boolean).join(" ");
      const satzEntries = [];

      if (numbers.length > 0) {
        satzEntries.push({
          id: uuid(),
          name: ["Trikot", bezeichnung].filter(Boolean).join(" "),
          kategorie: "Trikot",
          menge: String(numbers.length),
          einheit: "Stk",
          standort: "",
          trainer: "",
          zustand: [zustand, "Nr. " + numbers.join(", ")].filter(Boolean).join(" / ")
        });
      }
      if (hosenHatNummern) {
        if (hosenNumbers.length > 0) {
          satzEntries.push({
            id: uuid(),
            name: ["Hose", bezeichnung].filter(Boolean).join(" "),
            kategorie: "Hose",
            menge: String(hosenNumbers.length),
            einheit: "Stk",
            standort: "",
            trainer: "",
            zustand: [zustand, "Nr. " + hosenNumbers.join(", ")].filter(Boolean).join(" / ")
          });
        }
      } else if (hosen && Number(hosen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Hose", bezeichnung].filter(Boolean).join(" "), kategorie: "Hose",
          menge: hosen, einheit: "Stk", standort: "", trainer: "", zustand
        });
      }
      if (stutzen && Number(stutzen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Stutzen", bezeichnung].filter(Boolean).join(" "), kategorie: "Stutzen",
          menge: stutzen, einheit: "Stk", standort: "", trainer: "", zustand
        });
      }
      if (satzEntries.length === 0) {
        alert("Bitte mindestens eine Trikot-Nummer auswählen oder eine Hosen-/Stutzenanzahl eintragen.");
        return;
      }
      if (satzEntries.length > 1) {
        const satzId = uuid();
        satzEntries.forEach((entry) => { entry.satzId = satzId; entry.satzLabel = satzLabel; });
      }
      appData.reserve.push(...satzEntries);
      addedAny = true;
    } else if (baelle) {
      appData.reserve.push({
        id: uuid(),
        name: "Bälle",
        kategorie: "Sportgerät",
        menge: document.getElementById("r-mb-menge").value,
        einheit: "Stk",
        standort: "",
        trainer: "",
        zustand: document.getElementById("r-mb-zustand").value.trim()
      });
      addedAny = true;
    } else if (leibchen) {
      const farbe = document.getElementById("r-ml-farbe").value.trim();
      appData.reserve.push({
        id: uuid(),
        name: ["Leibchen", farbe].filter(Boolean).join(" "),
        kategorie: "Leibchen",
        menge: document.getElementById("r-ml-menge").value,
        einheit: "Stk",
        standort: "",
        trainer: "",
        zustand: document.getElementById("r-ml-zustand").value.trim()
      });
      addedAny = true;
    } else if (sonstiges) {
      const name = document.getElementById("r-name").value.trim();
      if (!name) {
        alert("Bitte einen Namen eingeben.");
        return;
      }
      appData.reserve.push({
        id: uuid(),
        name,
        kategorie: document.getElementById("r-kategorie").value.trim(),
        menge: document.getElementById("r-menge").value,
        einheit: "",
        standort: "",
        trainer: "",
        zustand: document.getElementById("r-zustand").value.trim()
      });
      addedAny = true;
    } else {
      alert("Bitte eine Art auswählen (Trikotsatz, Bälle, Leibchen oder Sonstiges).");
      return;
    }

    if (!addedAny) return;

    persist();
    renderReserve();
    populateUmbuchungMaterialSelect();
    e.target.reset();
    document.querySelectorAll("#r-trikot-number-grid label.checked, #r-hosen-number-grid label.checked").forEach((l) => l.classList.remove("checked"));
    updateMaterialTypeVisibility(RESERVE_TYPE_IDS);
    updateHosenNummernVisibility(RESERVE_TYPE_IDS);
    document.getElementById("r-name").focus();
  });
}

// ---------- Umbuchung ----------

function findOrCreateMatchingEntry(list, { name, kategorie, zustand, mannschaft }) {
  let entry = list.find((m) =>
    (m.name || "").toLowerCase() === (name || "").toLowerCase() &&
    (m.kategorie || "") === (kategorie || "") &&
    (m.zustand || "") === (zustand || "") &&
    (mannschaft === undefined || m.mannschaft === mannschaft)
  );
  if (!entry) {
    entry = { id: uuid(), name, kategorie, menge: "0", einheit: "", standort: "", trainer: "", zustand, satzId: "", satzLabel: "" };
    if (mannschaft !== undefined) entry.mannschaft = mannschaft;
    list.push(entry);
  }
  return entry;
}

function buchUm({ richtung, materialId, menge, ziel, kommentar }) {
  const sourceList = richtung === "reserve->team" ? appData.reserve : appData.materials;
  const source = sourceList.find((m) => m.id === materialId);
  if (!source) {
    alert("Material nicht gefunden.");
    return false;
  }
  const verfuegbar = Number(source.menge) || 0;
  if (!menge || menge <= 0 || menge > verfuegbar) {
    alert(`Ungültige Menge. Verfügbar: ${verfuegbar}.`);
    return false;
  }
  source.menge = String(verfuegbar - menge);

  if (richtung === "reserve->team") {
    const target = findOrCreateMatchingEntry(appData.materials, { name: source.name, kategorie: source.kategorie, zustand: source.zustand, mannschaft: ziel });
    target.menge = String((Number(target.menge) || 0) + menge);
  } else {
    const target = findOrCreateMatchingEntry(appData.reserve, { name: source.name, kategorie: source.kategorie, zustand: source.zustand });
    target.menge = String((Number(target.menge) || 0) + menge);
  }

  appData.umbuchungen.push({
    id: uuid(), datum: todayStr(), name: source.name, kategorie: source.kategorie,
    menge, richtung, ziel, kommentar: kommentar || ""
  });
  persist();
  return true;
}

function populateUmbuchungMaterialSelect() {
  const richtung = document.getElementById("ub-richtung").value;
  const mannschaft = document.getElementById("ub-mannschaft").value;
  const materialSelect = document.getElementById("ub-material");
  const list = (richtung === "reserve->team" ? appData.reserve : appData.materials.filter((m) => m.mannschaft === mannschaft))
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  materialSelect.innerHTML = list.length === 0
    ? '<option value="">— kein Material verfügbar —</option>'
    : list.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}${m.kategorie ? " (" + escapeHtml(m.kategorie) + ")" : ""} – ${escapeHtml(m.menge)} verfügbar</option>`).join("");
}

function populateUmbuchungSelects() {
  const mannschaftSelect = document.getElementById("ub-mannschaft");
  const prevMannschaft = mannschaftSelect.value;
  const teams = appData.teams.slice().sort((a, b) => compareTeamNames(a.name, b.name));
  mannschaftSelect.innerHTML = teams.map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
  if (teams.some((t) => t.name === prevMannschaft)) mannschaftSelect.value = prevMannschaft;
  populateUmbuchungMaterialSelect();

  const logFilter = document.getElementById("ub-log-mannschaft-filter");
  const prevLogFilter = logFilter.value;
  logFilter.innerHTML = '<option value="">Alle Mannschaften</option>' + teams.map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
  logFilter.value = teams.some((t) => t.name === prevLogFilter) ? prevLogFilter : "";
}

function deleteUmbuchung(id) {
  if (!confirm("Diesen Umbuchungs-Eintrag wirklich aus dem Protokoll löschen? Der Materialbestand wird dadurch nicht zurückgebucht.")) return;
  appData.umbuchungen = appData.umbuchungen.filter((u) => u.id !== id);
  persist();
  renderUmbuchungsLog();
}

function renderUmbuchungsLog() {
  const empty = document.getElementById("umbuchung-log-empty");
  const container = document.getElementById("umbuchung-log-list");
  let list = appData.umbuchungen.slice().sort((a, b) => b.datum.localeCompare(a.datum));
  if (umbuchungFilterZiel) list = list.filter((u) => u.ziel === umbuchungFilterZiel);
  if (umbuchungFilterRichtung) list = list.filter((u) => u.richtung === umbuchungFilterRichtung);
  empty.style.display = list.length === 0 ? "block" : "none";
  container.innerHTML = list.length === 0 ? "" : `
    <div class="umbuchung-log-row umbuchung-log-header">
      <span>Datum</span><span>Material</span><span>Menge</span><span>Richtung</span><span>Mannschaft</span><span>Kommentar</span><span></span>
    </div>
    ${list.map((u) => `
      <div class="umbuchung-log-row" data-id="${u.id}">
        <span>${escapeHtml(u.datum)}</span>
        <span>${escapeHtml(u.name)}${u.kategorie ? " (" + escapeHtml(u.kategorie) + ")" : ""}</span>
        <span>${escapeHtml(String(u.menge))}</span>
        <span class="badge-richtung">${u.richtung === "reserve->team" ? "Reserve → Mannschaft" : "Mannschaft → Reserve"}</span>
        <span>${escapeHtml(u.ziel)}</span>
        <span>${escapeHtml(u.kommentar)}</span>
        <div class="row-actions">
          <button class="btn danger small" data-action="delete">Löschen</button>
        </div>
      </div>
    `).join("")}
  `;
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteUmbuchung(btn.closest(".umbuchung-log-row").dataset.id);
    });
  });
}

function setupUmbuchungForm() {
  document.getElementById("ub-richtung").addEventListener("change", populateUmbuchungMaterialSelect);
  document.getElementById("ub-mannschaft").addEventListener("change", populateUmbuchungMaterialSelect);

  document.getElementById("umbuchung-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const richtung = document.getElementById("ub-richtung").value;
    const ziel = document.getElementById("ub-mannschaft").value;
    const materialId = document.getElementById("ub-material").value;
    const menge = Number(document.getElementById("ub-menge").value);
    const kommentar = document.getElementById("ub-kommentar").value.trim();
    if (!ziel) {
      alert("Bitte eine Mannschaft auswählen.");
      return;
    }
    if (!materialId) {
      alert("Bitte ein Material auswählen.");
      return;
    }
    if (!buchUm({ richtung, materialId, menge, ziel, kommentar })) return;
    // Erst zurücksetzen, dann neu befüllen – sonst zeigt das Material-Dropdown
    // weiter die Liste der alten Richtung, während die Richtung schon "reserve->team" ist.
    e.target.reset();
    renderReserve();
    renderListe();
    populateUmbuchungSelects();
    renderUmbuchungsLog();
  });

  document.getElementById("ub-log-mannschaft-filter").addEventListener("change", (e) => {
    umbuchungFilterZiel = e.target.value;
    renderUmbuchungsLog();
  });
  document.getElementById("ub-log-richtung-filter").addEventListener("change", (e) => {
    umbuchungFilterRichtung = e.target.value;
    renderUmbuchungsLog();
  });
}

// ---------- Hinzufügen ----------

function buildNumberGrid(gridId) {
  const grid = document.getElementById(gridId);
  if (!grid || grid.children.length > 0) return;
  let html = "";
  for (let n = 1; n <= 40; n++) {
    html += `<label><input type="checkbox" data-num="${n}" /> ${n}</label>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", () => {
      cb.closest("label").classList.toggle("checked", cb.checked);
    });
  });
}

function buildTrikotNumberGrid() {
  buildNumberGrid("trikot-number-grid");
  buildNumberGrid("hosen-number-grid");
}

function buildReserveTrikotNumberGrid() {
  buildNumberGrid("r-trikot-number-grid");
  buildNumberGrid("r-hosen-number-grid");
}

const MATERIAL_TYPE_IDS = {
  chkTrikotsatz: "chk-trikotsatz", chkBaelle: "chk-baelle", chkLeibchen: "chk-leibchen", chkSonstiges: "chk-sonstiges",
  baelleLabel: "mtype-baelle-label", leibchenLabel: "mtype-leibchen-label", sonstigesLabel: "mtype-sonstiges-label",
  formTrikotsatz: "mform-trikotsatz", formBaelle: "mform-baelle", formLeibchen: "mform-leibchen", formGeneric: "mform-generic",
  chkHosenNummern: "chk-hosen-nummern", hosenField: "mt-hosen-field", hosenNummernWrap: "hosen-nummern-wrap"
};

const RESERVE_TYPE_IDS = {
  chkTrikotsatz: "r-chk-trikotsatz", chkBaelle: "r-chk-baelle", chkLeibchen: "r-chk-leibchen", chkSonstiges: "r-chk-sonstiges",
  baelleLabel: "r-mtype-baelle-label", leibchenLabel: "r-mtype-leibchen-label", sonstigesLabel: "r-mtype-sonstiges-label",
  formTrikotsatz: "r-mform-trikotsatz", formBaelle: "r-mform-baelle", formLeibchen: "r-mform-leibchen", formGeneric: "r-mform-generic",
  chkHosenNummern: "r-chk-hosen-nummern", hosenField: "r-mt-hosen-field", hosenNummernWrap: "r-hosen-nummern-wrap"
};

function updateHosenNummernVisibility(ids) {
  const hatNummern = document.getElementById(ids.chkHosenNummern).checked;
  document.getElementById(ids.hosenField).style.display = hatNummern ? "none" : "";
  document.getElementById(ids.hosenNummernWrap).style.display = hatNummern ? "block" : "none";
}

function updateMaterialTypeVisibility(ids) {
  const chkTrikot = document.getElementById(ids.chkTrikotsatz);
  const chkBaelle = document.getElementById(ids.chkBaelle);
  const chkLeibchen = document.getElementById(ids.chkLeibchen);
  const chkSonstiges = document.getElementById(ids.chkSonstiges);
  const trikot = chkTrikot.checked;

  document.getElementById(ids.baelleLabel).style.display = trikot ? "none" : "";
  document.getElementById(ids.leibchenLabel).style.display = trikot ? "none" : "";
  document.getElementById(ids.sonstigesLabel).style.display = trikot ? "none" : "";
  if (trikot) {
    chkBaelle.checked = false;
    chkLeibchen.checked = false;
    chkSonstiges.checked = false;
  }

  document.getElementById(ids.formTrikotsatz).style.display = trikot ? "block" : "none";
  document.getElementById(ids.formBaelle).style.display = !trikot && chkBaelle.checked ? "grid" : "none";
  document.getElementById(ids.formLeibchen).style.display = !trikot && chkLeibchen.checked ? "grid" : "none";
  document.getElementById(ids.formGeneric).style.display = !trikot && chkSonstiges.checked ? "grid" : "none";
}

function setupMaterialTypeToggle(ids) {
  const typeIds = [ids.chkTrikotsatz, ids.chkBaelle, ids.chkLeibchen, ids.chkSonstiges];
  typeIds.forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => {
      // Nur eine Art gleichzeitig – das Speichern verarbeitet ohnehin nur einen Typ.
      if (e.target.checked) {
        typeIds.forEach((other) => {
          if (other !== id) document.getElementById(other).checked = false;
        });
      }
      updateMaterialTypeVisibility(ids);
    });
  });
  updateMaterialTypeVisibility(ids);
  document.getElementById(ids.chkHosenNummern).addEventListener("change", () => updateHosenNummernVisibility(ids));
  updateHosenNummernVisibility(ids);
}

function setupMaterialForm() {
  buildTrikotNumberGrid();
  setupMaterialTypeToggle(MATERIAL_TYPE_IDS);

  document.getElementById("material-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const trikot = document.getElementById("chk-trikotsatz").checked;
    const baelle = document.getElementById("chk-baelle").checked;
    const leibchen = document.getElementById("chk-leibchen").checked;
    const sonstiges = document.getElementById("chk-sonstiges").checked;
    const mannschaftSelected = getSelectedMannschaft();
    const trainer = document.getElementById("m-mannschaft-trainer").value.trim();
    let addedAny = false;

    if (trikot) {
      const mannschaft = mannschaftSelected;
      const bezeichnung = document.getElementById("mt-bezeichnung").value.trim();
      const standort = "";
      const zustand = document.getElementById("mt-zustand").value.trim();
      const numbers = Array.from(document.querySelectorAll('#trikot-number-grid input[type="checkbox"]:checked')).map((c) => c.dataset.num);
      const hosenHatNummern = document.getElementById("chk-hosen-nummern").checked;
      const hosenNumbers = Array.from(document.querySelectorAll('#hosen-number-grid input[type="checkbox"]:checked')).map((c) => c.dataset.num);
      const hosen = document.getElementById("mt-hosen").value;
      const stutzen = document.getElementById("mt-stutzen").value;
      const satzLabel = ["Trikotsatz", bezeichnung].filter(Boolean).join(" ");
      const satzEntries = [];

      if (numbers.length > 0) {
        satzEntries.push({
          id: uuid(),
          name: ["Trikot", bezeichnung].filter(Boolean).join(" "),
          kategorie: "Trikot",
          mannschaft,
          menge: String(numbers.length),
          einheit: "Stk",
          standort,
          trainer,
          zustand: [zustand, "Nr. " + numbers.join(", ")].filter(Boolean).join(" / ")
        });
      }
      if (hosenHatNummern) {
        if (hosenNumbers.length > 0) {
          satzEntries.push({
            id: uuid(),
            name: ["Hose", bezeichnung].filter(Boolean).join(" "),
            kategorie: "Hose",
            mannschaft,
            menge: String(hosenNumbers.length),
            einheit: "Stk",
            standort,
            trainer,
            zustand: [zustand, "Nr. " + hosenNumbers.join(", ")].filter(Boolean).join(" / ")
          });
        }
      } else if (hosen && Number(hosen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Hose", bezeichnung].filter(Boolean).join(" "), kategorie: "Hose",
          mannschaft, menge: hosen, einheit: "Stk", standort, trainer, zustand
        });
      }
      if (stutzen && Number(stutzen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Stutzen", bezeichnung].filter(Boolean).join(" "), kategorie: "Stutzen",
          mannschaft, menge: stutzen, einheit: "Stk", standort, trainer, zustand
        });
      }
      if (satzEntries.length === 0) {
        alert("Bitte mindestens eine Trikot-Nummer auswählen oder eine Hosen-/Stutzenanzahl eintragen.");
        return;
      }
      if (satzEntries.length > 1) {
        const satzId = uuid();
        satzEntries.forEach((entry) => { entry.satzId = satzId; entry.satzLabel = satzLabel; });
      }
      appData.materials.push(...satzEntries);
      addedAny = true;
    } else if (baelle) {
      appData.materials.push({
        id: uuid(),
        name: "Bälle",
        kategorie: "Sportgerät",
        mannschaft: mannschaftSelected,
        menge: document.getElementById("mb-menge").value,
        einheit: "Stk",
        standort: "",
        trainer,
        zustand: document.getElementById("mb-zustand").value.trim()
      });
      addedAny = true;
    } else if (leibchen) {
      const farbe = document.getElementById("ml-farbe").value.trim();
      appData.materials.push({
        id: uuid(),
        name: ["Leibchen", farbe].filter(Boolean).join(" "),
        kategorie: "Leibchen",
        mannschaft: mannschaftSelected,
        menge: document.getElementById("ml-menge").value,
        einheit: "Stk",
        standort: "",
        trainer,
        zustand: document.getElementById("ml-zustand").value.trim()
      });
      addedAny = true;
    } else if (sonstiges) {
      const name = document.getElementById("m-name").value.trim();
      if (!name) {
        alert("Bitte einen Namen eingeben.");
        return;
      }
      appData.materials.push({
        id: uuid(),
        name,
        kategorie: document.getElementById("m-kategorie").value.trim(),
        mannschaft: mannschaftSelected,
        menge: document.getElementById("m-menge").value,
        einheit: "",
        standort: "",
        trainer,
        zustand: document.getElementById("m-zustand").value.trim()
      });
      addedAny = true;
    } else {
      alert("Bitte eine Art auswählen (Trikotsatz, Bälle, Leibchen oder Sonstiges).");
      return;
    }

    if (!addedAny) return;

    persist();
    renderListe();
    e.target.reset();
    document.querySelectorAll("#trikot-number-grid label.checked, #hosen-number-grid label.checked, #mannschaft-checkbox-grid label.checked").forEach((l) => l.classList.remove("checked"));
    updateMaterialTypeVisibility(MATERIAL_TYPE_IDS);
    updateHosenNummernVisibility(MATERIAL_TYPE_IDS);
    document.getElementById("m-name").focus();
  });
}

// ---------- Text-Import (automatische Erkennung) ----------

const COLOR_WORDS = [
  "blau", "rot", "gelb", "grün", "grun", "grau", "schwarz", "weiß", "weiss",
  "orange", "lila", "pink", "türkis", "tuerkis", "bordeaux", "navy", "violett",
  "braun", "hellblau", "dunkelblau"
];

function capWord(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function isColorWord(w) {
  return COLOR_WORDS.includes(String(w || "").toLowerCase());
}

function parseSmartImport(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const items = [];
  const unrecognized = [];
  let mannschaftContext = "";
  let currentSatz = null; // { farbe, label }
  let mode = "normal"; // "normal" | "leibchen"

  function pushItem(partial) {
    items.push({
      name: partial.name || "",
      kategorie: partial.kategorie || "",
      mannschaft: partial.mannschaft !== undefined ? partial.mannschaft : mannschaftContext,
      menge: partial.menge !== undefined ? String(partial.menge) : "",
      einheit: partial.einheit || "Stk",
      standort: partial.standort || "",
      zustand: partial.zustand || ""
    });
  }

  function buildSatzItem(teilName, menge) {
    return {
      name: [capWord(teilName), currentSatz ? currentSatz.farbe : ""].filter(Boolean).join(" "),
      kategorie: capWord(teilName),
      menge,
      zustand: currentSatz ? currentSatz.label : ""
    };
  }

  lines.forEach((line) => {
    // Tab-getrennte Zeile (klassischer Excel-Paste): direkte Spaltenzuordnung
    if (line.includes("\t")) {
      const cells = line.split("\t").map((c) => c.trim());
      pushItem({
        name: cells[0],
        kategorie: cells[1],
        menge: cells[2],
        einheit: cells[3],
        standort: cells[4],
        zustand: cells[5]
      });
      return;
    }

    // "<Kategorie> bestand <Kontext>" Kopfzeile, z.B. "Trikot bestand U19"
    let m = line.match(/^(.*?)\s*bestand\s*(.*)$/i);
    if (m) {
      mannschaftContext = m[2].trim() || mannschaftContext;
      currentSatz = null;
      mode = "normal";
      return;
    }

    // Explizite "Leibchen" Kopfzeile
    if (/^leibchen$/i.test(line)) {
      mode = "leibchen";
      currentSatz = null;
      return;
    }

    // "Keine <Teil>" -> Menge 0
    m = line.match(/^keine\s+(.+)$/i);
    if (m) {
      pushItem(buildSatzItem(m[1].trim(), 0));
      return;
    }

    // Reine Nummernliste (z.B. Trikotnummern), durch Komma getrennt
    const commaTokens = line.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (commaTokens.length >= 2 && commaTokens.every((t) => /^\d+$/.test(t))) {
      pushItem({
        name: ["Trikot", currentSatz ? currentSatz.farbe : "", currentSatz ? currentSatz.label : ""].filter(Boolean).join(" "),
        kategorie: "Trikot",
        menge: commaTokens.length,
        zustand: "Nr. " + commaTokens.join(", ")
      });
      return;
    }

    // "<Nr> TW <Menge> x <Farben>", z.B. "22 TW 2 x orange und schwarz"
    m = line.match(/^(\d+)\s*tw\s*(\d+)\s*x\s*(.+)$/i);
    if (m) {
      pushItem({
        name: ["TW-Trikot", currentSatz ? currentSatz.farbe : "", currentSatz ? currentSatz.label : ""].filter(Boolean).join(" "),
        kategorie: "Torwart",
        menge: m[2],
        zustand: `${m[3].trim()} (Nr. ${m[1]})`
      });
      return;
    }

    // "<Menge> TW Hose + Stutzen <Farbe>"
    m = line.match(/^(\d+)\s*tw\s*hose\s*\+\s*stutzen\s*(.+)$/i);
    if (m) {
      pushItem({ name: ["TW-Hose", currentSatz ? currentSatz.farbe : ""].filter(Boolean).join(" "), kategorie: "Torwart", menge: m[1], zustand: currentSatz ? currentSatz.label : "" });
      pushItem({ name: "TW-Stutzen " + capWord(m[2].trim()), kategorie: "Torwart", menge: m[1], zustand: currentSatz ? currentSatz.label : "" });
      return;
    }

    // Farb-Kopfzeile für einen neuen Satz, z.B. "Blau KD Sports (Ausweichsatz)"
    const firstWord = line.split(/\s+/)[0];
    if (isColorWord(firstWord) && !/^\d/.test(line)) {
      currentSatz = { farbe: capWord(firstWord), label: line.slice(firstWord.length).trim() };
      mode = "normal";
      return;
    }

    // Generische Mengenangabe "<Zahl> [x] <Rest>"
    m = line.match(/^(\d+)\s*x?\.?\s*(.+)$/i);
    if (m) {
      const n = m[1];
      const rest = m[2].trim();
      if (mode === "leibchen") {
        pushItem({ name: "Leibchen " + capWord(rest), kategorie: "Leibchen", menge: n });
      } else if (/h[oö]sen?/i.test(rest)) {
        pushItem(buildSatzItem("Hose", n));
      } else if (/stutzen/i.test(rest)) {
        pushItem(buildSatzItem("Stutzen", n));
      } else if (/trikots?/i.test(rest)) {
        pushItem(buildSatzItem("Trikot", n));
      } else if (/b[aä]lle|ball/i.test(rest)) {
        pushItem({ name: "Bälle", kategorie: "Sportgerät", menge: n });
      } else if (/leibchen/i.test(rest)) {
        pushItem({ name: rest, kategorie: "Leibchen", menge: n });
      } else {
        pushItem(buildSatzItem(rest, n));
      }
      return;
    }

    unrecognized.push(line);
  });

  return { items, unrecognized };
}

let smartImportRows = [];

function renderSmartImportPreview(parsed) {
  smartImportRows = parsed.items;
  const preview = document.getElementById("smart-import-preview");
  const container = document.getElementById("smart-import-rows");
  const unrecognizedEl = document.getElementById("smart-import-unrecognized");
  preview.style.display = smartImportRows.length > 0 ? "block" : "none";
  container.innerHTML = smartImportRows.map((item, idx) => `
    <div class="material-edit-row with-checkbox" data-index="${idx}">
      <input type="checkbox" checked />
      <input type="text" data-field="name" value="${escapeHtml(item.name)}" />
      <input type="text" data-field="kategorie" value="${escapeHtml(item.kategorie)}" />
      <input type="text" data-field="mannschaft" value="${escapeHtml(item.mannschaft)}" />
      <input type="number" data-field="menge" value="${escapeHtml(item.menge)}" />
      <input type="text" data-field="einheit" value="${escapeHtml(item.einheit)}" />
      <input type="text" data-field="standort" value="${escapeHtml(item.standort)}" />
      <input type="text" data-field="zustand" value="${escapeHtml(item.zustand)}" />
    </div>
  `).join("");
  if (parsed.unrecognized.length > 0) {
    unrecognizedEl.textContent = `${parsed.unrecognized.length} Zeile(n) nicht erkannt und nicht übernommen: ` + parsed.unrecognized.join(" / ");
  } else {
    unrecognizedEl.textContent = "";
  }
}

function setupSmartImport() {
  document.getElementById("btn-smart-analyze").addEventListener("click", () => {
    const text = document.getElementById("smart-import-input").value;
    const parsed = parseSmartImport(text);
    renderSmartImportPreview(parsed);
  });

  document.getElementById("btn-smart-commit").addEventListener("click", () => {
    const rows = document.querySelectorAll("#smart-import-rows .material-edit-row");
    let added = 0;
    rows.forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      if (!checkbox.checked) return;
      const get = (field) => row.querySelector(`[data-field="${field}"]`).value.trim();
      const name = get("name");
      if (!name) return;
      const team = resolveTeamByName(get("mannschaft"));
      appData.materials.push({
        id: uuid(),
        name,
        kategorie: get("kategorie"),
        mannschaft: team ? team.name : "",
        menge: get("menge"),
        einheit: get("einheit"),
        standort: get("standort"),
        trainer: "",
        zustand: get("zustand")
      });
      added++;
    });
    if (added > 0) {
      persist();
      renderListe();
      renderMannschaftCheckboxes();
    }
    document.getElementById("smart-import-input").value = "";
    document.getElementById("smart-import-preview").style.display = "none";
    document.getElementById("smart-import-rows").innerHTML = "";
    document.getElementById("smart-import-unrecognized").textContent = "";
  });
}

// ---------- Daten-Sicherung (JSON) ----------

function setupBackupButtons() {
  document.getElementById("btn-export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "materialdaten-backup-" + todayStr() + ".json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    document.getElementById("import-file-input").click();
  });

  document.getElementById("import-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data.materials)) {
        alert("Ungültiges Datenformat.");
        return;
      }
      if (!confirm("Aktuelle Daten durch die importierte Datei ersetzen?")) return;
      appData = data;
      migrateData(appData);
      persist();
      renderAll();
    } catch (err) {
      alert("Datei konnte nicht gelesen werden.");
    }
    e.target.value = "";
  });
}

// ---------- Excel-Import ----------

const KNOWN_HEADER_KEYS = ["name", "kategorie", "menge", "einheit", "standort", "zustand"];

function normalizeHeaderKey(key) {
  return String(key).trim().toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
}

function looksLikeHeaderRow(row) {
  return row.some((cell) => KNOWN_HEADER_KEYS.includes(normalizeHeaderKey(cell)));
}

function importMaterialsFromRows(rows) {
  let added = 0;
  let skipped = 0;
  rows.forEach((row, idx) => {
    if (idx === 0 && looksLikeHeaderRow(row)) return;
    const name = String(row[0] ?? "").trim();
    if (!name) {
      if (row.some((c) => String(c ?? "").trim())) skipped++;
      return;
    }
    appData.materials.push({
      id: uuid(),
      name,
      kategorie: String(row[1] ?? "").trim(),
      menge: String(row[2] ?? "").trim(),
      einheit: String(row[3] ?? "").trim(),
      standort: String(row[4] ?? "").trim(),
      zustand: String(row[5] ?? "").trim()
    });
    added++;
  });
  return { added, skipped };
}

function setupExcelImport() {
  document.getElementById("btn-import-excel").addEventListener("click", () => {
    document.getElementById("import-excel-input").click();
  });

  document.getElementById("import-excel-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const statusEl = document.getElementById("settings-excel-import-status");
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const { added, skipped } = importMaterialsFromRows(rows);
      migrateData(appData);
      persist();
      renderListe();
      if (statusEl) {
        statusEl.textContent = `${added} Material-Einträge importiert.` + (skipped ? ` ${skipped} Zeile(n) übersprungen (Name fehlt).` : "");
      }
    } catch (err) {
      console.error(err);
      if (statusEl) statusEl.textContent = "Excel-Datei konnte nicht gelesen werden.";
      else alert("Excel-Datei konnte nicht gelesen werden.");
    }
    e.target.value = "";
  });
}

// ---------- Inventur ----------

function inventurZielLabel(ziel) {
  return ziel === RESERVE_KEY ? "Reserve" : ziel;
}

function populateInventurZielSelect() {
  const select = document.getElementById("inventur-ziel-select");
  const prev = select.value;
  const teams = appData.teams.slice().sort((a, b) => compareTeamNames(a.name, b.name));
  const options = teams.map((t) => ({ value: t.name, label: t.name })).concat([{ value: RESERVE_KEY, label: "Reserve" }]);
  select.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join("");
  if (options.some((o) => o.value === prev)) select.value = prev;
}

function startInventur(ziel) {
  const sourceList = ziel === RESERVE_KEY ? appData.reserve : appData.materials.filter((m) => m.mannschaft === ziel);
  inventurAktiv = {
    id: uuid(),
    datum: todayStr(),
    ziel,
    positionen: sourceList.map((m) => ({
      materialId: m.id, name: m.name, kategorie: m.kategorie, satzLabel: m.satzLabel,
      soll: m.menge, ist: m.menge, uebernommen: false
    }))
  };
  document.getElementById("inventur-erfassung").style.display = "block";
  renderInventurErfassung();
}

function renderInventurErfassung() {
  const wrap = document.getElementById("inventur-erfassung");
  if (!inventurAktiv) {
    wrap.style.display = "none";
    return;
  }
  wrap.style.display = "block";
  const container = document.getElementById("inventur-positionen");
  container.innerHTML = inventurAktiv.positionen.map((p, idx) => {
    const diff = (Number(p.ist) || 0) - (Number(p.soll) || 0);
    return `
      <div class="material-edit-row inventur-row${diff !== 0 ? " diff" : ""}" data-index="${idx}">
        <span>${escapeHtml(p.name)}${p.satzLabel ? ` <span class="muted">(${escapeHtml(p.satzLabel)})</span>` : ""}</span>
        <span>${escapeHtml(p.kategorie)}</span>
        <span>${escapeHtml(p.soll)}</span>
        <input type="number" data-field="ist" value="${escapeHtml(p.ist)}" />
        <span>${diff > 0 ? "+" : ""}${diff}</span>
        <label class="checkbox-label"><input type="checkbox" data-field="uebernommen" ${p.uebernommen ? "checked" : ""} ${diff === 0 ? "disabled" : ""} /></label>
      </div>
    `;
  }).join("");

  container.querySelectorAll('input[data-field="ist"]').forEach((input) => {
    input.addEventListener("change", () => commitInventurIstEdit(input));
  });
  container.querySelectorAll('input[data-field="uebernommen"]').forEach((input) => {
    input.addEventListener("change", () => {
      const idx = Number(input.closest(".inventur-row").dataset.index);
      inventurAktiv.positionen[idx].uebernommen = input.checked;
    });
  });
}

function commitInventurIstEdit(input) {
  const idx = Number(input.closest(".inventur-row").dataset.index);
  inventurAktiv.positionen[idx].ist = input.value;
  inventurAktiv.positionen[idx].uebernommen = false;
  renderInventurErfassung();
}

function finalizeInventur() {
  if (!inventurAktiv) return;
  if (!confirm("Inventur abschließen und als Stichtag speichern? Übernommene Abweichungen korrigieren den aktuellen Bestand.")) return;
  const sourceList = inventurAktiv.ziel === RESERVE_KEY ? appData.reserve : appData.materials;
  inventurAktiv.positionen.forEach((p) => {
    if (p.uebernommen) {
      const m = sourceList.find((x) => x.id === p.materialId);
      if (m) m.menge = p.ist;
    }
  });
  appData.inventuren.push(inventurAktiv);
  inventurAktiv = null;
  persist();
  document.getElementById("inventur-erfassung").style.display = "none";
  renderListe();
  renderReserve();
  renderInventurHistorie();
  populateVergleichSelects();
}

function renderInventurHistorie() {
  const empty = document.getElementById("inventur-historie-empty");
  const container = document.getElementById("inventur-historie-list");
  const list = appData.inventuren.slice().sort((a, b) => b.datum.localeCompare(a.datum));
  empty.style.display = list.length === 0 ? "block" : "none";
  container.innerHTML = list.map((inv) => `
    <details class="satz-group">
      <summary>${escapeHtml(inv.datum)} – ${escapeHtml(inventurZielLabel(inv.ziel))} <span class="muted">(${inv.positionen.length} Position(en))</span></summary>
      <div class="material-edit-row material-edit-header inventur-row">
        <span>Name</span><span>Kategorie</span><span>Soll</span><span>Ist</span><span>Diff.</span><span>Übernommen</span>
      </div>
      <div class="player-grid">
        ${inv.positionen.map((p) => {
          const diff = (Number(p.ist) || 0) - (Number(p.soll) || 0);
          return `
            <div class="material-edit-row inventur-row${diff !== 0 ? " diff" : ""}">
              <span>${escapeHtml(p.name)}</span><span>${escapeHtml(p.kategorie)}</span><span>${escapeHtml(p.soll)}</span><span>${escapeHtml(p.ist)}</span><span>${diff > 0 ? "+" : ""}${diff}</span><span>${p.uebernommen ? "Ja" : "Nein"}</span>
            </div>
          `;
        }).join("")}
      </div>
    </details>
  `).join("");
}

function setupInventurForm() {
  document.getElementById("btn-inventur-start").addEventListener("click", () => {
    const ziel = document.getElementById("inventur-ziel-select").value;
    if (!ziel) {
      alert("Bitte eine Mannschaft oder Reserve wählen.");
      return;
    }
    const sourceList = ziel === RESERVE_KEY ? appData.reserve : appData.materials.filter((m) => m.mannschaft === ziel);
    if (sourceList.length === 0) {
      alert("Keine Material-Positionen für diese Auswahl vorhanden.");
      return;
    }
    startInventur(ziel);
  });
  document.getElementById("btn-inventur-abschliessen").addEventListener("click", finalizeInventur);
  document.getElementById("btn-inventur-abbrechen").addEventListener("click", () => {
    if (!confirm("Laufende Inventur verwerfen?")) return;
    inventurAktiv = null;
    document.getElementById("inventur-erfassung").style.display = "none";
  });
}

// ---------- Vergleich ----------

function populateVergleichSelects() {
  const zielSelect = document.getElementById("vergleich-ziel-select");
  const prevZiel = zielSelect.value;
  const ziele = [...new Set(appData.inventuren.map((i) => i.ziel))].sort((a, b) => inventurZielLabel(a).localeCompare(inventurZielLabel(b), "de"));
  zielSelect.innerHTML = ziele.map((z) => `<option value="${escapeHtml(z)}">${escapeHtml(inventurZielLabel(z))}</option>`).join("");
  if (ziele.includes(prevZiel)) zielSelect.value = prevZiel;
  populateVergleichDatumSelects();
}

function populateVergleichDatumSelects() {
  const ziel = document.getElementById("vergleich-ziel-select").value;
  const datumASelect = document.getElementById("vergleich-datum-a");
  const datumBSelect = document.getElementById("vergleich-datum-b");
  const snapshots = appData.inventuren.filter((i) => i.ziel === ziel).slice().sort((a, b) => a.datum.localeCompare(b.datum));
  // Mehrere Inventuren am selben Tag wären sonst im Dropdown nicht unterscheidbar – mit Zähler ergänzen.
  const dateTotals = {};
  snapshots.forEach((s) => { dateTotals[s.datum] = (dateTotals[s.datum] || 0) + 1; });
  const dateSeen = {};
  const optsHtml = snapshots.map((s) => {
    let label = escapeHtml(s.datum);
    if (dateTotals[s.datum] > 1) {
      dateSeen[s.datum] = (dateSeen[s.datum] || 0) + 1;
      label += ` (${dateSeen[s.datum]})`;
    }
    return `<option value="${s.id}">${label}</option>`;
  }).join("");
  datumASelect.innerHTML = optsHtml;
  datumBSelect.innerHTML = optsHtml;
  if (snapshots.length >= 2) {
    datumASelect.value = snapshots[0].id;
    datumBSelect.value = snapshots[snapshots.length - 1].id;
  }
  renderVergleich();
}

function renderVergleich() {
  const idA = document.getElementById("vergleich-datum-a").value;
  const idB = document.getElementById("vergleich-datum-b").value;
  const empty = document.getElementById("vergleich-empty");
  const result = document.getElementById("vergleich-result");
  const snapA = appData.inventuren.find((i) => i.id === idA);
  const snapB = appData.inventuren.find((i) => i.id === idB);
  if (!snapA || !snapB || idA === idB) {
    empty.style.display = "block";
    result.innerHTML = "";
    return;
  }
  empty.style.display = "none";

  const keyOf = (p) => (p.name || "").toLowerCase() + "|" + (p.kategorie || "").toLowerCase();
  // Gleiche Position (Name+Kategorie) kann mehrfach vorkommen (z.B. gleicher Artikel
  // in unterschiedlichem Zustand). Mengen aufsummieren statt Einträge zu überschreiben.
  function aggregate(positionen) {
    const map = new Map();
    positionen.forEach((p) => {
      const key = keyOf(p);
      const ist = Number(p.ist) || 0;
      if (map.has(key)) {
        map.get(key).ist += ist;
      } else {
        map.set(key, { name: p.name, kategorie: p.kategorie, ist });
      }
    });
    return map;
  }
  const mapA = aggregate(snapA.positionen);
  const mapB = aggregate(snapB.positionen);
  const statusLabels = { neu: "Neu", entfallen: "Entfallen", unveraendert: "Unverändert", geaendert: "Geändert" };

  const rows = [...new Set([...mapA.keys(), ...mapB.keys()])].map((key) => {
    const a = mapA.get(key);
    const b = mapB.get(key);
    const istA = a ? a.ist : null;
    const istB = b ? b.ist : null;
    let status, diff;
    if (a && !b) { status = "entfallen"; diff = -istA; }
    else if (!a && b) { status = "neu"; diff = istB; }
    else { diff = istB - istA; status = diff === 0 ? "unveraendert" : "geaendert"; }
    return { name: (a || b).name, kategorie: (a || b).kategorie, istA, istB, diff, status };
  }).sort((x, y) => x.name.localeCompare(y.name, "de"));

  result.innerHTML = `
    <div class="diff-table">
      <div class="diff-row diff-header"><span>Name</span><span>Kategorie</span><span>Stichtag A</span><span>Stichtag B</span><span>Differenz</span><span>Status</span></div>
      ${rows.map((r) => `
        <div class="diff-row ${r.status === "neu" ? "added" : r.status === "entfallen" ? "removed" : r.status === "geaendert" ? "changed" : ""}">
          <span>${escapeHtml(r.name)}</span>
          <span>${escapeHtml(r.kategorie)}</span>
          <span>${r.istA === null ? "—" : r.istA}</span>
          <span>${r.istB === null ? "—" : r.istB}</span>
          <span>${r.diff > 0 ? "+" : ""}${r.diff}</span>
          <span>${statusLabels[r.status]}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function setupVergleichForm() {
  document.getElementById("vergleich-ziel-select").addEventListener("change", populateVergleichDatumSelects);
  document.getElementById("vergleich-datum-a").addEventListener("change", renderVergleich);
  document.getElementById("vergleich-datum-b").addEventListener("change", renderVergleich);
}

// ---------- Automatisches Backup ----------

function setupBackupFolder() {
  document.getElementById("btn-choose-backup-folder").addEventListener("click", async () => {
    try {
      const dir = await window.showDirectoryPicker();
      if (!(await verifyPermission(dir, true))) {
        alert("Zugriff auf den Ordner wurde nicht erlaubt.");
        return;
      }
      backupDirHandle = dir;
      await FileStore.setBackupDirHandle(dir);
      updateBackupFolderStatus();
      await runAutoBackup(true);
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
    }
  });

  document.getElementById("btn-backup-now").addEventListener("click", async () => {
    if (!backupDirHandle) {
      alert("Bitte zuerst einen Backup-Ordner wählen.");
      return;
    }
    await runAutoBackup(true);
  });
}

function updateBackupFolderStatus() {
  const nameEl = document.getElementById("settings-backup-folder-name");
  if (nameEl) nameEl.textContent = backupDirHandle ? backupDirHandle.name : "— kein Ordner gewählt —";
}

async function runAutoBackup(withPrompt) {
  const statusEl = document.getElementById("settings-backup-status");
  if (!backupDirHandle) return;
  try {
    const granted = withPrompt ? await verifyPermission(backupDirHandle, true) : await verifyPermissionSilent(backupDirHandle);
    if (!granted) {
      if (statusEl) statusEl.textContent = "Automatisches Backup nicht möglich – Zugriff auf den Backup-Ordner fehlt. Bitte Ordner erneut wählen.";
      return;
    }
    const fileName = `materialdaten-backup-${todayStr()}.json`;
    const backupFileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
    await writeDataFile(backupFileHandle, appData);
    if (statusEl) {
      const time = new Date().toLocaleTimeString("de-DE");
      statusEl.textContent = `Letztes automatisches Backup: ${fileName} (${time} Uhr)`;
    }
  } catch (e) {
    console.error(e);
    if (statusEl) statusEl.textContent = "Backup fehlgeschlagen: " + e.message;
  }
}

async function tryAutoBackupOnStart() {
  if (autoBackupDoneThisSession) return;
  autoBackupDoneThisSession = true;
  const dir = await FileStore.getBackupDirHandle();
  if (!dir) return;
  backupDirHandle = dir;
  updateBackupFolderStatus();
  await runAutoBackup(false);
}

// ---------- Start ----------

window.addEventListener("DOMContentLoaded", () => {
  setupNav();
  setupListeFilters();
  setupDeleteAllButton();
  setupTeamForm();
  setupMaterialForm();
  setupSmartImport();
  setupBackupButtons();
  setupBackupFolder();
  setupExcelImport();
  setupReserveForm();
  setupUmbuchungForm();
  setupInventurForm();
  setupVergleichForm();
  init();
});
