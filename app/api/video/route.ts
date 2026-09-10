import { normalizeComfyUrl } from '../comfy-url';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const fileType = params.get('type') === 'input' || params.get('type') === 'temp' ? params.get('type') : 'output';
  const upstream = `${normalizeComfyUrl(params.get('comfy_url'))}/view?filename=${encodeURIComponent(params.get('filename') ?? '')}&subfolder=${encodeURIComponent(params.get('subfolder') ?? '')}&type=${fileType}`;
  const response = await fetch(upstream, { headers: request.headers.get('range') ? { Range: request.headers.get('range')! } : undefined });
  const headers = new Headers(response.headers);
  headers.set('Content-Type', response.headers.get('content-type') ?? 'video/mp4');
  headers.set('Cache-Control', 'no-cache');
  if (response.headers.has('accept-ranges')) headers.set('Accept-Ranges', response.headers.get('accept-ranges')!);
  if (response.headers.has('content-range')) headers.set('Content-Range', response.headers.get('content-range')!);
  return new Response(response.body, { status: response.status, headers });
}
