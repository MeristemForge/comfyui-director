export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { prompt_id?: unknown };
    const promptId = typeof body?.prompt_id === 'string' ? body.prompt_id : '';
    const endpoint = promptId ? `http://127.0.0.1:8188/api/jobs/${encodeURIComponent(promptId)}/cancel` : 'http://127.0.0.1:8188/interrupt';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    return Response.json({ ok: response.ok }, { status: response.ok ? 200 : response.status });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : '停止失败' }, { status: 500 }); }
}
