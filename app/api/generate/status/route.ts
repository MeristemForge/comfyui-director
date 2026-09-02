export const runtime = 'nodejs';

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
  const shot = new URL(request.url).searchParams.get('shot') ?? 'unknown';
  const seed = new URL(request.url).searchParams.get('seed');
  const seedMode = new URL(request.url).searchParams.get('seed_mode') ?? 'fixed';
  if (!id) return Response.json({ error: '缺少任务 ID' }, { status: 400 });
  try {
    const response = await fetch(`http://127.0.0.1:8188/history/${encodeURIComponent(id)}`);
    const data = await response.json();
    const item = data[id];
    if (!item) {
      try {
        const queueResponse = await fetch('http://127.0.0.1:8188/queue');
        const queue = await queueResponse.json() as { queue_pending?: unknown[]; queue_running?: unknown[] };
        const pending = Array.isArray(queue.queue_pending) ? queue.queue_pending : [];
        const running = Array.isArray(queue.queue_running) ? queue.queue_running : [];
        const isRunning = running.some((entry) => Array.isArray(entry) && entry[1] === id);
        if (isRunning) return Response.json({ status: 'running' });
        const pendingIndex = pending.findIndex((entry) => Array.isArray(entry) && entry[1] === id);
        if (pendingIndex >= 0) return Response.json({ status: 'queued', position: pendingIndex + 1 });
      } catch {
        // History remains the source of truth if queue inspection is unavailable.
      }
      return Response.json({ status: 'pending' });
    }
    if (item.status?.status_str === 'error') {
      const messages = Array.isArray(item.status.messages) ? item.status.messages : [];
      const detail = messages.find((entry: unknown) => Array.isArray(entry) && entry[0] === 'execution_error')?.[1];
      return Response.json({ status: 'error', error: detail?.exception_message ?? 'ComfyUI 执行失败' });
    }
    const output = findVideoOutput(item);
    if (!output) return Response.json({ status: 'running' });
    // The local Worker runtime cannot write arbitrary Windows paths. Return a
    // same-origin proxy URL; the browser saves it via the selected directory handle.
    const url = `/api/video?filename=${encodeURIComponent(output.filename)}&subfolder=${encodeURIComponent(output.subfolder ?? '')}`;
    return Response.json({ status: 'completed', url, source: output.filename, source_subfolder: output.subfolder ?? '', shot, noise_seed: seed, seed_mode: seedMode });
  } catch (error) { return Response.json({ status: 'error', error: error instanceof Error ? error.message : '状态查询失败' }, { status: 500 }); }
}
