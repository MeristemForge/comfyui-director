const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

app.commandLine.appendSwitch('enable-features', 'FileSystemAccessAPI');
app.setName('MeristemForge');
Menu.setApplicationMenu(null);
let server;
const serverPort = 3000;
let mainWindow;
let comfyProcess;
let comfyPort = 8188;
let comfyState = 'stopped';
let comfyError = null;
const projectRoots = new Set();
let appConfigWriteQueue = Promise.resolve();

function defaultModelDirectory() {
  return path.join(app.getPath('appData'), 'MeristemForge', 'models');
}

function configPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

async function readAppConfig() {
  try {
    const value = JSON.parse(await fs.readFile(configPath(), 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('读取 MeristemForge 配置失败', error);
    return {};
  }
}

function writeAppConfig(patchOrUpdater) {
  const task = appConfigWriteQueue.catch(() => undefined).then(async () => {
    const current = await readAppConfig();
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(current) : patchOrUpdater;
    await fs.writeFile(configPath(), JSON.stringify({ ...current, ...patch }, null, 2));
  });
  appConfigWriteQueue = task.then(() => undefined, () => undefined);
  return task;
}

function normalizePath(value) {
  return path.resolve(String(value || ''));
}

function isPathInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertProjectPath(target) {
  const normalized = normalizePath(target);
  if (![...projectRoots].some((root) => isPathInside(normalized, root)))
    throw new Error('文件操作路径不在已选择的项目目录内');
  return normalized;
}

async function registerProjectPath(value) {
  const normalized = normalizePath(value);
  const stat = await fs.stat(normalized);
  if (!stat.isDirectory()) throw new Error('项目路径必须是目录');
  projectRoots.add(normalized);
  return normalized;
}

async function saveProjectPaths(paths, activePath) {
  const unique = [];
  for (const value of paths) {
    try {
      const normalized = await registerProjectPath(value);
      if (!unique.some((item) => path.normalize(item).toLowerCase() === path.normalize(normalized).toLowerCase())) unique.push(normalized);
    } catch {}
  }
  const requestedActive = activePath === undefined ? undefined : activePath ? normalizePath(activePath) : null;
  await writeAppConfig((current) => {
    const active = requestedActive === undefined
      ? (typeof current.activeProjectPath === 'string' ? normalizePath(current.activeProjectPath) : null)
      : requestedActive;
    return {
      projectPaths: unique,
      activeProjectPath: active && unique.some((item) => path.normalize(item).toLowerCase() === path.normalize(active).toLowerCase()) ? active : null,
    };
  });
  return unique;
}

async function getSavedProjectPaths() {
  const config = await readAppConfig();
  const saved = Array.isArray(config.projectPaths) ? config.projectPaths : [];
  const valid = [];
  for (const value of saved) {
    try {
      const normalized = await registerProjectPath(value);
      if (!valid.some((item) => path.normalize(item).toLowerCase() === path.normalize(normalized).toLowerCase()))
        valid.push(normalized);
    } catch {}
  }
  const activeCandidate = typeof config.activeProjectPath === 'string' ? normalizePath(config.activeProjectPath) : null;
  const active = activeCandidate && valid.some((item) => path.normalize(item).toLowerCase() === path.normalize(activeCandidate).toLowerCase())
    ? activeCandidate
    : null;
  if (valid.length !== saved.length || active !== (config.activeProjectPath || null))
    await writeAppConfig({ projectPaths: valid, activeProjectPath: active });
  return { paths: valid, activePath: active };
}

const H3_AGENT_INSTRUCTION = 'You are a professional MiniMax H3 audiovisual prompt editor. Rewrite the user draft into a production-ready H3 prompt. Preserve dialogue, lyrics, and visible text in their original language. Do not invent plot events, dialogue, subjects, or reference assets. Match the requested duration. Describe concrete composition, subjects, environment, actions, camera movement, sound, and timing. For T2VA/I2VA output exactly these three sections in this order: integrated_multimodal_description, overall_soundscape, non_diegetic_music. For R2VA output exactly these six sections in this order: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. Return only the finished prompt, without markdown fences or commentary.';

async function runConfiguredAgent(input) {
  const config = await readAppConfig();
  const executable = typeof config.agentExecutablePath === 'string' ? config.agentExecutablePath.trim() : '';
  if (!executable) throw new Error('未配置本地 Agent 可执行程序路径');
  const data = input && typeof input === 'object' ? input : { prompt: String(input || '') };
  const draft = String(data.prompt || '').trim();
  if (!draft) throw new Error('请先输入提示词');
  const mappings = Array.isArray(data.referenceMapping) ? data.referenceMapping.filter((item) => item && item.picture && item.subject).map((item) => `${String(item.picture).trim()} = entity: ${String(item.subject).trim()}${item.usage ? `; usage: ${String(item.usage).trim()}` : ''}${item.description ? `; description: ${String(item.description).trim()}` : ''}${item.role ? `; role: ${String(item.role).trim()}` : ''}${item.assetName ? `; file: ${String(item.assetName).trim()}` : ''}`).join('\n') : '';
  const style = String(data.visualStyle || '').trim();
  const context = `${H3_AGENT_INSTRUCTION}\nUse the installed H3 prompt-writing skill when available.\n\nMode: ${String(data.mode || 'T2VA')}\nDuration: ${data.duration || 6} seconds${style ? `\n\nVisual style preset:\n${style}` : ''}${mappings ? `\n\nReference inputs below correspond to the actual H3 input slots. Keep labels unchanged and use only the listed inputs:\n${mappings}` : ''}\n\nUser draft:\n${draft}`;
  return new Promise((resolve, reject) => {
    const isCodex = /codex/i.test(path.basename(executable));
    const args = isCodex
      ? ['--ask-for-approval', 'never', 'exec', '-', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--color', 'never']
      : ['-p', context, '--output-format', 'text'];
    const child = spawn(executable, args, {
      cwd: app.getPath('userData'),
      windowsHide: true,
      shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable),
      stdio: isCodex ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('本地 Agent 优化超时')); }, 120000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => { clearTimeout(timer); reject(new Error(`无法启动本地 Agent：${error.message}`)); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || `Agent 退出码 ${code}`));
      const result = stdout.trim().replace(/^```(?:text)?\s*/i, '').replace(/\s*```$/, '').trim();
      if (!result) return reject(new Error('本地 Agent 未返回优化结果'));
      resolve(result);
    });
    if (isCodex) child.stdin.end(context);
  });
}

