#!/usr/bin/env node

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_DIRECTOR_URL = "http://localhost:3000";
const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";
const DEFAULT_TIMEOUT_SECONDS = 1800;
const REFERENCE_LIMITS = { image: 9, video: 3, audio: 3 };
const PROMPT_SECTIONS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
];

function usage() {
  return `directorctl - operate ComfyUI Director Desk projects without UI clicks

Usage:
  node scripts/directorctl.mjs status [--director-url URL] [--comfy-url URL]
  node scripts/directorctl.mjs inspect --project PROJECT
  node scripts/directorctl.mjs assets --project PROJECT
  node scripts/directorctl.mjs clips --project PROJECT
  node scripts/directorctl.mjs clip --project PROJECT --clip ID
  node scripts/directorctl.mjs bind --project PROJECT --clip ID --asset PATH [--subject NAME] [--role ROLE]
  node scripts/directorctl.mjs prepare --project PROJECT --clip ID
  node scripts/directorctl.mjs render --project PROJECT --clip ID [--wait] [--timeout SECONDS]

Common options:
  --director-url URL   Director Desk URL (default: ${DEFAULT_DIRECTOR_URL})
  --comfy-url URL      ComfyUI URL (default: ${DEFAULT_COMFY_URL})
  --pretty             Pretty-print JSON output
  --prompt-file PATH   Read the agent-written final prompt from a project file
  --help               Show this help
`;
}

function parseArgs(argv) {
  const args = { _: [], asset: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      args._.push(...argv.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const equal = token.indexOf("=");
    const name = equal >= 0 ? token.slice(2, equal) : token.slice(2);
    const inlineValue = equal >= 0 ? token.slice(equal + 1) : undefined;
    if (["help", "pretty", "wait"].includes(name) && inlineValue === undefined) {
      args[name] = true;
      continue;
    }
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`选项 --${name} 缺少值`);
    if (name === "asset") args.asset.push(value);
    else args[name.replaceAll("-", "_")] = value;
  }
  return args;
}

