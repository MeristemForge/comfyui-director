import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeComfyUrl } from '../../comfy-url';

export const runtime = 'nodejs';

function resolveDirectorDirectory(outputRoot: string) {
  return /^[A-Za-z]:[\\/]/.test(outputRoot)
    ? path.win32.join(outputRoot, 'director')
    : path.resolve(outputRoot, 'director');
}

async function resolveOutputRoot(comfyUrl?: string) {
  const configuredRoot = process.env.COMFYUI_OUTPUT_DIR?.trim();
  if (configuredRoot) return configuredRoot;
  const response = await fetch(`${normalizeComfyUrl(comfyUrl)}/system_stats`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
  if (!response.ok) return null;
  const payload = await response.json();
  const argv = Array.isArray(payload?.system?.argv) ? payload.system.argv : [];
  const flagIndex = argv.findIndex((value: unknown) => value === '--output-directory');
  return flagIndex >= 0 && typeof argv[flagIndex + 1] === 'string' ? argv[flagIndex + 1] as string : null;
}

function safeName(value: string, fallback: string) {
  return (value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || fallback);
}

function safeChildPath(root: string, child: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(root, child);
  const relative = path.relative(resolvedRoot, resolvedChild);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('输出文件路径无效');
  return resolvedChild;
}

async function waitForFile(filePath: string, attempts = 60) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const info = await stat(pathToFileURL(filePath));
      if (info.size > 0) return info;
      lastError = new Error('输出文件仍为空');
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError instanceof Error ? lastError : new Error('输出文件不存在');
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      shot_id?: unknown;
      shot_title?: unknown;
      file_name?: unknown;
      source?: unknown;
      source_subfolder?: unknown;
      comfy_url?: unknown;
      metadata?: unknown;
    };
    const shotId = safeName(String(body.shot_id ?? 'unknown'), 'unknown');
    const title = safeName(String(body.shot_title ?? ''), `未命名镜头 ${shotId}`);
    const source = String(body.source ?? '').trim();
    if (!source) return Response.json({ error: '缺少 ComfyUI 输出文件' }, { status: 400 });
    const sourceSubfolder = String(body.source_subfolder ?? '').trim();
    const outputRoot = await resolveOutputRoot(typeof body.comfy_url === 'string' ? body.comfy_url : undefined);
    if (!outputRoot) return Response.json({ error: '无法从 ComfyUI 获取输出目录，请先启动 ComfyUI' }, { status: 503 });
    const directorDirectory = resolveDirectorDirectory(outputRoot);
    await mkdir(pathToFileURL(directorDirectory), { recursive: true });
    const sourcePath = safeChildPath(outputRoot, path.join(sourceSubfolder, source));
    const sourceExtension = path.extname(sourcePath).toLowerCase() || '.mp4';
    const finalName = `shot-${shotId}-${title}${sourceExtension}`;
    const finalPath = safeChildPath(directorDirectory, finalName);
    // Check the source before replacing the previous output for this shot.
    await waitForFile(sourcePath);
    if (path.resolve(sourcePath) !== path.resolve(finalPath)) {
      await unlink(pathToFileURL(finalPath)).catch(() => undefined);
      await rename(pathToFileURL(sourcePath), pathToFileURL(finalPath));
    }
    const relativeSubfolder = path.relative(outputRoot, directorDirectory).replaceAll('\\', '/');
    const comfyUrl = normalizeComfyUrl(typeof body.comfy_url === 'string' ? body.comfy_url : undefined);
    return Response.json({
      ok: true,
      filename: finalName,
      subfolder: relativeSubfolder,
      url: `/api/video?filename=${encodeURIComponent(finalName)}&subfolder=${encodeURIComponent(relativeSubfolder)}&comfy_url=${encodeURIComponent(comfyUrl)}`,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '整理输出文件失败' }, { status: 500 });
  }
}