async function getConfiguredModelDirectory() {
  const config = await readAppConfig();
  if (typeof config.modelDirectory === 'string' && config.modelDirectory.trim())
    return path.resolve(config.modelDirectory);
  try {
    const installedPath = (await fs.readFile(path.join(app.getPath('userData'), 'model-directory.txt'), 'utf8')).trim();
    if (installedPath) return path.resolve(installedPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('读取安装时模型目录失败', error);
  }
  return defaultModelDirectory();
}

function runtimeCandidates() {
  if (app.isPackaged) return [path.join(app.getPath('userData'), 'runtime')];
  return [
    process.env.COMFYUI_RUNTIME_DIR,
    path.resolve(__dirname, '..', 'runtime'),
    path.resolve(__dirname, '..', 'build-assets', 'runtime'),
  ].filter(Boolean);
}

function resolveRuntime() {
  return runtimeCandidates().find((candidate) =>
    fsSync.existsSync(path.join(candidate, 'python_embeded', 'python.exe')) &&
    fsSync.existsSync(path.join(candidate, 'ComfyUI', 'main.py')),
  ) ?? null;
}

function runtimeArchive() {
  const directory = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime-archive')
    : path.resolve(__dirname, '..', 'build-assets');
  const archive = path.join(directory, 'runtime.7z');
  return fsSync.existsSync(archive) ? archive : null;
}

async function ensurePackagedRuntime() {
  const existing = resolveRuntime();
  if (existing) return existing;
  const archive = runtimeArchive();
  if (!archive) return null;
  const extractorDirectory = app.isPackaged
    ? path.join(process.resourcesPath, 'runtime-extractor')
    : path.resolve(__dirname, '..', '.runtime-extractor');
  const extractor = path.join(extractorDirectory, '7z.exe');
  const extractorDll = path.join(extractorDirectory, '7z.dll');
  if (!fsSync.existsSync(extractor) || !fsSync.existsSync(extractorDll))
    throw new Error(app.isPackaged ? '安装包缺少 runtime 解压组件。' : '开发环境缺少 7-Zip 解压组件，请先运行 npm run prepare-runtime。');
  // runtime.7z contains the top-level `runtime` directory. Extract into the
  // build-assets in development and the writable per-user data directory in
  // the packaged app so ComfyUI can maintain its runtime data.
  const target = app.isPackaged ? app.getPath('userData') : path.resolve(__dirname, '..', 'build-assets');
  await fs.mkdir(target, { recursive: true });
  comfyState = 'extracting';
  comfyError = null;
  broadcastComfyState();
  await new Promise((resolve, reject) => {
    const child = spawn(extractor, ['x', '-y', archive, `-o${target}`], {
      cwd: path.dirname(extractor),
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`runtime 解压失败，退出码：${code}`)));
  });
  const extracted = resolveRuntime();
  if (!extracted) throw new Error('runtime 解压完成，但未找到 ComfyUI 主程序。');
  return extracted;
}

