#!/usr/bin/env node

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_DIRECTOR_URL = "http://localhost:3000";
const DEFAULT_COMFY_URL = "http://127.0.0.1:8188";
const DEFAULT_TIMEOUT_SECONDS = 1800;
const REFERENCE_LIMITS = { image: 9, video: 3, audio: 3 };
const GENERATION_MODES = ["T2VA", "I2VA", "R2VA"];
const REFERENCE_ROLES = ["character", "wardrobe", "object", "environment", "video", "audio", "composite"];
const REFERENCE_KINDS = ["image", "video", "audio"];

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
  if (script.project?.version !== 2) fail("不支持此项目格式，请使用 version 2 项目");
  if (!Array.isArray(script.clips)) fail("script.json 缺少 clips 数组");
  script.clips.forEach((clip, index) => {
    if (!clip || typeof clip.id !== "string" || !clip.id.trim() ||
      typeof clip.title !== "string" || !clip.title.trim() ||
      typeof clip.path !== "string" || !clip.path.trim())
      fail(`script.json 的第 ${index + 1} 个片段格式无效`);
  });
  return { root, script };
}

function validateClipManifest(manifest, clip) {
  if (manifest.version !== 2) fail(`片段 ${clip.id} 不是 version 2 格式`);
  if (manifest.id !== clip.id || manifest.title !== clip.title)
    fail(`片段 ${clip.id} 与 script.json 记录不一致`);
  const generation = manifest.generation;
  if (
    !generation ||
    !GENERATION_MODES.includes(generation.mode) ||
    !Number.isFinite(generation.duration) || generation.duration <= 0 ||
    typeof generation.resolution !== "string" || !generation.resolution.trim() ||
    typeof generation.aspect !== "string" || !generation.aspect.trim() ||
    !Number.isFinite(generation.fps) || generation.fps <= 0 ||
    generation.model !== "H3" ||
    typeof generation.turbo !== "boolean" ||
    typeof generation.seed !== "string" || !generation.seed.trim() ||
    !["fixed", "random"].includes(generation.seedMode) ||
    (generation.mode === "I2VA" && !["first", "last", "first_last"].includes(generation.keyframeMode)) ||
    (generation.steps !== undefined && (!Number.isInteger(generation.steps) || generation.steps <= 0))
  ) fail(`片段 ${clip.id} 的 generation 不完整`);
  if (!manifest.prompts || !GENERATION_MODES.every((mode) => {
    const prompt = manifest.prompts[mode];
    return prompt && typeof prompt.original === "string" &&
      (prompt.optimized === undefined || typeof prompt.optimized === "string");
  })) fail(`片段 ${clip.id} 的 prompts 不完整`);
  if (!Array.isArray(manifest.references?.subjects))
    fail(`片段 ${clip.id} 的 references 不完整`);
  for (const [subjectIndex, subject] of manifest.references.subjects.entries()) {
    if (!subject || typeof subject.subjectId !== "string" || !subject.subjectId.trim() ||
      typeof subject.name !== "string" || !subject.name.trim() || !Array.isArray(subject.references))
      fail(`片段 ${clip.id} 的第 ${subjectIndex + 1} 个引用主体无效`);
    if (subject.relation !== undefined &&
      (typeof subject.relation.type !== "string" || !subject.relation.type.trim() ||
        typeof subject.relation.parentSubjectId !== "string" || !subject.relation.parentSubjectId.trim()))
      fail(`片段 ${clip.id} 的引用主体关系无效`);
    for (const [referenceIndex, reference] of subject.references.entries()) {
      if (!reference || typeof reference.assetKey !== "string" || !reference.assetKey.trim() ||
        typeof reference.name !== "string" || !reference.name.trim() ||
        !REFERENCE_ROLES.includes(reference.role) || !REFERENCE_KINDS.includes(reference.kind))
        fail(`片段 ${clip.id} 的第 ${subjectIndex + 1} 个主体中，第 ${referenceIndex + 1} 个引用无效`);
    }
  }
  if (typeof manifest.visualStyle !== "string" || !manifest.visualStyle.trim())
    fail(`片段 ${clip.id} 的 visualStyle 无效`);
  if (manifest.output !== null && typeof manifest.output !== "string")
    fail(`片段 ${clip.id} 的 output 无效`);
}

function clipManifestPath(root, clip) {
  if (typeof clip.path !== "string" || !clip.path.trim())
    fail(`片段 ${clip.id} 缺少 clip.json 路径`);
  return ensureInside(root, clip.path);
}

