import t2vTemplate from '../../../comfyui-workflows/minimax-h3/api/video_minimax_h3_t2v-api.json';
import i2vTemplate from '../../../comfyui-workflows/minimax-h3/api/video_minimax_h3_i2v-api.json';
import r2vTemplate from '../../../comfyui-workflows/minimax-h3/api/video_minimax_h3_r2v-api.json';
import { normalizeComfyUrl } from '../comfy-url';

type GenerateBody = {
  mode?: unknown;
  duration?: unknown;
  fps?: unknown;
  prompt?: unknown;
  turbo?: unknown;
  seed?: unknown;
  comfy_url?: unknown;
  resolution?: unknown;
  aspect?: unknown;
  keyframe_mode?: unknown;
  image?: unknown;
  last_image?: unknown;
  images?: unknown;
  videos?: unknown;
  audios?: unknown;
  shot_id?: unknown;
  shot_title?: unknown;
  client_id?: unknown;
};
type WorkflowNode = { inputs?: Record<string, unknown>; class_type?: string; [key: string]: unknown };

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback;
}

export async function POST(request: Request) {
  try {
    const rawBody: unknown = await request.json();
    if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody))
      return Response.json({ error: '请求参数无效' }, { status: 400 });
    const body = rawBody as GenerateBody;
    const mode = body.mode;
    if (typeof mode !== 'string' || !['T2VA', 'I2VA', 'R2VA'].includes(mode))
      return Response.json({ error: '无效生成模式' }, { status: 400 });
    const duration = Number(body.duration);
    const fps = Number(body.fps);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 30)
      return Response.json({ error: '无效的时长' }, { status: 400 });
    if (!Number.isFinite(fps) || fps <= 0 || fps > 120)
      return Response.json({ error: '无效的 FPS' }, { status: 400 });
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim())
      return Response.json({ error: '提示词不能为空' }, { status: 400 });
    if (body.turbo !== undefined && typeof body.turbo !== 'boolean')
      return Response.json({ error: 'turbo 必须是布尔值' }, { status: 400 });
    const seedText = textValue(body.seed);
    if (body.seed !== undefined &&
      (!/^[0-9]+$/.test(seedText) ||
        !Number.isSafeInteger(Number(body.seed))))
      return Response.json({ error: 'seed 必须是安全整数' }, { status: 400 });
    const comfyUrl = normalizeComfyUrl(body.comfy_url);
    const template = mode === 'I2VA' ? i2vTemplate : mode === 'R2VA' ? r2vTemplate : t2vTemplate;
    const workflow = structuredClone(template) as Record<string, WorkflowNode>;
    // API exports from subgraphs may prefix node IDs; flatten them for ComfyUI's prompt endpoint.
    const normalized: Record<string, WorkflowNode> = {};
    for (const [id, node] of Object.entries(workflow)) normalized[id.includes(':') ? id.split(':').pop()! : id] = node;
    for (const node of Object.values(normalized)) {
      if (!node.inputs) continue;
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value) && typeof value[0] === 'string' && value[0].includes(':')) value[0] = value[0].split(':').pop()!;
      }
    }
    const resolutionMatch = textValue(body.resolution, '1344 × 768').trim().match(/^(\d+)\s*[×x]\s*(\d+)$/i);
    let width = resolutionMatch ? Number(resolutionMatch[1]) : NaN;
    let height = resolutionMatch ? Number(resolutionMatch[2]) : NaN;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
      return Response.json({ error: '无效的分辨率' }, { status: 400 });
    // Keep the selected pixel budget while honoring portrait/square/wide aspect
    // choices. H3 requires dimensions aligned to a 32-pixel grid.
    const aspect = textValue(body.aspect, '16:9').trim();
    const aspectMatch = aspect.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!aspectMatch || Number(aspectMatch[1]) <= 0 || Number(aspectMatch[2]) <= 0)
      return Response.json({ error: '无效的画面比例' }, { status: 400 });
    const ratio = Number(aspectMatch[1]) / Number(aspectMatch[2]);
    if (!Number.isFinite(ratio) || ratio <= 0)
      return Response.json({ error: '无效的画面比例' }, { status: 400 });
    if (aspect !== '16:9') {
      const area = width * height;
      width = Math.max(32, Math.round(Math.sqrt(area * ratio) / 32) * 32);
      height = Math.max(32, Math.round(Math.sqrt(area / ratio) / 32) * 32);
    }
    if (width > 4096 || height > 4096 || width * height > 4096 * 4096)
      return Response.json({ error: '分辨率不能超过 4096 × 4096' }, { status: 400 });

    const node = (type: string) => Object.values(normalized).find((item) => item.class_type === type);
    const turbo = body.turbo === true;
    const turboSwitch = node('PrimitiveBoolean');
    if (turboSwitch) turboSwitch.inputs!.value = turbo;
    const stepNodes = Object.values(normalized).filter((item) => item.class_type === 'PrimitiveInt');
    const stepNode = stepNodes.find((item) => Number(item.inputs?.value) === 20 || Number(item.inputs?.value) === 4);
    if (stepNode) stepNode.inputs!.value = turbo ? 4 : 20;
    node('RandomNoise')!.inputs!.noise_seed = body.seed === undefined
      ? Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)) + 1
      : Number(body.seed);
    const videoNode = Object.values(normalized).find((item) => item.class_type?.startsWith('MiniMaxH3'))!;
    const imageNode = node('LoadImage');
    if (mode === 'I2VA') {
      const keyframeMode = typeof body.keyframe_mode === 'string' ? body.keyframe_mode : 'first';
      if (!['first', 'last', 'first_last'].includes(keyframeMode))
        return Response.json({ error: '无效的关键帧模式' }, { status: 400 });
      const useFirst = keyframeMode === 'first' || keyframeMode === 'first_last';
      const useLast = keyframeMode === 'last' || keyframeMode === 'first_last';
      const firstImage = useFirst && typeof body.image === 'string' && body.image.trim() ? body.image.trim() : '';
      const lastImage = useLast && typeof body.last_image === 'string' && body.last_image.trim() ? body.last_image.trim() : '';
      if ((keyframeMode === 'first' || keyframeMode === 'first_last') && !firstImage) return Response.json({ error: 'I2VA 首帧未上传' }, { status: 400 });
      if ((keyframeMode === 'last' || keyframeMode === 'first_last') && !lastImage) return Response.json({ error: '关键帧模式需要尾帧' }, { status: 400 });
      if (videoNode.inputs) {
        delete videoNode.inputs.first_frame;
        delete videoNode.inputs.last_frame;
        const imageNodeId = Object.entries(normalized).find(([, item]) => item === imageNode)?.[0];
        if (firstImage && imageNode) {
          imageNode.inputs!.image = firstImage;
          videoNode.inputs.first_frame = [imageNodeId ?? '114', 0];
        } else if (imageNodeId) {
          // Do not leave the template's example image as an unrelated node in
          // last-frame-only mode; ComfyUI may still validate it.
          delete normalized[imageNodeId];
        }
        if (lastImage) {
          const lastNodeId = nextNumericNodeId(normalized);
          normalized[lastNodeId] = { class_type: 'LoadImage', inputs: { image: lastImage } };
          videoNode.inputs.last_frame = [lastNodeId, 0];
        }
      }
    }
    if (mode === 'R2VA') {
      const addNode = (classType: string, inputs: Record<string, unknown>) => {
        const id = nextNumericNodeId(normalized);
        normalized[id] = { class_type: classType, inputs };
        return id;
      };
      for (const key of Object.keys(videoNode.inputs ?? {})) {
        if (/^(ref_images\.ref_image_|ref_videos\.ref_video_|ref_audios\.ref_audio_)/.test(key)) delete videoNode.inputs![key];
      }
      const images = Array.isArray(body.images) ? body.images.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0) : [];
      const videos = Array.isArray(body.videos) ? body.videos.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0) : [];
      const audios = Array.isArray(body.audios) ? body.audios.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0) : [];
      if (images.length > 9 || videos.length > 3 || audios.length > 3) return Response.json({ error: 'R2VA 参考素材数量超过 H3 限制' }, { status: 400 });
      images.forEach((filename, index) => {
        const loaderId = addNode('LoadImage', { image: filename });
        videoNode.inputs![`ref_images.ref_image_${index}`] = [loaderId, 0];
      });
      videos.forEach((filename, index) => {
        const loaderId = addNode('LoadVideo', { file: filename });
        const componentsId = addNode('GetVideoComponents', { video: [loaderId, 0] });
        videoNode.inputs![`ref_videos.ref_video_${index}`] = [componentsId, 0];
      });
      audios.forEach((filename, index) => {
        const loaderId = addNode('LoadAudio', { audio: filename });
        videoNode.inputs![`ref_audios.ref_audio_${index}`] = [loaderId, 0];
      });
    }
    videoNode.inputs!.prompt = prompt;
    videoNode.inputs!.width = width; videoNode.inputs!.height = height;
    const durationNode = node('PrimitiveFloat'); if (durationNode) durationNode.inputs!.value = duration;
    node('CreateVideo')!.inputs!.fps = fps;
    const shotId = textValue(body.shot_id, 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const shotTitle = textValue(body.shot_title).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || `shot-${shotId}`;
    const saveVideoNode = node('SaveVideo');
    if (saveVideoNode) saveVideoNode.inputs!.filename_prefix = `director/shot-${shotId}-${shotTitle}-${Date.now().toString(36)}`;
    const clientId = typeof body.client_id === 'string' && body.client_id ? body.client_id : 'comfyui-director';
    const response = await fetch(`${comfyUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: normalized, client_id: clientId }), signal: AbortSignal.timeout(30000) });
    const result = await response.json().catch(() => ({})) as {
      prompt_id?: unknown;
      error?: unknown;
      node_errors?: unknown;
    };
    if (!response.ok) {
      const error = result.error;
      const baseMessage = typeof error === 'string'
        ? error
        : error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : error && typeof error === 'object' && typeof (error as { details?: unknown }).details === 'string'
            ? (error as { details: string }).details
            : `ComfyUI 提交失败（HTTP ${response.status}）`;
      const nodeDetails = Object.values((result.node_errors ?? {}) as Record<string, unknown>)
        .flatMap((nodeError) => nodeError && typeof nodeError === 'object' && Array.isArray((nodeError as { errors?: unknown }).errors) ? (nodeError as { errors: unknown[] }).errors : [])
        .map((nodeError) => nodeError && typeof nodeError === 'object' && typeof (nodeError as { details?: unknown }).details === 'string' ? (nodeError as { details: string }).details : '')
        .filter(Boolean);
      const message = nodeDetails.length ? `${baseMessage}: ${nodeDetails.join('; ')}` : baseMessage;
      return Response.json({ error: message, node_errors: result.node_errors }, { status: response.status });
    }
    if (typeof result.prompt_id !== 'string' || !result.prompt_id) {
      return Response.json({ error: 'ComfyUI 未返回任务 ID', node_errors: result.node_errors }, { status: 502 });
    }
    return Response.json(result);
  } catch (error) {
    const timedOut = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return Response.json({ error: timedOut ? 'ComfyUI 请求超时' : error instanceof Error ? error.message : '生成请求失败' }, { status: timedOut ? 504 : 500 });
  }
}

function nextNumericNodeId(workflow: Record<string, unknown>) {
  return String(Math.max(0, ...Object.keys(workflow).map((id) => Number(id)).filter(Number.isFinite)) + 1);
}