function quoteYamlPath(value) {
  return JSON.stringify(value.replaceAll('\\', '/'));
}

async function writeComfyModelPaths(modelDirectory) {
  const paths = {
    checkpoints: 'checkpoints',
    configs: 'configs',
    loras: 'loras',
    vae: 'vae',
    text_encoders: 'text_encoders',
    diffusion_models: 'diffusion_models',
    clip_vision: 'clip_vision',
    style_models: 'style_models',
    embeddings: 'embeddings',
    diffusers: 'diffusers',
    vae_approx: 'vae_approx',
    controlnet: 'controlnet',
    gligen: 'gligen',
    upscale_models: 'upscale_models',
    latent_upscale_models: 'latent_upscale_models',
    hypernetworks: 'hypernetworks',
    photomaker: 'photomaker',
    classifiers: 'classifiers',
    model_patches: 'model_patches',
    audio_encoders: 'audio_encoders',
    background_removal: 'background_removal',
    frame_interpolation: 'frame_interpolation',
    geometry_estimation: 'geometry_estimation',
    optical_flow: 'optical_flow',
    detection: 'detection',
  };
  await fs.mkdir(modelDirectory, { recursive: true });
  await Promise.all(Object.values(paths).map((folder) => fs.mkdir(path.join(modelDirectory, folder), { recursive: true })));
  const content = [
    'comfyui:',
    `  base_path: ${quoteYamlPath(modelDirectory)}`,
    '  is_default: true',
    ...Object.entries(paths).map(([name, folder]) => `  ${name}: ${quoteYamlPath(`${folder}/`)}`),
    '',
  ].join('\n');
  const target = path.join(app.getPath('userData'), 'comfyui-extra-model-paths.yaml');
  await fs.writeFile(target, content, 'utf8');
  return target;
}

function findFreePort(start = 8188) {
  return new Promise((resolve) => {
    const probe = (port) => {
      const server = net.createServer();
      server.once('error', () => probe(port + 1));
      server.once('listening', () => server.close(() => resolve(port)));
      server.listen(port, '127.0.0.1');
    };
    probe(start);
  });
}

function comfyUrl() {
  return `http://127.0.0.1:${comfyPort}`;
}

function broadcastComfyState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('director:comfy-state', getComfyState());
}

