const fs = require('node:fs');
const path = require('node:path');

const localCertificate = path.join(__dirname, 'build-assets', 'certs', 'MeristemForge-Local.pfx');
if (!process.env.CSC_LINK && fs.existsSync(localCertificate)) process.env.CSC_LINK = localCertificate;
const markerPath = path.join(__dirname, '.runtime-build-path');
const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
const markedArchive = marker?.type === 'archive' ? marker.path : null;
if (!markedArchive) {
  throw new Error('找不到 runtime.7z。请设置 COMFYUI_RUNTIME_ARCHIVE，或将 runtime.7z 放到仓库根目录的 build-assets 文件夹后再执行 npm run electron:dist。');
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
  files: ['electron/**/*', '!electron/server/**', 'dist/**/*', 'node_modules/**/*', 'package.json'],
  extraResources: [
    { from: 'electron/server', to: 'server' },
    { from: archiveDirectory, to: 'runtime-archive', filter: [archiveBaseName] },
    { from: extractorDirectory, to: 'runtime-extractor' },
  ],
  win: {
    icon: 'public/meristemforge-icon.png',
    // Set CSC_LINK/CSC_KEY_PASSWORD for a certificate-backed release build.
    forceCodeSigning: Boolean(process.env.CSC_LINK),
  },
};
