import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

function directorPath(outputRoot) {
  return /^[A-Za-z]:[\\/]/.test(outputRoot)
    ? path.win32.join(outputRoot, 'director')
    : path.resolve(outputRoot, 'director');
}

async function resolveOutputDirectory() {
  const configuredRoot = process.env.COMFYUI_OUTPUT_DIR?.trim();
  if (configuredRoot) return configuredRoot;

  try {
    const response = await fetch('http://127.0.0.1:8188/system_stats', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    const payload = await response.json();
    const argv = Array.isArray(payload?.system?.argv) ? payload.system.argv : [];
    const flagIndex = argv.findIndex((value) => value === '--output-directory');
    const outputRoot = flagIndex >= 0 && typeof argv[flagIndex + 1] === 'string' ? argv[flagIndex + 1] : null;
    return outputRoot;
  } catch {
    return null;
  }
}

function safeName(value, fallback) {
  return (value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || fallback);
}

function safeChildPath(root, child) {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(root, child);
  const relative = path.relative(resolvedRoot, resolvedChild);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('输出文件路径无效');
  return resolvedChild;
}

function openDirectory(directory) {
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [directory], { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', (error) => console.error(`无法打开导演台输出目录：${error.message}`));
    child.unref();
    return;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [directory], { detached: true, stdio: 'ignore' });
  child.once('error', (error) => console.error(`无法打开导演台输出目录：${error.message}`));
  child.unref();
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

async function waitForFile(filePath, attempts = 60) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const info = await stat(filePath);
      if (info.size > 0) return info;
      lastError = new Error('输出文件仍为空');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError ?? new Error('输出文件不存在');
}

async function finalizeOutput(body) {
  const shotId = safeName(String(body.shot_id ?? 'unknown'), 'unknown');
  const title = safeName(String(body.shot_title ?? ''), `未命名镜头 ${shotId}`);
  const source = String(body.source ?? '').trim();
  if (!source) throw new Error('缺少 ComfyUI 输出文件');
  const sourceSubfolder = String(body.source_subfolder ?? '').trim();
  const outputRoot = await resolveOutputDirectory();
  if (!outputRoot) throw new Error('无法从 ComfyUI 获取输出目录，请先启动 ComfyUI');
  const directorDirectory = directorPath(outputRoot);
  await mkdir(directorDirectory, { recursive: true });
  const relativeSubfolder = sourceSubfolder.replace(/^director(?:[\\/]|$)/i, '');
  const sourceCandidates = [
    safeChildPath(outputRoot, path.join(sourceSubfolder, source)),
    safeChildPath(directorDirectory, path.join(relativeSubfolder, source)),
  ].filter((candidate, index, candidates) => candidates.indexOf(candidate) === index);
  let sourcePath = '';
  for (const candidate of sourceCandidates) {
    try {
      // ComfyUI may report the output before the file handle is fully closed.
      await waitForFile(candidate);
      sourcePath = candidate;
      break;
    } catch {
      // Try the director-relative form for older ComfyUI responses.
    }
  }
  if (!sourcePath) throw new Error(`找不到 ComfyUI 输出文件：${source}`);
  const sourceExtension = path.extname(sourcePath).toLowerCase() || '.mp4';
  const finalName = `shot-${shotId}-${title}${sourceExtension}`;
  const finalPath = safeChildPath(directorDirectory, finalName);
  if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
    await unlink(finalPath).catch(() => undefined);
    await rename(sourcePath, finalPath);
  }
  return {
    ok: true,
    filename: finalName,
    subfolder: 'director',
    url: `/api/video?filename=${encodeURIComponent(finalName)}&subfolder=director`,
  };
}

const helper = createServer(async (request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== 'POST' || !['/open-output', '/finalize-output'].includes(request.url ?? '')) {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }
  try {
    if (request.url === '/finalize-output') {
      const body = JSON.parse(await readRequestBody(request));
      const result = await finalizeOutput(body);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
      return;
    }
    const outputRoot = await resolveOutputDirectory();
    if (!outputRoot) {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ opened: false, error: '无法从 ComfyUI 获取输出目录，请先启动 ComfyUI' }));
      return;
    }
    const outputDirectory = directorPath(outputRoot);
    mkdirSync(outputDirectory, { recursive: true });
    openDirectory(outputDirectory);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ opened: true, path: outputDirectory }));
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ opened: false, error: error instanceof Error ? error.message : '无法打开输出目录' }));
  }
});

helper.listen(3101, '127.0.0.1');
const vinext = spawn(process.execPath, ['node_modules/vinext/dist/cli.js', 'dev'], { stdio: 'inherit', shell: false });

function shutdown() {
  helper.close();
  vinext.kill();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
vinext.on('exit', (code) => {
  helper.close();
  process.exit(code ?? 0);
});
