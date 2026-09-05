import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeComfyUrl } from '../../comfy-url';

export const runtime = 'nodejs';

function outputRootFromArg(value: string) {
  return value || process.env.COMFYUI_OUTPUT_DIR?.trim() || '';
}

function safeChildPath(root: string, child: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedChild = path.resolve(root, child);
  const relative = path.relative(resolvedRoot, resolvedChild);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('输出文件路径无效');
  return resolvedChild;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { filename?: unknown; subfolder?: unknown; comfy_url?: unknown };
    const filename = String(body.filename ?? '').trim();
    if (!filename) return Response.json({ error: '缺少输出文件名' }, { status: 400 });
    const response = await fetch(`${normalizeComfyUrl(typeof body.comfy_url === 'string' ? body.comfy_url : undefined)}/system_stats`, { signal: AbortSignal.timeout(2500) });
    const payload = await response.json();
    const argv = Array.isArray(payload?.system?.argv) ? payload.system.argv : [];
    const index = argv.findIndex((value: unknown) => value === '--output-directory');
    const outputRoot = outputRootFromArg(index >= 0 && typeof argv[index + 1] === 'string' ? argv[index + 1] : '');
    if (!outputRoot) return Response.json({ error: '无法确定 ComfyUI 输出目录' }, { status: 503 });
    const relative = path.join(String(body.subfolder ?? ''), filename);
    const videoPath = safeChildPath(outputRoot, relative);
    await unlink(pathToFileURL(videoPath)).catch(() => undefined);
    await unlink(pathToFileURL(videoPath.replace(/\.[^.]+$/, '.json'))).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '清理输出文件失败' }, { status: 500 });
  }
}
