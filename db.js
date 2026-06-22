// Kleine IndexedDB-Hilfe, um das FileSystemFileHandle der Datendatei
// zwischen Sitzungen zu merken (damit nicht jedes Mal neu ausgewählt werden muss).
const FileStore = (() => {
  const DB_NAME = "materialtool-db";
  const STORE = "handles";
  const KEY_DATA = "dataFileHandle";
  const KEY_BACKUP_DIR = "backupDirHandle";
  const KEY_STORAGE_MODE = "storageMode";
  const KEY_WEBDAV_CONFIG = "webdavConfig";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getValue(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function setValue(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function clearValue(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    getHandle: () => getValue(KEY_DATA),
    setHandle: (handle) => setValue(KEY_DATA, handle),
    clearHandle: () => clearValue(KEY_DATA),
    getBackupDirHandle: () => getValue(KEY_BACKUP_DIR),
    setBackupDirHandle: (handle) => setValue(KEY_BACKUP_DIR, handle),
    clearBackupDirHandle: () => clearValue(KEY_BACKUP_DIR),
    getStorageMode: () => getValue(KEY_STORAGE_MODE),
    setStorageMode: (mode) => setValue(KEY_STORAGE_MODE, mode),
    getWebdavConfig: () => getValue(KEY_WEBDAV_CONFIG),
    setWebdavConfig: (config) => setValue(KEY_WEBDAV_CONFIG, config),
    clearWebdavConfig: () => clearValue(KEY_WEBDAV_CONFIG)
  };
})();

async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) options.mode = "readwrite";
  if ((await fileHandle.queryPermission(options)) === "granted") return true;
  if ((await fileHandle.requestPermission(options)) === "granted") return true;
  return false;
}

async function readDataFile(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function writeDataFile(fileHandle, dataObj) {
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(dataObj, null, 2));
  await writable.close();
}

function fsApiSupported() {
  return typeof window.showOpenFilePicker === "function" && typeof window.showSaveFilePicker === "function";
}

function davAuthHeader(config) {
  return "Basic " + btoa(unescape(encodeURIComponent(config.username + ":" + config.password)));
}

function davRequestUrl(config) {
  if (config.proxyUrl) {
    return config.proxyUrl.replace(/\/$/, "") + "/?url=" + encodeURIComponent(config.url);
  }
  return config.url;
}

async function davReadFile(config) {
  const resp = await fetch(davRequestUrl(config), {
    method: "GET",
    headers: { Authorization: davAuthHeader(config) }
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`WebDAV-Lesefehler (HTTP ${resp.status})`);
  const text = await resp.text();
  if (!text.trim()) return null;
  return JSON.parse(text);
}

async function davWriteFile(config, dataObj) {
  const resp = await fetch(davRequestUrl(config), {
    method: "PUT",
    headers: {
      Authorization: davAuthHeader(config),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(dataObj, null, 2)
  });
  if (!resp.ok) throw new Error(`WebDAV-Schreibfehler (HTTP ${resp.status})`);
}
