import { normalizeComfyUrl } from '../../comfy-url';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url).searchParams.get('comfy_url');
    const response = await fetch(`${normalizeComfyUrl(url)}/system_stats`, { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return Response.json({ connected: false });
    return Response.json({ connected: true });
  } catch {
    return Response.json({ connected: false });
  }
}