async function getClip(project, clipId) {
  const clip = project.script.clips.find((item) => String(item.id) === String(clipId));
  if (!clip) fail(`找不到片段：${clipId}`);
  const manifestPath = clipManifestPath(project.root, clip);
  const manifest = await readJson(manifestPath);
  validateClipManifest(manifest, clip);
  return { clip, manifest, manifestPath, directory: path.dirname(manifestPath) };
}

function inferKind(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(extension)) return "video";
  if ([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"].includes(extension)) return "audio";
  return "image";
}

function referenceKind(reference) {
  if (!["image", "video", "audio"].includes(reference.kind))
    fail(`引用 ${reference.assetKey || "unknown"} 缺少有效 kind`);
  return reference.kind;
}

function inferRole(assetType, explicitRole) {
  if (explicitRole) {
    if (!REFERENCE_ROLES.includes(explicitRole)) fail(`无效引用角色：${explicitRole}`);
    return explicitRole;
  }
  return ({ character: "character", wardrobe: "wardrobe", prop: "object", scene: "environment", video: "video", audio: "audio" })[assetType] || "composite";
}

function assetTypeFromFolder(filePath) {
  const folder = relativeProjectPath(filePath).split("/")[1];
  return ({ "角色": "character", "服装": "wardrobe", "道具": "prop", "场景": "scene", "视频": "video", "音频": "audio", "自定义": "custom" })[folder] || "custom";
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
  return allReferences(manifest).flatMap((subject) =>
    subject.references.map((reference) => ({ subject, reference })),
  );
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
  const resolved = files.filter((file) => !file.toLowerCase().endsWith(".json")).map((file) => ({ absolute: path.join(absolute, file), sourcePath: relativeProjectPath(path.relative(root, path.join(absolute, file))), name: path.basename(file), type: assetTypeFromFolder(path.relative(root, path.join(absolute, file))) }));
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

function selectedPrompt(manifest, mode = manifest.generation.mode) {
  const prompt = manifest.prompts[mode];
  return String(prompt.optimized || prompt.original).trim();
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
  form.append("comfy_url", comfyUrl);
  const result = await apiFetch(fileUrl(directorUrl, "/api/upload"), { method: "POST", body: form });
  if (!result.name) fail(`上传资产失败：${asset.sourcePath}`);
  return { comfyName: result.name, ...(result.subfolder ? { comfySubfolder: result.subfolder } : {}) };
}

async function remoteAssetAvailable(comfyUrl, asset) {
  if (!asset.comfyName) return false;
  const url = `${comfyUrl}/view?filename=${encodeURIComponent(asset.comfyName)}&subfolder=${encodeURIComponent(asset.comfySubfolder || '')}&type=input`;
  try { return (await fetch(url, { method: 'HEAD' })).ok; } catch { return false; }
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
  const mode = args.mode || target.manifest.generation?.mode;
  const keyframeMode = args.keyframe_mode || target.manifest.generation?.keyframeMode || "first";
  const keyframes = target.manifest.keyframes || {};
  const neededKeyframes = mode === "I2VA"
    ? [
        ...(keyframeMode === "first" || keyframeMode === "first_last" ? [["first", keyframes.first]] : []),
        ...(keyframeMode === "last" || keyframeMode === "first_last" ? [["last", keyframes.last]] : []),
      ]
    : [];
  for (const [label, frame] of neededKeyframes) {
    if (!frame) continue;
    if (await remoteAssetAvailable(urls.comfy, frame)) continue;
    if (!frame.sourcePath) fail(`关键帧 ${label} 在 ComfyUI 中已失效，且没有本地源文件`);
    const absolute = ensureInside(project.root, frame.sourcePath);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) fail(`关键帧不存在：${frame.sourcePath}`);
    const remote = await uploadReference(urls.director, urls.comfy, { absolute, sourcePath: frame.sourcePath, name: frame.name || path.basename(absolute) });
    Object.assign(frame, remote);
    uploaded.push({ assetKey: label, sourcePath: frame.sourcePath, ...remote });
  }
  for (const { reference } of entries) {
    if (mode !== "R2VA") continue;
    if (await remoteAssetAvailable(urls.comfy, reference)) continue;
    if (!reference.sourcePath) fail(`参考素材 ${reference.name || reference.assetKey} 在 ComfyUI 中已失效，且没有本地源文件`);
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
  return { target, uploaded, references: refs, keyframes, prompt: selectedPrompt(target.manifest) };
}

function generationOptions(manifest, args) {
  const generation = manifest.generation;
  if (!generation) fail("clip.json 缺少 generation");
  const mode = args.mode || generation.mode;
  const seedMode = args.seed_mode || generation.seedMode;
  const seed = args.seed !== undefined
    ? args.seed
    : seedMode === "random"
      ? String(Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1000000000000000)) + 1000000000000000)
      : generation.seed;
  return {
    mode,
    duration: Number(args.duration ?? generation.duration),
    resolution: args.resolution || generation.resolution,
    aspect: args.aspect || generation.aspect,
    fps: Number(args.fps ?? generation.fps),
    model: args.model || generation.model,
    turbo: args.turbo === undefined ? generation.turbo : args.turbo !== "false",
    seed,
    seedMode,
    ...(mode === "I2VA"
      ? { keyframeMode: args.keyframe_mode || generation.keyframeMode || "first" }
      : {}),
  };
}

