export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';

export function normalizeComfyUrl(value?: unknown) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : process.env.COMFYUI_URL?.trim() || DEFAULT_COMFY_URL;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('ComfyUI 地址无效，只支持 http 或 https 地址');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname)
    throw new Error('ComfyUI 地址无效，只支持 http 或 https 地址');
  parsed.hash = '';
  parsed.search = '';
  return parsed.toString().replace(/\/+$/, '');
}