function output(value, pretty) {
  process.stdout.write(`${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function normalizeUrl(value, fallback) {
  const result = String(value || fallback).trim().replace(/\/$/, "");
  try { return new URL(result).toString().replace(/\/$/, ""); } catch { fail(`无效的 URL：${result}`); }
}

function safeStem(value) {
  const sanitized = String(value).replace(/[<>:"/\\|?*]/g, "_").split("").filter((character) => character.charCodeAt(0) >= 32).join("");
  return (sanitized.trim().replace(/[. ]+$/g, "").slice(0, 120) || "未命名片段");
}

function relativeProjectPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

function ensureInside(root, candidate) {
  const rootPath = path.resolve(root);
  const candidatePath = path.resolve(root, candidate);
  const relative = path.relative(rootPath, candidatePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`路径超出项目目录：${candidate}`);
  return candidatePath;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const wrapped = new Error(`无法读取 JSON：${filePath}`);
    wrapped.details = error;
    throw wrapped;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function projectInfo(projectPath) {
  const root = path.resolve(projectPath || ".");
  const script = await readJson(path.join(root, "script.json"));
  if (!Array.isArray(script.clips)) fail("script.json 缺少 clips 数组");
  return { root, script };
}

function clipManifestPath(root, clip) {
  const manifestPath = typeof clip.path === "string" && clip.path.trim()
    ? clip.path
    : `片段/${clip.id}-${safeStem(clip.title)}/clip.json`;
  return ensureInside(root, manifestPath);
}

async function getClip(project, clipId) {
  const clip = project.script.clips.find((item) => String(item.id) === String(clipId));
  if (!clip) fail(`找不到片段：${clipId}`);
  const manifestPath = clipManifestPath(project.root, clip);
  let manifest;
  try {
    manifest = await readJson(manifestPath);
  } catch (error) {
    if (error.details?.code === "ENOENT") manifest = { id: clip.id, title: clip.title };
    else throw error;
  }
  return { clip, manifest, manifestPath, directory: path.dirname(manifestPath) };
}

function inferKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(extension)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(extension)) return "audio";
  return "image";
}

function referenceKind(reference) {
  if (["image", "video", "audio"].includes(reference.kind)) return reference.kind;
  const match = String(reference.assetKey || "").match(/-(image|video|audio)-\d+$/);
  return match?.[1] || inferKind(reference.sourcePath || reference.name || "");
}

function inferRole(assetType, explicitRole) {
  if (explicitRole) return explicitRole === "clothing" ? "wardrobe" : explicitRole;
  return ({ character: "character", clothing: "wardrobe", prop: "object", scene: "environment", video: "composite", audio: "composite" })[assetType] || "composite";
}

function assetTypeFromFolder(filePath) {
  const folder = relativeProjectPath(filePath).split("/")[1];
  return ({ "角色": "character", "服装": "clothing", "道具": "prop", "场景": "scene", "视频": "video", "音频": "audio", "自定义": "custom" })[folder] || "custom";
}

function nameFromFile(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.split("_")[0] || base;
}

async function walkFiles(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRelative = path.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(child, childRelative));
    else if (!entry.name.endsWith(".json") || entry.name === "clip.json") files.push(childRelative);
  }
  return files;
}

function allReferences(manifest) {
  return Array.isArray(manifest.references?.subjects) ? manifest.references.subjects : [];
}

function referenceEntries(manifest) {
  return allReferences(manifest).flatMap((subject) => [
    ...(Array.isArray(subject.references) ? subject.references.map((reference) => ({ subject, reference })) : []),
    ...(Array.isArray(subject.children) ? subject.children.flatMap((child) => (child.references || []).map((reference) => ({ subject: child, reference }))) : []),
  ]);
}

function nextSlot(manifest, clipId, kind) {
  const used = new Set(referenceEntries(manifest).map(({ reference }) => reference.assetKey).filter((key) => typeof key === "string" && key.startsWith(`${clipId}-${kind}-`)).map((key) => Number(key.slice(`${clipId}-${kind}-`.length))).filter(Number.isInteger));
  for (let index = 0; index < REFERENCE_LIMITS[kind]; index += 1) if (!used.has(index)) return index;
  fail(`${kind} 参考素材已达到 H3 上限 ${REFERENCE_LIMITS[kind]}`);
}

function findExistingReference(manifest, sourcePath) {
  return referenceEntries(manifest).find(({ reference }) => relativeProjectPath(reference.sourcePath || "") === relativeProjectPath(sourcePath));
}

async function resolveAsset(root, input) {
  const absolute = ensureInside(root, input);
  const info = await stat(absolute).catch(() => null);
  if (!info) fail(`找不到资产：${input}`);
  if (info.isFile()) return [{ absolute, sourcePath: relativeProjectPath(path.relative(root, absolute)), name: path.basename(absolute), type: assetTypeFromFolder(path.relative(root, absolute)) }];
  const files = await walkFiles(absolute);
  const resolved = files.filter((file) => path.basename(file) !== "clothing.json" && path.basename(file) !== "asset.json" && path.basename(file) !== "prop.json" && path.basename(file) !== "scene.json").map((file) => ({ absolute: path.join(absolute, file), sourcePath: relativeProjectPath(path.relative(root, path.join(absolute, file))), name: path.basename(file), type: assetTypeFromFolder(path.relative(root, path.join(absolute, file))) }));
  if (!resolved.length) fail(`资产目录中没有可绑定的媒体文件：${input}`);
  return resolved;
}

function subjectRecord(manifest, clipId, subjectName) {
  const subjects = allReferences(manifest);
  let subject = subjects.find((item) => String(item.name || "").trim().toLowerCase() === subjectName.trim().toLowerCase());
  if (!subject) {
    subject = { subjectId: `subject-${clipId}-${safeStem(subjectName)}`, name: subjectName.trim(), references: [] };
    manifest.references = { ...manifest.references, subjects };
    subjects.push(subject);
  }
  subject.references = Array.isArray(subject.references) ? subject.references : [];
  return subject;
}

async function bind(project, args) {
  if (!args.clip || !args.asset.length) fail("bind 需要 --clip 和至少一个 --asset");
  const target = await getClip(project, args.clip);
  const resolved = (await Promise.all(args.asset.map((asset) => resolveAsset(project.root, asset)))).flat();
  const bound = [];
  for (const asset of resolved) {
    const kind = inferKind(asset.absolute);
    const existing = findExistingReference(target.manifest, asset.sourcePath);
    const subject = subjectRecord(target.manifest, target.clip.id, args.subject || nameFromFile(asset.name));
    if (existing) {
      if (!subject.references.some((reference) => reference.assetKey === existing.reference.assetKey)) subject.references.push(existing.reference);
      bound.push({ asset: asset.sourcePath, assetKey: existing.reference.assetKey, reused: true });
      continue;
    }
    const index = nextSlot(target.manifest, target.clip.id, kind);
    const reference = { assetKey: `${target.clip.id}-${kind}-${index}`, role: inferRole(asset.type, args.role), name: asset.name, kind, sourcePath: asset.sourcePath };
    subject.references.push(reference);
    bound.push({ asset: asset.sourcePath, assetKey: reference.assetKey, subject: subject.name });
  }
  await writeJson(target.manifestPath, target.manifest);
  return { ok: true, clip: target.clip.id, manifest: relativeProjectPath(path.relative(project.root, target.manifestPath)), bound };
}

function promptText(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const record = value;
  return PROMPT_SECTIONS.filter((name) => typeof record[name] === "string" && record[name].trim()).map((name) => `${name}:\n${record[name].trim()}`).join("\n\n");
}

function selectedPrompt(manifest) {
  const prompt = manifest.prompt;
  if (prompt && typeof prompt === "object" && "original" in prompt) return prompt.selected === "optimized" && prompt.optimized ? promptText(prompt.optimized) : promptText(prompt.original);
  return promptText(prompt);
}

function fileUrl(base, value) {
  return new URL(value, `${base}/`).toString();
}

async function apiFetch(url, init) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(body.error || body.details || `请求失败（HTTP ${response.status}）`, body);
  return body;
}

async function apiFetchWithRetry(url, init, attempts = 8) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await apiFetch(url, init);
    } catch (error) {
      lastError = error;
      if (!/operation not permitted|EPERM|资源被占用/i.test(error.message) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

async function uploadReference(directorUrl, comfyUrl, asset) {
  const bytes = await readFile(asset.absolute);
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: mimeType(asset.absolute) }), asset.name);
  form.append("kind", inferKind(asset.absolute));
  form.append("comfy_url", comfyUrl);
  const result = await apiFetch(fileUrl(directorUrl, "/api/upload"), { method: "POST", body: form });
  if (!result.name) fail(`上传资产失败：${asset.sourcePath}`);
  return { comfyName: result.name, ...(result.subfolder ? { comfySubfolder: result.subfolder } : {}) };
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".flac": "audio/flac" })[extension] || "application/octet-stream";
}

async function prepare(project, args, urls) {
  if (!args.clip) fail("prepare 需要 --clip");
  const target = await getClip(project, args.clip);
  const entries = referenceEntries(target.manifest);
  const uploaded = [];
  for (const { reference } of entries) {
    if (reference.comfyName || !reference.sourcePath) continue;
    const absolute = ensureInside(project.root, reference.sourcePath);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) fail(`参考素材不存在：${reference.sourcePath}`);
    const remote = await uploadReference(urls.director, urls.comfy, { absolute, sourcePath: reference.sourcePath, name: reference.name || path.basename(absolute) });
    Object.assign(reference, remote);
    uploaded.push({ assetKey: reference.assetKey, sourcePath: reference.sourcePath, ...remote });
  }
  if (uploaded.length) await writeJson(target.manifestPath, target.manifest);
  const refs = { images: [], videos: [], audios: [] };
  const readyReferences = referenceEntries(target.manifest)
    .map(({ reference }) => ({ reference, kind: referenceKind(reference) }))
    .filter(({ reference }) => Boolean(reference.comfyName))
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
      const leftIndex = Number(String(left.reference.assetKey || "").match(/-(\d+)$/)?.[1] ?? 0);
      const rightIndex = Number(String(right.reference.assetKey || "").match(/-(\d+)$/)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
  for (const { reference, kind } of readyReferences) {
    if (!reference.comfyName) continue;
    const value = reference.comfySubfolder ? `${reference.comfySubfolder}/${reference.comfyName}` : reference.comfyName;
    if (kind === "video") refs.videos.push(value);
    else if (kind === "audio") refs.audios.push(value);
    else refs.images.push(value);
  }
  return { target, uploaded, references: refs, prompt: selectedPrompt(target.manifest) };
}

function generationOptions(manifest, args) {
  const generation = manifest.generation || {};
  return {
    mode: args.mode || generation.mode || "R2VA",
    duration: Number(args.duration ?? generation.duration ?? 6) || 6,
    resolution: args.resolution || generation.resolution || "864 × 480",
    aspect: args.aspect || generation.aspect || "16:9",
    fps: Number(args.fps ?? generation.fps ?? 24) || 24,
    model: args.model || generation.model || "H3",
    turbo: args.turbo === undefined ? Boolean(generation.turbo ?? true) : args.turbo !== "false",
    seed: args.seed ?? generation.seed ?? String(Math.floor(Math.random() * 9000000000000000) + 1000000000000000),
    seedMode: args.seed_mode || generation.seedMode || "fixed",
    keyframeMode: args.keyframe_mode || generation.keyframeMode || "first",
  };
}

async function render(project, args, urls) {
  if (!args.clip) fail("render 需要 --clip");
  const prepared = await prepare(project, args, urls);
  const options = generationOptions(prepared.target.manifest, args);
  const mode = options.mode;
  if (!prepared.prompt) fail("片段没有可生成的提示词，请先写入 clip.json 的 prompt");
  const references = mode === "R2VA" ? prepared.references : { images: [], videos: [], audios: [] };
  const promptOverride = args.prompt_file
    ? (await readFile(ensureInside(project.root, args.prompt_file), "utf8")).trim()
    : String(args.prompt || "").trim();
  const body = {
    shot_id: prepared.target.clip.id,
    shot_title: prepared.target.clip.title,
    prompt: promptOverride || prepared.prompt,
    ...options,
    client_id: `directorctl-${process.pid}`,
    comfy_url: urls.comfy,
    keyframe_mode: options.keyframeMode,
    images: references.images.slice(0, REFERENCE_LIMITS.image),
    videos: references.videos.slice(0, REFERENCE_LIMITS.video),
    audios: references.audios.slice(0, REFERENCE_LIMITS.audio),
    ...(args.image ? { image: args.image } : {}),
    ...(args.last_image ? { last_image: args.last_image } : {}),
  };
  const submitted = await apiFetch(fileUrl(urls.director, "/api/generate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = { ok: true, clip: prepared.target.clip.id, prompt_id: submitted.prompt_id, status: "submitted", generation: options, references: { images: body.images, videos: body.videos, audios: body.audios } };
  if (!args.wait) return result;
  const deadline = Date.now() + (Number(args.timeout || DEFAULT_TIMEOUT_SECONDS) * 1000);
  let status;
  while (Date.now() < deadline) {
    status = await apiFetch(fileUrl(urls.director, `/api/generate/status?id=${encodeURIComponent(submitted.prompt_id)}&shot=${encodeURIComponent(prepared.target.clip.id)}&seed=${encodeURIComponent(options.seed)}&seed_mode=${encodeURIComponent(options.seedMode)}&comfy_url=${encodeURIComponent(urls.comfy)}`), {});
    if (status.status === "completed") break;
    if (status.status === "error") fail(status.error || "视频生成失败", status);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (status?.status !== "completed") fail(`等待生成超时（${args.timeout || DEFAULT_TIMEOUT_SECONDS} 秒）`, status);
  const requestedOutputName = `shot-${prepared.target.clip.id}-${safeStem(prepared.target.clip.title)}.mp4`;
  let finalized;
  try {
    finalized = await apiFetchWithRetry(fileUrl(urls.director, "/api/output/finalize"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shot_id: prepared.target.clip.id, shot_title: prepared.target.clip.title, file_name: requestedOutputName, source: status.source, source_subfolder: status.source_subfolder || "", comfy_url: urls.comfy, metadata: { prompt_id: submitted.prompt_id, seed: options.seed, mode, duration: options.duration, resolution: options.resolution, fps: options.fps, generated_at: new Date().toISOString() } }) });
  } catch (error) {
    // ComfyUI can keep the output handle open on Windows. The proxy can still
    // download a completed file even when the server cannot rename it.
    if (!/operation not permitted|EPERM|资源被占用/i.test(error.message) || !status.url) throw error;
    finalized = { filename: requestedOutputName, url: status.url, archive_fallback: true };
  }
  const outputName = finalized.filename || requestedOutputName;
  const outputPath = path.join(prepared.target.directory, outputName);
  const videoResponse = await fetch(fileUrl(urls.director, finalized.url));
  if (!videoResponse.ok || !videoResponse.body) fail(`无法下载生成的视频（HTTP ${videoResponse.status}）`);
  await writeFile(outputPath, Buffer.from(await videoResponse.arrayBuffer()));
  prepared.target.manifest.output = outputName;
  prepared.target.manifest.generation = { ...prepared.target.manifest.generation, mode, duration: options.duration, resolution: options.resolution, aspect: options.aspect, fps: options.fps, model: options.model, turbo: options.turbo, seed: String(status.noise_seed ?? options.seed), seedMode: options.seedMode, keyframeMode: options.keyframeMode };
  await writeJson(prepared.target.manifestPath, prepared.target.manifest);
  return { ...result, status: "completed", output: relativeProjectPath(path.relative(project.root, outputPath)), filename: outputName, source: status.source, finalized };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args._[0]) { process.stdout.write(usage()); return; }
  const command = args._[0];
  const pretty = Boolean(args.pretty);
  if (command === "status") {
    const director = normalizeUrl(args.director_url, DEFAULT_DIRECTOR_URL);
    const comfy = normalizeUrl(args.comfy_url, DEFAULT_COMFY_URL);
    let directorStatus = null; let comfyStatus = null;
    try { directorStatus = await apiFetch(fileUrl(director, `/api/comfyui/status?comfy_url=${encodeURIComponent(comfy)}`), {}); } catch (error) { directorStatus = { connected: false, error: error.message }; }
    try { const response = await fetch(`${comfy}/system_stats`); comfyStatus = { connected: response.ok, ...(response.ok ? {} : { httpStatus: response.status }) }; } catch (error) { comfyStatus = { connected: false, error: error.message }; }
    output({ director: directorStatus, comfyui: comfyStatus, urls: { director, comfy } }, pretty); return;
  }
  const project = await projectInfo(args.project);
  if (command === "inspect") { output({ project: project.root, metadata: project.script.project || null, clips: project.script.clips }, pretty); return; }
  if (command === "clips") { output({ project: project.root, clips: project.script.clips }, pretty); return; }
  if (command === "assets") { const root = ensureInside(project.root, "资产"); output({ project: project.root, assets: (await walkFiles(root)).map((item) => ({ path: relativeProjectPath(path.join("资产", item)), kind: inferKind(item), type: assetTypeFromFolder(path.join("资产", item)) })) }, pretty); return; }
  const target = await getClip(project, args.clip);
  if (command === "clip") { output({ project: project.root, clip: target.clip, manifestPath: relativeProjectPath(path.relative(project.root, target.manifestPath)), manifest: target.manifest }, pretty); return; }
  const urls = { director: normalizeUrl(args.director_url || process.env.DIRECTOR_URL, DEFAULT_DIRECTOR_URL), comfy: normalizeUrl(args.comfy_url || process.env.COMFYUI_URL, DEFAULT_COMFY_URL) };
  if (command === "bind") { output(await bind(project, args), pretty); return; }
  if (command === "prepare") { const prepared = await prepare(project, args, urls); output({ ok: true, clip: args.clip, prompt: prepared.prompt, references: prepared.references, uploaded: prepared.uploaded }, pretty); return; }
  if (command === "render") { output(await render(project, args, urls), pretty); return; }
  fail(`未知命令：${command}`);
}

main().catch((error) => { output({ ok: false, error: error.message, ...(error.details ? { details: error.details } : {}) }, true); process.exitCode = 1; });
