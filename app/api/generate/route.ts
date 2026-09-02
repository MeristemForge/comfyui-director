import t2vTemplate from '../../../comfyui-workflows/minimax-h3/video_minimax_h3_t2v.json';
import i2vTemplate from '../../../comfyui-workflows/minimax-h3/video_minimax_h3_i2v.json';
import r2vTemplate from '../../../comfyui-workflows/minimax-h3/video_minimax_h3_r2v.json';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const template = body.mode === 'I2VA' ? i2vTemplate : body.mode === 'R2VA' ? r2vTemplate : t2vTemplate;
    const workflow = structuredClone(template) as Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;
    // API exports from subgraphs may prefix node IDs; flatten them for ComfyUI's prompt endpoint.
    const normalized: Record<string, { inputs?: Record<string, unknown> }> = {};
    for (const [id, node] of Object.entries(workflow)) normalized[id.includes(':') ? id.split(':').pop()! : id] = node;
    for (const node of Object.values(normalized)) {
      if (!node.inputs) continue;
      for (const [key, value] of Object.entries(node.inputs)) {
        if (Array.isArray(value) && typeof value[0] === 'string' && value[0].includes(':')) value[0] = value[0].split(':').pop()!;
        if (typeof value === 'string' && value.includes(':')) node.inputs[key] = value.split(':').pop()!;
      }
    }
    const [width, height] = String(body.resolution ?? '1344 × 768').split('×').map((value) => Number(value.trim()));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return Response.json({ error: '无效的分辨率' }, { status: 400 });

    const node = (type: string) => Object.values(normalized).find((item) => item.class_type === type);
    const turbo = Boolean(body.turbo) || body.model === 'H3-加速';
    const turboSwitch = node('PrimitiveBoolean');
    if (turboSwitch) turboSwitch.inputs!.value = turbo;
    const stepNodes = Object.values(normalized).filter((item) => item.class_type === 'PrimitiveInt');
    const stepNode = stepNodes.find((item) => Number(item.inputs?.value) === 20 || Number(item.inputs?.value) === 4);
    if (stepNode) stepNode.inputs!.value = turbo ? 4 : 20;
    node('RandomNoise')!.inputs!.noise_seed = Number(body.seed) || Math.floor(Math.random() * 9000000000000000) + 1000000000000000;
    const videoNode = Object.values(normalized).find((item) => item.class_type?.startsWith('MiniMaxH3'))!;
    const imageNode = node('LoadImage');
    if (body.mode === 'R2VA') {
      const nextNodeId = () => String(Math.max(0, ...Object.keys(normalized).map((id) => Number(id)).filter(Number.isFinite)) + 1);
      const addNode = (classType: string, inputs: Record<string, unknown>) => {
        const id = nextNodeId();
        normalized[id] = { class_type: classType, inputs };
        return id;
      };
      for (const key of Object.keys(videoNode.inputs ?? {})) {
        if (/^(ref_images\.ref_image_|ref_videos\.ref_video_|ref_video_audios\.ref_video_audio_|ref_audios\.ref_audio_)/.test(key)) delete videoNode.inputs![key];
      }
      const images = Array.isArray(body.images) ? body.images.filter((value: unknown): value is string => typeof value === 'string' && value.trim()) : [];
      const videos = Array.isArray(body.videos) ? body.videos.filter((value: unknown): value is string => typeof value === 'string' && value.trim()) : [];
      const videoAudios = Array.isArray(body.video_audios) ? body.video_audios.filter((value: unknown): value is string => typeof value === 'string' && value.trim()) : [];
      const audios = Array.isArray(body.audios) ? body.audios.filter((value: unknown): value is string => typeof value === 'string' && value.trim()) : [];
      if (images.length > 9 || videos.length > 3 || videoAudios.length > 3 || audios.length > 3) return Response.json({ error: 'R2VA 参考素材数量超过 H3 限制' }, { status: 400 });
      images.forEach((filename, index) => {
        const loaderId = addNode('LoadImage', { image: filename });
        videoNode.inputs![`ref_images.ref_image_${index}`] = [loaderId, 0];
      });
      videos.forEach((filename, index) => {
        const loaderId = addNode('LoadVideo', { file: filename });
        const componentsId = addNode('GetVideoComponents', { video: [loaderId, 0] });
        videoNode.inputs![`ref_videos.ref_video_${index}`] = [componentsId, 0];
      });
      videoAudios.forEach((filename, index) => {
        const loaderId = addNode('LoadAudio', { audio: filename });
        videoNode.inputs![`ref_video_audios.ref_video_audio_${index}`] = [loaderId, 0];
      });
      audios.forEach((filename, index) => {
        const loaderId = addNode('LoadAudio', { audio: filename });
        videoNode.inputs![`ref_audios.ref_audio_${index}`] = [loaderId, 0];
      });
    } else if (imageNode && body.image) {
      imageNode.inputs!.image = String(body.image);
    }
    videoNode.inputs!.prompt = String(body.prompt ?? '');
    videoNode.inputs!.width = width; videoNode.inputs!.height = height;
    const durationNode = node('PrimitiveFloat'); if (durationNode) durationNode.inputs!.value = Number.parseInt(String(body.duration ?? '6'), 10) || 6;
    node('CreateVideo')!.inputs!.fps = Number.parseInt(String(body.fps ?? '24'), 10) || 24;
    const shotId = String(body.shot_id ?? 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const shotTitle = String(body.shot_title ?? '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || `shot-${shotId}`;
    const saveVideoNode = node('SaveVideo');
    if (saveVideoNode) saveVideoNode.inputs!.filename_prefix = `director/shot-${shotId}-${shotTitle}-${Date.now().toString(36)}`;
    const clientId = typeof body.client_id === 'string' && body.client_id ? body.client_id : 'comfyui-director';
    const response = await fetch('http://127.0.0.1:8188/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: normalized, client_id: clientId }) });
    const result = await response.json();
    if (!response.ok) return Response.json({ error: result.error ?? 'ComfyUI 提交失败' }, { status: response.status });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : '生成请求失败' }, { status: 500 });
  }
}
