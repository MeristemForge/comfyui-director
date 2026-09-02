export async function POST(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  let file: File;
  if (contentType.includes('application/json')) {
    const body = await request.json();
    if (!body.data || !body.name) return Response.json({ error: '缺少图片数据' }, { status: 400 });
    const bytes = Uint8Array.from(atob(String(body.data).replace(/^data:[^;]+;base64,/, '')), (char) => char.charCodeAt(0));
    file = new File([bytes], String(body.name), { type: String(body.mime ?? 'image/png') });
  } else {
    const form = await request.formData();
    const uploaded = form.get('image');
    if (!(uploaded instanceof File)) return Response.json({ error: '缺少图片文件' }, { status: 400 });
    file = uploaded;
  }
  const upstream = new FormData(); upstream.append('image', file, file.name); upstream.append('type', 'input'); upstream.append('overwrite', 'true');
  const response = await fetch('http://127.0.0.1:8188/upload/image', { method: 'POST', body: upstream });
  const result = await response.json();
  return Response.json(result, { status: response.status });
}
