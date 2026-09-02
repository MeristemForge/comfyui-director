export const runtime = 'nodejs';

export async function GET() {
  try {
    const response = await fetch('http://127.0.0.1:8188/system_stats', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    if (!response.ok) return Response.json({ connected: false });
    return Response.json({ connected: true });
  } catch {
    return Response.json({ connected: false });
  }
}
