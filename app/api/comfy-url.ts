export const DEFAULT_COMFY_URL = 'http://127.0.0.1:8188';

export function normalizeComfyUrl(value?: unknown) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : process.env.COMFYUI_URL?.trim() || DEFAULT_COMFY_URL;
  return raw.replace(/\/+$/, '');
}
