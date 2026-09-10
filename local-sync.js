/* Sincronización opcional con una carpeta local elegida por el usuario. */
class LocalFolderWatcher {
  constructor() {
    this.dirHandle = null;
    this.serverMode = false;
    this.fileTimestamps = new Map();
    this.intervalId = null;
    this.isChecking = false;
    this.pollInterval = 2000;
    this.filesToWatch = ['local-cases.js', 'base-cases.js', 'local-users.js', 'cases.json', 'users.json'];
  }

  async connectFolder() {
    // En el servidor local del CRM, la carpeta de trabajo ya es conocida y
    // puede leerse sin abrir un selector nativo que el navegador integrado no expone.
    if (location.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(location.hostname)) {
      try {
        const response = await fetch('/api/local-folder/data', { cache: 'no-store' });
        if (response.ok) return this.connectServerFolder();
      } catch {}
    }
    if (!('showDirectoryPicker' in window)) {
      return this.connectServerFolder();
    }
    try {
      this.dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      if (!(await this.verifyPermission())) throw new Error('Permiso de carpeta no concedido');
      this.fileTimestamps.clear();
      this.updateStatus('syncing', '● Leyendo carpeta...');
      await this.reloadLocalData(true);
      this.updateStatus('online', '● Sincronizado');
      this.startWatching();
      return true;
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('[Watcher] Error al vincular carpeta:', error);
        return this.connectServerFolder();
      }
      return false;
    }
  }

  async connectServerFolder() {
    try {
      const response = await fetch('/api/local-folder/data', { cache: 'no-store' });
      if (!response.ok) throw new Error('El servidor local no autorizó la carpeta');
      this.serverMode = true;
      await this.applyServerData(await response.json(), true);
      this.updateStatus('online', '● Carpeta del CRM vinculada');
      this.startWatching();
      return true;
    } catch (error) {
      console.error('[Watcher] Error vinculando la carpeta del servidor:', error);
      this.updateStatus('offline', '● Error de conexión');
      return false;
    }
  }

  async verifyPermission() {
    if (!this.dirHandle) return false;
    const options = { mode: 'readwrite' };
    if ((await this.dirHandle.queryPermission(options)) === 'granted') return true;
    return (await this.dirHandle.requestPermission(options)) === 'granted';
  }

  startWatching() {
    this.stopWatching();
    this.intervalId = setInterval(() => this.checkForUpdates(), this.pollInterval);
    this.checkForUpdates();
  }

  stopWatching() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  async checkForUpdates() {
    if (this.isChecking) return;
    if (this.serverMode) return this.checkServerForUpdates();
    if (!this.dirHandle) return;
    this.isChecking = true;
    try {
      let hasChanges = false;
      for (const fileName of this.filesToWatch) {
        try {
          const handle = await this.dirHandle.getFileHandle(fileName);
          const file = await handle.getFile();
          const timestamp = `${file.lastModified}:${file.size}`;
          if (this.fileTimestamps.has(fileName) && this.fileTimestamps.get(fileName) !== timestamp) hasChanges = true;
          this.fileTimestamps.set(fileName, timestamp);
        } catch (error) {
          if (error.name !== 'NotFoundError') console.warn(`[Watcher] No se pudo revisar ${fileName}`, error);
        }
      }
      if (hasChanges) {
        this.updateStatus('syncing', '● Sincronizando...');
        await this.reloadLocalData();
        this.updateStatus('online', '● Sincronizado');
      }
    } catch (error) {
      console.error('[Watcher] Error comprobando cambios:', error);
      this.updateStatus('offline', '● Error de lectura');
    } finally {
      this.isChecking = false;
    }
  }

  async checkServerForUpdates() {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      const response = await fetch('/api/local-folder/data', { cache: 'no-store' });
      if (!response.ok) throw new Error('No fue posible consultar la carpeta local');
      const payload = await response.json();
      const changed = payload.files.some(file => this.fileTimestamps.get(file.name) !== `${file.lastModified}:${file.size}`);
      if (changed) {
        this.updateStatus('syncing', '● Sincronizando...');
        await this.applyServerData(payload, false);
        this.updateStatus('online', '● Carpeta del CRM vinculada');
      }
    } catch (error) {
      console.error('[Watcher] Error comprobando la carpeta del servidor:', error);
      this.updateStatus('offline', '● Error de lectura');
    } finally {
      this.isChecking = false;
    }
  }

  async applyServerData(payload, initial = false) {
    const runtime = {};
    for (const file of payload.files) {
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(file.text);
        if (file.name.includes('cases')) runtime.localCases = Array.isArray(parsed) ? parsed : parsed.cases;
        if (file.name.includes('users')) runtime.localPasswords = parsed;
      } else {
        new Function('window', `'use strict';\n${file.text}`)(runtime);
      }
      this.fileTimestamps.set(file.name, `${file.lastModified}:${file.size}`);
    }
    Object.entries(runtime).forEach(([key, value]) => { window[key] = value; });
    window.dispatchEvent(new CustomEvent('crm:data-updated', { detail: { initial, root: payload.root, serverMode: true } }));
  }

  async reloadLocalData(initial = false) {
    const runtime = {};
    let loaded = false;
    for (const fileName of this.filesToWatch) {
      try {
        const file = await (await this.dirHandle.getFileHandle(fileName)).getFile();
        const text = await file.text();
        if (fileName.endsWith('.json')) {
          const parsed = JSON.parse(text);
          if (fileName.includes('cases')) runtime.localCases = Array.isArray(parsed) ? parsed : parsed.cases;
          if (fileName.includes('users')) runtime.localPasswords = parsed;
        } else {
          // Los archivos actuales solo contienen asignaciones a window.*.
          new Function('window', `'use strict';\n${text}`)(runtime);
        }
        loaded = true;
      } catch (error) {
        if (error.name !== 'NotFoundError') console.error(`[Watcher] Error leyendo ${fileName}:`, error);
      }
    }
    if (!loaded) return;
    Object.entries(runtime).forEach(([key, value]) => { window[key] = value; });
    window.dispatchEvent(new CustomEvent('crm:data-updated', { detail: { initial } }));
  }

  async saveToLocalFile(fileName, contentString) {
    if (!this.dirHandle || !(await this.verifyPermission())) return false;
    try {
      const handle = await this.dirHandle.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(contentString);
      await writable.close();
      const file = await handle.getFile();
      this.fileTimestamps.set(fileName, `${file.lastModified}:${file.size}`);
      this.updateStatus('online', '● Guardado en disco');
      return true;
    } catch (error) {
      console.error(`[Watcher] Error guardando ${fileName}:`, error);
      this.updateStatus('offline', '● Error al guardar');
      return false;
    }
  }

  updateStatus(stateClass, labelText) {
    const element = document.getElementById('syncStatus');
    if (element) {
      element.className = `syncBadge ${stateClass}`;
      element.textContent = labelText;
    }
  }
}

window.folderWatcher = new LocalFolderWatcher();
