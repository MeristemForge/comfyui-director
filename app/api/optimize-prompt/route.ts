export const runtime = "nodejs";
type OptimizeBody = {
  executablePath?: string;
  prompt?: string;
  mode?: string;
  duration?: number | string;
  referenceMapping?: Array<{
    picture?: string;
    subject?: string;
    role?: string;
    assetName?: string;
    usage?: string;
    description?: string;
  }>;
};
const H3_INSTRUCTION = `You are a professional MiniMax H3 audiovisual prompt editor. Rewrite the user's draft into a production-ready H3 prompt. Preserve dialogue, lyrics, and visible text in their original language. Do not invent plot events, dialogue, subjects, or reference assets. Match the requested duration. Describe concrete composition, subjects, environment, actions, camera movement, sound, and timing. For T2VA/I2VA/FL2VA/L2VA output exactly these three sections in this order: integrated_multimodal_description, overall_soundscape, non_diegetic_music. For R2VA output exactly these six sections in this order: subject_definitions, summary, retention_analysis, detailed_description, overall_soundscape, non_diegetic_music. In R2VA mode, never output integrated_multimodal_description. Use the provided reference subjects and asset labels in subject_definitions, and repeat the same labels consistently in summary, retention_analysis, and detailed_description. Return only the finished prompt, without markdown fences or commentary.`;
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OptimizeBody;
    const draft = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!draft) return Response.json({ error: "请先输入提示词" }, { status: 400 });
    const mappings = Array.isArray(body.referenceMapping)
      ? body.referenceMapping
          .filter(
            (item) =>
              typeof item.picture === "string" &&
              typeof item.subject === "string" &&
              item.picture.trim() &&
              item.subject.trim(),
          )
          .map(
            (item) =>
              `${item.picture!.trim()} = entity: ${item.subject!.trim()}${
                item.usage?.trim() ? `; usage: ${item.usage.trim()}` : ""
              }${
                item.description?.trim()
                  ? `; description: ${item.description.trim()}`
                  : ""
              }${item.role?.trim() ? `; role: ${item.role.trim()}` : ""}${
                item.assetName?.trim() ? `; file: ${item.assetName.trim()}` : ""
              }`,
          )
          .join("\n")
      : "";
    const referenceContext = mappings
      ? `\n\nReference inputs below correspond to the actual H3 input slots. Keep Picture/Video/Audio ordinals unchanged and use only the listed inputs. Infer subject grouping, subject names, reference roles, and relationships from the normalized filenames and the user's draft:\n${mappings}`
      : "";
    const context = `${H3_INSTRUCTION}\nUse the installed H3 prompt-writing skill when available.\n\nMode: ${body.mode || "T2VA"}\nDuration: ${body.duration || 6} seconds${referenceContext}\n\nUser draft:\n${draft}`;
    const helper = await fetch("http://127.0.0.1:3101/optimize-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: context, executablePath: body.executablePath?.trim() }),
      signal: AbortSignal.timeout(130_000),
    });
    const result = (await helper.json().catch(() => ({}))) as { prompt?: string; error?: string };
    if (!helper.ok || !result.prompt) throw new Error(result.error || "本地 Agent 优化失败");
    return Response.json({ prompt: result.prompt });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "提示词优化失败" }, { status: 500 }); }
}