async function waitForComfyReady(timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (comfyProcess && Date.now() < deadline) {
    try {
      const response = await fetch(`${comfyUrl()}/system_stats`, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return true;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return false;
}

function getComfyState() {
  return {
    state: comfyState,
    ready: comfyState === 'ready',
    url: comfyUrl(),
    port: comfyPort,
    error: comfyError,
    runtimePath: resolveRuntime(),
  };
}

async function stopComfyUI() {
  const child = comfyProcess;
  comfyProcess = undefined;
  comfyState = 'stopped';
  comfyError = null;
  if (child && !child.killed) child.kill();
  broadcastComfyState();
}

async function startComfyUI() {
  if (comfyProcess) return getComfyState();
  const runtime = await ensurePackagedRuntime();
  if (!runtime) {
    comfyState = 'unavailable';
    comfyError = '没有找到内置 ComfyUI 运行时，请设置 COMFYUI_RUNTIME_DIR 或重新安装完整版本。';
    broadcastComfyState();
    return getComfyState();
  }
  const python = path.join(runtime, 'python_embeded', 'python.exe');
  const main = path.join(runtime, 'ComfyUI', 'main.py');
  const modelDirectory = await getConfiguredModelDirectory();
  const modelPaths = await writeComfyModelPaths(modelDirectory);
  const comfyDataRoot = path.join(app.getPath('userData'), 'comfyui');
  const comfyUserDirectory = path.join(comfyDataRoot, 'user');
  const comfyInputDirectory = path.join(comfyDataRoot, 'input');
  const comfyOutputDirectory = path.join(comfyDataRoot, 'output');
  await Promise.all([
    fs.mkdir(comfyUserDirectory, { recursive: true }),
    fs.mkdir(comfyInputDirectory, { recursive: true }),
    fs.mkdir(comfyOutputDirectory, { recursive: true }),
    fs.mkdir(comfyDataRoot, { recursive: true }),
  ]);
  comfyPort = await findFreePort(8188);
  const logDirectory = path.join(app.getPath('userData'), 'logs');
  await fs.mkdir(logDirectory, { recursive: true });
  const comfyLogPath = path.join(logDirectory, 'comfyui.log');
  const comfyLogFd = fsSync.openSync(comfyLogPath, 'a');
  comfyState = 'starting';
  comfyError = null;
  broadcastComfyState();
  comfyProcess = spawn(python, [
    '-s', main,
    '--listen', '127.0.0.1',
    '--port', String(comfyPort),
    '--user-directory', comfyUserDirectory,
    '--input-directory', comfyInputDirectory,
    '--output-directory', comfyOutputDirectory,
    '--temp-directory', comfyDataRoot,
    '--extra-model-paths-config', modelPaths,
  ], { cwd: runtime, windowsHide: true, stdio: ['ignore', comfyLogFd, comfyLogFd] });
  fsSync.closeSync(comfyLogFd);
  comfyProcess.once('error', (error) => {
    comfyError = error.message;
    comfyState = 'error';
    broadcastComfyState();
  });
  comfyProcess.once('exit', (code) => {
    if (comfyProcess) {
      comfyProcess = undefined;
      comfyState = code === 0 ? 'stopped' : 'error';
      if (code !== 0) comfyError = `ComfyUI 已退出，退出码：${code}`;
      broadcastComfyState();
    }
  });
  void waitForComfyReady().then((ready) => {
    if (!comfyProcess) return;
    comfyState = ready ? 'ready' : 'error';
    if (!ready) comfyError = 'ComfyUI 启动超时，请查看用户数据目录中的 logs/comfyui.log。';
    broadcastComfyState();
  }).catch((error) => {
    if (!comfyProcess) return;
    comfyState = 'error';
    comfyError = error instanceof Error ? error.message : String(error);
    broadcastComfyState();
  });
  return getComfyState();
}
function broadcastWindowState() {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('director:window-state', mainWindow.isMaximized());
}
ipcMain.handle('director:window-control', (_event, action) => {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (action === 'is-maximized') return mainWindow.isMaximized();
  if (action === 'minimize') mainWindow.minimize();
  else if (action === 'toggle-maximize') {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
  else if (action === 'close') mainWindow.close();
  return mainWindow.isMaximized();
});
function waitForTcp(port, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error(`本地 Web 服务在 ${port} 端口启动超时`));
        else setTimeout(check, 250);
      });
    };
    check();
  });
}

async function startProductionServer() {
  if (!app.isPackaged) return process.env.DIRECTOR_DEV_URL || 'http://127.0.0.1:3000';
  const entry = path.join(process.resourcesPath, 'server', 'start.cjs');
  const serverRuntimeRoot = path.join(app.getPath('userData'), 'server-runtime');
  const packagedDistRoot = path.join(app.getAppPath(), 'dist');
  const writableDistRoot = path.join(serverRuntimeRoot, 'dist');
  await fs.mkdir(serverRuntimeRoot, { recursive: true });
  await fs.cp(path.join(packagedDistRoot, 'server'), path.join(writableDistRoot, 'server'), { recursive: true, force: true });
  await fs.cp(path.join(packagedDistRoot, 'client'), path.join(writableDistRoot, 'client'), { recursive: true, force: true });
  const logDirectory = path.join(app.getPath('userData'), 'logs');
  await fs.mkdir(logDirectory, { recursive: true });
  const logFd = fsSync.openSync(path.join(logDirectory, 'server.log'), 'a');
  server = spawn(process.execPath, [entry], {
    cwd: serverRuntimeRoot,
    env: {
      ...process.env,
      DIRECTOR_APP_ROOT: app.getAppPath(),
      DIRECTOR_DIST_ROOT: writableDistRoot,
      DIRECTOR_WORKING_DIRECTORY: serverRuntimeRoot,
      WRANGLER_CACHE_DIR: path.join(serverRuntimeRoot, '.wrangler', 'cache'),
      ELECTRON_RUN_AS_NODE: '1',
      DIRECTOR_SERVER_PORT: String(serverPort),
    },
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
  });
  fsSync.closeSync(logFd);
  await waitForTcp(serverPort);
  return `http://127.0.0.1:${serverPort}`;
}

