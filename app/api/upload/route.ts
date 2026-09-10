import { normalizeComfyUrl } from '../comfy-url';

export async function POST(request: Request) {
  const form = await request.formData();
  const comfyUrlValue = form.get('comfy_url');
  const comfyUrl = typeof comfyUrlValue === 'string' ? comfyUrlValue : undefined;
  const file = form.get('image');
  if (!(file instanceof File)) return Response.json({ error: '缺少图片文件' }, { status: 400 });
  // ComfyUI keys uploaded files by basename. Two character references often
  // share names such as "半身正面.png"; forwarding the original name with
  // overwrite enabled silently replaces the earlier reference. Give every
  // upload a unique storage name while keeping the original name in the UI.
  const originalName = file.name;
  const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
  const stem = (originalName.slice(0, originalName.length - extension.length)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .trim()
    .slice(0, 80)) || 'reference';
  const uniqueName = `director-ref-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}-${stem}${extension}`;
  const upstream = new FormData(); upstream.append('image', file, uniqueName); upstream.append('type', 'input'); upstream.append('overwrite', 'false');
  const response = await fetch(`${normalizeComfyUrl(comfyUrl)}/upload/image`, { method: 'POST', body: upstream });
  const result = await response.json();
  return Response.json(result, { status: response.status });
}
