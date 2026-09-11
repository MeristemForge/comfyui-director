const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');

app.commandLine.appendSwitch('enable-features', 'FileSystemAccessAPI');
app.setName('MeristemForge');
Menu.setApplicationMenu(null);
let server;
let mainWindow;
function broadcastWindowState() {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('director:window-state', mainWindow.isMaximized());
}
ipcMain.handle('director:window-control', (_event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (action === 'is-maximized') return mainWindow.isMaximized();
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'maximize') mainWindow.maximize();
  else if (action === 'unmaximize') mainWindow.unmaximize();
  else if (action === 'toggle-maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  else if (action === 'close') mainWindow.close();
  return mainWindow.isMaximized();
});
ipcMain.handle('director:prompt-project-name', () => new Promise((resolve) => {
  const promptWindow = new BrowserWindow({ parent: mainWindow, modal: true, width: 440, height: 260, resizable: false, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px sans-serif;background:#18181b;color:#fafafa;padding:24px}h2{font-size:16px}input{box-sizing:border-box;width:100%;padding:10px;margin:12px 0;background:#27272a;color:white;border:1px solid #52525b;border-radius:8px}button{padding:9px 16px;border:0;border-radius:8px;background:#f4bd50;color:#17120a;font-weight:600;float:right}</style><h2>新建项目</h2><div>请输入项目名称</div><input id="name" value="未命名项目" autofocus><button id="ok">选择保存位置</button><script>const send=()=>window.electronDirectorSubmit(document.getElementById('name').value);document.getElementById('ok').onclick=send;document.getElementById('name').onkeydown=e=>{if(e.key==='Enter')send()};</script>`;
  ipcMain.once('director:prompt-project-name-result', (_event, name) => { if (!promptWindow.isDestroyed()) promptWindow.close(); resolve(typeof name === 'string' ? name.trim() : null); });
  promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}));
function startProductionServer() {
  if (!app.isPackaged) return;
  const entry = path.join(process.resourcesPath, 'server', 'start.cjs');
  server = spawn(process.execPath, [entry], { cwd: path.dirname(entry), windowsHide: true, stdio: 'ignore' });
}

ipcMain.handle('director:pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('director:create-project', async (_event, operation) => {
  const folderName = String(operation.projectName || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || '未命名项目';
  const projectPath = path.join(path.resolve(String(operation.parentPath)), folderName);
  const scriptPath = path.join(projectPath, 'script.json');
  let scriptExists = false;
  try { await fs.access(scriptPath); scriptExists = true; } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (scriptExists) throw new Error('该目录已经是项目，请使用“导入项目”打开，避免覆盖现有内容');
  await fs.mkdir(path.join(projectPath, '资产'), { recursive: true });
  for (const folder of ['角色', '场景', '服装', '道具', '视频', '音频', '自定义']) await fs.mkdir(path.join(projectPath, '资产', folder), { recursive: true });
  await fs.mkdir(path.join(projectPath, '片段'), { recursive: true });
  await fs.mkdir(path.join(projectPath, '输出'), { recursive: true });
  await fs.writeFile(scriptPath, JSON.stringify({ project: { id: String(operation.projectId), name: String(operation.projectName), version: 2 }, clips: [] }, null, 2));
  return projectPath;
});
ipcMain.handle('director:fs', async (_event, operation) => {
  const target = path.resolve(operation.path);
  if (operation.kind === 'read-file') return (await fs.readFile(target)).toString('base64');
  if (operation.kind === 'write-file') { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, Buffer.from(operation.data, 'base64')); return true; }
  if (operation.kind === 'mkdir') { await fs.mkdir(target, { recursive: true }); return true; }
  if (operation.kind === 'list') return (await fs.readdir(target, { withFileTypes: true })).map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }));
  if (operation.kind === 'exists') { try { const stat = await fs.stat(target); return stat.isDirectory() === operation.directory; } catch { return false; } }
  if (operation.kind === 'remove') { await fs.rm(target, { recursive: true, force: true }); return true; }
  throw new Error(`Unknown filesystem operation: ${operation.kind}`);
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: 'MeristemForge',
    icon: path.join(__dirname, '..', 'public', 'meristemforge-icon.png'),
    frame: false,
    backgroundColor: '#090a0d',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  mainWindow = window;
  window.on('maximize', broadcastWindowState);
  window.on('unmaximize', broadcastWindowState);
  window.loadURL(process.env.DIRECTOR_DEV_URL || 'http://127.0.0.1:3000');
}

app.whenReady().then(() => {
  startProductionServer();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('before-quit', () => { if (server && !server.killed) server.kill(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
