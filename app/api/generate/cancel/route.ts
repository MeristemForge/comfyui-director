import { normalizeComfyUrl } from '../../comfy-url';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { prompt_id?: unknown; comfy_url?: unknown };
    const promptId = typeof body?.prompt_id === 'string' ? body.prompt_id : '';
    const endpoint = promptId ? `${normalizeComfyUrl(body?.comfy_url)}/api/jobs/${encodeURIComponent(promptId)}/cancel` : `${normalizeComfyUrl(body?.comfy_url)}/interrupt`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return Response.json({ ok: response.ok }, { status: response.ok ? 200 : response.status });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '停止失败' }, { status: 500 }); }
}
