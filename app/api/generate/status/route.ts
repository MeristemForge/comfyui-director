export const runtime = 'nodejs';
import { normalizeComfyUrl } from '../../comfy-url';

type HistoryItem = {
  status?: { status_str?: string; messages?: unknown[] };
  outputs?: Record<string, unknown>;
};

const COMFY_STATUS_TIMEOUT_MS = 10_000;

function findVideoOutput(item: { outputs?: Record<string, unknown> }) {
  const outputEntries = Object.values(item.outputs ?? {}) as Array<Record<string, unknown>>;
  // SaveVideo commonly reports `videos` or `gifs`; scan every node before
  // considering image outputs from intermediate decode nodes.
  for (const output of outputEntries) {
    for (const key of ['videos', 'gifs']) {
      const files = output[key];
      if (!Array.isArray(files)) continue;
      const file = files.find((entry): entry is { filename: string; subfolder?: string; type?: string } => Boolean(entry && typeof entry === 'object' && typeof (entry as { filename?: unknown }).filename === 'string'));
      if (file) return file;
    }
  }
  // Older custom SaveVideo nodes may expose the encoded file as `images`.
  for (const output of outputEntries) {
    const files = output.images;
    if (!Array.isArray(files)) continue;
    const file = files.find((entry): entry is { filename: string; subfolder?: string; type?: string } => {
      if (!entry || typeof entry !== 'object' || typeof (entry as { filename?: unknown }).filename !== 'string') return false;
      return /\.(mp4|webm|mov|mkv)$/i.test((entry as { filename: string }).filename);
    });
    if (file) return file;
  }
  return null;
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  const comfyUrl = normalizeComfyUrl(new URL(request.url).searchParams.get('comfy_url'));
  if (!id) return Response.json({ error: '缺少任务 ID' }, { status: 400 });
  try {
    const response = await fetch(`${comfyUrl}/history/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(COMFY_STATUS_TIMEOUT_MS),
    });
    if (!response.ok) {
      return Response.json({ status: 'error', error: `ComfyUI history HTTP ${response.status}` }, { status: 502 });
    }
    const data = await response.json() as Record<string, HistoryItem>;
    const item = data[id];
    if (!item) {
      try {
        const queueResponse = await fetch(`${comfyUrl}/queue`, {
          signal: AbortSignal.timeout(COMFY_STATUS_TIMEOUT_MS),
        });
        const queue = await queueResponse.json() as { queue_pending?: unknown[]; queue_running?: unknown[] };
        const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending : [];
        const running = Array.isArray(queue.queue_running) ? queue.queue_running : [];
        const isRunning = running.some((entry) => Array.isArray(entry) && entry[1] === id);
        if (isRunning) return Response.json({ status: 'running' });
        const pendingIndex = pending.findIndex((entry) => Array.isArray(entry) && entry[1] === id);
        if (pendingIndex >= 0) return Response.json({ status: 'queued', position: pendingIndex + 1 });
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) throw error;
        // History remains the source of truth if queue inspection is unavailable.
      }
      return Response.json({ status: 'pending' });
    }
    if (item.status?.status_str === 'error') {
      const messages = Array.isArray(item.status.messages) ? item.status.messages : [];
      const detail = messages.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'execution_error');
      const detailMessage = Array.isArray(detail) && detail[1] && typeof detail[1] === 'object' && 'exception_message' in detail[1]
        ? detail[1].exception_message
        : null;
      return Response.json({ status: 'error', error: typeof detailMessage === 'string' ? detailMessage : 'ComfyUI 执行失败' });
    }
    const output = findVideoOutput(item);
    if (!output) {
      const statusString = item.status?.status_str?.toLowerCase();
      if (statusString && ['success', 'completed', 'complete', 'done'].includes(statusString))
        return Response.json({ status: 'error', error: '生成完成但未找到视频输出' });
      return Response.json({ status: 'running' });
    }
    // The local Worker runtime cannot write arbitrary Windows paths. Return a
    // same-origin proxy URL; the browser saves it via the selected directory handle.
    const url = `/api/video?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder ?? '')}&type=${encodeURIComponent(output.type ?? 'output')}&comfy_url=${encodeURIComponent(comfyUrl)}`;
    return Response.json({ status: 'completed', url, source: output.filename, source_subfolder: output.subfolder ?? '' });
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return Response.json({ status: 'error', error: timedOut ? 'ComfyUI 状态查询超时' : error instanceof Error ? error.message : '状态查询失败' }, { status: timedOut ? 504 : 500 });
  }
}
