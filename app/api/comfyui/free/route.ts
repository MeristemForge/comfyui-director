import { normalizeComfyUrl } from '../../comfy-url';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { comfy_url?: unknown };
    const response = await fetch(`${normalizeComfyUrl(body.comfy_url)}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    return Response.json({ ok: response.ok }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '释放 ComfyUI 内存失败' }, { status: 500 });
  }
}
