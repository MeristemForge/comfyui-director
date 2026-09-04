import { spawn } from 'node:child_process';
import path from 'node:path';
import { normalizeComfyUrl } from '../../comfy-url';

export const runtime = 'nodejs';

function directorPath(outputRoot: string) {
  return /^[A-Za-z]:[\\/]/.test(outputRoot)
    ? path.win32.join(outputRoot, 'director').replaceAll('\\', '/')
    : path.resolve(outputRoot, 'director');
}

function openDirectory(directory: string) {
  if (process.platform === 'win32') {
    const child = spawn('explorer.exe', [directory], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    return;
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(opener, [directory], { detached: true, stdio: 'ignore' });
  child.unref();
}

export async function POST(request: Request) {
  const comfyUrl = new URL(request.url).searchParams.get('comfy_url');
  const configuredRoot = process.env.COMFYUI_OUTPUT_DIR?.trim();
  let outputDirectory = configuredRoot ? directorPath(configuredRoot) : null;
  if (!outputDirectory) {
    try {
      const response = await fetch(`${normalizeComfyUrl(comfyUrl)}/system_stats`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (response.ok) {
        const payload = await response.json();
        const argv = Array.isArray(payload?.system?.argv) ? payload.system.argv : [];
        const flagIndex = argv.findIndex((value: unknown) => value === '--output-directory');
        const outputRoot = flagIndex >= 0 && typeof argv[flagIndex + 1] === 'string' ? argv[flagIndex + 1] as string : null;
        if (outputRoot) outputDirectory = directorPath(outputRoot);
      }
    } catch {
      // The client receives a clear error below when ComfyUI is unavailable.
    }
  }
  if (!outputDirectory) return Response.json({ opened: false, error: '无法从 ComfyUI 获取输出目录，请先启动 ComfyUI' }, { status: 503 });
  openDirectory(outputDirectory);
  return Response.json({ opened: true, path: outputDirectory });
}
