const fs = require('node:fs');
const path = require('node:path');

const markerPath = path.join(__dirname, '.runtime-build-path');
const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
const markedRuntime = marker?.type === 'directory' ? marker.path : null;
const markedArchive = marker?.type === 'archive' ? marker.path : null;
const candidates = [
  markedRuntime,
  process.env.COMFYUI_RUNTIME_DIR,
  path.resolve(__dirname, '..', 'MeristemForge', 'runtime'),
  path.resolve(__dirname, 'runtime'),
].filter(Boolean);
const runtime = markedArchive ? null : candidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'python_embeded', 'python.exe')) &&
  fs.existsSync(path.join(candidate, 'ComfyUI', 'main.py')),
);

if (!runtime && !markedArchive) {
  throw new Error('找不到 runtime.7z。请设置 COMFYUI_RUNTIME_ARCHIVE，或将 runtime.7z 放到 ../MeristemForge 后再执行 npm run electron:dist。');
}

const archiveDirectory = markedArchive ? path.dirname(markedArchive) : null;
const archiveBaseName = markedArchive ? path.basename(markedArchive) : null;
const extractorDirectory = path.join(__dirname, '.runtime-extractor');
if (markedArchive && (!fs.existsSync(path.join(extractorDirectory, '7z.exe')) || !fs.existsSync(path.join(extractorDirectory, '7z.dll')))) {
  throw new Error('找不到 7-Zip 解压组件。请确认 C:\\Program Files\\7-Zip\\7z.exe 和 7z.dll 存在。');
}

module.exports = {
  appId: 'comfyui.director',
  productName: 'MeristemForge',
  // The production Worker server launches Wrangler in a separate Node
  // process. Keep the app files on disk so that process can resolve them
  // without relying on Electron's virtual app.asar path.
  asar: false,
  directories: { output: 'release' },
  files: ['electron/**/*', 'dist/**/*', 'node_modules/**/*', 'package.json'],
  extraResources: [
    { from: 'electron/server', to: 'server' },
    ...(runtime ? [{ from: runtime, to: 'runtime' }] : []),
    ...(markedArchive ? [{ from: archiveDirectory, to: 'runtime-archive', filter: [archiveBaseName] }] : []),
    ...(markedArchive ? [{ from: extractorDirectory, to: 'runtime-extractor' }] : []),
  ],
  win: {
    target: ['nsis', 'portable'],
    icon: 'public/meristemforge-icon.png',
    // Set CSC_LINK/CSC_KEY_PASSWORD for a certificate-backed release build.
    forceCodeSigning: Boolean(process.env.CSC_LINK),
  },
  nsis: {
    include: 'electron/installer.nsh',
    oneClick: false,
    allowToChangeInstallationDirectory: true,
  },
};
