const { contextBridge, ipcRenderer } = require('electron');

const decode = (value) => Uint8Array.from(Buffer.from(value, 'base64'));
const mimeByExtension = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
};
function fileMime(name) {
  const extension = String(name).toLowerCase().match(/\.[^.]+$/)?.[0];
  return mimeByExtension[extension] || 'application/octet-stream';
}
function validateChildName(child) {
  const value = String(child);
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\'))
    throw new TypeError('Invalid directory entry name');
  return value;
}
function fileHandle(path, name) {
  return {
    kind: 'file', name,
    async getFile() { const data = await ipcRenderer.invoke('director:fs', { kind: 'read-file', path }); const bytes = decode(data); return new File([bytes], name, { type: fileMime(name) }); },
    async createWritable() {
      let chunks = [];
      let aborted = false;
      let closed = false;
      return {
        async write(value) {
          if (aborted || closed) throw new Error('Writable stream is no longer available');
          if (value instanceof Blob) chunks.push(new Uint8Array(await value.arrayBuffer()));
          else if (value instanceof ArrayBuffer) chunks.push(new Uint8Array(value));
          else if (ArrayBuffer.isView(value)) chunks.push(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
          else if (typeof value === 'string') chunks.push(new TextEncoder().encode(value));
          else throw new TypeError('Unsupported writable value');
        },
        async abort() { chunks = []; aborted = true; },
        async close() {
          if (aborted || closed) throw new Error('Writable stream is no longer available');
          const size = chunks.reduce((total, item) => total + item.byteLength, 0);
          const bytes = new Uint8Array(size);
          let offset = 0;
          for (const item of chunks) { bytes.set(item, offset); offset += item.byteLength; }
          await ipcRenderer.invoke('director:fs', { kind: 'write-file', path, data: Buffer.from(bytes).toString('base64') });
          closed = true;
        },
      };
    },
    __path: path, projectPath: path,
  };
}
function directoryHandle(path, name = path.split(/[\\/]/).pop()) {
  return {
    kind: 'directory', name,
    async getDirectoryHandle(child, options = {}) { const safeChild = validateChildName(child); const childPath = `${path}/${safeChild}`; if (options.create) await ipcRenderer.invoke('director:fs', { kind: 'mkdir', path: childPath }); else if (!(await ipcRenderer.invoke('director:fs', { kind: 'exists', path: childPath, directory: true }))) throw new DOMException('Directory not found', 'NotFoundError'); return directoryHandle(childPath, safeChild); },
    async getFileHandle(child, options = {}) { const safeChild = validateChildName(child); const childPath = `${path}/${safeChild}`; if (options.create) await ipcRenderer.invoke('director:fs', { kind: 'write-file', path: childPath, data: '' }); else if (!(await ipcRenderer.invoke('director:fs', { kind: 'exists', path: childPath, directory: false }))) throw new DOMException('File not found', 'NotFoundError'); return fileHandle(childPath, safeChild); },
    async *entries() { for (const entry of await ipcRenderer.invoke('director:fs', { kind: 'list', path })) yield [entry.name, entry.kind === 'directory' ? directoryHandle(`${path}/${entry.name}`, entry.name) : fileHandle(`${path}/${entry.name}`, entry.name)]; },
    async removeEntry(child, _options = {}) { const safeChild = validateChildName(child); await ipcRenderer.invoke('director:fs', { kind: 'remove', path: `${path}/${safeChild}` }); },
    async isSameEntry(other) { return path.toLowerCase() === (other?.__path || other?.projectPath)?.toLowerCase(); },
    queryPermission: async () => 'granted', requestPermission: async () => 'granted',
    __path: path, projectPath: path,
  };
}
contextBridge.exposeInMainWorld('electronDirector', {
  async pickDirectory(createProject = false) { const path = await ipcRenderer.invoke('director:pick-directory', { createProject }); return path ? { ...directoryHandle(path), async createProject(projectName, projectId) { const createdPath = await ipcRenderer.invoke('director:create-project', { parentPath: path, projectName, projectId }); return directoryHandle(createdPath, projectName); } } : null; },
  async getProjectDirectories() { const result = await ipcRenderer.invoke('director:get-project-directories'); return { activePath: result.activePath, handles: result.paths.map((value) => directoryHandle(value)) }; },
  async setProjectDirectories(paths) { await ipcRenderer.invoke('director:set-project-directories', { paths: paths.filter((value) => typeof value === 'string') }); },
  async setActiveProjectDirectory(path) { await ipcRenderer.invoke('director:set-active-project-directory', path); },
  async clearActiveProjectDirectory() { await ipcRenderer.invoke('director:clear-active-project-directory'); },
  async beginFileWrite(targetPath) { return ipcRenderer.invoke('director:file-write-begin', { path: targetPath }); },
  async appendFileWrite(token, chunkBase64) { return ipcRenderer.invoke('director:file-write-chunk', { token, chunkBase64 }); },
  async finishFileWrite(token) { return ipcRenderer.invoke('director:file-write-end', { token }); },
  async abortFileWrite(token) { await ipcRenderer.invoke('director:file-write-abort', { token }); },
  async removePath(targetPath) { await ipcRenderer.invoke('director:fs', { kind: 'remove', path: targetPath }); },
  async writeFile(targetPath, data) { await ipcRenderer.invoke('director:fs', { kind: 'write-file', path: targetPath, data }); },
  async listDirectory(directoryPath) { const entries = await ipcRenderer.invoke('director:fs', { kind: 'list', path: directoryPath }); return entries.map((entry) => entry.name); },
  async getAgentExecutable() { return ipcRenderer.invoke('director:get-agent-executable'); },
  async setAgentExecutable(value) { await ipcRenderer.invoke('director:set-agent-executable', value); },
  async runAgent(prompt) { return ipcRenderer.invoke('director:run-agent', prompt); },
  async windowControl(action) { return ipcRenderer.invoke('director:window-control', action); },
  async getComfyState() { return ipcRenderer.invoke('director:get-comfy-state'); },
  async getModelDirectory() { return ipcRenderer.invoke('director:get-model-directory'); },
  async pickModelDirectory() { return ipcRenderer.invoke('director:pick-model-directory'); },
  onComfyStateChange(callback) { const listener = (_event, state) => callback(state); ipcRenderer.on('director:comfy-state', listener); return () => ipcRenderer.removeListener('director:comfy-state', listener); },
  onWindowStateChange(callback) { const listener = (_event, maximized) => callback(Boolean(maximized)); ipcRenderer.on('director:window-state', listener); return () => ipcRenderer.removeListener('director:window-state', listener); },
});
