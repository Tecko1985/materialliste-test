let appData = { materials: [], teams: [] };
let fileHandle = null;
let pendingHandle = null;
let backupDirHandle = null;
let storageMode = "fs"; // "fs" | "webdav"
let webdavConfig = null;
let autoBackupDoneThisSession = false;
let saveTimer = null;

let listeSearchQuery = "";
let listeKategorieFilter = "";
let listeStandortFilter = "";
let listeMannschaftFilter = "";
let listeSortOrder = "name-asc";

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function migrateData(data) {
  if (!Array.isArray(data.materials)) data.materials = [];
  if (!Array.isArray(data.teams)) data.teams = [];
  data.materials.forEach((m) => {
    if (m.id === undefined) m.id = uuid();
    if (m.name === undefined) m.name = "";
    if (m.kategorie === undefined) m.kategorie = "";
    if (m.mannschaft === undefined) m.mannschaft = "";
    if (m.menge === undefined) m.menge = "";
    if (m.einheit === undefined) m.einheit = "";
    if (m.standort === undefined) m.standort = "";
    if (m.zustand === undefined) m.zustand = "";
    if (m.satzId === undefined) m.satzId = "";
    if (m.satzLabel === undefined) m.satzLabel = "";
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
  document.getElementById("webdav-connect-form").addEventListener("submit", handleWebdavConnectSubmit);
  document.getElementById("btn-webdav-disconnect").addEventListener("click", disconnectWebdav);

  if (!fsApiSupported()) {
    document.getElementById("fs-api-warning").style.display = "block";
  }

  const mode = await FileStore.getStorageMode();
  if (mode === "webdav") {
    const config = await FileStore.getWebdavConfig();
    if (config) {
      try {
        const data = await davReadFile(config);
        storageMode = "webdav";
        webdavConfig = config;
        appData = data && Array.isArray(data.materials) ? data : { materials: [], teams: [] };
        migrateData(appData);
        startApp();
        return;
      } catch (e) {
        console.error("WebDAV-Verbindung fehlgeschlagen", e);
        document.getElementById("webdav-url").value = config.url;
        document.getElementById("webdav-username").value = config.username;
        document.getElementById("webdav-proxy-url").value = config.proxyUrl || "";
        showWebdavError("Verbindung zu Nextcloud fehlgeschlagen: " + e.message + ". Bitte Zugangsdaten prüfen und erneut verbinden.");
        showConnectScreen(false);
        return;
      }
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

async function handleWebdavConnectSubmit(e) {
  e.preventDefault();
  const url = document.getElementById("webdav-url").value.trim();
  const username = document.getElementById("webdav-username").value.trim();
  const password = document.getElementById("webdav-password").value;
  const proxyUrl = document.getElementById("webdav-proxy-url").value.trim();
  if (!url || !username || !password) return;
  await connectWebdav({ url, username, password, proxyUrl });
}

async function connectWebdav(config) {
  showWebdavError("");
  setWebdavConnecting(true);
  try {
    let data = await davReadFile(config);
    if (data === null) {
      const empty = { materials: [], teams: [] };
      await davWriteFile(config, empty);
      data = empty;
    }
    appData = Array.isArray(data.materials) ? data : { materials: [], teams: [] };
    migrateData(appData);
    storageMode = "webdav";
    webdavConfig = config;
    await FileStore.setStorageMode("webdav");
    await FileStore.setWebdavConfig(config);
    startApp();
  } catch (e) {
    console.error(e);
    showWebdavError(
      "Verbindung fehlgeschlagen: " + e.message + ". Prüfe URL, Benutzername, App-Passwort und ob der Nextcloud-Server CORS-Zugriffe von dieser Seite erlaubt."
    );
  } finally {
    setWebdavConnecting(false);
  }
}

function setWebdavConnecting(isConnecting) {
  const btn = document.getElementById("btn-webdav-connect");
  if (!btn) return;
  btn.disabled = isConnecting;
  btn.textContent = isConnecting ? "Verbinde…" : "Mit Nextcloud verbinden";
}

function showWebdavError(text) {
  const el = document.getElementById("webdav-error");
  if (!el) return;
  el.textContent = text;
  el.style.display = text ? "block" : "none";
}

async function disconnectWebdav() {
  if (!confirm("Nextcloud-Verbindung trennen? Danach musst du erneut Zugangsdaten eingeben oder eine lokale Datei wählen.")) return;
  await FileStore.setStorageMode("fs");
  await FileStore.clearWebdavConfig();
  location.reload();
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
  const fileLabel = storageMode === "webdav" ? "Nextcloud" : fileHandle ? fileHandle.name : "Datei";
  status.querySelector(".label").textContent = "Verbunden: " + fileLabel;
  const settingsFileName = document.getElementById("settings-file-name");
  if (settingsFileName) settingsFileName.textContent = fileLabel;
  setSaveStatus("Autospeichern aktiv · Autoladen beim nächsten Öffnen aktiv");
  const fsActions = document.getElementById("settings-fs-actions");
  const webdavActions = document.getElementById("settings-webdav-actions");
  if (fsActions) fsActions.style.display = storageMode === "webdav" ? "none" : "flex";
  if (webdavActions) webdavActions.style.display = storageMode === "webdav" ? "flex" : "none";
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
      if (storageMode === "webdav") {
        if (!webdavConfig) return;
        await davWriteFile(webdavConfig, appData);
      } else {
        if (!fileHandle) return;
        await writeDataFile(fileHandle, appData);
      }
      const time = new Date().toLocaleTimeString("de-DE");
      setSaveStatus(`Zuletzt automatisch gespeichert um ${time} · Autoladen beim nächsten Öffnen aktiv`);
    } catch (e) {
      console.error("Speichern fehlgeschlagen", e);
      setSaveStatus("Speichern fehlgeschlagen — siehe Konsole.");
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
  const standortSelect = document.getElementById("liste-standort-filter");
  const mannschaftSelect = document.getElementById("liste-mannschaft-filter");
  const prevKategorie = kategorieSelect.value;
  const prevStandort = standortSelect.value;
  const prevMannschaft = mannschaftSelect.value;
  kategorieSelect.innerHTML = '<option value="">Alle Kategorien</option>' +
    uniqueValues("kategorie").map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`).join("");
  standortSelect.innerHTML = '<option value="">Alle Standorte</option>' +
    uniqueValues("standort").map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  mannschaftSelect.innerHTML = '<option value="">Alle Mannschaften</option>' +
    uniqueValues("mannschaft").map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  kategorieSelect.value = prevKategorie;
  standortSelect.value = prevStandort;
  mannschaftSelect.value = prevMannschaft;

  const jumpSelect = document.getElementById("liste-jump-select");
  jumpSelect.innerHTML = '<option value="">Wählen…</option>' +
    appData.teams.slice().sort((a, b) => compareTeamNames(a.name, b.name))
      .map((t) => `<option value="${escapeHtml(t.name)}">${escapeHtml(t.name)}</option>`).join("");
}

function filteredSortedMaterials() {
  let list = appData.materials.slice();
  if (listeSearchQuery) {
    const q = listeSearchQuery.toLowerCase();
    list = list.filter((m) => (m.name || "").toLowerCase().includes(q));
  }
  if (listeKategorieFilter) list = list.filter((m) => m.kategorie === listeKategorieFilter);
  if (listeStandortFilter) list = list.filter((m) => m.standort === listeStandortFilter);
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
  document.getElementById("liste-standort-filter").addEventListener("change", (e) => {
    listeStandortFilter = e.target.value;
    renderListe();
  });
  document.getElementById("liste-mannschaft-filter").addEventListener("change", (e) => {
    listeMannschaftFilter = e.target.value;
    renderListe();
  });
  document.getElementById("liste-jump-select").addEventListener("change", (e) => {
    const name = e.target.value;
    if (!name) return;
    const target = document.querySelector(`.material-group[data-mannschaft="${CSS.escape(name)}"]`);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    e.target.value = "";
  });
  document.getElementById("liste-sort-select").addEventListener("change", (e) => {
    listeSortOrder = e.target.value;
    renderListe();
  });
}

function materialRowHtml(m) {
  return `
    <div class="material-edit-row" data-id="${m.id}">
      <input type="text" data-field="name" value="${escapeHtml(m.name)}" />
      <input type="text" data-field="kategorie" value="${escapeHtml(m.kategorie)}" />
      <select data-field="mannschaft">${teamOptionsHtml(m.mannschaft)}</select>
      <input type="number" data-field="menge" value="${escapeHtml(m.menge)}" />
      <input type="text" data-field="zustand" value="${escapeHtml(m.zustand)}" />
      <div class="row-actions">
        <button class="btn danger small" data-action="delete">Löschen</button>
      </div>
    </div>
  `;
}

function satzRowHtml(satz) {
  return `
    <details class="satz-group">
      <summary>🎽 ${escapeHtml(satz.label || "Trikotsatz")} <span class="muted">(Satz · ${satz.items.length} Teile)</span></summary>
      <div class="material-edit-row material-edit-header">
        <span>Name</span><span>Kategorie</span><span>Mannschaft</span><span>Menge</span><span>Zustand</span><span></span>
      </div>
      <div class="player-grid">${satz.items.map(materialRowHtml).join("")}</div>
    </details>
  `;
}

function renderListe() {
  populateListeFilters();
  const list = filteredSortedMaterials();
  const container = document.getElementById("liste-groups");
  const empty = document.getElementById("liste-empty");
  empty.style.display = appData.materials.length === 0 ? "block" : "none";

  const groups = groupByMannschaft(list);
  container.innerHTML = groups.map((g) => `
    <div class="material-group" data-mannschaft="${escapeHtml(g.mannschaft)}">
      <div class="material-group-title">${escapeHtml(g.mannschaft || "Ohne Mannschaft")} (${g.items.length})</div>
      <div class="material-edit-row material-edit-header">
        <span>Name</span><span>Kategorie</span><span>Mannschaft</span><span>Menge</span><span>Zustand</span><span></span>
      </div>
      <div class="player-grid">${buildRenderGroups(g.items).map((rg) => rg.type === "satz" ? satzRowHtml(rg) : materialRowHtml(rg.material)).join("")}</div>
    </div>
  `).join("");

  container.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("change", () => commitMaterialEdit(input));
  });
  container.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".material-edit-row").dataset.id;
      deleteMaterial(id);
    });
  });
}

function commitMaterialEdit(input) {
  const row = input.closest(".material-edit-row");
  const id = row.dataset.id;
  const material = appData.materials.find((m) => m.id === id);
  if (!material) return;
  const field = input.dataset.field;
  material[field] = field === "menge" ? input.value : input.value.trim();
  persist();
  populateListeFilters();
}

function deleteMaterial(id) {
  if (!confirm("Diesen Eintrag wirklich löschen?")) return;
  appData.materials = appData.materials.filter((m) => m.id !== id);
  persist();
  renderListe();
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

function updateHosenNummernVisibility() {
  const hatNummern = document.getElementById("chk-hosen-nummern").checked;
  document.getElementById("mt-hosen-field").style.display = hatNummern ? "none" : "";
  document.getElementById("hosen-nummern-wrap").style.display = hatNummern ? "block" : "none";
}

function updateMaterialTypeVisibility() {
  const chkTrikot = document.getElementById("chk-trikotsatz");
  const chkBaelle = document.getElementById("chk-baelle");
  const chkLeibchen = document.getElementById("chk-leibchen");
  const trikot = chkTrikot.checked;

  document.getElementById("mtype-baelle-label").style.display = trikot ? "none" : "";
  document.getElementById("mtype-leibchen-label").style.display = trikot ? "none" : "";
  if (trikot) {
    chkBaelle.checked = false;
    chkLeibchen.checked = false;
  }

  document.getElementById("mform-trikotsatz").style.display = trikot ? "block" : "none";
  document.getElementById("mform-baelle").style.display = !trikot && chkBaelle.checked ? "grid" : "none";
  document.getElementById("mform-leibchen").style.display = !trikot && chkLeibchen.checked ? "grid" : "none";
  document.getElementById("mform-generic").style.display = !trikot && !chkBaelle.checked && !chkLeibchen.checked ? "grid" : "none";
}

function setupMaterialTypeToggle() {
  ["chk-trikotsatz", "chk-baelle", "chk-leibchen"].forEach((id) => {
    document.getElementById(id).addEventListener("change", updateMaterialTypeVisibility);
  });
  updateMaterialTypeVisibility();
  document.getElementById("chk-hosen-nummern").addEventListener("change", updateHosenNummernVisibility);
  updateHosenNummernVisibility();
}

function setupMaterialForm() {
  buildTrikotNumberGrid();
  setupMaterialTypeToggle();

  document.getElementById("material-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const trikot = document.getElementById("chk-trikotsatz").checked;
    const baelle = document.getElementById("chk-baelle").checked;
    const leibchen = document.getElementById("chk-leibchen").checked;
    const mannschaftSelected = getSelectedMannschaft();
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
            zustand: [zustand, "Nr. " + hosenNumbers.join(", ")].filter(Boolean).join(" / ")
          });
        }
      } else if (hosen && Number(hosen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Hose", bezeichnung].filter(Boolean).join(" "), kategorie: "Hose",
          mannschaft, menge: hosen, einheit: "Stk", standort, zustand
        });
      }
      if (stutzen && Number(stutzen) > 0) {
        satzEntries.push({
          id: uuid(), name: ["Stutzen", bezeichnung].filter(Boolean).join(" "), kategorie: "Stutzen",
          mannschaft, menge: stutzen, einheit: "Stk", standort, zustand
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
        zustand: document.getElementById("ml-zustand").value.trim()
      });
      addedAny = true;
    } else {
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
        zustand: document.getElementById("m-zustand").value.trim()
      });
      addedAny = true;
    }

    if (!addedAny) return;

    persist();
    renderListe();
    e.target.reset();
    document.querySelectorAll("#trikot-number-grid label.checked, #hosen-number-grid label.checked, #mannschaft-checkbox-grid label.checked").forEach((l) => l.classList.remove("checked"));
    updateMaterialTypeVisibility();
    updateHosenNummernVisibility();
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
  init();
});