ipcMain.handle('director:pick-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = await registerProjectPath(result.filePaths[0]);
  return selected;
});
ipcMain.handle('director:get-project-directories', async () => getSavedProjectPaths());
ipcMain.handle('director:set-project-directories', async (_event, operation = {}) => {
  const paths = Array.isArray(operation.paths) ? operation.paths : [];
  const saved = await saveProjectPaths(paths);
  const nextConfig = await readAppConfig();
  return { paths: saved, activePath: typeof nextConfig.activeProjectPath === 'string' ? nextConfig.activeProjectPath : null };
});
ipcMain.handle('director:set-active-project-directory', async (_event, value) => {
  const activePath = await registerProjectPath(value);
  const config = await readAppConfig();
  const paths = Array.isArray(config.projectPaths) ? config.projectPaths : [];
  const saved = await saveProjectPaths([...paths, activePath], activePath);
  return { paths: saved, activePath };
});
ipcMain.handle('director:clear-active-project-directory', async () => {
  await writeAppConfig({ activeProjectPath: null });
  return true;
});
ipcMain.handle('director:get-agent-executable', async () => {
  const config = await readAppConfig();
  return typeof config.agentExecutablePath === 'string' ? config.agentExecutablePath : '';
});
ipcMain.handle('director:set-agent-executable', async (_event, value) => {
  const executablePath = String(value || '').trim();
  await writeAppConfig({ agentExecutablePath: executablePath });
  return executablePath;
});
ipcMain.handle('director:run-agent', async (_event, input) => runConfiguredAgent(input));
ipcMain.handle('director:get-comfy-state', () => getComfyState());
ipcMain.handle('director:get-model-directory', async () => {
  const configured = await getConfiguredModelDirectory();
  return { path: configured, isDefault: path.normalize(configured) === path.normalize(defaultModelDirectory()) };
});
ipcMain.handle('director:pick-model-directory', async () => {
  const current = await getConfiguredModelDirectory();
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: current,
    properties: ['openDirectory', 'createDirectory'],
    title: '选择模型目录',
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const selected = path.resolve(result.filePaths[0]);
  await writeAppConfig({ modelDirectory: selected });
  await stopComfyUI();
  await startComfyUI();
  return { path: selected, isDefault: path.normalize(selected) === path.normalize(defaultModelDirectory()) };
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
  await fs.writeFile(scriptPath, JSON.stringify({ project: { id: String(operation.projectId), name: String(operation.projectName), version: 2 }, nextShotNumber: 1, clips: [] }, null, 2));
  await registerProjectPath(projectPath);
  const config = await readAppConfig();
  const existing = Array.isArray(config.projectPaths) ? config.projectPaths : [];
  await saveProjectPaths([...existing, projectPath], projectPath);
  return projectPath;
});
ipcMain.handle('director:fs', async (_event, operation) => {
  const target = assertProjectPath(operation.path);
  if (operation.kind === 'read-file') return (await fs.readFile(target)).toString('base64');
  if (operation.kind === 'write-file') { await fs.mkdir(path.dirname(target), { recursive: true }); await fs.writeFile(target, Buffer.from(operation.data, 'base64')); return true; }
  if (operation.kind === 'mkdir') { await fs.mkdir(target, { recursive: true }); return true; }
  if (operation.kind === 'list') return (await fs.readdir(target, { withFileTypes: true })).map((entry) => ({ name: entry.name, kind: entry.isDirectory() ? 'directory' : 'file' }));
  if (operation.kind === 'exists') { try { const stat = await fs.stat(target); return stat.isDirectory() === operation.directory; } catch { return false; } }
  if (operation.kind === 'remove') { await fs.rm(target, { recursive: true, force: true }); return true; }
  throw new Error(`Unknown filesystem operation: ${operation.kind}`);
});

function createWindow(url = process.env.DIRECTOR_DEV_URL || 'http://127.0.0.1:3000') {
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
  void window.loadURL(url);
}

void app.whenReady().then(async () => {
  if (process.argv.includes('--extract-runtime')) {
    try { await ensurePackagedRuntime(); app.quit(); } catch (error) { console.error(error); app.exit(1); }
    return;
  }
  let webUrl = process.env.DIRECTOR_DEV_URL || 'http://127.0.0.1:3000';
  try {
    webUrl = await startProductionServer();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    webUrl = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><body style="font:16px sans-serif;background:#090a0d;color:#f5f5f5;padding:48px"><h2>MeristemForge 启动失败</h2><p>${message}</p><p>请查看用户数据目录 logs/server.log。</p></body>`)}`;
  }
  void startComfyUI().catch((error) => {
    comfyState = 'error';
    comfyError = error instanceof Error ? error.message : String(error);
    broadcastComfyState();
  });
  createWindow(webUrl);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(webUrl); });
});
app.on('before-quit', () => {
  if (server && !server.killed) server.kill();
  void stopComfyUI();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
