const { contextBridge, ipcRenderer } = require('electron');

const decode = (value) => Uint8Array.from(Buffer.from(value, 'base64'));
function fileHandle(path, name) {
  return {
    kind: 'file', name,
    async getFile() { const data = await ipcRenderer.invoke('director:fs', { kind: 'read-file', path }); const bytes = decode(data); return new File([bytes], name); },
    async createWritable() { let chunks = []; return { write(value) { chunks.push(typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)); }, async close() { const size = chunks.reduce((n, item) => n + item.length, 0); const bytes = new Uint8Array(size); let offset = 0; for (const item of chunks) { bytes.set(item, offset); offset += item.length; } await ipcRenderer.invoke('director:fs', { kind: 'write-file', path, data: Buffer.from(bytes).toString('base64') }); } }; },
  };
}
function directoryHandle(path, name = path.split(/[\\/]/).pop()) {
  return {
    kind: 'directory', name,
    async getDirectoryHandle(child, options = {}) { const childPath = `${path}/${child}`; if (options.create) await ipcRenderer.invoke('director:fs', { kind: 'mkdir', path: childPath }); else if (!(await ipcRenderer.invoke('director:fs', { kind: 'exists', path: childPath, directory: true }))) throw new DOMException('Directory not found', 'NotFoundError'); return directoryHandle(childPath, child); },
    async getFileHandle(child, options = {}) { const childPath = `${path}/${child}`; if (options.create) await ipcRenderer.invoke('director:fs', { kind: 'write-file', path: childPath, data: '' }); else if (!(await ipcRenderer.invoke('director:fs', { kind: 'exists', path: childPath, directory: false }))) throw new DOMException('File not found', 'NotFoundError'); return fileHandle(childPath, child); },
    async *entries() { for (const entry of await ipcRenderer.invoke('director:fs', { kind: 'list', path })) yield [entry.name, entry.kind === 'directory' ? directoryHandle(`${path}/${entry.name}`, entry.name) : fileHandle(`${path}/${entry.name}`, entry.name)]; },
    async removeEntry(child, options = {}) { await ipcRenderer.invoke('director:fs', { kind: 'remove', path: `${path}/${child}` }); },
    async isSameEntry(other) { return path.toLowerCase() === other.__path?.toLowerCase(); },
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    __path: path,
  };
}
contextBridge.exposeInMainWorld('electronDirector', {
  async pickDirectory() { const path = await ipcRenderer.invoke('director:pick-directory'); return path ? { ...directoryHandle(path), async createProject(projectName, projectId) { const createdPath = await ipcRenderer.invoke('director:create-project', { parentPath: path, projectName, projectId }); return directoryHandle(createdPath, projectName); } } : null; },
  async promptProjectName() { return ipcRenderer.invoke('director:prompt-project-name'); },
  async windowControl(action) { return ipcRenderer.invoke('director:window-control', action); },
  async isMaximized() { return ipcRenderer.invoke('director:window-control', 'is-maximized'); },
  onWindowStateChange(callback) { const listener = (_event, maximized) => callback(Boolean(maximized)); ipcRenderer.on('director:window-state', listener); return () => ipcRenderer.removeListener('director:window-state', listener); },
});
contextBridge.exposeInMainWorld('electronDirectorSubmit', (name) => ipcRenderer.send('director:prompt-project-name-result', name));
