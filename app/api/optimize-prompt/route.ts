import path from "node:path";
import { spawn } from "node:child_process";

export const runtime = "nodejs";
type OptimizeBody = {
  executablePath?: string;
  prompt?: string;
  mode?: string;
  duration?: number | string;
  visualStyle?: string;
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

function runAgent(executablePath: string, prompt: string) {
  return new Promise<string>((resolve, reject) => {
    const executable = executablePath.trim();
    const isCodex = /codex/i.test(path.basename(executable));
    const args = isCodex ? ["--ask-for-approval", "never", "exec", "-", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "--color", "never"] : ["-p", prompt, "--output-format", "text"];
    const child = spawn(executable, args, { cwd: process.cwd(), windowsHide: true, shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(executable), stdio: isCodex ? ["pipe", "pipe", "pipe"] : ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("本地 Agent 优化超时")); }, 120000);
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(new Error(`无法启动本地 Agent：${error.message}`)); });
    child.on("close", (code) => { clearTimeout(timer); if (code !== 0) return reject(new Error(stderr.trim() || `Agent 退出码 ${code}`)); const result = stdout.trim().replace(/^```(?:text)?\s*/i, "").replace(/\s*```$/, "").trim(); if (!result) return reject(new Error("本地 Agent 未返回优化结果")); resolve(result); });
    if (isCodex) child.stdin.end(prompt);
  });
}

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
    const style = typeof body.visualStyle === "string" ? body.visualStyle.trim() : "";
    const styleContext = style
      ? `\n\nVisual style preset:\n${style}\nApply this visual style consistently throughout the target clip while preserving realistic subject identity and scene requirements.`
      : "";
    const context = `${H3_INSTRUCTION}\nUse the installed H3 prompt-writing skill when available.\n\nMode: ${body.mode || "T2VA"}\nDuration: ${body.duration || 6} seconds${styleContext}${referenceContext}\n\nUser draft:\n${draft}`;
    if (!body.executablePath?.trim()) throw new Error("未配置本地 Agent 可执行程序路径");
    return Response.json({ prompt: await runAgent(body.executablePath, context) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "提示词优化失败" }, { status: 500 }); }
}
