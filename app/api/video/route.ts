import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { normalizeComfyUrl } from '../comfy-url';

export const runtime = 'nodejs';

function rangeHeaders(request: Request, size: number) {
  const range = request.headers.get('range');
  if (!range?.startsWith('bytes=')) return null;
  const [startText, endText] = range.slice(6).split('-', 2);
  const start = startText ? Number.parseInt(startText, 10) : Math.max(0, size - Number.parseInt(endText, 10));
  const end = endText ? Number.parseInt(endText, 10) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

async function localVideoResponse(request: Request, filePath: string) {
  const fileUrl = pathToFileURL(filePath);
  const metadata = await stat(fileUrl);
  const range = rangeHeaders(request, metadata.size);
  const headers = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (!range) {
    const body = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
    return new Response(body, { headers: { ...headers, 'Content-Length': String(metadata.size) } });
  }
  const body = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as unknown as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: {
      ...headers,
      'Content-Length': String(range.end - range.start + 1),
      'Content-Range': `bytes ${range.start}-${range.end}/${metadata.size}`,
    },
  });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const shot = params.get('shot');
  if (shot) {
    const directorRoot = process.env.DIRECTOR_PROJECT_DIR ?? 'C:/Users/wujin/Desktop/workspace/comfyui-director';
    const shotDir = path.join(directorRoot, 'generated-shots', `shot-${shot}`);
    let filePath: string;
    try {
      await stat(pathToFileURL(path.join(shotDir, `shot-${shot}.mp4`)));
      filePath = path.join(shotDir, `shot-${shot}.mp4`);
    } catch {
      filePath = path.join(shotDir, 'output.mp4');
    }
    return localVideoResponse(request, filePath);
  }
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