async function render(project, args, urls) {
  if (!args.clip) fail("render 需要 --clip");
  const prepared = await prepare(project, args, urls);
  const options = generationOptions(prepared.target.manifest, args);
  const mode = options.mode;
  if (!GENERATION_MODES.includes(mode)) fail(`无效生成模式：${mode}`);
  const references = mode === "R2VA" ? prepared.references : { images: [], videos: [], audios: [] };
  const firstFrame = prepared.keyframes?.first?.comfyName;
  const lastFrame = prepared.keyframes?.last?.comfyName;
  const promptOverride = args.prompt_file
    ? (await readFile(ensureInside(project.root, args.prompt_file), "utf8")).trim()
    : String(args.prompt || "").trim();
  const prompt = promptOverride || selectedPrompt(prepared.target.manifest, mode);
  if (!prompt) fail(`当前 ${mode} 模式没有提示词，请先写入 clip.json 的 prompts.${mode} 或使用 --prompt/--prompt-file`);
  const body = {
    shot_id: prepared.target.clip.id,
    shot_title: prepared.target.clip.title,
    prompt,
    mode,
    duration: options.duration,
    resolution: options.resolution,
    aspect: options.aspect,
    fps: options.fps,
    turbo: options.turbo,
    seed: options.seed,
    client_id: `directorctl-${process.pid}`,
    comfy_url: urls.comfy,
    keyframe_mode: mode === "I2VA" ? options.keyframeMode : undefined,
    images: references.images.slice(0, REFERENCE_LIMITS.image),
    videos: references.videos.slice(0, REFERENCE_LIMITS.video),
    audios: references.audios.slice(0, REFERENCE_LIMITS.audio),
    ...(args.image || firstFrame ? { image: args.image || firstFrame } : {}),
    ...(args.last_image || lastFrame ? { last_image: args.last_image || lastFrame } : {}),
  };
  const submitted = await apiFetch(fileUrl(urls.director, "/api/generate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = { ok: true, clip: prepared.target.clip.id, prompt_id: submitted.prompt_id, status: "submitted", generation: options, references: { images: body.images, videos: body.videos, audios: body.audios } };
  if (!args.wait) return result;
  const deadline = Date.now() + (Number(args.timeout || DEFAULT_TIMEOUT_SECONDS) * 1000);
  let status;
  while (Date.now() < deadline) {
    status = await apiFetch(fileUrl(urls.director, `/api/generate/status?id=${encodeURIComponent(submitted.prompt_id)}&comfy_url=${encodeURIComponent(urls.comfy)}`), {});
    if (status.status === "completed") break;
    if (status.status === "error") fail(status.error || "视频生成失败", status);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  if (status?.status !== "completed") fail(`等待生成超时（${args.timeout || DEFAULT_TIMEOUT_SECONDS} 秒）`, status);
  const requestedOutputName = `shot-${prepared.target.clip.id}-${safeStem(prepared.target.clip.title)}.mp4`;
  let finalized;
  try {
    finalized = await apiFetchWithRetry(fileUrl(urls.director, "/api/output/finalize"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shot_id: prepared.target.clip.id, shot_title: prepared.target.clip.title, source: status.source, source_subfolder: status.source_subfolder || "", comfy_url: urls.comfy }) });
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
  prepared.target.manifest.generation = {
    mode,
    duration: options.duration,
    resolution: options.resolution,
    aspect: options.aspect,
    fps: options.fps,
    model: options.model,
    turbo: options.turbo,
    seed: String(options.seed),
    seedMode: options.seedMode,
    ...(mode === "I2VA" ? { keyframeMode: options.keyframeMode } : {}),
  };
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
