"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Box,
  CircleAlert,
  CircleStop,
  Clapperboard,
  Clipboard,
  Dice5,
  Eye,
  Film,
  FolderInput,
  FolderOpen,
  ImagePlus,
  MapPinned,
  Maximize2,
  Minimize2,
  Minus,
  Package,
  Plus,
  RotateCcw,
  Settings,
  Shirt,
  Trash2 as TrashIcon,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ProjectTree,
  type ProjectTreeAsset,
} from "@/components/project-tree";

type Shot = {
  id: string;
  title: string;
  state: string;
  output?: string | null;
};
type VisualStyleKey = keyof typeof visualStylePresets;
const visualSubjectRealismGuidance = "Whenever human subjects appear, prioritize authentic live-action facial rendering over idealized beauty-filter aesthetics. Preserve natural skin texture, fine facial detail, realistic pores, and minimal retouching. Keep facial highlights restrained and natural, with a low-shine matte-to-natural skin finish. Avoid oily sheen, wet-looking skin, glossy skin, waxy or plastic-looking skin, excessive smoothing, beauty-filter effects, over-retouched faces, and localized artificial color patches. Keep human skin tones natural, consistent, and evenly balanced while respecting the scene lighting.";
const visualStylePresets = {
  natural_cinematic: { label: "自然电影写实", prompt: `Natural cinematic live-action look. Neutral white balance, realistic natural skin tones, balanced contrast, controlled highlights, restrained saturation, natural color separation, clean cinematic image without an obvious stylized color cast.\n\n${visualSubjectRealismGuidance}` },
  high_key_portrait: { label: "高调清透人像", prompt: `The target video has a clean high-key cinematic portrait look with bright, soft, natural light and controlled highlights. Skin should appear fair, natural, and realistic, with a neutral-to-slightly-cool undertone and a subtle healthy complexion. Keep the complexion even and clean, with low facial shine and a matte-to-natural skin finish. Keep facial skin tone consistent and balanced across the forehead, cheeks, nose, chin, and neck, with no localized color patches. Soft natural muted-pink lips only. Use a neutral-to-slightly-cool white balance, fresh clean colors, and controlled saturation. Use eye-level framing, close shots, a wide aperture, and naturally blurred backgrounds throughout.\n\n${visualSubjectRealismGuidance}` },
  teal_orange_blockbuster: { label: "青橙商业大片", prompt: `Premium theatrical blockbuster color grade. Cinematic teal-and-orange color separation, cooler shadows and controlled warm highlights, rich blacks, strong dimensional contrast, dramatic subject separation and polished Hollywood feature-film look. Keep human skin natural and believable rather than strongly orange.\n\n${visualSubjectRealismGuidance}` },
  neon_noir: { label: "都市霓虹黑色电影", prompt: `Cinematic neon-noir night look. Deep controlled shadows, rich blacks, blue, cyan, magenta and red urban neon illumination, wet reflective surfaces, luminous practical lights, strong atmospheric separation and sophisticated metropolitan night mood. Keep faces clearly readable and skin tones natural under colored lighting.\n\n${visualSubjectRealismGuidance}` },
  japanese_high_key_daylight: { label: "日系高调日光", prompt: `Japanese high-key daylight cinematic look. Bright airy daylight, clean blue skies, crisp white clouds, cool-to-neutral daylight balance and fresh transparent colors. Keep skin fair, natural, and evenly balanced with clean white highlights. Avoid yellow or orange skin tones. Bright, refreshing and photographic rather than anime illustration.\n\n${visualSubjectRealismGuidance}` },
} as const;
type GenerationMode = "T2VA" | "I2VA" | "R2VA";
type KeyframeMode = "first" | "last" | "first_last";
const generationModes = ["T2VA", "I2VA", "R2VA"] as const;
type ReferenceRole =
  | "character"
  | "wardrobe"
  | "object"
  | "environment"
  | "video"
  | "audio"
  | "composite";
const referenceRoles: readonly ReferenceRole[] = [
  "character",
  "wardrobe",
  "object",
  "environment",
  "video",
  "audio",
  "composite",
];
type ProjectAssetType =
  "character" | "scene" | "wardrobe" | "prop" | "video" | "audio" | "custom";
const assetUsageOptions: Record<ProjectAssetType, readonly string[]> = {
  character: ["角色参考"],
  scene: ["场景参考"],
  wardrobe: ["服装参考"],
  prop: ["道具参考"],
  video: ["动作参考", "镜头参考", "表演参考"],
  audio: ["声音参考", "环境音", "音乐参考"],
  custom: [],
};
const modelProfiles = {
  H3: {
    modes: ["T2VA", "I2VA", "R2VA"],
    images: 9,
    videos: 3,
    audios: 3,
    resolutions: [
      "608 × 352",
      "736 × 416",
      "864 × 480",
      "960 × 544",
      "1056 × 608",
      "1152 × 640",
      "1216 × 672",
      "1280 × 736",
      "1344 × 768",
    ],
  },
} as const;
type ShotSettings = {
  duration: string;
  resolution: string;
  aspect: string;
  fps: string;
  mode: GenerationMode;
  model: keyof typeof modelProfiles;
  turbo: boolean;
  seed: string;
  seedMode: "fixed" | "random";
  keyframeMode: KeyframeMode;
};
const shotSettingDefaults: ShotSettings = {
  duration: "6 秒",
  resolution: "864 × 480",
  aspect: "16:9",
  fps: "24 fps",
  mode: "T2VA",
  model: "H3",
  turbo: true,
  seed: "7483926150842719",
  seedMode: "fixed",
  keyframeMode: "first",
};
type PromptSubject = {
  name: string;
  assetKeys: string[];
  assetRoles?: Record<string, ReferenceRole>;
  children?: PromptSubject[];
};
type PersistedPromptReference = {
  assetKey: string;
  role: ReferenceRole;
  name: string;
  kind: ReferenceKind;
  comfyName?: string;
  comfySubfolder?: string;
  sourcePath?: string;
};
type PersistedPromptSubject = {
  subjectId: string;
  name: string;
  references: PersistedPromptReference[];
  relation?: { type: string; parentSubjectId: string };
};
type PersistedKeyframe = {
  name: string;
  sourcePath?: string;
  comfyName?: string;
};
type DirectoryPickerWindow = Window & {
  electronDirector?: {
    getComfyState?: () => Promise<{ ready: boolean; url: string; error: string | null }>;
    getModelDirectory?: () => Promise<{ path: string }>;
    pickModelDirectory?: () => Promise<{ path: string } | null>;
    onComfyStateChange?: (callback: (state: { ready: boolean; url: string; error: string | null }) => void) => () => void;
    pickDirectory: () => Promise<ElectronDirectoryHandle | null>;
    getProjectDirectories?: () => Promise<{ paths: string[]; activePath: string | null; handles: ElectronDirectoryHandle[] }>;
    setProjectDirectories?: (handles: ElectronDirectoryHandle[]) => Promise<unknown>;
    setActiveProjectDirectory?: (handle: ElectronDirectoryHandle) => Promise<unknown>;
    clearActiveProjectDirectory?: () => Promise<unknown>;
    getAgentExecutable?: () => Promise<string>;
    setAgentExecutable?: (value: string) => Promise<string>;
    runAgent?: (input: { prompt: string; mode: string; duration: number; visualStyle?: string; referenceMapping: H3ReferenceMapping[] }) => Promise<string>;
    windowControl?: (action: "minimize" | "toggle-maximize" | "close" | "is-maximized") => Promise<boolean>;
    isMaximized?: () => Promise<boolean>;
    onWindowStateChange?: (callback: (maximized: boolean) => void) => () => void;
  };
};
type ElectronDirectoryHandle = FileSystemDirectoryHandle & {
  __path?: string;
  createProject: (name: string, id: string) => Promise<ElectronDirectoryHandle>;
};
type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: {
    mode?: "read" | "readwrite";
  }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: {
    mode?: "read" | "readwrite";
  }) => Promise<PermissionState>;
  removeEntry?: (
    name: string,
    options?: { recursive?: boolean },
  ) => Promise<void>;
};

async function saveProjectDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const api = (window as DirectoryPickerWindow).electronDirector;
  if (api?.setActiveProjectDirectory && (handle as ElectronDirectoryHandle).__path)
    await api.setActiveProjectDirectory(handle as ElectronDirectoryHandle);
}
async function clearProjectDirectoryHandle() {
  const api = (window as DirectoryPickerWindow).electronDirector;
  await api?.clearActiveProjectDirectory?.();
}
async function loadProjectDirectoryHandle() {
  const api = (window as DirectoryPickerWindow).electronDirector;
  if (!api?.getProjectDirectories) return null;
  const result = await api.getProjectDirectories();
  return result.handles.find((handle) => handle.__path?.toLowerCase() === result.activePath?.toLowerCase()) ?? null;
}
async function saveProjectDirectoryHandles(
  handles: FileSystemDirectoryHandle[],
) {
  const api = (window as DirectoryPickerWindow).electronDirector;
  await api?.setProjectDirectories?.(handles as ElectronDirectoryHandle[]);
}
async function loadProjectDirectoryHandles() {
  const api = (window as DirectoryPickerWindow).electronDirector;
  if (!api?.getProjectDirectories) return [];
  const result = await api.getProjectDirectories();
  return result.handles;
}
async function isDirectoryHandleAvailable(handle: FileSystemDirectoryHandle) {
  try {
    await handle.entries().next();
    return true;
  } catch (error) {
    // A directory removed outside the app reports NotFoundError. Keep handles
    // with other errors so a later permission grant can recover them.
    return !(
      error instanceof DOMException &&
      (error.name === "NotFoundError" || error.name === "NotFound")
    );
  }
}

type ShotTask = {
  promptId: string;
  seed: string;
  seedMode: "fixed" | "random";
  title: string;
  fileName: string;
  steps: number;
  startedAt: number;
};
type ReferenceKind = "image" | "video" | "audio";
type ReferenceAsset = {
  name: string;
  url: string;
  sourcePath?: string;
  comfyName?: string;
  comfySubfolder?: string;
  kind: ReferenceKind;
};
type ReferenceDrag = { kind: ReferenceKind; index: number };
type PromptMention = {
  start: number;
  end: number;
  query: string;
  selected: number;
};
type ClipPromptRecord = {
  original: string;
  optimized?: string;
};
type ClipGenerationBase = {
  duration: number;
  resolution: string;
  aspect: string;
  fps: number;
  model: "H3";
  turbo: boolean;
  seed: string;
  seedMode: "fixed" | "random";
  steps?: number;
};
type ClipGeneration = ClipGenerationBase &
  (
    | { mode: "I2VA"; keyframeMode: KeyframeMode }
    | { mode: "T2VA" | "R2VA"; keyframeMode?: never }
  );
type ClipPrompts = Record<GenerationMode, ClipPromptRecord>;
type ProjectShotRecord = Shot & {
  output: string | null;
  references: { subjects: PersistedPromptSubject[] };
  generation: ClipGeneration;
  prompts: ClipPrompts;
  visualStyle: VisualStyleKey;
  keyframes?: { first?: PersistedKeyframe; last?: PersistedKeyframe };
};
type ClipManifestOverrides = {
  generation?: Partial<ClipGenerationBase> & {
    mode?: GenerationMode;
    keyframeMode?: KeyframeMode;
  };
  promptOriginal?: string;
  promptOptimized?: string;
  output?: string | null;
  visualStyle?: VisualStyleKey;
  referenceAssets?: Record<string, ReferenceAsset>;
  keyframes?: Record<string, { name: string; url: string; comfyName?: string; sourcePath?: string }>;
};
function normalizePrompt(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function promptStoreKey(shotId: string, mode: string) {
  return `${shotId}::${mode}`;
}
type ReferenceMentionOption = {
  kind: ReferenceKind;
  index: number;
  token: string;
  name: string;
  url: string;
  assetKey: string;
};
type H3ReferenceMapping = {
  picture: string;
  subject: string;
  role: string;
  assetName: string;
  usage?: string;
  description?: string;
};

function restoreProjectShotReferences(
  persistedSubjects: PersistedPromptSubject[],
  comfyUrl: string,
) {
  const nodes: Array<{
    id: string;
    subject: PromptSubject;
    parentId?: string;
  }> = [];
  const referenceAssets: Record<string, ReferenceAsset> = {};

  const addReference = (
    subject: PromptSubject,
    reference: PersistedPromptReference,
  ) => {
    const assetKey = reference.assetKey.trim();
    const role = reference.role;
    if (!subject.assetKeys.includes(assetKey)) subject.assetKeys.push(assetKey);
    subject.assetRoles = { ...subject.assetRoles, [assetKey]: role };
    if (referenceAssets[assetKey]) return;
    const restoredAsset = {
      name: reference.name.trim(),
      comfyName: reference.comfyName,
      comfySubfolder: reference.comfySubfolder,
      kind: reference.kind,
    };
    referenceAssets[assetKey] = {
      ...restoredAsset,
      url: referenceAssetUrl(restoredAsset, comfyUrl),
      ...(reference.sourcePath ? { sourcePath: reference.sourcePath } : {}),
    };
  };

  const collect = (record: PersistedPromptSubject) => {
    const subject: PromptSubject = {
      name: record.name.trim(),
      assetKeys: [],
      assetRoles: {},
    };
    record.references.forEach((reference) => addReference(subject, reference));
    nodes.push({
      id: record.subjectId.trim(),
      subject,
      parentId: record.relation?.parentSubjectId.trim(),
    });
  };
  persistedSubjects.forEach((subject) => collect(subject));

  const subjects: PromptSubject[] = [];
  const subjectsById = new Map(nodes.map((node) => [node.id, node.subject]));
  nodes.forEach((node) => {
    const parent = node.parentId ? subjectsById.get(node.parentId) : undefined;
    if (parent && parent !== node.subject) {
      parent.children = [...(parent.children ?? []), node.subject];
    } else {
      subjects.push(node.subject);
    }
  });
  return { subjects, referenceAssets };
}

function referenceAssetUrl(
  asset: Pick<ReferenceAsset, "comfyName" | "comfySubfolder">,
  comfyUrl: string,
) {
  if (!asset.comfyName) return "";
  const params = new URLSearchParams({
    filename: asset.comfyName,
    type: "input",
    comfy_url: comfyUrl,
  });
  if (asset.comfySubfolder) params.set("subfolder", asset.comfySubfolder);
  return `/api/video?${params.toString()}`;
}

async function readProjectSourceFile(
  project: FileSystemDirectoryHandle,
  sourcePath: string,
) {
  const pathParts = sourcePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (
    !pathParts.length ||
    pathParts.some((part) => part === "." || part === "..")
  )
    return null;
  let directory = project;
  for (const part of pathParts.slice(0, -1))
    directory = await directory.getDirectoryHandle(part);
  return directory.getFileHandle(pathParts[pathParts.length - 1]).then((file) =>
    file.getFile(),
  );
}

async function uploadReferenceFile(
  file: File,
  kind: ReferenceKind,
  comfyUrl: string,
) {
  const form = new FormData();
  form.append("image", file, file.name);
  form.append("comfy_url", comfyUrl);
  const response = await fetch("/api/upload", { method: "POST", body: form });
  const uploaded = (await response.json().catch(() => ({}))) as {
    name?: string;
    subfolder?: string;
    error?: string;
  };
  if (!response.ok || !uploaded.name)
    throw new Error(uploaded.error ?? `上传${file.name}失败`);
  return {
    kind,
    comfyName: uploaded.name,
    comfySubfolder: uploaded.subfolder || undefined,
  };
}

async function isReferenceAssetAvailable(
  asset: Pick<ReferenceAsset, "comfyName" | "comfySubfolder">,
  comfyUrl: string,
) {
  if (!asset.comfyName) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(referenceAssetUrl(asset, comfyUrl), {
      cache: "no-store",
      signal: controller.signal,
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function safeFileStem(title: string) {
  return (
    title
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .trim()
      .replace(/[. ]+$/g, "")
      .slice(0, 120) || "未命名片段"
  );
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return String(error);
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "未知错误";
}

function assetNamePart(value: string) {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/[\s_]+/g, "-")
    .replace(/^[_ .]+|[_ .]+$/g, "")
    .slice(0, 80);
}

function originalFileStem(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "");
}

function parseProjectAssetName(fileName: string) {
  const parts = originalFileStem(fileName)
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    name: parts[0] || originalFileStem(fileName),
    usage: parts[1],
    description: parts.slice(2).join("_") || undefined,
  };
}

function formatProjectAssetFileName(
  name: string,
  usage: string,
  description: string,
  originalName: string,
) {
  const parts = [name, usage, description]
    .map(assetNamePart)
    .filter(Boolean);
  if (parts.length < 2) return null;
  const extension = originalName.match(/\.[^.]+$/)?.[0] ?? "";
  return `${parts.join("_")}${extension}`;
}

async function getProjectAssetFolder(
  project: FileSystemDirectoryHandle,
  folderName: string,
  options: { create?: boolean } = {},
) {
  if (options.create) {
    const assets = await project.getDirectoryHandle("资产", { create: true });
    return assets.getDirectoryHandle(folderName, { create: true });
  }
  const assets = await project.getDirectoryHandle("资产");
  return assets.getDirectoryHandle(folderName);
}

async function uniqueProjectAssetFileName(
  folder: FileSystemDirectoryHandle,
  requestedName: string,
) {
  const entries = (
    folder as FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    }
  ).entries();
  const existingNames = new Set<string>();
  for await (const [name] of entries) existingNames.add(name.toLowerCase());
  if (!existingNames.has(requestedName.toLowerCase())) return requestedName;
  const extension = requestedName.match(/\.[^.]+$/)?.[0] ?? "";
  const stem = extension
    ? requestedName.slice(0, -extension.length)
    : requestedName;
  let index = 2;
  let candidate = `${stem}_${index}${extension}`;
  while (existingNames.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${stem}_${index}${extension}`;
  }
  return candidate;
}

async function readAssetFileThumbnail(
  entry: FileSystemFileHandle,
): Promise<string | undefined> {
  try {
    const file = await entry.getFile();
    return file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
  } catch {
    return undefined;
  }
}

async function readProjectShots(
  handle: FileSystemDirectoryHandle,
): Promise<ProjectShotRecord[]> {
  const scriptFile = await handle.getFileHandle("script.json");
  const script = JSON.parse(await (await scriptFile.getFile()).text()) as {
    project?: { version?: unknown };
    clips?: Array<{ id?: unknown; title?: unknown; path?: unknown }>;
  };
  if (script.project?.version !== 2)
    throw new Error("不支持此项目格式，请创建 version 2 项目");
  if (!Array.isArray(script.clips))
    throw new Error("script.json 缺少 clips 数组");
  return Promise.all(
    script.clips.map(async (clip, index) => {
      if (
        typeof clip.id !== "string" ||
        typeof clip.title !== "string" ||
        typeof clip.path !== "string" ||
        !clip.id.trim() ||
        !clip.title.trim() ||
        !clip.path.trim()
      )
        throw new Error(`script.json 的第 ${index + 1} 个片段格式无效`);
      const clipId = clip.id;
      const clipTitle = clip.title;
      const clipPath = clip.path;
      const source = await readProjectSourceFile(handle, clipPath);
      if (!source) throw new Error(`片段 ${clipId} 的路径无效`);
      const data = JSON.parse(await source.text()) as Partial<ProjectShotRecord> & {
        version?: unknown;
      };
      if (data.version !== 2)
        throw new Error(`片段 ${clipId} 不是 version 2 格式`);
      if (data.id !== clipId || data.title !== clipTitle)
        throw new Error(`片段 ${clipId} 与 script.json 记录不一致`);
      const generation = data.generation;
      if (
        !generation ||
        !generationModes.includes(generation.mode) ||
        !Number.isFinite(generation.duration) ||
        generation.duration <= 0 ||
        typeof generation.resolution !== "string" ||
        !generation.resolution.trim() ||
        typeof generation.aspect !== "string" ||
        !generation.aspect.trim() ||
        !Number.isFinite(generation.fps) ||
        generation.fps <= 0 ||
        generation.model !== "H3" ||
        typeof generation.turbo !== "boolean" ||
        typeof generation.seed !== "string" ||
        !generation.seed.trim() ||
        (generation.seedMode !== "fixed" && generation.seedMode !== "random") ||
        (generation.mode === "I2VA" &&
          !["first", "last", "first_last"].includes(
            generation.keyframeMode,
          )) ||
        (generation.steps !== undefined &&
          (!Number.isInteger(generation.steps) || generation.steps <= 0))
      )
        throw new Error(`片段 ${clipId} 的 generation 不完整`);
      if (
        !data.prompts ||
        !generationModes.every(
          (mode) =>
            typeof data.prompts?.[mode as GenerationMode]?.original === "string" &&
            (data.prompts[mode as GenerationMode].optimized === undefined ||
              typeof data.prompts[mode as GenerationMode].optimized === "string"),
        )
      )
        throw new Error(`片段 ${clipId} 的 prompts 不完整`);
      if (!data.references || !Array.isArray(data.references.subjects))
        throw new Error(`片段 ${clipId} 的 references 不完整`);
      data.references.subjects.forEach((subject, subjectIndex) => {
        if (
          typeof subject?.subjectId !== "string" ||
          !subject.subjectId.trim() ||
          typeof subject.name !== "string" ||
          !subject.name.trim() ||
          !Array.isArray(subject.references)
        )
          throw new Error(
            `片段 ${clipId} 的第 ${subjectIndex + 1} 个引用主体无效`,
          );
        if (
          subject.relation !== undefined &&
          (typeof subject.relation.type !== "string" ||
            !subject.relation.type.trim() ||
            typeof subject.relation.parentSubjectId !== "string" ||
            !subject.relation.parentSubjectId.trim())
        )
          throw new Error(`片段 ${clipId} 的引用主体关系无效`);
        subject.references.forEach((reference, referenceIndex) => {
          if (
            typeof reference?.assetKey !== "string" ||
            !reference.assetKey.trim() ||
            typeof reference.name !== "string" ||
            !reference.name.trim() ||
            !referenceRoles.includes(reference.role) ||
            !["image", "video", "audio"].includes(reference.kind)
          )
            throw new Error(
              `片段 ${clipId} 的第 ${subjectIndex + 1} 个主体中，第 ${referenceIndex + 1} 个引用无效`,
            );
        });
      });
      if (!data.visualStyle || !(data.visualStyle in visualStylePresets))
        throw new Error(`片段 ${clipId} 的 visualStyle 无效`);
      if (data.output !== null && typeof data.output !== "string")
        throw new Error(`片段 ${clipId} 的 output 无效`);
      const output = data.output;
      let outputAvailable = false;
      if (output) {
        const clipDirectoryPath = clipPath.split("/").slice(0, -1).join("/");
        try {
          outputAvailable = Boolean(
            await readProjectSourceFile(handle, `${clipDirectoryPath}/${output}`),
          );
        } catch {
          outputAvailable = false;
        }
      }
      const persistedKeyframes = data.keyframes;
      if (
        persistedKeyframes !== undefined &&
        (typeof persistedKeyframes !== "object" || persistedKeyframes === null)
      )
        throw new Error(`片段 ${clipId} 的 keyframes 无效`);
      return {
        id: clipId,
        title: clipTitle,
        state: output ? (outputAvailable ? "已完成" : "文件缺失") : "草稿",
        output,
        generation,
        references: data.references,
        prompts: data.prompts,
        visualStyle: data.visualStyle,
        keyframes: persistedKeyframes,
      };
    }),
  );
}
async function readNextShotNumber(handle: FileSystemDirectoryHandle, shots: Shot[] = []) {
  let persistedCounter = 1;
  let manifestMax = 0;
  try {
    const file = await handle.getFileHandle("script.json");
    const script = JSON.parse(await (await file.getFile()).text()) as {
      nextShotNumber?: unknown;
      clips?: Array<{ id?: unknown }>;
    };
    if (typeof script.nextShotNumber === "number" && Number.isInteger(script.nextShotNumber) && script.nextShotNumber > 0)
      persistedCounter = script.nextShotNumber;
    if (Array.isArray(script.clips))
      manifestMax = script.clips.reduce((max, clip) => Math.max(max, Number(clip?.id) || 0), 0);
  } catch {
    // Fall back to the legacy manifest contents.
  }
  const loadedMax = shots.reduce((max, shot) => Math.max(max, Number(shot.id) || 0), 0);
  return Math.max(persistedCounter, manifestMax + 1, loadedMax + 1);
}
async function readProjectMetadata(handle: FileSystemDirectoryHandle) {
  try {
    const file = await handle.getFileHandle("script.json");
    const script = JSON.parse(await (await file.getFile()).text()) as {
      project?: { id?: unknown; name?: unknown };
      [key: string]: unknown;
    };
    const existingId = typeof script.project?.id === "string" && script.project.id.trim()
      ? script.project.id.trim()
      : null;
    const id = existingId ?? crypto.randomUUID();
    if (!existingId) {
      try {
        const writable = await file.createWritable();
        await writable.write(JSON.stringify({
          ...script,
          project: { ...script.project, id },
        }, null, 2));
        await writable.close();
      } catch {
        // Reading project metadata must remain available when a restored
        // handle has read permission only; the next writable import retries.
      }
    }
    return {
      id,
      name: typeof script.project?.name === "string" && script.project.name.trim()
        ? script.project.name.trim() : handle.name,
    };
  } catch {
    return { id: crypto.randomUUID(), name: handle.name };
  }
}

async function writeProjectId(handle: FileSystemDirectoryHandle, id: string) {
  const file = await handle.getFileHandle("script.json");
  const script = JSON.parse(await (await file.getFile()).text()) as {
    project?: Record<string, unknown>;
    [key: string]: unknown;
  };
  const writable = await file.createWritable();
  await writable.write(JSON.stringify({
    ...script,
    project: { ...script.project, id },
  }, null, 2));
  await writable.close();
}

function WindowChrome({
  title = "MeristemForge",
  iconSrc = "/meristemforge-icon.svg",
}: {
  title?: string;
  iconSrc?: string;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const api = (window as DirectoryPickerWindow).electronDirector;
    if (!api?.windowControl) return;
    let active = true;
    if (api.isMaximized) {
      void api.isMaximized().then((value) => {
        if (active) setMaximized(Boolean(value));
      });
    }
    const unsubscribe = api.onWindowStateChange?.((value) => setMaximized(value));
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);
  async function control(action: "minimize" | "toggle-maximize" | "close") {
    const api = (window as DirectoryPickerWindow).electronDirector;
    if (!api?.windowControl) return;
    const nextMaximized = await api.windowControl(action);
    if (action === "toggle-maximize") setMaximized(nextMaximized);
  }
  return (
    <div
      className="window-chrome relative flex h-11 items-center justify-between border-b border-white/8 bg-[#0b0d12]/92 px-3 text-zinc-400 shadow-[0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-xl"
      onDoubleClick={() => void control("toggle-maximize")}
    >
      <div className="window-drag-region flex min-w-0 flex-1 items-center gap-2.5 pl-1">
        <img src={iconSrc} alt="" className="size-6 shrink-0 rounded-[7px] shadow-[0_0_18px_rgba(76,124,229,0.18)]" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[11px] font-semibold tracking-[0.04em] text-zinc-200">{title}</span>
          <span className="hidden text-[9px] uppercase tracking-[0.2em] text-zinc-600 sm:inline">Creative Suite</span>
        </div>
      </div>
      <div className="window-no-drag flex items-center">
        <button type="button" onClick={() => void control("minimize")} className="grid size-9 place-items-center rounded-md transition hover:bg-white/8 hover:text-zinc-100" aria-label="最小化">
          <Minus className="size-3.5" />
        </button>
        <button type="button" onClick={() => void control("toggle-maximize")} className="grid size-9 place-items-center rounded-md transition hover:bg-white/8 hover:text-zinc-100" aria-label={maximized ? "还原窗口" : "最大化"}>
          {maximized ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>
        <button type="button" onClick={() => void control("close")} className="grid size-9 place-items-center rounded-md transition hover:bg-red-500/80 hover:text-white" aria-label="关闭">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const [workspaceMode, setWorkspaceMode] = useState<"launcher" | "video">(
    "launcher",
  );
  const [activeWorkspaceCard, setActiveWorkspaceCard] = useState(0);
  const [activeShot, setActiveShot] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [mode, setMode] = useState<GenerationMode>("T2VA");
  const [model, setModel] = useState<keyof typeof modelProfiles>("H3");
  const [turboMode, setTurboMode] = useState(true);
  const [keyframeMode, setKeyframeMode] = useState<KeyframeMode>("first");
  const [shotStages, setShotStages] = useState<Record<string, string>>({});
  const [shotVisualStyles, setShotVisualStyles] = useState<Record<string, VisualStyleKey>>({});
  const [railWidth, setRailWidth] = useState(220);
  const [panelWidth, setPanelWidth] = useState(420);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [shotTasks, setShotTasks] = useState<Record<string, ShotTask>>({});
  const [generationDurations, setGenerationDurations] = useState<
    Record<string, number>
  >({});
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [submittingShots, setSubmittingShots] = useState<
    Record<string, boolean>
  >({});
  const clientId = "comfyui-director-ui";
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [shotVideos, setShotVideos] = useState<Record<string, string>>({});
  const [shotFileNames, setShotFileNames] = useState<Record<string, string>>(
    {},
  );
  const [keyframes, setKeyframes] = useState<
    Record<string, { name: string; url: string; comfyName?: string; sourcePath?: string }>
  >({});
  const [referenceAssets, setReferenceAssets] = useState<
    Record<string, ReferenceAsset>
  >({});
  const [draggingReference, setDraggingReference] =
    useState<ReferenceDrag | null>(null);
  const [projectDirectory, setProjectDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [projectDirectories, setProjectDirectories] = useState<
    FileSystemDirectoryHandle[]
  >([]);
  const [projectDirectoryName, setProjectDirectoryName] =
    useState("未选择项目目录");
  const [projectNameDialog, setProjectNameDialog] = useState(false);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("未命名项目");
  const projectIdRef = useRef(crypto.randomUUID());
  const projectIdsRef = useRef(new WeakMap<FileSystemDirectoryHandle, string>());
  const [projectAssets, setProjectAssets] = useState<ProjectTreeAsset[]>([]);
  const [projectOutputFiles, setProjectOutputFiles] = useState<string[] | null>(
    null,
  );
  const [seed, setSeed] = useState("7483926150842719");
  const [seedMode, setSeedMode] = useState<"fixed" | "random">("fixed");
  const [fps, setFps] = useState("24 fps");
  const [duration, setDuration] = useState("6 秒");
  const [resolution, setResolution] = useState("864 × 480");
  const [aspect, setAspect] = useState("16:9");
  const [prompt, setPrompt] = useState("");
  const [promptOptimizing, setPromptOptimizing] = useState<Record<string, boolean>>({});
  const [llmExecutablePath, setLlmExecutablePath] = useState("");
  const [promptSubjects, setPromptSubjects] = useState<
    Record<string, PromptSubject[]>
  >({});
  const [promptPanelHeight, setPromptPanelHeight] = useState(300);
  const [promptViewerOpen, setPromptViewerOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
  const [promptCopied, setPromptCopied] = useState(false);
  const [optimizedPrompts, setOptimizedPrompts] = useState<Record<string, string>>({});
  const [promptNotice, setPromptNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const previewStageRef = useRef<HTMLElement | null>(null);
  const previewControlsRef = useRef<HTMLDivElement | null>(null);
  const [promptMention, setPromptMention] = useState<PromptMention | null>(
    null,
  );
  const [mentionPosition, setMentionPosition] = useState({ left: 16, top: 16 });
  const [addDialog, setAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [projectDeleteCandidate, setProjectDeleteCandidate] = useState<
    { id: string; name: string } | null
  >(null);
  const [assetDeleteCandidate, setAssetDeleteCandidate] = useState<
    ProjectTreeAsset | null
  >(null);
  const [assetSubjectPickerOpen, setAssetSubjectPickerOpen] = useState(false);
  const [assetPickerView, setAssetPickerView] = useState<
    "actions" | "categories" | "items"
  >("actions");
  const [assetPickerCategory, setAssetPickerCategory] = useState<
    ProjectAssetType | null
  >(null);
  const [referencePickerTarget, setReferencePickerTarget] = useState<{
    kind: ReferenceKind;
    index: number;
  } | null>(null);
  const [assetDialog, setAssetDialog] = useState(false);
  const [assetType, setAssetType] = useState<ProjectAssetType | null>(null);
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetUsage, setNewAssetUsage] = useState("");
  const [newAssetDescription, setNewAssetDescription] = useState("");
  const [newAssetFile, setNewAssetFile] = useState<File | null>(null);
  const [shotPrompts, setShotPrompts] = useState<Record<string, string>>({});
  const [shotSettings, setShotSettings] = useState<
    Record<string, ShotSettings>
  >({});
  const [storageReady, setStorageReady] = useState(false);
  const [comfyConnected, setComfyConnected] = useState<boolean | null>(null);
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [comfyUrlDraft, setComfyUrlDraft] = useState("http://127.0.0.1:8188");
  const [modelDirectory, setModelDirectory] = useState("");
  const [engineSettingsOpen, setEngineSettingsOpen] = useState(false);
  const profile = modelProfiles[model] ?? modelProfiles.H3;
  const modes = profile.modes;
  const activeMode = (modes as readonly string[]).includes(mode)
    ? mode
    : modes[0];
  const availableResolution = (
    profile.resolutions as readonly string[]
  ).includes(resolution)
    ? resolution
    : profile.resolutions[profile.resolutions.length - 1];
  const taskShot = shots[activeShot];
  const visibleProjects = projectDirectories.length
    ? projectDirectories.map((directory) => ({ id: projectIdsRef.current.get(directory) ?? directory.name, name: directory.name }))
    : projectDirectory
      ? [{ id: projectIdRef.current, name: projectDirectoryName }]
      : [];
  const activeShotIdRef = useRef<string | null>(null);
  const projectSwitchTokenRef = useRef(0);
  const projectTreeEpochRef = useRef(0);
  const saveTimerRef = useRef<number | null>(null);
  const projectMutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const creatingShotRef = useRef(false);
  const optimizedPromptRequestRef = useRef<Record<string, number>>({});
  const optimizedPromptFingerprintsRef = useRef<Record<string, string>>({});
  function enqueueProjectMutation<T>(operation: () => Promise<T>): Promise<T> {
    const task = projectMutationQueueRef.current
      .catch(() => undefined)
      .then(operation);
    projectMutationQueueRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
  const referenceUploadTokensRef = useRef<Record<string, number>>({});
  const keyframeUploadTokensRef = useRef<Record<string, number>>({});
  const keyframesRef = useRef(keyframes);
  keyframesRef.current = keyframes;
  const referenceAssetsRef = useRef(referenceAssets);
  referenceAssetsRef.current = referenceAssets;
  const projectEpochRef = useRef(0);
  function updateReferenceAssets(
    updater: (current: Record<string, ReferenceAsset>) => Record<string, ReferenceAsset>,
  ) {
    setReferenceAssets((current) => {
      const next = updater(current);
      referenceAssetsRef.current = next;
      return next;
    });
  }
  const finalizingPromptIdsRef = useRef(new Set<string>());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeTask = taskShot ? shotTasks[taskShot.id] : undefined;
  function setGenerationStatus(text: string) {
    if (/(失败|请先|未上传|无法|权限|错误|不存在|缺失|未返回)/.test(text))
      setGenerationNotice(text);
  }
  const activeSubmitting = taskShot
    ? Boolean(submittingShots[taskShot.id])
    : false;
  const canRegenerate = Boolean(
    taskShot &&
    ["已完成", "失败", "文件缺失", "已停止"].includes(taskShot.state),
  );
  const activeStage = taskShot ? shotStages[taskShot.id] : undefined;
  useEffect(() => {
    let disposed = false;
    const api = (window as DirectoryPickerWindow).electronDirector;
    const load = async () => {
      if (api?.getComfyState) {
        const state = await api.getComfyState().catch(() => null);
        if (!disposed && state?.url) {
          setComfyUrl(state.url);
          setComfyUrlDraft(state.url);
        }
        if (api.getModelDirectory) {
          const directory = await api.getModelDirectory().catch(() => null);
          if (!disposed && directory) setModelDirectory(directory.path);
        }
        return;
      }
      const savedComfyUrl = window.localStorage.getItem("comfyui-url");
      if (!disposed && savedComfyUrl) {
        setComfyUrl(savedComfyUrl);
        setComfyUrlDraft(savedComfyUrl);
      }
    };
    void load();
    if (api?.getAgentExecutable) {
      void api.getAgentExecutable().then((value) => {
        if (!disposed) setLlmExecutablePath(value);
      });
    } else {
      setLlmExecutablePath(window.localStorage.getItem("llm-executable-path") ?? "");
    }
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const api = (window as DirectoryPickerWindow).electronDirector;
    if (!api?.onComfyStateChange) return;
    return api.onComfyStateChange((state) => {
      setComfyConnected(state.ready);
      if (state.url) {
        setComfyUrl(state.url);
        setComfyUrlDraft(state.url);
      }
      if (state.error) setGenerationStatus(`ComfyUI：${state.error}`);
    });
  }, []);

  useEffect(() => {
    if (!taskShot) return;
    const shotId = taskShot.id;
    const remap = new Map<string, string>();
    (['image', 'video', 'audio'] as ReferenceKind[]).forEach((kind) => {
      const prefix = `${shotId}-${kind}-`;
      const entries = Object.entries(referenceAssets)
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, asset]) => ({
          key,
          asset,
          index: Number(key.slice(prefix.length)),
        }))
        .filter((entry) => Number.isInteger(entry.index))
        .sort((left, right) => left.index - right.index);
      entries.forEach((entry, index) => {
        const nextKey = referenceKey(shotId, kind, index);
        if (entry.key !== nextKey) remap.set(entry.key, nextKey);
      });
    });
    if (!remap.size) return;
    setReferenceAssets((current) => {
      const next = { ...current };
      remap.forEach((nextKey, oldKey) => {
        const asset = next[oldKey];
        if (!asset) return;
        delete next[oldKey];
        next[nextKey] = asset;
      });
      return next;
    });
    setPromptSubjects((current) => {
      const subjects = current[shotId];
      if (!subjects?.length) return current;
      const remapKey = (assetKey: string) => remap.get(assetKey) ?? assetKey;
      return {
        ...current,
        [shotId]: remapSubjectReferenceKeys(subjects, remapKey),
      };
    });
  }, [taskShot?.id, referenceAssets]);
  const frameButtonTitle = !videoUrl
    ? "先生成或加载当前镜头视频"
    : activeShot >= shots.length - 1
      ? "请先创建下一个镜头"
      : "先用播放器进度条定位画面，再设为下一镜头首帧";
  const allMentionOptions = promptMention ? referenceMentionOptions() : [];
  const mentionOptions = promptMention
    ? allMentionOptions.filter((option) =>
        `${option.token} ${option.name}`
          .toLowerCase()
          .includes(promptMention.query.toLowerCase()),
      )
    : [];

  useEffect(() => {
    let disposed = false;
    const restoreState = async () => {
      const persistedComfyUrl =
        window.localStorage.getItem("comfyui-url")?.trim() ||
        "http://127.0.0.1:8188";
      window.localStorage.removeItem("comfyui-director-state");
      const savedProjectHandle: ElectronDirectoryHandle | null =
        await loadProjectDirectoryHandle().catch(() => null);
      const projectHandle =
        savedProjectHandle &&
        (await isDirectoryHandleAvailable(savedProjectHandle))
          ? savedProjectHandle
          : null;
      if (disposed) return;
      if (savedProjectHandle && !projectHandle)
        void clearProjectDirectoryHandle().catch(() => undefined);
      if (projectHandle) {
        const metadata = await readProjectMetadata(projectHandle);
        projectIdRef.current = metadata.id;
        projectIdsRef.current.set(projectHandle, metadata.id);
        setProjectDirectory(projectHandle);
        setProjectDirectoryName(metadata.name || projectHandle.name || "项目目录");
      }
      const savedProjectHandles =
        (await loadProjectDirectoryHandles().catch(() => [])) as ElectronDirectoryHandle[];
      let projectHandles = (
        await Promise.all(
          savedProjectHandles.map(async (handle) =>
            (await isDirectoryHandleAvailable(handle)) ? handle : null,
          ),
        )
      ).filter((handle): handle is ElectronDirectoryHandle =>
        Boolean(handle),
      );
      if (disposed) return;
      const uniqueHandles: ElectronDirectoryHandle[] = [];
      const knownIds = new Set<string>();
      for (const handle of projectHandles) {
        const metadata = await readProjectMetadata(handle);
        if (await Promise.all(uniqueHandles.map((existing) =>
          existing.isSameEntry(handle).catch(() => false),
        )).then((matches) => matches.some(Boolean))) continue;
        if (knownIds.has(metadata.id)) {
          metadata.id = crypto.randomUUID();
          await writeProjectId(handle, metadata.id);
        }
        knownIds.add(metadata.id);
        projectIdsRef.current.set(handle, metadata.id);
        uniqueHandles.push(handle);
      }
      projectHandles = uniqueHandles;
      if (disposed) return;
      if (projectHandles.length !== savedProjectHandles.length)
        void saveProjectDirectoryHandles(projectHandles).catch(() => undefined);
      if (projectHandles.length) setProjectDirectories(projectHandles);
      if (projectHandle) {
        try {
          const projectShots = await readProjectShots(projectHandle);
          resetProjectEditorState();
          const restoredAssets = applyProjectShotRecords(projectShots);
          await hydrateProjectReferenceAssets(
            projectHandle,
            restoredAssets,
            persistedComfyUrl,
          );
          setActiveShot(0);
        } catch (error) {
          setGenerationStatus(
            error instanceof Error ? error.message : "项目读取失败",
          );
        }
      }
      setStorageReady(true);
    };
    void restoreState();
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady || !projectDirectory) return;
    void refreshProjectTree();
  }, [storageReady, projectDirectory]);

  useEffect(() => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    if (!projectDirectory || !storageReady || !shots.length) return;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const snapshot = {
        projectDirectory,
        shot: taskShot,
        shots,
        shotSettings,
        promptSubjects,
        shotPrompts,
        optimizedPrompts,
        keyframeMode,
        shotTasks,
        shotFileNames,
      };
      void enqueueProjectMutation(async () => {
          for (const shot of snapshot.shots) {
            const settings = snapshot.shotSettings[shot.id] ?? shotSettingDefaults;
            const modeKey = promptStoreKey(shot.id, settings.mode);
            await writeClipManifest(shot, {
              generation: {
                mode: settings.mode,
                duration: Number.parseFloat(settings.duration) || 6,
                resolution: settings.resolution,
                aspect: settings.aspect,
                fps: Number.parseInt(settings.fps, 10) || 24,
                model: settings.model,
                turbo: settings.turbo,
                seed: settings.seed,
                seedMode: settings.seedMode,
                ...(snapshot.shotTasks[shot.id]
                  ? { seed: snapshot.shotTasks[shot.id].seed, seedMode: snapshot.shotTasks[shot.id].seedMode, steps: snapshot.shotTasks[shot.id].steps }
                  : {}),
                ...(settings.mode === "I2VA"
                  ? { keyframeMode: shot.id === snapshot.shot?.id ? snapshot.keyframeMode : settings.keyframeMode }
                  : {}),
              },
              promptOriginal: snapshot.shotPrompts[modeKey] ??
                (shot.id === snapshot.shot?.id ? prompt : ""),
              promptOptimized: snapshot.optimizedPrompts[modeKey],
              output: shot.output ?? null,
            });
          }
        }).catch(() => undefined);
    }, 500);
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    projectDirectory,
    storageReady,
    shots,
    shotSettings,
    promptSubjects,
    shotPrompts,
    optimizedPrompts,
    keyframeMode,
    shotTasks,
    shotFileNames,
    referenceAssets,
    keyframes,
  ]);

  useEffect(() => {
    if (!projectDirectory || !storageReady) return;
    let disposed = false;
    const projectEpoch = projectEpochRef.current;
    const hydrate = async () => {
      for (const [key, frame] of Object.entries(keyframes)) {
        if (disposed || !frame.sourcePath) continue;
        const token = keyframeUploadTokensRef.current[key];
        const isCurrent = () => !disposed &&
          projectEpochRef.current === projectEpoch &&
          keyframeUploadTokensRef.current[key] === token &&
          keyframesRef.current[key] === frame;
        try {
          if (frame.comfyName && (await isReferenceAssetAvailable(frame, comfyUrl))) continue;
          if (!isCurrent()) continue;
          const source = await readProjectSourceFile(projectDirectory, frame.sourcePath);
          if (!source || !isCurrent()) continue;
          const uploaded = await uploadReferenceFile(source, "image", comfyUrl);
          if (!isCurrent()) continue;
          const restored = { ...frame, ...uploaded, url: referenceAssetUrl(uploaded, comfyUrl) };
          keyframesRef.current = { ...keyframesRef.current, [key]: restored };
          setKeyframes((current) =>
            current[key] === frame
              ? { ...current, [key]: restored }
              : current,
          );
          if (frame.url.startsWith("blob:")) URL.revokeObjectURL(frame.url);
        } catch {
          if (isCurrent()) setGenerationStatus("关键帧源文件无法重新上传");
        }
      }
    };
    void hydrate();
    return () => {
      disposed = true;
    };
  }, [projectDirectory, storageReady, comfyUrl]);

  useEffect(() => {
    activeShotIdRef.current = taskShot?.id ?? null;
  }, [taskShot?.id]);

  useEffect(() => {
    if (!promptNotice) return;
    const timer = window.setTimeout(() => setPromptNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [promptNotice]);

  useEffect(() => {
    if (!storageReady || !taskShot) return;
    const settings = shotSettings[taskShot.id] ?? shotSettingDefaults;
    setPrompt(
      normalizePrompt(shotPrompts[promptStoreKey(taskShot.id, settings.mode)]),
    );
    setPromptNotice(null);
    setVideoUrl(shotVideos[taskShot.id] ?? taskShot.output ?? null);
    void loadArchivedShotVideo(taskShot).then((url) => {
      if (url && activeShotIdRef.current === taskShot.id) setVideoUrl(url);
    });
    setDuration(settings.duration);
    setResolution(settings.resolution);
    setAspect(settings.aspect);
    setFps(settings.fps);
    setMode(settings.mode);
    setModel(settings.model);
    setTurboMode(settings.turbo);
    setSeed(settings.seed);
    setSeedMode(settings.seedMode);
    setKeyframeMode(settings.keyframeMode);
    setGenerationStatus(
      taskShot.state === "已完成"
        ? "已完成"
        : taskShot.state === "生成中"
          ? "正在生成"
          : taskShot.state === "失败"
            ? "生成失败"
            : taskShot.state === "文件缺失"
              ? "视频文件缺失，请重新生成"
              : taskShot.state === "已停止"
                ? "已停止"
                : "等待生成",
    );
  }, [storageReady, taskShot?.id, shotVideos, shotSettings]);

  useEffect(() => {
    setGenerationNotice(null);
  }, [taskShot?.id]);

  useEffect(() => {
    if (!storageReady || !projectDirectory) return;
    const candidates = shots
      .filter(
        (shot) =>
          (shot.state === "已完成" || shot.state === "文件缺失") &&
          !shotTasks[shot.id] &&
          shot.output,
      )
      .map((shot) => {
        return {
          id: shot.id,
          state: shot.state,
          sourcePath: `片段/${shot.id}-${safeFileStem(shot.title)}/${shot.output}`,
        };
      });
    if (!candidates.length) return;
    let disposed = false;
    const epoch = projectEpochRef.current;
    const verify = async ({
      id,
      state,
      sourcePath,
    }: (typeof candidates)[number]) => {
      let file: File | null = null;
      try {
        file = await readProjectSourceFile(projectDirectory, sourcePath);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "NotFoundError")) return;
      }
      if (disposed || epoch !== projectEpochRef.current) return;
      if (file) {
        if (state === "文件缺失") {
          const resolvedUrl = URL.createObjectURL(file);
          setShotVideos((current) => ({ ...current, [id]: resolvedUrl }));
          setShots((items) => {
            let changed = false;
            const next = items.map((item) =>
              item.id === id && item.state === "文件缺失"
                ? ((changed = true), { ...item, state: "已完成" })
                : item,
            );
            return changed ? next : items;
          });
          setShotStages((current) =>
            current[id] === "文件缺失"
              ? { ...current, [id]: "已完成" }
              : current,
          );
          if (activeShotIdRef.current === id) {
            setVideoUrl(resolvedUrl);
            setGenerationStatus("已完成");
          }
        }
      } else {
        setShots((items) => {
          let changed = false;
          const next = items.map((item) =>
            item.id === id && item.state === "已完成"
              ? ((changed = true), { ...item, state: "文件缺失" })
              : item,
          );
          return changed ? next : items;
        });
        setShotStages((current) =>
          current[id] === "文件缺失"
            ? current
            : { ...current, [id]: "文件缺失" },
        );
        if (activeShotIdRef.current === id) {
          setVideoUrl(null);
          setGenerationStatus("视频文件缺失，请重新生成");
        }
      }
    };
    const checkFiles = () => {
      void Promise.all(candidates.map((candidate) => verify(candidate)));
    };
    checkFiles();
    const timer = window.setInterval(checkFiles, 2000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [storageReady, projectDirectory, shots, shotTasks]);

  useEffect(() => {
    if (!Object.keys(shotTasks).length) return;
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [shotTasks]);

  // Keep ComfyUI responsive during active work, but release cached models
  // after 15 minutes with no running generation task.
  useEffect(() => {
    if (Object.keys(shotTasks).length) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/comfyui/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comfy_url: comfyUrl }),
      });
    }, 15 * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [shotTasks, comfyUrl]);

  useEffect(() => {
    let disposed = false;
    const checkConnection = async () => {
      try {
        const response = await fetch(
          `/api/comfyui/status?comfy_url=${encodeURIComponent(comfyUrl)}`,
          { cache: "no-store" },
        );
        const result = (await response.json()) as { connected?: boolean };
        if (!disposed) setComfyConnected(result.connected === true);
      } catch {
        if (!disposed) setComfyConnected(false);
      }
    };
    void checkConnection();
    const timer = window.setInterval(() => {
      void checkConnection();
    }, 5000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [comfyUrl]);

  function selectShot(index: number) {
    const nextShot = shots[index];
    const settings = shotSettings[nextShot.id];
    const shotResolution =
      settings?.resolution ?? shotSettingDefaults.resolution;
    setActiveShot(index);
    activeShotIdRef.current = nextShot.id;
    setPrompt(
      normalizePrompt(
        shotPrompts[promptStoreKey(nextShot.id, settings?.mode ?? activeMode)],
      ),
    );
    const savedVideo = shotVideos[nextShot.id];
    setVideoUrl(savedVideo ?? null);
    void loadArchivedShotVideo(nextShot).then((url) => {
      if (url && activeShotIdRef.current === nextShot.id) setVideoUrl(url);
    });
    setGenerationStatus(
      nextShot.state === "已完成"
        ? "已完成"
        : nextShot.state === "生成中"
          ? "正在生成"
          : nextShot.state === "失败"
            ? "生成失败"
            : nextShot.state === "文件缺失"
              ? "视频文件缺失，请重新生成"
              : nextShot.state === "已停止"
                ? "已停止"
                : "等待生成",
    );
    setDuration(
      settings?.duration ?? shotSettingDefaults.duration,
    );
    setResolution(shotResolution);
    setAspect(settings?.aspect ?? "16:9");
    setFps(settings?.fps ?? "24 fps");
    setMode(settings?.mode ?? "T2VA");
    setModel(settings?.model ?? "H3");
    setTurboMode(settings?.turbo ?? shotSettingDefaults.turbo);
  }
  function addShot() {
    setNewTitle(`未命名片段 ${String(shots.length + 1).padStart(2, "0")}`);
    setAddDialog(true);
    return;
  }
  async function confirmAddShot() {
    const title = newTitle.trim();
    if (!title || creatingShotRef.current || !projectDirectory) return;
    creatingShotRef.current = true;
    const projectAtStart = projectDirectory;
    const epochAtStart = projectEpochRef.current;
    let createdShot: { id: string; title: string; state: string } | null = null;
    try {
      await enqueueProjectMutation(async () => {
        if (projectDirectory !== projectAtStart || projectEpochRef.current !== epochAtStart)
          throw new Error("项目已切换，请在当前项目中重新创建片段");
        const currentShots = await readProjectShots(projectAtStart);
        const nextShotNumber = await readNextShotNumber(projectAtStart, currentShots);
        const shot = { id: String(nextShotNumber).padStart(2, "0"), title: title.trim(), state: "草稿" };
        createdShot = shot;
        await writeClipManifest(shot, {
          generation: { mode: "T2VA", model: "H3", duration: 6, resolution: "864 × 480", aspect: "16:9", fps: 24, turbo: true, seed: "7483926150842719", seedMode: "fixed" },
          promptOriginal: "",
        });
        await writeProjectManifest([...currentShots, shot], nextShotNumber + 1);
      });
    } catch (error) {
      const failedShot = createdShot as { id: string; title: string } | null;
      if (failedShot && projectDirectory === projectAtStart)
        await deleteSavedShotFiles(failedShot.id, failedShot.title).catch(() => undefined);
      setGenerationStatus(
        error instanceof Error && error.message.includes("项目已切换")
          ? error.message
          : "片段创建失败，请检查项目目录写入权限",
      );
      return;
    } finally {
      creatingShotRef.current = false;
    }
    const shot = createdShot as { id: string; title: string; state: string } | null;
    if (!shot) return;
    setShots((current) => [...current, shot]);
    setShotPrompts((current) => ({
      ...current,
      [promptStoreKey(shot.id, "T2VA")]: "",
    }));
    // Each shot owns its subjects and references. Reuse is explicit via the
    // subject library, so a new shot cannot accidentally process prior-shot
    // characters that were never added to it.
    setPromptSubjects((current) => ({ ...current, [shot.id]: [] }));
    setShotSettings((current) => ({
      ...current,
      [shot.id]: { ...shotSettingDefaults },
    }));
    setShotVisualStyles((current) => ({ ...current, [shot.id]: "natural_cinematic" }));
    // A deleted shot may have reused this id. Never inherit its old keyframes.
    setKeyframes((current) => {
      const next = { ...current };
      Object.keys(next)
        .filter((key) => key.startsWith(`${shot.id}-`))
        .forEach((key) => delete next[key]);
      return next;
    });
    setReferenceAssets((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${shot.id}-`))),
    );
    const clearShotEntry = <T,>(current: Record<string, T>) => {
      const next = { ...current };
      delete next[shot.id];
      return next;
    };
    setShotVideos(clearShotEntry);
    setShotFileNames(clearShotEntry);
    setGenerationDurations(clearShotEntry);
    setShotTasks(clearShotEntry);
    setShotStages(clearShotEntry);
    setSubmittingShots(clearShotEntry);
    setActiveShot(shots.length);
    activeShotIdRef.current = shot.id;
    setPrompt("");
    setDuration("6 秒");
    setResolution("864 × 480");
    setAspect("16:9");
    setFps("24 fps");
    setMode("T2VA");
    setModel("H3");
    setTurboMode(true);
    setKeyframeMode("first");
    setVideoUrl(null);
    setGenerationStatus("等待生成");
    setAddDialog(false);
  }
  function renameShot(index: number) {
    setNewTitle(shots[index]?.title ?? "");
    setRenameIndex(index);
  }
  async function copyDirectoryContents(
    source: FileSystemDirectoryHandle,
    target: FileSystemDirectoryHandle,
  ) {
    for await (const [name, entry] of source.entries()) {
      if (entry.kind === "directory") {
        const targetDirectory = await target.getDirectoryHandle(name, { create: true });
        await copyDirectoryContents(entry, targetDirectory);
        continue;
      }
      const sourceFile = await entry.getFile();
      const targetFile = await target.getFileHandle(name, { create: true });
      const writable = await targetFile.createWritable();
      await writable.write(await sourceFile.arrayBuffer());
      await writable.close();
    }
  }
  async function renameSavedShotDirectory(
    shotId: string,
    oldTitle: string,
    newTitle: string,
  ) {
    if (!projectDirectory) throw new Error("请先选择项目目录");
    const oldName = `${shotId}-${safeFileStem(oldTitle)}`;
    const newName = `${shotId}-${safeFileStem(newTitle)}`;
    if (oldName === newName) return false;
    const clips = await projectDirectory.getDirectoryHandle("片段");
    const writableDirectory = clips as WritableDirectoryHandle;
    const permission = writableDirectory.queryPermission
      ? await writableDirectory.queryPermission({ mode: "readwrite" })
      : "granted";
    if (permission !== "granted") throw new Error("片段目录没有写入权限");
    let source: FileSystemDirectoryHandle;
    try {
      source = await clips.getDirectoryHandle(oldName);
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError")
        throw new Error("原片段目录不存在，无法重命名");
      throw error;
    }
    let target: FileSystemDirectoryHandle;
    try {
      target = await clips.getDirectoryHandle(newName);
      if (await source.isSameEntry(target)) return false;
      throw new Error("目标片段目录已存在");
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError"))
        throw error;
      target = await clips.getDirectoryHandle(newName, { create: true });
    }
    await copyDirectoryContents(source, target);
    return true;
  }
  async function confirmRenameShot() {
    if (renameIndex === null || !newTitle.trim()) return;
    const shot = shots[renameIndex];
    if (!shot) return;
    const title = newTitle.trim();
    const oldFolderName = `${shot.id}-${safeFileStem(shot.title)}`;
    const newFolderName = `${shot.id}-${safeFileStem(title)}`;
    if (title === shot.title) {
      setRenameIndex(null);
      return;
    }
    const directoryMoved = oldFolderName !== newFolderName;
    const oldFolder = `片段/${shot.id}-${safeFileStem(shot.title)}`;
    const newFolder = `片段/${shot.id}-${safeFileStem(title)}`;
    let renamedAssets = referenceAssets;
    let renamedKeyframes = keyframes;
    if (oldFolder !== newFolder) {
      renamedAssets = { ...referenceAssets };
      const shotPrefix = `${shot.id}-`;
        Object.entries(referenceAssets).forEach(([key, asset]) => {
          if (!key.startsWith(shotPrefix) || !asset.sourcePath) return;
          const normalized = asset.sourcePath.replaceAll("\\", "/");
          if (!normalized.startsWith(`${oldFolder}/`)) return;
          renamedAssets[key] = {
            ...asset,
            sourcePath: `${newFolder}/${normalized.slice(oldFolder.length + 1)}`,
          };
        });
      renamedKeyframes = { ...keyframes };
        Object.entries(keyframes).forEach(([key, frame]) => {
          if (!key.startsWith(shotPrefix) || !frame.sourcePath) return;
          const normalized = frame.sourcePath.replaceAll("\\", "/");
          if (!normalized.startsWith(`${oldFolder}/`)) return;
          renamedKeyframes[key] = {
            ...frame,
            sourcePath: `${newFolder}/${normalized.slice(oldFolder.length + 1)}`,
          };
        });
    }
    const next = shots.map((item, itemIndex) =>
      itemIndex === renameIndex ? { ...item, title } : item,
    );
    try {
      await enqueueProjectMutation(async () => {
        await renameSavedShotDirectory(shot.id, shot.title, title);
        await writeClipManifest({ id: shot.id, title, output: shot.output ?? null }, {
          referenceAssets: renamedAssets,
          keyframes: renamedKeyframes,
        });
        await writeProjectManifest(next);
        const clips = await projectDirectory?.getDirectoryHandle("片段");
        if (directoryMoved && clips && (clips as WritableDirectoryHandle).removeEntry)
          await (clips as WritableDirectoryHandle).removeEntry(oldFolderName, { recursive: true });
      });
    } catch {
      if (directoryMoved) {
        try {
          const clips = await projectDirectory?.getDirectoryHandle("片段");
          if (clips && (clips as WritableDirectoryHandle).removeEntry)
            await (clips as WritableDirectoryHandle).removeEntry(newFolderName, { recursive: true });
        } catch {
          // Keep the original error; cleanup is best effort.
        }
      }
      setGenerationStatus("片段重命名保存失败，旧目录仍已保留");
      return;
    }
    setReferenceAssets(renamedAssets);
    setKeyframes(renamedKeyframes);
    setShots(next);
    setRenameIndex(null);
  }
  function deleteShot(index: number) {
    setDeleteIndex(index);
    return;
  }
  async function deleteSavedShotFiles(shotId: string, shotTitle: string) {
    if (!projectDirectory) return;
    const clips = await projectDirectory.getDirectoryHandle("片段");
    const writableDirectory = clips as WritableDirectoryHandle;
    if (!writableDirectory.removeEntry) return;
    const permission = writableDirectory.queryPermission
      ? await writableDirectory.queryPermission({ mode: "readwrite" })
      : "granted";
    if (permission !== "granted") throw new Error("输出目录没有写入权限");
    try {
      await writableDirectory.removeEntry(`${shotId}-${safeFileStem(shotTitle)}`, {
        recursive: true,
      });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError"))
        throw error;
    }
  }
  async function confirmDeleteShot(deleteFromDisk = false) {
    if (deleteIndex === null) return;
    const index = deleteIndex;
    const shot = shots[index];
    if (!shot) return;
    const deletedId = shot.id;
    const next = shots.filter((_, itemIndex) => itemIndex !== index);
    try {
      await enqueueProjectMutation(async () => {
        await writeProjectManifest(next);
        if (deleteFromDisk) await deleteSavedShotFiles(deletedId, shot.title);
      });
    } catch {
      setGenerationStatus("片段删除保存失败，原片段文件仍已保留");
      return;
    }
    setShots(next);
    if (deletedId) {
      setShotPrompts((current) => {
        const nextPrompts = { ...current };
        Object.keys(nextPrompts)
          .filter((key) => key.startsWith(`${deletedId}::`))
          .forEach((key) => delete nextPrompts[key]);
        return nextPrompts;
      });
      setOptimizedPrompts((current) => {
        const nextPrompts = { ...current };
        Object.keys(nextPrompts)
          .filter((key) => key.startsWith(`${deletedId}::`))
          .forEach((key) => delete nextPrompts[key]);
        return nextPrompts;
      });
      setPromptSubjects((current) => {
        const nextSubjects = { ...current };
        delete nextSubjects[deletedId];
        return nextSubjects;
      });
      setShotSettings((current) => {
        const nextSettings = { ...current };
        delete nextSettings[deletedId];
        return nextSettings;
      });
      setShotVideos((current) => {
        const nextVideos = { ...current };
        delete nextVideos[deletedId];
        return nextVideos;
      });
      setShotFileNames((current) => {
        const nextFileNames = { ...current };
        delete nextFileNames[deletedId];
        return nextFileNames;
      });
      setGenerationDurations((current) => {
        const nextDurations = { ...current };
        delete nextDurations[deletedId];
        return nextDurations;
      });
      setShotTasks((current) => {
        const nextTasks = { ...current };
        delete nextTasks[deletedId];
        return nextTasks;
      });
      setSubmittingShots((current) => {
        const nextSubmitting = { ...current };
        delete nextSubmitting[deletedId];
        return nextSubmitting;
      });
      setKeyframes((current) => {
        const nextKeyframes = { ...current };
        Object.keys(nextKeyframes)
          .filter((key) => key.startsWith(`${deletedId}-`))
          .forEach((key) => delete nextKeyframes[key]);
        return nextKeyframes;
      });
      setReferenceAssets((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([key]) => !key.startsWith(`${deletedId}-`),
          ),
        ),
      );
    }
    const nextIndex = next.length ? Math.min(activeShot, next.length - 1) : 0;
    setActiveShot(nextIndex);
    const nextShot = next[nextIndex];
    if (nextShot) {
      const settings = shotSettings[nextShot.id] ?? shotSettingDefaults;
      setPrompt(
        normalizePrompt(
          shotPrompts[promptStoreKey(nextShot.id, settings.mode)],
        ),
      );
      setVideoUrl(shotVideos[nextShot.id] ?? null);
      setDuration(settings.duration);
      setResolution(settings.resolution);
      setAspect(settings.aspect);
      setFps(settings.fps);
      setMode(settings.mode);
      setModel(settings.model);
      setTurboMode(settings.turbo);
      setGenerationStatus(
        nextShot.state === "已完成"
          ? "已完成"
          : nextShot.state === "生成中"
            ? "正在生成"
            : nextShot.state === "失败"
              ? "生成失败"
              : nextShot.state === "文件缺失"
                ? "视频文件缺失，请重新生成"
                : nextShot.state === "已停止"
                  ? "已停止"
                  : "等待生成",
      );
    } else {
      setPrompt("");
      setVideoUrl(null);
      setGenerationStatus("等待生成");
    }
    setDeleteIndex(null);
  }
  function updateSetting<K extends keyof ShotSettings>(
    key: K,
    value: ShotSettings[K],
  ) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setShotSettings((current) => ({
      ...current,
      [shotId]: { ...shotSettingDefaults, ...current[shotId], [key]: value },
    }));
  }
  function ensureReferenceMode(shotId: string) {
    const current = shotSettings[shotId] ?? shotSettingDefaults;
    if (current.mode === "R2VA") return;
    const next: ShotSettings = { ...current, mode: "R2VA" };
    setShotSettings((settings) => ({ ...settings, [shotId]: next }));
    if (taskShot?.id === shotId) setMode("R2VA");
  }
  function getShotSettings(shot: Shot) {
    return { ...shotSettingDefaults, ...shotSettings[shot.id] };
  }
  function shotDetail(shot: Shot) {
    const settings = getShotSettings(shot);
    return `${settings.duration.replace(/\s*秒$/, "s")} · ${settings.mode} · ${settings.turbo ? "加速" : "标准"} · ${settings.resolution.replace(/\s*×\s*/, "×")} · ${settings.fps.replace(/\s+/g, "")}`;
  }
  async function bindProjectAsset(
    asset: ProjectTreeAsset,
    target?: { kind: ReferenceKind; index: number },
  ) {
    const shotId = taskShot?.id;
    if (!shotId || !projectDirectory) return;
    const epoch = projectEpochRef.current;
    const projectAtStart = projectDirectory;
    ensureReferenceMode(shotId);
    try {
      const folderName =
        asset.type === "character"
          ? "角色"
          : asset.type === "wardrobe"
          ? "服装"
          : asset.type === "prop"
            ? "道具"
            : asset.type === "scene"
              ? "场景"
              : asset.type === "custom"
                ? "自定义"
                : asset.type === "video"
                  ? "视频"
                  : "音频";
      const folder = await getProjectAssetFolder(projectDirectory, folderName);
      const file = await (await folder.getFileHandle(asset.name)).getFile();
      if (projectEpochRef.current !== epoch || projectDirectory !== projectAtStart) return;
      const kind: ReferenceKind = file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "video"
          : "image";
      const role: ReferenceRole =
        asset.type === "character"
          ? "character"
          : asset.type === "wardrobe"
            ? "wardrobe"
            : asset.type === "prop"
              ? "object"
              : asset.type === "scene"
                ? "environment"
                : asset.type === "video"
                  ? "video"
                  : asset.type === "audio"
                    ? "audio"
                    : "composite";
      const existingKey = Object.entries(referenceAssets).find(
        ([key, existing]) =>
          key.startsWith(`${shotId}-${kind}-`) &&
          existing.kind === kind &&
          existing.sourcePath === `资产/${folderName}/${asset.name}`,
      )?.[0];
      const key = target?.kind === kind
        ? referenceKey(shotId, kind, target.index)
        : existingKey ?? referenceKey(shotId, kind, nextReferenceIndex(shotId, kind));
      if (!existingKey || target) {
        const previous = referenceAssets[key];
        const uploaded = await uploadReferenceFile(file, kind, comfyUrl);
        if (projectEpochRef.current !== epoch || projectDirectory !== projectAtStart) return;
        if (previous?.sourcePath) void deleteReferenceSourceFile(previous.sourcePath);
        if (previous?.url.startsWith("blob:")) URL.revokeObjectURL(previous.url);
        updateReferenceAssets((current) => ({
          ...current,
          [key]: {
            name: file.name,
            url: URL.createObjectURL(file),
            ...uploaded,
            sourcePath: `资产/${folderName}/${asset.name}`,
          },
        }));
      }
      const uploadedKeys = [key];
      const uploadedRoles: ReferenceRole[] = [role];
      const parsedAsset = parseProjectAssetName(asset.name);
      setPromptSubjects((current) => {
        const subjects = remapSubjectReferenceKeys(
          current[shotId] ?? [],
          (assetKey) => assetKey === key ? null : assetKey,
        );
        const child = {
          name: parsedAsset.name,
          assetKeys: uploadedKeys,
          assetRoles: Object.fromEntries(
            uploadedKeys.map((key, index) => [key, uploadedRoles[index] ?? "composite"]),
          ),
        };
        const existingIndex = subjects.findIndex(
          (subject) =>
            subject.name.trim().toLowerCase() === parsedAsset.name.trim().toLowerCase(),
        );
        if (existingIndex >= 0) {
          const existing = subjects[existingIndex];
          subjects[existingIndex] = {
            ...existing,
            assetKeys: [...new Set([...existing.assetKeys, ...uploadedKeys])],
            assetRoles: { ...existing.assetRoles, ...child.assetRoles },
          };
          return { ...current, [shotId]: subjects };
        }
        return { ...current, [shotId]: [...subjects, child] };
      });
      setAssetSubjectPickerOpen(false);
      setGenerationStatus(`已将资产“${asset.name}”绑定到当前片段`);
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? `绑定资产失败：${error.message}`
          : "绑定资产失败",
      );
    }
  }
  function changeGenerationMode(nextMode: GenerationMode) {
    setMode(nextMode);
    const nextModePrompt = taskShot
      ? shotPrompts[promptStoreKey(taskShot.id, nextMode)] ?? ""
      : "";
    if (taskShot) {
      setPrompt(normalizePrompt(nextModePrompt));
    }
    updateSetting("mode", nextMode);
    const shot = shots[activeShot];
    if (shot) {
      const settings = {
        ...shotSettingDefaults,
        ...shotSettings[shot.id],
        mode: nextMode,
      };
      void writeClipManifest(shot, {
        generation: {
          mode: settings.mode,
          duration: Number.parseFloat(settings.duration) || 6,
          resolution: settings.resolution,
          aspect: settings.aspect,
          fps: Number.parseInt(settings.fps, 10) || 24,
          model: settings.model,
          turbo: settings.turbo,
        },
        promptOriginal:
          shotPrompts[promptStoreKey(shot.id, nextMode)] ??
          (shot.id === taskShot?.id ? nextModePrompt : ""),
      });
    }
  }
  function openPromptViewer() {
    const key = taskShot ? promptStoreKey(taskShot.id, activeMode) : "";
    const effectivePrompt = taskShot
      ? optimizedPrompts[key]?.trim() || prompt.trim() || shotPrompts[key]?.trim() || ""
      : "";
    if (!effectivePrompt) {
      setPromptNotice({ type: "error", text: "当前模式暂无可查看的提示词" });
      return;
    }
    setPromptDraft(effectivePrompt);
    setPromptCopied(false);
    setPromptViewerOpen(true);
  }
  async function copyPromptViewer() {
    if (!promptDraft.trim()) return;
    try {
      await navigator.clipboard.writeText(promptDraft);
      setPromptCopied(true);
      window.setTimeout(() => setPromptCopied(false), 1600);
    } catch {
      setGenerationStatus("复制失败，请手动选择提示词复制");
    }
  }
  function closePromptViewer() {
    setPromptCopied(false);
    setPromptViewerOpen(false);
  }
  function shotElapsed(shotId: string) {
    const task = shotTasks[shotId];
    return task ? elapsedNow - task.startedAt : generationDurations[shotId];
  }
  function resetProjectEditorState() {
    projectEpochRef.current += 1;
    referenceUploadTokensRef.current = {};
    keyframeUploadTokensRef.current = {};
    keyframesRef.current = {};
    setPromptOptimizing({});
    setShots([]);
    setActiveShot(0);
    setPrompt("");
    setVideoUrl(null);
    setShotPrompts({});
    setPromptSubjects({});
    setShotSettings({});
    setShotVideos({});
    setShotFileNames({});
    setGenerationDurations({});
    setShotTasks({});
    setShotStages({});
    setSubmittingShots({});
    setKeyframes({});
    setReferenceAssets({});
    setOptimizedPrompts({});
    optimizedPromptFingerprintsRef.current = {};
    setShotVisualStyles({});
    setPromptNotice(null);
    setPromptMention(null);
    setPromptViewerOpen(false);
  }
  function chooseProjectDirectory() {
    setProjectError(null);
    setNewProjectName("未命名项目");
    setProjectNameDialog(true);
  }
  async function createProjectDirectory(projectNameOverride?: string) {
    const electronPicker = (window as DirectoryPickerWindow).electronDirector?.pickDirectory;
    if (!electronPicker) {
      setGenerationStatus("当前窗口没有可用的项目目录功能");
      setProjectError("当前窗口没有可用的目录选择功能，请重新启动视频创作工作台。");
      return;
    }
    const requestedName = (projectNameOverride ?? newProjectName).trim();
    if (!requestedName) return;
    setProjectNameDialog(false);
    let createStage = "选择保存位置";
    try {
      const selectedDirectory = await electronPicker();
      if (!selectedDirectory) return;
      createStage = "创建项目目录";
      const newProjectId = crypto.randomUUID();
      const directory = await selectedDirectory.createProject(requestedName, newProjectId);
      projectIdRef.current = newProjectId;
      projectIdsRef.current.set(directory, newProjectId);
      resetProjectEditorState();
      setProjectDirectory(directory);
      setProjectDirectories((current) => {
        const next = [
          ...current.filter((item) => item !== directory),
          directory,
        ];
        void saveProjectDirectoryHandles(next);
        return next;
      });
      void saveProjectDirectoryHandle(directory);
      setProjectDirectoryName(requestedName);
      setGenerationStatus(`项目目录已就绪：${requestedName}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProjectError(`${createStage}失败：${errorMessage(error)}`);
      setGenerationStatus("创建项目目录失败");
    }
  }
  async function importProjectDirectory() {
    const electronPicker = (window as DirectoryPickerWindow).electronDirector?.pickDirectory;
    if (!electronPicker) {
      setGenerationStatus("当前窗口没有可用的项目导入功能");
      return;
    }
    try {
      const directory = await electronPicker();
      if (!directory) return;
      const writable = directory as WritableDirectoryHandle;
      const permission = writable.requestPermission
        ? await writable.requestPermission({ mode: "readwrite" })
        : "granted";
      if (permission !== "granted") {
        setGenerationStatus("没有项目目录读取权限");
        return;
      }
      const required = ["资产", "片段", "输出"];
      const missing: string[] = [];
      for (const folder of required) {
        try {
          await directory.getDirectoryHandle(folder);
        } catch {
          missing.push(folder);
        }
      }
      if (missing.length)
        throw new Error(`项目格式无效，缺少目录：${missing.join("、")}`);
      const loaded = await readProjectShots(directory);
      let metadata = await readProjectMetadata(directory);
      const knownDirectories = [
        ...projectDirectories,
        ...(projectDirectory ? [projectDirectory] : []),
      ];
      let sameDirectory = false;
      let duplicateId = false;
      for (const existing of knownDirectories) {
        if (await existing.isSameEntry(directory).catch(() => false)) {
          sameDirectory = true;
          break;
        }
        const existingId = projectIdsRef.current.get(existing);
        if (existingId === metadata.id) duplicateId = true;
      }
      if (sameDirectory) {
        setGenerationStatus(`项目已在列表中：${metadata.name || directory.name}`);
        return;
      }
      if (duplicateId) {
        const migratedId = crypto.randomUUID();
        await writeProjectId(directory, migratedId);
        metadata = { ...metadata, id: migratedId };
      }
      projectIdRef.current = metadata.id;
      projectIdsRef.current.set(directory, metadata.id);
      resetProjectEditorState();
      setProjectDirectory(directory);
      setProjectDirectories((current) => {
        const next = [
          ...current.filter((item) => item !== directory),
          directory,
        ];
        void saveProjectDirectoryHandles(next);
        return next;
      });
      setProjectDirectoryName(metadata.name || "导入项目");
      void saveProjectDirectoryHandle(directory);
      const restoredAssets = applyProjectShotRecords(loaded);
      await hydrateProjectReferenceAssets(
        directory,
        restoredAssets,
        comfyUrl,
      );
      setGenerationStatus(`项目已导入：${metadata.name || "未命名项目"}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setGenerationStatus(
        error instanceof Error ? error.message : "导入项目失败",
      );
    }
  }
  async function refreshProjectTree() {
    if (!projectDirectory) {
      setGenerationStatus("请先新建或导入项目");
      return;
    }
    const directory = projectDirectory;
    const epoch = ++projectTreeEpochRef.current;
    const assets: ProjectTreeAsset[] = [];
    for (const type of [
      "character",
      "scene",
      "wardrobe",
      "prop",
      "video",
      "audio",
      "custom",
    ] as const) {
      try {
        const folderName =
          type === "character"
            ? "角色"
            : type === "scene"
            ? "场景"
            : type === "wardrobe"
              ? "服装"
              : type === "prop"
                ? "道具"
                : type === "video"
                  ? "视频"
                : type === "audio"
                  ? "音频"
                  : "自定义";
        const folder = await getProjectAssetFolder(
          directory,
          folderName,
        );
        for await (const [name, entry] of folder.entries()) {
          if (entry.kind !== "file") continue;
          assets.push({
            name,
            type,
            thumbnail: await readAssetFileThumbnail(entry),
          });
        }
      } catch {
        /* Optional asset folders are created on demand. */
      }
    }
    if (epoch !== projectTreeEpochRef.current || projectDirectory !== directory) return;
    setProjectAssets(assets);
    let outputFiles: string[] | null = null;
    try {
      const output = await directory.getDirectoryHandle("输出");
      outputFiles = [];
      for await (const [name] of output.entries()) outputFiles.push(name);
    } catch {
      /* Imported projects may not have an output folder yet. */
    }
    if (epoch !== projectTreeEpochRef.current || projectDirectory !== directory) return;
    setProjectOutputFiles(outputFiles);
  }
  function applyProjectShotRecords(records: ProjectShotRecord[]) {
    setShots(
      records.map((record) => ({
        id: record.id,
        title: record.title,
        state: record.state,
        output: record.output,
      })),
    );
    const settings = Object.fromEntries(
      records.map((record) => [
        record.id,
        {
          duration: `${record.generation.duration} 秒`,
          resolution: record.generation.resolution.replace(/\s*[x×]\s*/i, " × "),
          aspect: record.generation.aspect,
          fps: `${record.generation.fps} fps`,
          mode: record.generation.mode,
          model: record.generation.model,
          turbo: record.generation.turbo,
          seed: record.generation.seed,
          seedMode: record.generation.seedMode,
          keyframeMode:
            record.generation.mode === "I2VA"
              ? record.generation.keyframeMode
              : "first",
        },
      ]),
    );
    setShotSettings(settings);
    setShotVisualStyles(
      Object.fromEntries(
        records.map((record) => [record.id, record.visualStyle]),
      ),
    );
    setKeyframes(
      Object.fromEntries(
        records.flatMap((record) =>
          ([
            ["首帧", record.keyframes?.first],
            ["尾帧", record.keyframes?.last],
          ] as const)
            .flatMap(([label, frame]) => frame ? [[label, frame] as const] : [])
            .map(([label, frame]) => [
              `${record.id}-${label}`,
              {
                ...frame,
                url: frame.comfyName
                  ? referenceAssetUrl(
                      { comfyName: frame.comfyName },
                      comfyUrl,
                    )
                  : "",
              },
            ]),
        ),
      ),
    );
    const restoredPrompts: Record<string, string> = {};
    const restoredOptimizedPrompts: Record<string, string> = {};
    records.forEach((record) => {
      Object.entries(record.prompts).forEach(([mode, promptRecord]) => {
        const key = promptStoreKey(record.id, mode);
        restoredPrompts[key] = normalizePrompt(promptRecord.original);
        if (typeof promptRecord.optimized === "string" && promptRecord.optimized.trim())
          restoredOptimizedPrompts[key] = normalizePrompt(promptRecord.optimized);
      });
    });
    setShotPrompts(restoredPrompts);
    setOptimizedPrompts(restoredOptimizedPrompts);
    const restored: Record<string, PromptSubject[]> = {};
    const restoredReferenceAssets: Record<string, ReferenceAsset> = {};
    records.forEach((record) => {
      const shotReferences = restoreProjectShotReferences(
        record.references.subjects,
        comfyUrl,
      );
      restored[record.id] = shotReferences.subjects;
      Object.assign(restoredReferenceAssets, shotReferences.referenceAssets);
    });
    setPromptSubjects(restored);
    referenceAssetsRef.current = restoredReferenceAssets;
    setReferenceAssets(restoredReferenceAssets);
    return restoredReferenceAssets;
  }
  async function hydrateProjectReferenceAssets(
    project: FileSystemDirectoryHandle,
    assets: Record<string, ReferenceAsset>,
    comfyUrlValue: string,
  ) {
    const epoch = projectEpochRef.current;
    let restoredCount = 0;
    let missingCount = 0;
    for (const [assetKey, asset] of Object.entries(assets)) {
      if (projectEpochRef.current !== epoch) return;
      if (referenceAssetsRef.current[assetKey]?.sourcePath !== asset.sourcePath) continue;
      if (!asset.sourcePath) continue;
      if (await isReferenceAssetAvailable(asset, comfyUrlValue)) continue;
      let sourceFile: File;
      try {
        const resolvedSourceFile = await readProjectSourceFile(
          project,
          asset.sourcePath,
        );
        if (!resolvedSourceFile) {
          missingCount += 1;
          continue;
        }
        sourceFile = resolvedSourceFile;
      } catch {
        missingCount += 1;
        continue;
      }
      try {
        if (projectEpochRef.current !== epoch) return;
        if (referenceAssetsRef.current[assetKey]?.sourcePath !== asset.sourcePath) continue;
        const uploaded = await uploadReferenceFile(
          sourceFile,
          asset.kind,
          comfyUrlValue,
        );
        if (projectEpochRef.current !== epoch) return;
        if (referenceAssetsRef.current[assetKey]?.sourcePath !== asset.sourcePath) continue;
        const restored = {
          ...referenceAssetsRef.current[assetKey],
          ...uploaded,
          url: referenceAssetUrl(uploaded, comfyUrlValue),
        };
        updateReferenceAssets((current) =>
          current[assetKey]?.sourcePath === asset.sourcePath
            ? { ...current, [assetKey]: restored }
            : current,
        );
        restoredCount += 1;
      } catch {
        missingCount += 1;
      }
    }
    if (restoredCount || missingCount)
      setGenerationStatus(
        missingCount
          ? `已重新上传 ${restoredCount} 个引用，${missingCount} 个源文件无法恢复`
          : `已重新上传 ${restoredCount} 个项目引用`,
      );
  }
  async function selectProjectById(name: string) {
    const token = ++projectSwitchTokenRef.current;
    const handle = projectDirectories.find(
      (directory) => (projectIdsRef.current.get(directory) ?? directory.name) === name,
    );
    if (!handle) return;
    if (projectDirectory && (projectIdsRef.current.get(projectDirectory) ?? projectDirectory.name) === name) return;
    try {
      const loaded = await readProjectShots(handle);
      if (token !== projectSwitchTokenRef.current) return;
      const metadata = await readProjectMetadata(handle);
      if (token !== projectSwitchTokenRef.current) return;
      projectIdRef.current = metadata.id;
      projectIdsRef.current.set(handle, metadata.id);
      resetProjectEditorState();
      setProjectDirectory(handle);
      setProjectDirectoryName(metadata.name || handle.name);
      const restoredAssets = applyProjectShotRecords(loaded);
      await hydrateProjectReferenceAssets(handle, restoredAssets, comfyUrl);
      if (token !== projectSwitchTokenRef.current) return;
      setActiveShot(0);
      void saveProjectDirectoryHandle(handle).catch(() => undefined);
    } catch (error) {
      if (token !== projectSwitchTokenRef.current) return;
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "NotFound")
      ) {
        const next = projectDirectories.filter(
          (directory) => (projectIdsRef.current.get(directory) ?? directory.name) !== name,
        );
        setProjectDirectories(next);
        void saveProjectDirectoryHandles(next).catch(() => undefined);
        if (projectDirectory && (projectIdsRef.current.get(projectDirectory) ?? projectDirectory.name) === name) {
          resetProjectEditorState();
          setProjectDirectory(null);
          setProjectDirectoryName("未选择项目目录");
          setProjectAssets([]);
          setProjectOutputFiles(null);
          void clearProjectDirectoryHandle().catch(() => undefined);
        }
        setGenerationStatus(`项目“${name}”已在电脑上删除，已从列表移除`);
      } else {
        setGenerationStatus(
          error instanceof Error
            ? `无法切换到项目“${handle.name}”：${error.message}`
            : `项目“${handle.name}”的片段文件无法读取`,
        );
      }
      return;
    }
    if (token === projectSwitchTokenRef.current)
      setGenerationStatus(`已切换项目：${handle.name}`);
  }
  function assetFolderName(asset: ProjectTreeAsset) {
    return asset.type === "character"
      ? "角色"
      : asset.type === "scene"
      ? "场景"
      : asset.type === "wardrobe"
        ? "服装"
        : asset.type === "prop"
          ? "道具"
          : asset.type === "video"
            ? "视频"
            : asset.type === "audio"
              ? "音频"
              : "自定义";
  }
  function assetLabel(asset: ProjectTreeAsset) {
    return asset.type === "character"
      ? "角色"
      : asset.type === "scene"
      ? "场景"
      : asset.type === "wardrobe"
        ? "服装"
        : asset.type === "prop"
          ? "道具"
          : asset.type === "video"
            ? "视频"
            : asset.type === "audio"
              ? "音频"
              : "自定义资产";
  }
  function removeAssetReferences(asset: ProjectTreeAsset) {
    const assetPath = `资产/${assetFolderName(asset)}/${asset.name}`;
    const matchesAsset = (sourcePath?: string) =>
      sourcePath === assetPath || sourcePath?.startsWith(`${assetPath}/`);
    setReferenceAssets((current) => {
      const removedKeys = new Set(
        Object.entries(current)
          .filter(([, entry]) => matchesAsset(entry.sourcePath))
          .map(([key]) => key),
      );
      if (!removedKeys.size) return current;
      return Object.fromEntries(
        Object.entries(current).filter(([key]) => !removedKeys.has(key)),
      );
    });
    setPromptSubjects((current) =>
      Object.fromEntries(
        Object.entries(current).map(([shotId, subjects]) => [
          shotId,
          remapSubjectReferenceKeys(subjects, (key) =>
            matchesAsset(referenceAssets[key]?.sourcePath) ? null : key,
          )
            .filter(
              (subject) =>
                subject.assetKeys.length > 0 ||
                (subject.children ?? []).some((child) => child.assetKeys.length > 0),
            ),
        ]),
      ),
    );
  }
  async function removeProjectAsset(asset: ProjectTreeAsset) {
    if (!projectDirectory) return;
    const label = assetLabel(asset);
    try {
      const writable = projectDirectory as WritableDirectoryHandle;
      const currentPermission = writable.queryPermission
        ? await writable.queryPermission({ mode: "readwrite" })
        : "granted";
      const permission =
        currentPermission === "granted" || !writable.requestPermission
          ? currentPermission
          : await writable.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        window.alert(`没有${label}删除权限，请重新授权后再试`);
        return;
      }
      const folderName = assetFolderName(asset);
      const assetsRoot = await projectDirectory.getDirectoryHandle("资产");
      const folder = await assetsRoot.getDirectoryHandle(folderName);
      const writableFolder = folder as WritableDirectoryHandle;
      if (!writableFolder.removeEntry) {
        window.alert("当前浏览器不支持删除资产");
        return;
      }
      let removed = false;
      try {
        await writableFolder.removeEntry(asset.name, { recursive: true });
        removed = true;
      } catch (error) {
        // Some browsers reject { recursive: true } for files. Retry as a
        // regular entry removal before reporting the failure.
        if (error instanceof TypeError || error instanceof DOMException) {
          await writableFolder.removeEntry(asset.name);
          removed = true;
        } else {
          throw error;
        }
      }
      if (!removed) return;
      removeAssetReferences(asset);
      setProjectAssets((current) =>
        current.filter(
          (item) => !(item.type === asset.type && item.name === asset.name),
        ),
      );
      setGenerationStatus(`已删除${label}“${asset.name}”`);
      setAssetDeleteCandidate(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `删除${label}“${asset.name}”失败：${error.message}`
          : `删除${label}“${asset.name}”失败，请检查项目目录权限`;
      setGenerationStatus(message);
    }
  }
  function requestProjectAssetDeletion(asset: ProjectTreeAsset) {
    setAssetDeleteCandidate(asset);
  }
  function openEngineSettings() {
    setComfyUrlDraft(comfyUrl);
    setEngineSettingsOpen(true);
  }
  async function chooseModelDirectory() {
    const picker = (window as DirectoryPickerWindow).electronDirector?.pickModelDirectory;
    if (!picker) {
      setGenerationStatus("请在 MeristemForge 桌面程序中设置模型目录");
      return;
    }
    try {
      const result = await picker();
      if (!result) return;
      setModelDirectory(result.path);
      const state = await (window as DirectoryPickerWindow).electronDirector?.getComfyState?.();
      if (state?.url) {
        setComfyUrl(state.url);
        setComfyUrlDraft(state.url);
      }
      setGenerationStatus(`模型目录已更新：${result.path}`);
    } catch (error) {
      setGenerationStatus(`模型目录更新失败：${errorMessage(error)}`);
    }
  }
  async function saveEngineSettings() {
    const draft = comfyUrlDraft.trim();
    try {
      const parsed = new URL(draft);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("protocol");
      const normalized = parsed.toString().replace(/\/+$/, "");
      setComfyUrl(normalized);
      window.localStorage.setItem("comfyui-url", normalized);
      const agentPath = llmExecutablePath.trim();
      const api = (window as DirectoryPickerWindow).electronDirector;
      if (api?.setAgentExecutable) await api.setAgentExecutable(agentPath);
      else window.localStorage.setItem("llm-executable-path", agentPath);
      setEngineSettingsOpen(false);
      setGenerationStatus(`ComfyUI 地址已更新：${normalized}`);
    } catch {
      setGenerationStatus("请输入有效的 ComfyUI 地址");
    }
  }
  function renderEngineSettingsDialog() {
    if (!engineSettingsOpen) return null;
    return (
      <div
        className="fixed inset-0 z-[70] grid place-items-center bg-black/65 p-4"
        onMouseDown={() => setEngineSettingsOpen(false)}
      >
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">视频创作设置</h2>
            </div>
            <button
              type="button"
              onClick={() => setEngineSettingsOpen(false)}
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="关闭视频创作设置"
            >
              <X className="size-4" />
            </button>
          </div>
          <label htmlFor="comfyui-url" className="field-label mt-5">
            ComfyUI 地址
          </label>
          <input
            id="comfyui-url"
            value={comfyUrlDraft}
            onChange={(event) => setComfyUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveEngineSettings();
              }
              if (event.key === "Escape") setEngineSettingsOpen(false);
            }}
            placeholder="http://127.0.0.1:8188"
            className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 font-mono text-xs outline-none focus:border-primary/60"
            autoFocus
          />
          <div className="mt-5 border-t border-border pt-4">
            <span className="field-label">模型目录</span>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={modelDirectory || "正在读取..."}
                readOnly
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted/30 px-3 font-mono text-[11px] outline-none"
              />
              <Button type="button" variant="outline" onClick={() => void chooseModelDirectory()}>
                选择目录
              </Button>
            </div>
            <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
              默认位置：用户 AppData/MeristemForge/models。切换后会重启内置 ComfyUI。
            </p>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <span className="field-label">本地 Agent CLI</span>
            <div className="mt-3 space-y-3">
              <label className="block"><span className="field-label">Agent 路径</span><input value={llmExecutablePath} onChange={(event) => setLlmExecutablePath(event.target.value)} placeholder="codex 或可执行文件路径" className="mt-1 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 font-mono text-xs outline-none focus:border-primary/60" /></label>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEngineSettingsOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={saveEngineSettings}
              className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
            >
              保存设置
            </Button>
          </div>
        </div>
      </div>
    );
  }
  function requestProjectDeletion(id: string) {
    const project = visibleProjects.find((item) => item.id === id);
    setProjectDeleteCandidate({ id, name: project?.name ?? id });
  }
  async function removeProjectFromDirector(name: string) {
    const knownDirectories = [
      ...projectDirectories,
      ...(projectDirectory &&
      !projectDirectories.some(
        (directory) => directory.name === projectDirectory.name,
      )
        ? [projectDirectory]
        : []),
    ];
    const next = knownDirectories.filter((directory) =>
      (projectIdsRef.current.get(directory) ?? directory.name) !== name,
    );
    if (next.length === knownDirectories.length) return;
    setProjectDirectories(next);
    await saveProjectDirectoryHandles(next).catch(() => undefined);
    if ((projectDirectory && (projectIdsRef.current.get(projectDirectory) ?? projectDirectory.name) !== name)) {
      setProjectDeleteCandidate(null);
      setGenerationStatus(`项目“${name}”已从视频创作移除，磁盘文件未改动`);
      return;
    }
    const nextHandle = next[0];
    if (!nextHandle) {
      resetProjectEditorState();
      setProjectDirectory(null);
      setProjectDirectoryName("未选择项目目录");
      setProjectAssets([]);
      setProjectOutputFiles(null);
      await clearProjectDirectoryHandle().catch(() => undefined);
      setProjectDeleteCandidate(null);
      setGenerationStatus(`项目“${name}”已从视频创作移除，磁盘文件未改动`);
      return;
    }
    const nextMetadata = await readProjectMetadata(nextHandle);
    projectIdRef.current = nextMetadata.id;
    projectIdsRef.current.set(nextHandle, nextMetadata.id);
    setProjectDirectory(nextHandle);
    setProjectDirectoryName(nextMetadata.name || nextHandle.name);
    resetProjectEditorState();
    let switchFailed = false;
    try {
      const loaded = await readProjectShots(nextHandle);
      if (loaded) {
        const restoredAssets = applyProjectShotRecords(loaded);
        await hydrateProjectReferenceAssets(
          nextHandle,
          restoredAssets,
          comfyUrl,
        );
      }
      setActiveShot(0);
    } catch {
      switchFailed = true;
      setGenerationStatus(
        `项目“${name}”已移除，已切换到“${nextHandle.name}”，但片段暂时无法读取`,
      );
    }
    await saveProjectDirectoryHandle(nextHandle).catch(() => undefined);
    setProjectDeleteCandidate(null);
    if (!switchFailed)
      setGenerationStatus(
        `项目“${name}”已从视频创作移除，已切换到“${nextHandle.name}”，磁盘文件未改动`,
      );
  }
  async function deleteProjectById(name: string) {
    const knownDirectories = [
      ...projectDirectories,
      ...(projectDirectory &&
      !projectDirectories.some(
        (directory) => directory.name === projectDirectory.name,
      )
        ? [projectDirectory]
        : []),
    ];
    const handle = knownDirectories.find((directory) =>
      (projectIdsRef.current.get(directory) ?? directory.name) === name,
    );
    if (!handle) return;
    try {
      const writable = handle as WritableDirectoryHandle;
      if (!writable.removeEntry) {
        const message = "当前浏览器不支持删除项目目录内容";
        setGenerationStatus(message);
        window.alert(message);
        return;
      }
      const currentPermission = writable.queryPermission
        ? await writable.queryPermission({ mode: "readwrite" })
        : "granted";
      const permission =
        currentPermission === "granted" || !writable.requestPermission
          ? currentPermission
          : await writable.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") {
        const message = "没有项目目录删除权限，请重新授权后再试";
        setGenerationStatus(message);
        window.alert(message);
        return;
      }
      await enqueueProjectMutation(async () => {
        const ownedEntries = ["资产", "片段", "输出", "script.json"];
        for (const entryName of ownedEntries) {
          try {
            await writable.removeEntry(entryName, { recursive: true });
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "NotFoundError"))
              throw error;
          }
        }
      });
      const next = knownDirectories.filter((directory) =>
        (projectIdsRef.current.get(directory) ?? directory.name) !== name,
      );
      setProjectDirectories(next);
      void saveProjectDirectoryHandles(next);
      const deletingActive = projectDirectory &&
        (projectIdsRef.current.get(projectDirectory) ?? projectDirectory.name) === name;
      if (deletingActive) {
        const nextHandle = next[0];
        if (nextHandle) {
          resetProjectEditorState();
          const nextMetadata = await readProjectMetadata(nextHandle);
          projectIdRef.current = nextMetadata.id;
          projectIdsRef.current.set(nextHandle, nextMetadata.id);
          setProjectDirectory(nextHandle);
          setProjectDirectoryName(nextMetadata.name || nextHandle.name);
          try {
            const loaded = await readProjectShots(nextHandle);
            if (loaded) {
              const restoredAssets = applyProjectShotRecords(loaded);
              await hydrateProjectReferenceAssets(
                nextHandle,
                restoredAssets,
                comfyUrl,
              );
            }
            setActiveShot(0);
          } catch {
            setGenerationStatus(
              `已删除项目“${name}”，但下一个项目的片段暂时无法读取`,
            );
          }
          void saveProjectDirectoryHandle(nextHandle);
          setGenerationStatus(
            `已删除项目“${name}”，已切换到“${nextHandle.name}”`,
          );
        } else {
          resetProjectEditorState();
          setProjectDirectory(null);
          setProjectDirectoryName("未选择项目目录");
          setProjectAssets([]);
          setProjectOutputFiles(null);
          void clearProjectDirectoryHandle();
          setGenerationStatus(`已删除项目“${name}”`);
        }
      } else {
        setGenerationStatus(`已删除项目“${name}”`);
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `删除项目“${name}”失败：${error.message}`
          : `删除项目“${name}”失败，请检查项目目录权限`;
      setGenerationStatus(message);
      window.alert(message);
    }
  }
  function confirmProjectDeletion() {
    const name = projectDeleteCandidate?.id;
    setProjectDeleteCandidate(null);
    if (name) void deleteProjectById(name);
  }
  function renderAssetDeleteDialog() {
    if (!assetDeleteCandidate) return null;
    return (
      <div
        className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4"
        onMouseDown={() => setAssetDeleteCandidate(null)}
      >
        <div
          className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <h2 className="text-sm font-semibold">永久删除资产</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            确定永久删除“{assetDeleteCandidate.name}”及其源文件吗？相关镜头引用也会被解除。
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAssetDeleteCandidate(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void removeProjectAsset(assetDeleteCandidate)}
            >
              永久删除
            </Button>
          </div>
        </div>
      </div>
    );
  }
  function renderProjectDeleteDialog() {
    if (!projectDeleteCandidate) return null;
    return (
      <div
        className="fixed inset-0 z-[60] grid place-items-center bg-black/65 p-4"
        onMouseDown={() => setProjectDeleteCandidate(null)}
      >
        <div
          className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-300">
              <TrashIcon className="size-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                处理项目
              </h2>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {projectDeleteCandidate.name}
              </p>
            </div>
          </div>
          <p className="mt-4 text-[10px] leading-5 text-muted-foreground">
            请选择处理方式。移除项目不会修改磁盘文件；从磁盘删除会清空项目内容，此操作无法撤销。
          </p>
          <div className="mt-4 space-y-2">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void removeProjectFromDirector(projectDeleteCandidate.id)
              }
              className="h-auto w-full justify-start gap-2 px-3 py-2.5 text-left"
            >
              <FolderInput className="size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs font-medium">
                  仅从视频创作移除
                </span>
                <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground">
                  保留电脑上的项目文件，之后仍可通过导入项目重新打开。
                </span>
              </span>
            </Button>
            <Button
              type="button"
              onClick={confirmProjectDeletion}
              className="h-auto w-full justify-start gap-2 bg-red-500/90 px-3 py-2.5 text-left text-white hover:bg-red-500"
            >
              <TrashIcon className="size-4 shrink-0" />
              <span>
                <span className="block text-xs font-medium">从磁盘删除</span>
                <span className="mt-0.5 block text-[10px] font-normal text-red-100/80">
                  清空项目中的资产、片段和输出文件，项目文件夹本身会保留。
                </span>
              </span>
            </Button>
          </div>
          <div className="mt-5 flex justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setProjectDeleteCandidate(null)}
            >
              取消
            </Button>
          </div>
        </div>
      </div>
    );
  }
  function openAssetDialog() {
    setAssetType(null);
    setNewAssetName("");
    setNewAssetUsage("");
    setNewAssetDescription("");
    setNewAssetFile(null);
    setAssetDialog(true);
  }
  function selectAssetType(type: ProjectAssetType) {
    setAssetType(type);
    setNewAssetName("");
    setNewAssetUsage(assetUsageOptions[type][0] ?? "");
    setNewAssetDescription("");
    setNewAssetFile(null);
  }
  async function uploadProjectAsset(
    file: File,
    kind: ProjectAssetType,
    name: string,
    usage: string,
    description: string,
  ) {
    if (!projectDirectory) return;
    try {
      const requestedName = formatProjectAssetFileName(
        name,
        usage,
        description,
        file.name,
      );
      if (!requestedName) {
        setGenerationStatus("请填写名称和用途");
        return;
      }
      const folderName =
        kind === "character"
          ? "角色"
          : kind === "scene"
          ? "场景"
          : kind === "wardrobe"
            ? "服装"
            : kind === "prop"
              ? "道具"
              : kind === "video"
                ? "视频"
                : kind === "audio"
                  ? "音频"
                  : "自定义";
      const folder = await getProjectAssetFolder(projectDirectory, folderName, {
        create: true,
      });
      const targetName = await uniqueProjectAssetFileName(folder, requestedName);
      const target = await folder.getFileHandle(targetName, { create: true });
      const writable = await target.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
      setProjectAssets((current) =>
        current.some((asset) => asset.type === kind && asset.name === targetName)
          ? current.map((asset) =>
              asset.type === kind && asset.name === targetName
                ? {
                    ...asset,
                    thumbnail: file.type.startsWith("image/")
                      ? URL.createObjectURL(file)
                      : asset.thumbnail,
                  }
                : asset,
            )
          : [
              ...current,
              {
                name: targetName,
                type: kind,
                thumbnail: file.type.startsWith("image/")
                  ? URL.createObjectURL(file)
                  : undefined,
              },
            ],
      );
      setNewAssetFile(null);
      setNewAssetName("");
      setNewAssetUsage("");
      setNewAssetDescription("");
      setAssetDialog(false);
      setAssetType(null);
      setGenerationStatus(`${targetName} 已添加到资产/${folderName}`);
    } catch {
      setGenerationStatus("添加资产失败，请检查项目目录权限");
    }
  }
  function renderAssetDialog() {
    if (!assetDialog) return null;
    const options: Array<{
      type: ProjectAssetType;
      label: string;
      description: string;
      icon: typeof UserRound;
    }> = [
      {
        type: "character",
        label: "角色",
        description: "上传角色参考文件",
        icon: UserRound,
      },
      {
        type: "scene",
        label: "场景",
        description: "上传场景参考文件",
        icon: MapPinned,
      },
      {
        type: "wardrobe",
        label: "服装",
        description: "上传服装参考文件",
        icon: Shirt,
      },
      {
        type: "prop",
        label: "道具",
        description: "上传道具参考文件",
        icon: Package,
      },
      {
        type: "video",
        label: "视频",
        description: "上传视频参考文件",
        icon: Video,
      },
      {
        type: "audio",
        label: "音频",
        description: "上传音频参考文件",
        icon: AudioLines,
      },
      {
        type: "custom",
        label: "自定义资产",
        description: "创建任意类型的可复用资产",
        icon: Box,
      },
    ];
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
        onMouseDown={() => setAssetDialog(false)}
      >
        <div
          className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">添加资产</h2>
            <button
              type="button"
              onClick={() => setAssetDialog(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="关闭添加资产"
            >
              <X className="size-4" />
            </button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            选择分类后上传文件，文件会直接保存到当前项目的资产目录。
          </p>
          {!assetType ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {options.map(({ type, label, description, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => selectAssetType(type)}
                  className="flex min-h-20 items-start gap-3 rounded-lg border border-border bg-muted/15 p-3 text-left transition hover:border-primary/50 hover:bg-primary/5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-medium">
                      添加{label}
                    </span>
                    <span className="mt-1 block text-[9px] leading-4 text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              {assetType && (
                <>
                  <label htmlFor="new-asset-name" className="field-label">
                    名称
                  </label>
                  <input
                    id="new-asset-name"
                    value={newAssetName}
                    onChange={(event) => setNewAssetName(event.target.value)}
                    placeholder={
                      assetType === "character"
                        ? "男主"
                        : assetType === "scene"
                          ? "麦当劳"
                          : assetType === "wardrobe"
                            ? "女主"
                            : assetType === "prop"
                              ? "手机"
                              : assetType === "video"
                                ? "男主"
                                : assetType === "audio"
                                  ? "男主或麦当劳"
                                  : "汽车"
                    }
                    className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none focus:border-primary/60"
                  />
                  <label htmlFor="new-asset-usage" className="field-label mt-4 block">
                    用途
                  </label>
                  {assetUsageOptions[assetType].length ? (
                    <select
                      id="new-asset-usage"
                      value={newAssetUsage}
                      onChange={(event) => setNewAssetUsage(event.target.value)}
                      className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none focus:border-primary/60"
                    >
                      {assetUsageOptions[assetType].map((usage) => (
                        <option key={usage} value={usage}>
                          {usage}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="new-asset-usage"
                      value={newAssetUsage}
                      onChange={(event) => setNewAssetUsage(event.target.value)}
                      placeholder="例如：外观参考、结构参考"
                      className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none focus:border-primary/60"
                    />
                  )}
                  <label htmlFor="new-asset-description" className="field-label mt-4 block">
                    描述（可选）
                  </label>
                  <input
                    id="new-asset-description"
                    value={newAssetDescription}
                    onChange={(event) => setNewAssetDescription(event.target.value)}
                    placeholder={
                      assetType === "character"
                        ? "多视角"
                        : assetType === "scene"
                          ? "柜台区"
                          : assetType === "video"
                            ? "走向柜台"
                            : ""
                    }
                    className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none focus:border-primary/60"
                  />
                  <label htmlFor="new-asset-file" className="field-label mt-4 block">
                    选择文件
                  </label>
                  <input
                    id="new-asset-file"
                    type="file"
                    accept={
                      assetType === "character"
                        ? "image/*"
                        : assetType === "audio"
                        ? "audio/*"
                        : assetType === "video"
                          ? "video/*"
                          : assetType === "custom"
                            ? undefined
                            : "image/*"
                    }
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setNewAssetFile(file);
                    }}
                    className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
                  />
                  <div className="mt-5 flex justify-end">
                    <Button variant="ghost" onClick={() => setAssetType(null)}>
                      返回
                    </Button>
                    <Button
                      className="ml-2"
                      onClick={() => {
                        if (!newAssetFile) return;
                        void uploadProjectAsset(
                          newAssetFile,
                          assetType,
                          newAssetName,
                          newAssetUsage,
                          newAssetDescription,
                        );
                      }}
                      disabled={
                        !newAssetFile ||
                        !projectDirectory ||
                        !newAssetName.trim() ||
                        !newAssetUsage.trim()
                      }
                    >
                      上传到项目
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  async function writeProjectManifest(shotList = shots, nextShotNumber?: number) {
    if (!projectDirectory) return;
    let counter = nextShotNumber;
    if (counter === undefined) counter = await readNextShotNumber(projectDirectory, shotList);
    const file = await projectDirectory.getFileHandle("script.json", {
      create: true,
    });
    const writable = await file.createWritable();
    await writable.write(
      JSON.stringify(
        {
          project: { id: projectIdRef.current, name: projectDirectoryName, version: 2 },
          nextShotNumber: counter,
          clips: shotList.map((item) => ({
            id: item.id,
            title: item.title,
            path: `片段/${item.id}-${safeFileStem(item.title)}/clip.json`,
          })),
        },
        null,
        2,
      ),
    );
    await writable.close();
  }
  async function writeClipManifest(
    shot: {
      id: string;
      title: string;
      output?: string | null;
    },
    overrides: ClipManifestOverrides = {},
  ) {
    if (!projectDirectory) throw new Error("请先选择项目目录");
    const writableProjectDirectory = projectDirectory as WritableDirectoryHandle;
    const permission = writableProjectDirectory.queryPermission
      ? await writableProjectDirectory.queryPermission({ mode: "readwrite" })
      : "granted";
    if (permission !== "granted") {
      const requested = await writableProjectDirectory.requestPermission?.({
        mode: "readwrite",
      });
      if (requested !== "granted") {
        const message = "项目目录写入权限已失效，请重新选择项目目录";
        setGenerationStatus(message);
        throw new Error(message);
      }
    }
    const clips = await projectDirectory.getDirectoryHandle("片段", {
      create: true,
    });
    const clipDirectory = await clips.getDirectoryHandle(
      `${shot.id}-${safeFileStem(shot.title)}`,
      { create: true },
    );
    const file = await clipDirectory.getFileHandle("clip.json", {
      create: true,
    });
    const writable = await file.createWritable();
    const shotSubjects = promptSubjects[shot.id] ?? [];
    const assetsSnapshot = overrides.referenceAssets ?? referenceAssets;
    const keyframesSnapshot = overrides.keyframes ?? keyframes;
    const serializeReference = (
      assetKey: string,
      role: ReferenceRole,
    ): PersistedPromptReference | null => {
      const asset = assetsSnapshot[assetKey];
      if (!asset) return null;
      return {
        assetKey,
        role,
        name: asset.name,
        kind: asset.kind,
        ...(asset.comfyName ? { comfyName: asset.comfyName } : {}),
        ...(asset.comfySubfolder ? { comfySubfolder: asset.comfySubfolder } : {}),
        ...(asset.sourcePath ? { sourcePath: asset.sourcePath } : {}),
      };
    };
    const relationForRole = (role: ReferenceRole) =>
      role === "wardrobe"
        ? "worn_by"
        : role === "object"
          ? "held_by"
          : role === "environment"
            ? "located_in"
            : "associated_with";
    const subjects: PersistedPromptSubject[] = shotSubjects
      .filter((subject) => subject.name.trim())
      .flatMap((subject) => {
        const references = subject.assetKeys
          .map((assetKey) =>
            serializeReference(
              assetKey,
              subject.assetRoles?.[assetKey] ?? "composite",
            ),
          )
          .filter((reference): reference is PersistedPromptReference => Boolean(reference));
        const children = (subject.children ?? []).map((child) => {
          const childRole =
            child.assetKeys
              .map((assetKey) => child.assetRoles?.[assetKey])
              .find(Boolean) ?? "composite";
          return {
            subjectId: `subject-${shot.id}-${safeFileStem(child.name.trim())}`,
            name: child.name.trim(),
            relation: {
              type: relationForRole(childRole),
              parentSubjectId: `subject-${shot.id}-${safeFileStem(subject.name.trim())}`,
            },
            references: child.assetKeys
              .map((assetKey) =>
                serializeReference(
                  assetKey,
                  child.assetRoles?.[assetKey] ?? childRole,
                ),
              )
              .filter((reference): reference is PersistedPromptReference => Boolean(reference)),
          };
        });
        const parent = {
          subjectId: `subject-${shot.id}-${safeFileStem(subject.name.trim())}`,
          name: subject.name.trim(),
          references,
        };
        return [parent, ...children.map((child) => ({
          subjectId: child.subjectId,
          name: child.name,
          relation: child.relation,
          references: child.references,
        }))];
      });
    const usedAssetKeys = new Set(
      subjects.flatMap((subject) =>
        subject.references.map((reference) => reference.assetKey),
      ),
    );
    const unassignedPrefix = `${shot.id}-`;
    Object.entries(assetsSnapshot)
      .filter(([assetKey]) => assetKey.startsWith(unassignedPrefix) && !usedAssetKeys.has(assetKey))
      .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
      .forEach(([assetKey, asset]) => {
        const role: ReferenceRole =
          asset.kind === "video" ? "video" : asset.kind === "audio" ? "audio" : "composite";
        const serialized = serializeReference(assetKey, role);
        if (!serialized) return;
        const name =
          parseProjectAssetName(asset.name).name.trim() || originalFileStem(asset.name);
        const existing = subjects.find(
          (subject) => subject.name.trim().toLowerCase() === name.toLowerCase(),
        );
        if (existing) {
          existing.references.push(serialized);
          return;
        }
        subjects.push({
          subjectId: `subject-${shot.id}-${safeFileStem(name)}`,
          name,
          references: [serialized],
        });
      });
    const savedSettings = {
      ...shotSettingDefaults,
      ...shotSettings[shot.id],
    };
    const generationOverride = overrides.generation ?? {};
    const manifestMode = generationOverride.mode ?? savedSettings.mode;
    const subjectsById = new Map(
      subjects.map((subject) => [subject.subjectId, subject]),
    );
    const referencedSubjectIds = new Set(
      subjects
        .filter(
          (subject) =>
            Array.isArray(subject.references) && subject.references.length > 0,
        )
        .map((subject) => subject.subjectId),
    );
    subjects.forEach((subject) => {
      let parentSubjectId = subject.relation?.parentSubjectId;
      while (parentSubjectId && !referencedSubjectIds.has(parentSubjectId)) {
        referencedSubjectIds.add(parentSubjectId);
        parentSubjectId = subjectsById.get(parentSubjectId)?.relation
          ?.parentSubjectId;
      }
    });
    const referencedSubjects = subjects.filter((subject) =>
      referencedSubjectIds.has(subject.subjectId),
    );
    const promptModes = Object.fromEntries(
      (["T2VA", "I2VA", "R2VA"] as const).map((promptMode) => {
        const key = promptStoreKey(shot.id, promptMode);
        const original =
          promptMode === manifestMode && overrides.promptOriginal !== undefined
            ? overrides.promptOriginal
            : shotPrompts[key] ??
              (taskShot?.id === shot.id && activeMode === promptMode ? prompt : "");
        const optimized =
          promptMode === manifestMode && overrides.promptOptimized !== undefined
            ? overrides.promptOptimized.trim()
            : optimizedPrompts[key]?.trim();
        return [
          promptMode,
          {
            original,
            ...(optimized ? { optimized } : {}),
          },
        ];
      }),
    ) as ClipPrompts;
    const generationBase: ClipGenerationBase = {
      duration:
        generationOverride.duration ??
        (Number.parseFloat(savedSettings.duration) || 6),
      resolution: generationOverride.resolution ?? savedSettings.resolution,
      aspect: generationOverride.aspect ?? savedSettings.aspect,
      fps:
        generationOverride.fps ?? (Number.parseInt(savedSettings.fps, 10) || 24),
      model: "H3",
      turbo: generationOverride.turbo ?? savedSettings.turbo,
      seed: generationOverride.seed ?? savedSettings.seed,
      seedMode: generationOverride.seedMode ?? savedSettings.seedMode,
      ...(generationOverride.steps !== undefined
        ? { steps: generationOverride.steps }
        : shotTasks[shot.id]?.steps !== undefined
          ? { steps: shotTasks[shot.id].steps }
          : {}),
    };
    const generation: ClipGeneration =
      manifestMode === "I2VA"
        ? {
            ...generationBase,
            mode: "I2VA",
            keyframeMode:
              generationOverride.keyframeMode ?? savedSettings.keyframeMode,
          }
        : { ...generationBase, mode: manifestMode };
    const output = Object.prototype.hasOwnProperty.call(overrides, "output")
      ? overrides.output ?? null
      : shot.output ?? null;
    const visualStyle =
      overrides.visualStyle ??
      shotVisualStyles[shot.id] ??
      "natural_cinematic";
    const savedKeyframes = Object.fromEntries(
      ([
        ["first", keyframesSnapshot[`${shot.id}-首帧`]],
        ["last", keyframesSnapshot[`${shot.id}-尾帧`]],
      ] as const).filter(([, frame]) => frame?.comfyName || frame?.sourcePath)
        .map(([name, frame]) => [name, {
          name: frame!.name,
          ...(frame!.sourcePath ? { sourcePath: frame!.sourcePath } : {}),
          ...(frame!.comfyName ? { comfyName: frame!.comfyName } : {}),
        }]),
    ) as { first?: PersistedKeyframe; last?: PersistedKeyframe };
    await writable.write(
      JSON.stringify(
        {
          version: 2,
          id: shot.id,
          title: shot.title,
          generation,
          prompts: promptModes,
          references: {
            subjects: referencedSubjects,
          },
          visualStyle,
          ...(Object.keys(savedKeyframes).length ? { keyframes: savedKeyframes } : {}),
          output,
        },
        null,
        2,
      ),
    );
    await writable.close();
  }
  async function archiveShotVideo(
    shot: { id: string; title: string },
    videoUrl: string,
    fileName: string,
  ) {
    if (!projectDirectory || !videoUrl) return null;
    const response = await fetch(videoUrl);
    if (!response.ok)
      throw new Error(`读取生成视频失败（HTTP ${response.status}）`);
    const blob = await response.blob();
    const clips = await projectDirectory.getDirectoryHandle("片段", {
      create: true,
    });
    const clipDirectory = await clips.getDirectoryHandle(
      `${shot.id}-${safeFileStem(shot.title)}`,
      { create: true },
    );
    const targetName =
      fileName
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim()
        .replace(/[. ]+$/g, "") ||
      `shot-${shot.id}-${safeFileStem(shot.title)}.mp4`;
    const file = await clipDirectory.getFileHandle(targetName, {
      create: true,
    });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return await file.getFile();
  }
  async function loadArchivedShotVideo(shot: Shot) {
    if (!projectDirectory) return null;
    const fileName = shotFileNames[shot.id] ?? shot.output;
    if (!fileName) return null;
    try {
      const clips = await projectDirectory.getDirectoryHandle("片段");
      const directory = await clips.getDirectoryHandle(`${shot.id}-${safeFileStem(shot.title)}`);
      const file = await directory.getFileHandle(fileName);
      return URL.createObjectURL(await file.getFile());
    } catch {
      return null;
    }
  }
  async function saveVideoToDirectory(
    url: string,
    shotId: string,
    task: ShotTask,
    source?: string,
    sourceSubfolder?: string,
  ) {
    const epoch = projectEpochRef.current;
    if (!source) {
      if (activeShotIdRef.current === shotId)
        setGenerationStatus("已完成，但未找到 ComfyUI 输出文件");
      return;
    }
    try {
      const payload = JSON.stringify({
        shot_id: shotId,
        shot_title: task.title,
        source,
        source_subfolder: sourceSubfolder ?? "",
        comfy_url: comfyUrl,
      });
      let finalUrl = url;
      const sourceName = source.split(/[\\/]/).pop() ?? "";
      const sourceFileName = sourceName
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim()
        .replace(/[. ]+$/g, "");
      let finalName = sourceFileName || task.fileName;
      try {
        const response = await fetch("/api/output/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        const result = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          filename?: string;
          url?: string;
          error?: string;
        };
        if (!response.ok || !result.ok || !result.url)
          throw new Error(
            result.error ?? `整理输出文件失败（HTTP ${response.status}）`,
          );
        finalUrl = result.url;
        finalName = result.filename ?? task.fileName;
      } catch {
        // A remote ComfyUI output may not be available on the local filesystem.
        // The proxy URL can still be fetched and copied into the project clip.
      }
      if (epoch !== projectEpochRef.current) return;
      setShotFileNames((current) => ({ ...current, [shotId]: finalName }));
      setShotVideos((current) => ({ ...current, [shotId]: finalUrl }));
      let archivedToProject = false;
      let archiveFailed = false;
      let cleanupFailed = false;
      try {
        const targetShot = { id: shotId, title: task.title };
        const archivedFile = await archiveShotVideo(
          targetShot,
          finalUrl,
          finalName,
        );
        if (epoch !== projectEpochRef.current) return;
        if (archivedFile) {
          await writeClipManifest(targetShot, { output: finalName });
          if (epoch !== projectEpochRef.current) return;
          archivedToProject = true;
          finalUrl = URL.createObjectURL(archivedFile);
          setShotVideos((current) => ({ ...current, [shotId]: finalUrl }));
          if (activeShotIdRef.current === shotId) setVideoUrl(finalUrl);
          try {
            const cleanupResponse = await fetch("/api/output/cleanup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: finalName,
                subfolder: "director",
                comfy_url: comfyUrl,
              }),
            });
            cleanupFailed = !cleanupResponse.ok;
          } catch {
            cleanupFailed = true;
          }
        }
      } catch {
        if (epoch !== projectEpochRef.current) return;
        archiveFailed = true;
        setGenerationStatus("视频已生成，但归档到项目片段目录失败");
      }
      if (epoch !== projectEpochRef.current) return;
      const persisted = archivedToProject && !archiveFailed;
      setShotStages((current) => ({
        ...current,
        [shotId]: persisted ? "已完成" : "归档失败",
      }));
      setShots((items) =>
        items.map((item) =>
          item.id === shotId
            ? { ...item, state: persisted ? "已完成" : "归档失败", ...(persisted ? { output: finalName } : {}) }
            : item,
        ),
      );
      if (activeShotIdRef.current === shotId) {
        setVideoUrl(finalUrl);
        setGenerationStatus(
          persisted
            ? cleanupFailed
              ? "视频已归档，但 ComfyUI 临时文件清理失败"
              : "已完成，视频已复制到当前项目片段"
            : "生成完成，但归档到项目片段目录失败",
        );
      }
    } catch (error) {
      if (epoch !== projectEpochRef.current) return;
      setShotStages((current) => ({ ...current, [shotId]: "整理输出失败" }));
      if (activeShotIdRef.current === shotId)
        setGenerationStatus(
          error instanceof Error
            ? `已完成，但整理输出文件失败：${error.message}`
            : "已完成，但整理输出文件失败",
        );
    }
  }
  function referenceKey(shotId: string, kind: ReferenceKind, index: number) {
    return `${shotId}-${kind}-${index}`;
  }

  function nextReferenceIndex(
    shotId: string,
    kind: ReferenceKind,
  ) {
    const prefix = `${shotId}-${kind}-`;
    const indices = Object.keys(referenceAssets)
      .filter((key) => key.startsWith(prefix))
      .map((key) => Number(key.slice(prefix.length)))
      .filter((index) => Number.isInteger(index) && index >= 0);
    const used = new Set(indices);
    let next = 0;
    while (used.has(next)) next += 1;
    return next;
  }

  function remapSubjectReferenceKeys(
    subjects: PromptSubject[],
    remap: (assetKey: string) => string | null,
  ) {
    const remapSubject = (subject: PromptSubject): PromptSubject => {
      const assetKeys = subject.assetKeys
        .map((assetKey) => ({ oldKey: assetKey, newKey: remap(assetKey) }))
        .filter((entry): entry is { oldKey: string; newKey: string } => Boolean(entry.newKey));
      return {
        ...subject,
        assetKeys: assetKeys.map((entry) => entry.newKey),
        assetRoles: Object.fromEntries(
          assetKeys
            .map((entry) => [entry.newKey, subject.assetRoles?.[entry.oldKey]])
            .filter((entry): entry is [string, ReferenceRole] => Boolean(entry[1])),
        ),
        children: subject.children?.map(remapSubject),
      };
    };
    return subjects.map(remapSubject);
  }

  function invalidateReferenceUploads(shotId: string, kind: ReferenceKind) {
    const prefix = `${shotId}-${kind}-`;
    Object.keys(referenceUploadTokensRef.current)
      .filter((key) => key.startsWith(prefix))
      .forEach((key) => {
        referenceUploadTokensRef.current[key] =
          (referenceUploadTokensRef.current[key] ?? 0) + 1;
      });
  }

  function isClipReferenceSourcePath(sourcePath?: string) {
    return Boolean(sourcePath?.replaceAll("\\", "/").match(/^片段\/[^/]+\/引用\//));
  }
  async function deleteReferenceSourceFile(sourcePath?: string) {
    if (!projectDirectory || !isClipReferenceSourcePath(sourcePath) || !sourcePath) return;
    const parts = sourcePath.replaceAll("\\", "/").split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;
    try {
      let directory: FileSystemDirectoryHandle = projectDirectory;
      for (const part of parts) directory = await directory.getDirectoryHandle(part);
      const writable = directory as WritableDirectoryHandle;
      if (!writable.removeEntry) return;
      await writable.removeEntry(fileName);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) return;
    }
  }
  async function deleteKeyframeSourceFile(sourcePath?: string) {
    if (
      !projectDirectory ||
      !sourcePath ||
      !/^片段\/[^/]+\/关键帧\//.test(sourcePath.replaceAll("\\", "/"))
    )
      return;
    const parts = sourcePath.replaceAll("\\", "/").split("/").filter(Boolean);
    const fileName = parts.pop();
    if (!fileName) return;
    try {
      let directory: FileSystemDirectoryHandle = projectDirectory;
      for (const part of parts) directory = await directory.getDirectoryHandle(part);
      await (directory as WritableDirectoryHandle).removeEntry?.(fileName);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "NotFoundError")) return;
    }
  }
  async function saveReferenceSourceFile(
    shot: { id: string; title: string },
    file: File,
  ) {
    if (!projectDirectory) return undefined;
    const clips = await projectDirectory.getDirectoryHandle("片段", {
      create: true,
    });
    const clipDirectory = await clips.getDirectoryHandle(
      `${shot.id}-${safeFileStem(shot.title)}`,
      { create: true },
    );
    const referenceDirectory = await clipDirectory.getDirectoryHandle("引用", {
      create: true,
    });
    const extension = file.name.match(/\.[^.]+$/)?.[0] ?? "";
    const requestedName =
      file.name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() ||
      `reference${extension}`;
    const targetName = await uniqueProjectAssetFileName(
      referenceDirectory,
      requestedName,
    );
    const handle = await referenceDirectory.getFileHandle(targetName, {
      create: true,
    });
    const writable = await handle.createWritable();
    await writable.write(await file.arrayBuffer());
    await writable.close();
    return `片段/${shot.id}-${safeFileStem(shot.title)}/引用/${targetName}`;
  }
  async function saveKeyframeSourceFile(
    shot: { id: string; title: string },
    file: File,
    label: "首帧" | "尾帧",
  ) {
    if (!projectDirectory) throw new Error("请先选择项目目录");
    const clips = await projectDirectory.getDirectoryHandle("片段", { create: true });
    const clipDirectory = await clips.getDirectoryHandle(
      `${shot.id}-${safeFileStem(shot.title)}`,
      { create: true },
    );
    const frameDirectory = await clipDirectory.getDirectoryHandle("关键帧", { create: true });
    const extension = file.name.match(/\.[^.]+$/)?.[0] ?? ".png";
    const targetName = `${label}-${crypto.randomUUID()}${extension}`;
    const handle = await frameDirectory.getFileHandle(targetName, { create: true });
    try {
      const writable = await handle.createWritable();
      try {
        await writable.write(await file.arrayBuffer());
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await frameDirectory.removeEntry(targetName).catch(() => undefined);
      throw error;
    }
    return `片段/${shot.id}-${safeFileStem(shot.title)}/关键帧/${targetName}`;
  }
  function beginKeyframeUpload(key: string) {
    const epoch = projectEpochRef.current;
    const token = (keyframeUploadTokensRef.current[key] ?? 0) + 1;
    keyframeUploadTokensRef.current[key] = token;
    return {
      isCurrent: () =>
        epoch === projectEpochRef.current &&
        token === keyframeUploadTokensRef.current[key],
    };
  }
  async function uploadKeyframe(
    shot: { id: string; title: string },
    file: File,
    label: "首帧" | "尾帧",
    request = beginKeyframeUpload(`${shot.id}-${label}`),
  ) {
    const key = `${shot.id}-${label}`;
    let sourcePath: string | undefined;
    let previewUrl: string | undefined;
    let committed = false;
    try {
      if (!request.isCurrent()) return false;
      const uploaded = await uploadReferenceFile(file, "image", comfyUrl);
      if (!request.isCurrent()) return false;
      sourcePath = await saveKeyframeSourceFile(shot, file, label);
      if (!request.isCurrent()) return false;
      previewUrl = URL.createObjectURL(file);
      const previousFrame = keyframesRef.current[key];
      const frame = { name: file.name, url: previewUrl, sourcePath, ...uploaded };
      keyframesRef.current = { ...keyframesRef.current, [key]: frame };
      setKeyframes((current) => ({ ...current, [key]: frame }));
      committed = true;
      if (previousFrame?.sourcePath && previousFrame.sourcePath !== sourcePath)
        void deleteKeyframeSourceFile(previousFrame.sourcePath);
      if (previousFrame?.url.startsWith("blob:")) URL.revokeObjectURL(previousFrame.url);
      return true;
    } catch (error) {
      if (request.isCurrent())
        setGenerationStatus(error instanceof Error ? error.message : "关键帧上传失败");
      return false;
    } finally {
      if (!committed) {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        if (sourcePath) await deleteKeyframeSourceFile(sourcePath);
      }
    }
  }
  async function uploadReference(
    event: React.ChangeEvent<HTMLInputElement>,
    kind: ReferenceKind,
    index: number,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !taskShot) return;
    const projectEpoch = projectEpochRef.current;
    const key = referenceKey(taskShot.id, kind, index);
    const uploadToken = (referenceUploadTokensRef.current[key] ?? 0) + 1;
    referenceUploadTokensRef.current[key] = uploadToken;
    const previousAsset = referenceAssetsRef.current[key];
    let url: string | undefined;
    try {
      const uploaded = await uploadReferenceFile(file, kind, comfyUrl);
      let sourcePath: string | undefined;
      let backupFailed = false;
      try {
        sourcePath = await saveReferenceSourceFile(taskShot, file);
        } catch {
          backupFailed = true;
        }
      if (
        projectEpoch !== projectEpochRef.current ||
        referenceUploadTokensRef.current[key] !== uploadToken
      ) {
        if (sourcePath) void deleteReferenceSourceFile(sourcePath);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      url = objectUrl;
      if (
        sourcePath &&
        previousAsset?.sourcePath &&
        previousAsset.sourcePath !== sourcePath
      ) {
        void deleteReferenceSourceFile(previousAsset.sourcePath);
      }
      if (previousAsset?.url.startsWith("blob:") && previousAsset.url !== url) {
        URL.revokeObjectURL(previousAsset.url);
      }
      setReferenceAssets((current) => ({
        ...current,
        [key]: {
          name: file.name,
          url: objectUrl,
          ...uploaded,
          ...(sourcePath ? { sourcePath } : {}),
        },
      }));
      const role: ReferenceRole =
        kind === "video" ? "video" : kind === "audio" ? "audio" : "composite";
      setPromptSubjects((current) => {
        const subjects = current[taskShot.id] ?? [];
        const alreadyBound = subjects.some(
          (subject) =>
            subject.assetKeys.includes(key) ||
            (subject.children ?? []).some((child) => child.assetKeys.includes(key)),
        );
        if (alreadyBound) return current;
        const parsedName =
          parseProjectAssetName(file.name).name.trim() || originalFileStem(file.name);
        const nextSubjects = [...subjects];
        const existingIndex = nextSubjects.findIndex(
          (subject) =>
            subject.name.trim().toLowerCase() === parsedName.toLowerCase(),
        );
        if (existingIndex >= 0) {
          const existing = nextSubjects[existingIndex];
          nextSubjects[existingIndex] = {
            ...existing,
            assetKeys: [...new Set([...existing.assetKeys, key])],
            assetRoles: { ...existing.assetRoles, [key]: role },
          };
          return { ...current, [taskShot.id]: nextSubjects };
        }
        return {
          ...current,
          [taskShot.id]: [
            ...nextSubjects,
            {
              name: parsedName,
              assetKeys: [key],
              assetRoles: { [key]: role },
            },
          ],
        };
      });
      setGenerationStatus(
        backupFailed
          ? "已上传到 ComfyUI，但本地引用备份失败"
          : `已添加参考素材“${file.name}”`,
      );
    } catch (error) {
      if (
        projectEpoch !== projectEpochRef.current ||
        referenceUploadTokensRef.current[key] !== uploadToken
      ) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (url) URL.revokeObjectURL(url);
      setReferenceAssets((current) => {
        const next = { ...current };
        if (previousAsset) next[key] = previousAsset;
        else delete next[key];
        return next;
      });
      setGenerationStatus(
        error instanceof Error
          ? `参考素材上传失败：${error.message}`
          : "参考素材上传失败",
      );
    }
  }

  function removeReference(kind: ReferenceKind, index: number) {
    if (!taskShot) return;
    invalidateReferenceUploads(taskShot.id, kind);
    const key = referenceKey(taskShot.id, kind, index);
    referenceUploadTokensRef.current[key] =
      (referenceUploadTokensRef.current[key] ?? 0) + 1;
    const asset = referenceAssets[key];
    if (asset?.url.startsWith("blob:")) URL.revokeObjectURL(asset.url);
    void deleteReferenceSourceFile(asset?.sourcePath);
    setReferenceAssets((current) => {
      const next = { ...current };
      const prefix = `${taskShot.id}-${kind}-`;
      const remaining = Object.entries(current)
        .filter(([entryKey]) => entryKey.startsWith(prefix))
        .map(([entryKey, entryAsset]) => ({
          index: Number(entryKey.slice(prefix.length)),
          asset: entryAsset,
        }))
        .filter(
          (entry) => Number.isInteger(entry.index) && entry.index !== index,
        )
        .sort((left, right) => left.index - right.index);
      Object.keys(next)
        .filter((entryKey) => entryKey.startsWith(prefix))
        .forEach((entryKey) => {
          delete next[entryKey];
        });
      remaining.forEach(({ asset: entryAsset }, nextIndex) => {
        next[referenceKey(taskShot.id, kind, nextIndex)] = entryAsset;
      });
      return next;
    });
    setPromptSubjects((current) => {
      const subjects = current[taskShot.id];
      if (!subjects?.length) return current;
      const prefix = `${taskShot.id}-${kind}-`;
      const nextSubjects = remapSubjectReferenceKeys(subjects, (assetKey) => {
        if (!assetKey.startsWith(prefix)) return assetKey;
        const assetIndex = Number(assetKey.slice(prefix.length));
        if (!Number.isInteger(assetIndex) || assetIndex === index) return null;
        return assetIndex > index
          ? referenceKey(taskShot.id, kind, assetIndex - 1)
          : assetKey;
      });
      return { ...current, [taskShot.id]: nextSubjects };
    });
  }

  function moveReference(
    kind: ReferenceKind,
    fromIndex: number,
    toIndex: number,
  ) {
    if (!taskShot || fromIndex === toIndex) return;
    invalidateReferenceUploads(taskShot.id, kind);
    setReferenceAssets((current) => {
      const prefix = `${taskShot.id}-${kind}-`;
      const entries = Object.entries(current)
        .filter(([entryKey]) => entryKey.startsWith(prefix))
        .map(([entryKey, asset]) => ({
          index: Number(entryKey.slice(prefix.length)),
          asset,
        }))
        .filter((entry) => Number.isInteger(entry.index))
        .sort((left, right) => left.index - right.index);
      const fromPosition = entries.findIndex(
        (entry) => entry.index === fromIndex,
      );
      const toPosition = entries.findIndex((entry) => entry.index === toIndex);
      if (fromPosition < 0 || toPosition < 0) return current;
      const [moved] = entries.splice(fromPosition, 1);
      entries.splice(toPosition, 0, moved);
      const next = { ...current };
      Object.keys(next)
        .filter((entryKey) => entryKey.startsWith(prefix))
        .forEach((entryKey) => {
          delete next[entryKey];
        });
      entries.forEach(({ asset }, nextIndex) => {
        next[referenceKey(taskShot.id, kind, nextIndex)] = asset;
      });
      return next;
    });
    setPromptSubjects((current) => {
      const subjects = current[taskShot.id];
      if (!subjects?.length) return current;
      const prefix = `${taskShot.id}-${kind}-`;
      const remapIndex = (assetIndex: number) => {
        if (assetIndex === fromIndex) return toIndex;
        if (
          fromIndex < toIndex &&
          assetIndex > fromIndex &&
          assetIndex <= toIndex
        )
          return assetIndex - 1;
        if (
          fromIndex > toIndex &&
          assetIndex >= toIndex &&
          assetIndex < fromIndex
        )
          return assetIndex + 1;
        return assetIndex;
      };
      const nextSubjects = remapSubjectReferenceKeys(subjects, (assetKey) => {
        if (!assetKey.startsWith(prefix)) return assetKey;
        const assetIndex = Number(assetKey.slice(prefix.length));
        return Number.isInteger(assetIndex)
          ? referenceKey(taskShot.id, kind, remapIndex(assetIndex))
          : assetKey;
      });
      return { ...current, [taskShot.id]: nextSubjects };
    });
  }

  function referenceCount(kind: ReferenceKind, limit: number) {
    if (!taskShot) return 0;
    return Array.from(
      { length: limit },
      (_, index) =>
        referenceAssets[referenceKey(taskShot.id, kind, index)]?.comfyName,
    ).filter(Boolean).length;
  }

  function referenceComfyFile(asset: ReferenceAsset | undefined) {
    if (!asset?.comfyName) return undefined;
    const filename = asset.comfyName;
    return asset.comfySubfolder
      ? `${asset.comfySubfolder}/${filename}`
      : filename;
  }

  function referenceSlotCount(kind: ReferenceKind, limit: number) {
    if (!taskShot) return 0;
    const used = Array.from({ length: limit }, (_, index) =>
      Boolean(referenceAssets[referenceKey(taskShot.id, kind, index)]),
    );
    const usedCount = used.filter(Boolean).length;
    return Math.min(limit, Math.max(1, usedCount + 1));
  }

  function referenceTile(kind: ReferenceKind, index: number) {
    if (!taskShot) return null;
    const key = referenceKey(taskShot.id, kind, index);
    const asset = referenceAssets[key];
    const label =
      kind === "image"
        ? `图 ${index + 1}`
        : kind === "video"
          ? `视频 ${index + 1}`
          : `音频 ${index + 1}`;
    const accept =
      kind === "image" ? "image/*" : kind === "video" ? "video/*" : "audio/*";
    const accessibleLabel = asset
      ? `${label}：${asset.name}，点击替换`
      : `添加${label}`;
    const isDragging =
      draggingReference?.kind === kind && draggingReference.index === index;
    return (
      <label
        key={key}
        onPointerDown={(event) => {
          if (!asset) {
            event.preventDefault();
            setReferencePickerTarget({ kind, index });
            setAssetPickerView("actions");
            setAssetPickerCategory(null);
            setAssetSubjectPickerOpen(true);
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          setReferencePickerTarget({ kind, index });
          setAssetPickerView("actions");
          setAssetPickerCategory(null);
          setAssetSubjectPickerOpen(true);
        }}
        draggable={Boolean(asset)}
        onDragStart={(event) => {
          if (!asset) return;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", `${kind}:${index}`);
          setDraggingReference({ kind, index });
        }}
        onDragEnd={() => setDraggingReference(null)}
        onDragOver={(event) => {
          if (asset && draggingReference?.kind === kind) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          const payload = event.dataTransfer.getData("text/plain").split(":");
          const source =
            draggingReference ??
            (payload[0] && payload[1]
              ? { kind: payload[0] as ReferenceKind, index: Number(payload[1]) }
              : null);
          if (source && source.kind === kind)
            moveReference(kind, source.index, index);
          setDraggingReference(null);
        }}
        className={`reference-slot relative overflow-hidden ${asset ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-40" : ""}`}
        aria-label={accessibleLabel}
        title={asset ? `${accessibleLabel}，可拖动调整顺序` : accessibleLabel}
      >
        {asset && kind === "image" && (
          <img
            src={asset.url}
            alt={`${label}缩略图`}
            className="absolute inset-0 size-full bg-black/30 object-contain opacity-80"
          />
        )}
        {asset && kind === "video" && (
          <video
            src={asset.url}
            muted
            className="absolute inset-0 size-full bg-black/30 object-contain opacity-80"
          />
        )}
        {!asset && <Plus aria-hidden="true" />}
        {asset && (
          <span className="relative max-w-full truncate rounded bg-black/60 px-1.5 py-0.5">
            {asset.name}
          </span>
        )}
        {asset && (
          <button
            type="button"
            className="absolute right-0.5 top-0.5 z-20 grid size-4 place-items-center rounded-full bg-black/75 text-white/80 transition hover:bg-red-500 hover:text-white"
            aria-label={`删除${label}`}
            title={`删除${label}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              removeReference(kind, index);
            }}
          >
            <X className="size-3" />
          </button>
        )}
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(event) => void uploadReference(event, kind, index)}
        />
      </label>
    );
  }

  function referenceMentionOptions(): ReferenceMentionOption[] {
    if (!taskShot) return [];
    const labels: Record<ReferenceKind, string> = {
      image: "Picture",
      video: "Video",
      audio: "Audio",
    };
    return Object.entries(referenceAssets)
      .map(([key, asset]) => {
        const prefix = `${taskShot.id}-`;
        if (!key.startsWith(prefix)) return null;
        const match = key
          .slice(prefix.length)
          .match(/^(image|video|audio)-(\d+)$/);
        if (!match) return null;
        const kind = match[1] as ReferenceKind;
        const index = Number(match[2]);
        return {
          kind,
          index,
          token: `<${labels[kind]} ${index + 1}>`,
          name: asset.name,
          url: asset.url,
          assetKey: key,
        };
      })
      .filter((option): option is ReferenceMentionOption => option !== null)
      .sort(
        (left, right) =>
          left.kind.localeCompare(right.kind) || left.index - right.index,
      );
  }

  function updatePromptMention(value: string, caret: number | null) {
    if (caret === null) return;
    const atIndex = value.lastIndexOf("@", caret - 1);
    if (atIndex < 0) {
      setPromptMention(null);
      return;
    }
    const query = value.slice(atIndex + 1, caret);
    if (/[\s<>{}]/.test(query)) {
      setPromptMention(null);
      return;
    }
    setPromptMention((current) =>
      current && current.start === atIndex && current.query === query
        ? { ...current, end: caret }
        : { start: atIndex, end: caret, query, selected: 0 },
    );
    const textarea = promptRef.current;
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement("div");
    const marker = document.createElement("span");
    const textareaRect = textarea.getBoundingClientRect();
    mirror.style.position = "fixed";
    mirror.style.left = `${textareaRect.left - textarea.scrollLeft}px`;
    mirror.style.top = `${textareaRect.top - textarea.scrollTop}px`;
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.boxSizing = "border-box";
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.font = style.font;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.overflowWrap = "break-word";
    mirror.textContent = value.slice(0, caret) || "\u200b";
    marker.textContent = "\u200b";
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const popupWidth = 256;
    const popupHeight = Math.min(192, window.innerHeight - 16);
    const left =
      markerRect.left + popupWidth <= window.innerWidth - 8
        ? markerRect.left
        : Math.max(8, markerRect.right - popupWidth);
    const belowTop = markerRect.bottom + 4;
    const top = Math.max(
      8,
      Math.min(belowTop, window.innerHeight - popupHeight - 8),
    );
    setMentionPosition({ left, top });
    mirror.remove();
  }

  function insertReferenceMention(option: ReferenceMentionOption) {
    if (!promptMention || !taskShot) return;
    const asset = referenceAssets[option.assetKey];
    const parsedAsset = asset?.sourcePath
      ? parseProjectAssetName(asset.name)
      : null;
    const token = parsedAsset?.usage
      ? `${option.token} 是${parsedAsset.name}的${parsedAsset.usage}${
          parsedAsset.description ? `（${parsedAsset.description}）` : ""
        } `
      : `${option.token} `;
    const nextPrompt = `${prompt.slice(0, promptMention.start)}${token}${prompt.slice(promptMention.end)}`;
    const nextCaret = promptMention.start + token.length;
    setPrompt(nextPrompt);
    setShotPrompts((current) => ({
      ...current,
      [promptStoreKey(taskShot.id, activeMode)]: nextPrompt,
    }));
    setOptimizedPrompts((current) => {
      const next = { ...current };
      delete next[promptStoreKey(taskShot.id, activeMode)];
      return next;
    });
    setPromptMention(null);
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function optimizeH3Prompt() {
    if (!taskShot) {
      setGenerationStatus("请先选择一个镜头");
      return;
    }
    if (!prompt.trim()) {
      setGenerationStatus("请先输入提示词");
      return;
    }
    if (promptOptimizing[taskShot.id]) return;
    if (!llmExecutablePath.trim()) {
      const message = "请先在视频创作设置中配置本地 Agent 的可执行程序路径";
      setGenerationStatus(message);
      window.alert(message);
      setEngineSettingsOpen(true);
      return;
    }
    const epoch = projectEpochRef.current;
    const shotId = taskShot.id;
    const modeAtStart = activeMode;
    const promptKey = promptStoreKey(shotId, modeAtStart);
    const requestToken = (optimizedPromptRequestRef.current[promptKey] ?? 0) + 1;
    optimizedPromptRequestRef.current[promptKey] = requestToken;
    setPromptOptimizing((current) => ({ ...current, [taskShot.id]: true }));
    setPromptNotice({ type: "success", text: "正在使用本地 Agent CLI 优化提示词…" });
    try {
      const shotSubjects = [
        ...(promptSubjects[taskShot.id] ?? []),
        ...(promptSubjects[taskShot.id] ?? []).flatMap(
          (subject) => subject.children ?? [],
        ),
      ];
      const subjectByAssetKey = new Map<
        string,
        { name: string; role?: string }
      >();
      shotSubjects.forEach((subject) => {
        subject.assetKeys.forEach((assetKey) => {
          subjectByAssetKey.set(assetKey, {
            name: subject.name.trim(),
            role: subject.assetRoles?.[assetKey],
          });
        });
      });
      const kindOrder: Record<ReferenceKind, number> = {
        image: 0,
        video: 1,
        audio: 2,
      };
      const shotReferences = Object.entries(referenceAssets)
        .flatMap(([assetKey, asset]) => {
          const match = assetKey.match(/^(.*)-(image|video|audio)-(\d+)$/);
          if (!match || match[1] !== taskShot.id) return [];
          return [{
            assetKey,
            asset,
            kind: match[2] as ReferenceKind,
            index: Number(match[3]),
          }];
        })
        .sort(
          (left, right) =>
            kindOrder[left.kind] - kindOrder[right.kind] ||
            left.index - right.index,
        );
      const referenceMapping: H3ReferenceMapping[] = shotReferences.map(
        ({ assetKey, asset, kind, index }) => {
          const subject = subjectByAssetKey.get(assetKey);
          const parsedAsset = asset.sourcePath
            ? parseProjectAssetName(asset.name)
            : null;
          const label =
            kind === "image" ? "Picture" : kind === "video" ? "Video" : "Audio";
          return {
            picture: `<${label} ${index + 1}>`,
            subject: parsedAsset?.name || subject?.name || asset.name,
            role: subject?.role ?? "composite",
            assetName: asset.name,
            usage: parsedAsset?.usage,
            description: parsedAsset?.description,
          };
        },
      );
      const optimizationInput = {
        prompt,
        mode: modeAtStart,
        duration: Number.parseFloat(duration) || 6,
        referenceMapping,
        visualStyle: shotVisualStyles[shotId]
          ? visualStylePresets[shotVisualStyles[shotId]].prompt
          : undefined,
      };
      const api = (window as DirectoryPickerWindow).electronDirector;
      let optimizedPrompt: string;
      if (api?.runAgent) {
        optimizedPrompt = await api.runAgent(optimizationInput);
      } else {
        const response = await fetch("/api/optimize-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...optimizationInput, executablePath: llmExecutablePath.trim() }),
        });
        const result = (await response.json().catch(() => ({}))) as { prompt?: string; error?: string };
        if (!response.ok || typeof result.prompt !== "string" || !result.prompt.trim())
          throw new Error(result.error || "提示词优化失败");
        optimizedPrompt = result.prompt;
      }
      const fingerprint = JSON.stringify(optimizationInput);
      if (projectEpochRef.current !== epoch || taskShot?.id !== shotId || activeMode !== modeAtStart || optimizedPromptRequestRef.current[promptKey] !== requestToken)
        return;
      setOptimizedPrompts((current) => ({
        ...current,
        [promptKey]: optimizedPrompt,
      }));
      optimizedPromptFingerprintsRef.current[promptKey] = fingerprint;
      await writeClipManifest(taskShot, {
        generation: {
          mode: activeMode,
          duration: Number.parseFloat(duration) || 6,
          resolution: availableResolution,
          aspect,
          fps: Number.parseInt(fps, 10) || 24,
          model,
          turbo: turboMode,
        },
        promptOriginal: shotPrompts[promptStoreKey(taskShot.id, activeMode)] ?? prompt,
        promptOptimized: optimizedPrompt,
        visualStyle: shotVisualStyles[taskShot.id] ?? "natural_cinematic",
      });
      setPromptNotice({ type: "success", text: "提示词优化完成" });
    } catch (error) {
      setPromptNotice({ type: "error", text: error instanceof Error ? error.message : "提示词优化失败" });
    } finally {
      setPromptOptimizing((current) => {
        const next = { ...current };
        delete next[taskShot.id];
        return next;
      });
    }
  }

  async function captureFrameForNextShot() {
    const video = videoRef.current;
    const nextShot = shots[activeShot + 1];
    if (!videoUrl || !video || !nextShot) {
      setGenerationStatus(
        nextShot ? "视频尚未加载完成，无法截取当前帧" : "请先创建下一个镜头",
      );
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      setGenerationStatus("视频尚未加载完成，无法截取当前帧");
      return;
    }
    const request = beginKeyframeUpload(`${nextShot.id}-首帧`);
    try {
      video.pause();
      if (video.seeking) {
        const currentVideo = video;
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(finish, 600);
          function finish() {
            window.clearTimeout(timeout);
            currentVideo.removeEventListener("seeked", finish);
            resolve();
          }
          currentVideo.addEventListener("seeked", finish, { once: true });
        });
      }
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法创建画布");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("无法提取视频帧")),
          "image/png",
        ),
      );
      const sourceShotId = shots[activeShot].id;
      const fileName = `continuity-${sourceShotId}-to-${nextShot.id}-${Math.round(video.currentTime * 1000)}.png`;
      const committed = await uploadKeyframe(
        nextShot,
        new File([blob], fileName, { type: "image/png" }),
        "首帧",
        request,
      );
      if (!committed || !request.isCurrent()) return;
      setShotSettings((current) => ({
        ...current,
        [nextShot.id]: {
          ...(current[nextShot.id] ?? shotSettingDefaults),
          mode: "I2VA",
          keyframeMode: "first",
        },
      }));
      setGenerationStatus(`已将当前帧设为片段 ${nextShot.id} 首帧`);
    } catch {
      if (request.isCurrent()) {
        setGenerationStatus("提取或上传当前帧失败");
      }
    }
  }

  function resizeRail(event: React.PointerEvent) {
    const startX = event.clientX;
    const startWidth = railWidth;
    const move = (moveEvent: PointerEvent) =>
      setRailWidth(
        Math.max(150, Math.min(320, startWidth + moveEvent.clientX - startX)),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  function resizePanel(event: React.PointerEvent) {
    const startX = event.clientX;
    const startWidth = panelWidth;
    const move = (moveEvent: PointerEvent) =>
      setPanelWidth(
        Math.max(300, Math.min(520, startWidth - (moveEvent.clientX - startX))),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  function resizePromptPanel(event: React.PointerEvent) {
    const startY = event.clientY;
    const startHeight = promptPanelHeight;
    const move = (moveEvent: PointerEvent) => {
      const nextHeight = startHeight + startY - moveEvent.clientY;
      setPromptPanelHeight(Math.max(0, nextHeight));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }
  useEffect(() => {
    const clampPromptPanel = () => {
      const stage = previewStageRef.current?.getBoundingClientRect();
      const controls = previewControlsRef.current?.getBoundingClientRect();
      if (!stage || !controls) return;
      const maxHeight = Math.max(0, stage.bottom - controls.bottom);
      setPromptPanelHeight((current) => Math.min(current, maxHeight));
    };
    clampPromptPanel();
    window.addEventListener("resize", clampPromptPanel);
    return () => window.removeEventListener("resize", clampPromptPanel);
  }, []);

  useEffect(() => {
    const tasks = Object.entries(shotTasks);
    if (!tasks.length) return;
    let disposed = false;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      await Promise.all(
        tasks.map(async ([shotId, task]) => {
          try {
            const result = (await fetch(
              `/api/generate/status?id=${encodeURIComponent(task.promptId)}&comfy_url=${encodeURIComponent(comfyUrl)}`,
            ).then((response) => response.json())) as {
              status?: string;
              position?: number;
              url?: string;
              source?: string;
              source_subfolder?: string;
              error?: string;
            };
            if (disposed) return;
            if (result.status === "queued") {
              if (activeShotIdRef.current === shotId)
                setGenerationStatus(
                  `排队中${result.position ? ` · 前面 ${result.position - 1} 个任务` : ""}`,
                );
              return;
            }
            if (
              result.status === "running" &&
              (!shotStages[shotId] || shotStages[shotId] === "排队中")
            ) {
              setShotStages((current) => ({
                ...current,
                [shotId]: "正在采样",
              }));
              if (activeShotIdRef.current === shotId)
                setGenerationStatus("正在采样");
            }
            if (result.status === "completed") {
              if (finalizingPromptIdsRef.current.has(task.promptId)) return;
              finalizingPromptIdsRef.current.add(task.promptId);
              if (!result.url) {
                finalizingPromptIdsRef.current.delete(task.promptId);
                setShotTasks((current) => {
                  const next = { ...current };
                  delete next[shotId];
                  return next;
                });
                setShotStages((current) => ({ ...current, [shotId]: "生成失败" }));
                setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: "失败" } : item));
                if (activeShotIdRef.current === shotId)
                  setGenerationStatus("生成完成，但 ComfyUI 未返回视频地址");
                return;
              }
              setGenerationDurations((current) => ({
                ...current,
                [shotId]: Date.now() - task.startedAt,
              }));
              setShotTasks((current) => {
                const next = { ...current };
                delete next[shotId];
                return next;
              });
              setShotStages((current) => ({
                ...current,
                [shotId]: "整理输出",
              }));
              // ComfyUI 已完成，但项目文件尚未归档；最终状态在
              // saveVideoToDirectory 成功写入 clip.json 后再置为“已完成”。
              setShots((items) =>
                items.map((item) =>
                  item.id === shotId ? { ...item, state: "整理输出" } : item,
                ),
              );
              if (activeShotIdRef.current === shotId)
                setGenerationStatus("整理输出并写入镜头脚本");
              void saveVideoToDirectory(
                result.url,
                shotId,
                task,
                result.source,
                result.source_subfolder,
              ).finally(() => finalizingPromptIdsRef.current.delete(task.promptId));
            }
            if (result.status === "error") {
              setShotTasks((current) => {
                const next = { ...current };
                delete next[shotId];
                return next;
              });
              setShotStages((current) => ({
                ...current,
                [shotId]: "生成失败",
              }));
              setShots((items) =>
                items.map((item) =>
                  item.id === shotId ? { ...item, state: "失败" } : item,
                ),
              );
              if (activeShotIdRef.current === shotId)
                setGenerationStatus(result.error ?? "生成失败");
            }
          } catch {
            // Keep polling while ComfyUI is temporarily unavailable.
          }
        }),
      );
      polling = false;
    };
    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 1200);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [shotTasks, shotStages, comfyUrl]);

  function toggleGeneration() {
    if (!taskShot) return;
    const projectEpoch = projectEpochRef.current;
    const shotId = taskShot.id;
    if (activeTask) {
      void fetch("/api/generate/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_id: activeTask.promptId,
          comfy_url: comfyUrl,
        }),
      });
      setShotTasks((current) => {
        const next = { ...current };
        delete next[shotId];
        return next;
      });
      setShots((items) =>
        items.map((item) =>
          item.id === shotId ? { ...item, state: "已停止" } : item,
        ),
      );
      setShotStages((current) => ({ ...current, [shotId]: "已停止" }));
      setGenerationStatus("已停止");
      return;
    }
    if (activeSubmitting) return;
    const firstFrame = keyframes[`${shotId}-首帧`];
    const firstFrameName = firstFrame?.comfyName;
    const submittedSeed =
      seedMode === "random"
        ? String(
            Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1000000000000000)) + 1000000000000000,
          )
        : seed.trim() ||
          String(
            Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1000000000000000)) + 1000000000000000,
          );
    setShotSettings((current) => ({
      ...current,
      [shotId]: {
        ...shotSettingDefaults,
        ...current[shotId],
        seed: submittedSeed,
        seedMode,
        keyframeMode,
      },
    }));
    const startedAt = Date.now();
    const fileName = `shot-${shotId}-${safeFileStem(taskShot.title)}.mp4`;
    const references =
      activeMode === "R2VA"
        ? {
            images: Array.from({ length: profile.images }, (_, index) =>
              referenceComfyFile(
                referenceAssets[referenceKey(shotId, "image", index)],
              ),
            ).filter((name): name is string => Boolean(name)),
            videos: Array.from({ length: profile.videos }, (_, index) =>
              referenceComfyFile(
                referenceAssets[referenceKey(shotId, "video", index)],
              ),
            ).filter((name): name is string => Boolean(name)),
            audios: Array.from({ length: profile.audios }, (_, index) =>
              referenceComfyFile(
                referenceAssets[referenceKey(shotId, "audio", index)],
              ),
            ).filter((name): name is string => Boolean(name)),
          }
        : undefined;
    const pendingReference =
      activeMode === "R2VA"
        ? Object.entries(referenceAssets).find(
            ([key, asset]) => key.startsWith(`${shotId}-`) && !asset.comfyName,
          )
        : undefined;
    if (pendingReference) {
      setGenerationStatus(
        `参考素材“${pendingReference[1].name}”尚未上传完成，请重新上传后再生成`,
      );
      setShotStages((current) => ({ ...current, [shotId]: "等待素材上传" }));
      return;
    }
    if (activeMode === "I2VA") {
      const needsFirst =
        keyframeMode === "first" || keyframeMode === "first_last";
      const needsLast =
        keyframeMode === "last" || keyframeMode === "first_last";
      if (needsFirst && (!firstFrame || !firstFrame.comfyName)) {
        setGenerationStatus(
          `首帧“${firstFrame?.name ?? "未选择"}”尚未上传完成，请重新上传后再生成`,
        );
        setShotStages((current) => ({ ...current, [shotId]: "等待素材上传" }));
        return;
      }
      const lastFrame = keyframes[`${shotId}-尾帧`];
      if (needsLast && (!lastFrame || !lastFrame.comfyName)) {
        setGenerationStatus(
          `尾帧“${lastFrame?.name ?? "未选择"}”尚未上传完成，请重新上传后再生成`,
        );
        setShotStages((current) => ({ ...current, [shotId]: "等待素材上传" }));
        return;
      }
    }
    const generationPrompt =
      optimizedPrompts[promptStoreKey(shotId, activeMode)] ??
      (shotId === taskShot?.id && prompt.trim()
        ? prompt.trim()
        : (shotPrompts[promptStoreKey(shotId, activeMode)] ?? prompt));
    setVideoUrl(null);
    setSubmittingShots((current) => ({ ...current, [shotId]: true }));
    void fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shot_id: shotId,
        shot_title: taskShot.title,
        prompt: generationPrompt,
        seed: submittedSeed,
        duration,
        resolution: availableResolution,
        aspect,
        fps,
        turbo: turboMode,
        mode: activeMode,
        keyframe_mode: activeMode === "I2VA" ? keyframeMode : undefined,
        image: firstFrameName,
        last_image:
          activeMode === "I2VA"
            ? keyframes[`${shotId}-尾帧`]?.comfyName
            : undefined,
        client_id: clientId,
        comfy_url: comfyUrl,
        ...(references
          ? {
              images: references.images,
              videos: references.videos,
              audios: references.audios,
            }
          : {}),
      }),
    })
      .then(async (response) => {
        const result = (await response.json().catch(() => ({}))) as {
          prompt_id?: unknown;
          error?: unknown;
          details?: unknown;
        };
        if (!response.ok) {
          const detail =
            typeof result.error === "string"
              ? result.error
              : typeof result.details === "string"
                ? result.details
                : `HTTP ${response.status}`;
          throw new Error(detail);
        }
        if (typeof result.prompt_id !== "string" || !result.prompt_id)
          throw new Error("ComfyUI 未返回任务 ID");
        if (projectEpoch !== projectEpochRef.current) return;
        setSubmittingShots((current) => {
          const next = { ...current };
          delete next[shotId];
          return next;
        });
        setShotTasks((current) => ({
          ...current,
          [shotId]: {
            promptId: result.prompt_id as string,
            seed: submittedSeed,
            seedMode,
            title: taskShot.title,
            fileName,
            steps: turboMode ? 4 : 20,
            startedAt,
          },
        }));
        if (activeShotIdRef.current === shotId)
          setGenerationStatus("已提交，等待 ComfyUI 排队");
      })
      .catch((error: unknown) => {
        if (projectEpoch !== projectEpochRef.current) return;
        const message = error instanceof Error ? error.message : "未知提交错误";
        setSubmittingShots((current) => {
          const next = { ...current };
          delete next[shotId];
          return next;
        });
        setShots((items) =>
          items.map((item) =>
            item.id === shotId ? { ...item, state: "失败" } : item,
          ),
        );
        setShotStages((current) => ({ ...current, [shotId]: "提交失败" }));
        if (activeShotIdRef.current === shotId)
          setGenerationStatus(`提交失败：${message}`);
      });
    setGenerationStatus("正在提交");
    setShots((items) =>
      items.map((item) =>
        item.id === shotId ? { ...item, state: "生成中" } : item,
      ),
    );
    setShotStages((current) => ({ ...current, [shotId]: "排队中" }));
    if (seedMode === "random") setSeed(submittedSeed);
  }

  const pickerAssets = projectAssets.filter((asset) => {
    if (!referencePickerTarget)
      return ["character", "scene", "wardrobe", "prop"].includes(asset.type);
    if (referencePickerTarget.kind === "image")
      return !["audio", "video"].includes(asset.type);
    return asset.type === referencePickerTarget.kind;
  });
  const hasPickerAssets = pickerAssets.length > 0;
  const allPickerCategoryOptions: Array<{
    type: ProjectAssetType;
    label: string;
    icon: typeof UserRound;
    count: number;
  }> = [
    {
      type: "character",
      label: "角色",
      icon: UserRound,
      count: pickerAssets.filter((asset) => asset.type === "character").length,
    },
    {
      type: "scene",
      label: "场景",
      icon: MapPinned,
      count: pickerAssets.filter((asset) => asset.type === "scene").length,
    },
    {
      type: "wardrobe",
      label: "服装",
      icon: Shirt,
      count: pickerAssets.filter((asset) => asset.type === "wardrobe").length,
    },
    {
      type: "prop",
      label: "道具",
      icon: Package,
      count: pickerAssets.filter((asset) => asset.type === "prop").length,
    },
    {
      type: "video",
      label: "视频",
      icon: Video,
      count: pickerAssets.filter((asset) => asset.type === "video").length,
    },
    {
      type: "audio",
      label: "音频",
      icon: AudioLines,
      count: pickerAssets.filter((asset) => asset.type === "audio").length,
    },
    {
      type: "custom",
      label: "自定义",
      icon: Box,
      count: pickerAssets.filter((asset) => asset.type === "custom").length,
    },
  ];
  const pickerCategoryOptions = allPickerCategoryOptions.filter(
    (category) => category.count > 0,
  );
  const selectedPickerAssets = pickerAssets.filter(
    (asset) => asset.type === assetPickerCategory,
  );
  function closeAssetPicker() {
    setAssetSubjectPickerOpen(false);
    setReferencePickerTarget(null);
    setAssetPickerView("actions");
    setAssetPickerCategory(null);
  }
  function workspaceCardStyle(index: number) {
    const relative = (index - activeWorkspaceCard + 3) % 3;
    const position = relative === 2 ? -1 : relative;
    const isActive = position === 0;
    return {
      transform: `translateX(${position * 190}px) translateZ(${isActive ? 72 : -24}px) rotateY(${position * -30}deg) scale(${isActive ? 1 : 0.84})`,
      opacity: isActive ? 1 : 0.8,
      zIndex: isActive ? 3 : 2,
      pointerEvents: "auto" as const,
      transformOrigin: "center center",
      transformStyle: "preserve-3d" as const,
      transition: "transform 900ms cubic-bezier(.22,.8,.24,1), opacity 700ms ease",
    };
  }
  function selectWorkspaceCard(index: number) {
    if (index !== activeWorkspaceCard) {
      setActiveWorkspaceCard(index);
      return;
    }
    if (index === 0) setWorkspaceMode("video");
  }

  useEffect(() => {
    if (workspaceMode !== "launcher") return;
    const timer = window.setInterval(() => {
      setActiveWorkspaceCard((current) => (current + 1) % 3);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [workspaceMode]);

  if (workspaceMode === "launcher") {
    return (
      <main className="min-h-screen overflow-hidden bg-[#090a0d] text-foreground">
        <WindowChrome />

        <section className="relative mx-auto flex min-h-[calc(100vh-2.75rem)] max-w-6xl flex-col justify-center px-6 py-12 pb-20">
          <div className="mb-8 max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#59c6c5]">
              Create workspace
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">
              选择你的创作方式
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              视频、图片和音乐各自拥有独立的创作流程，选择一个方向开始。
            </p>
          </div>

          <div className="mx-auto h-[330px] w-[min(78vw,300px)] max-w-full [perspective:1200px]">
            <div
              className="relative h-full w-full [transform-style:preserve-3d]"
            >
            <button
              type="button"
              onClick={() => selectWorkspaceCard(0)}
              style={workspaceCardStyle(0)}
              className="group absolute inset-0 h-full w-full overflow-hidden rounded-3xl border border-[#f4bd50]/40 bg-gradient-to-br from-[#2b2416] via-[#171719] to-[#0c0d11] p-6 text-left shadow-2xl shadow-black/20 hover:-translate-y-1 hover:border-[#f4bd50] hover:shadow-[#f4bd50]/10"
            >
              <div className="absolute -right-16 -top-20 size-64 rounded-full bg-[#f4bd50]/12 blur-3xl transition group-hover:bg-[#f4bd50]/20" />
              <div className="relative flex h-full flex-col">
                <div className="grid size-14 place-items-center rounded-2xl border border-[#f4bd50]/35 bg-[#f4bd50]/12 text-[#f4bd50]">
                  <Film className="size-7" />
                </div>
                <div className="mt-auto">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#f4bd50]">
                    Video
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-100">
                    视频创作
                  </h2>
                  <p className="mt-3 max-w-xs text-xs leading-5 text-zinc-400">
                    创建项目、编排镜头并生成视频。
                  </p>
                  <div className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#f4bd50] px-4 py-2 text-xs font-semibold text-[#17120a] transition group-hover:bg-[#ffd070]">
                    进入工作台
                    <ArrowLeft className="size-3 rotate-180" />
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectWorkspaceCard(1)}
              style={workspaceCardStyle(1)}
              className="absolute inset-0 h-full w-full overflow-hidden rounded-3xl border border-[#59c6c5]/20 bg-gradient-to-br from-[#15333a] via-[#122630] to-[#11151e] p-6 text-left opacity-90"
            >
              <div className="absolute -right-16 -top-16 size-64 rounded-full bg-[#59c6c5]/18 blur-3xl" />
              <div className="relative flex h-full flex-col">
                <div className="grid size-14 place-items-center rounded-2xl border border-[#59c6c5]/35 bg-[#59c6c5]/12 text-[#8ee4dc]">
                  <ImagePlus className="size-7" />
                </div>
                <div className="mt-auto">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8ee4dc]">Image</p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-100">图片创作</h2>
                  <p className="mt-3 max-w-xs text-xs leading-5 text-zinc-400">图片工作台正在规划中，后续会在这里加入。</p>
                  <div className="mt-7 inline-flex rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-medium text-zinc-400">即将推出</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => selectWorkspaceCard(2)}
              style={workspaceCardStyle(2)}
              className="absolute inset-0 h-full w-full overflow-hidden rounded-3xl border border-[#b344d8]/20 bg-gradient-to-br from-[#2d1839] via-[#20182f] to-[#11131d] p-6 text-left opacity-90"
            >
              <div className="absolute -right-16 -top-16 size-64 rounded-full bg-[#b344d8]/18 blur-3xl" />
              <div className="relative flex h-full flex-col">
                <div className="grid size-14 place-items-center rounded-2xl border border-[#b344d8]/35 bg-[#b344d8]/12 text-[#d79bea]">
                  <AudioLines className="size-7" />
                </div>
                <div className="mt-auto">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d79bea]">Music</p>
                  <h2 className="mt-2 text-2xl font-semibold text-zinc-100">音乐创作</h2>
                  <p className="mt-3 max-w-xs text-xs leading-5 text-zinc-400">音乐工作台正在规划中，后续会在这里加入。</p>
                  <div className="mt-7 inline-flex rounded-full border border-white/12 bg-white/6 px-4 py-2 text-xs font-medium text-zinc-400">即将推出</div>
                </div>
              </div>
            </button>
            </div>
          </div>
          <footer className="absolute bottom-5 left-6 right-6 flex items-center justify-center border-t border-white/6 pt-4 text-[10px] tracking-wide text-zinc-600">
            © 2026 MeristemForge
          </footer>
        </section>
      </main>
    );
  }

  if (!taskShot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <WindowChrome />
        {renderAssetDialog()}
        {renderAssetDeleteDialog()}
        {renderProjectDeleteDialog()}
        {renderEngineSettingsDialog()}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_rgba(244,189,80,0.16)]">
              <Clapperboard className="size-4" />
            </div>
            <p className="text-sm font-semibold tracking-tight">视频创作</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setWorkspaceMode("launcher")}
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-zinc-400 hover:bg-white/8 hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              工作台
            </Button>
            <div
              className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${comfyConnected === true ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400" : comfyConnected === false ? "border-red-500/20 bg-red-500/8 text-red-400" : "border-white/10 bg-white/5 text-zinc-400"}`}
            >
              <span
                className={`size-1.5 rounded-full ${comfyConnected === true ? "bg-emerald-400" : comfyConnected === false ? "bg-red-400" : "bg-zinc-500"}`}
              />
              {comfyConnected === true
                ? "已连接引擎"
                : comfyConnected === false
                  ? "引擎未连接"
                  : "正在检测引擎"}
            </div>
            <Button
              type="button"
              onClick={openEngineSettings}
              variant="ghost"
              size="icon-sm"
              className="size-8 text-zinc-400 hover:bg-white/8 hover:text-foreground"
              aria-label="ComfyUI 连接设置"
              title="ComfyUI 连接设置"
            >
              <Settings className="size-4" />
            </Button>
          </div>
        </header>
        <div
          className="workspace-grid relative"
          style={{
            gridTemplateColumns: `${railWidth}px minmax(420px, 1fr) ${panelWidth}px`,
          }}
        >
          <aside className="shot-rail overflow-y-auto border-r border-border bg-[#090a0d]">
            <div className="flex items-center justify-between p-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                项目管理
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  onClick={chooseProjectDirectory}
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label="新建项目"
                  title="新建项目"
                >
                  <Plus className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  onClick={() => void importProjectDirectory()}
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  aria-label="导入项目"
                  title="导入项目"
                >
                  <FolderInput className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="p-3">
              <ProjectTree
                projects={visibleProjects}
                activeProjectId={projectIdRef.current}
                onSelectProject={selectProjectById}
                onRemoveProject={requestProjectDeletion}
                onDeleteAsset={requestProjectAssetDeletion}
                assets={projectAssets}
                outputFiles={projectOutputFiles}
                shots={[]}
                activeShot={0}
                onSelectShot={() => undefined}
                onAddShot={addShot}
                onAddAsset={openAssetDialog}
              />
            </div>
          </aside>
          <section className="preview-stage flex min-w-0 flex-col bg-[#090a0d]">
            <div className="grid flex-1 place-items-center">
              <div className="text-center">
                <FolderOpen className="mx-auto size-8 text-zinc-600" />
                <p className="mt-3 text-sm text-zinc-400">
                  {projectDirectory ? "项目已就绪" : "请选择或创建一个项目"}
                </p>
                <p className="mt-2 text-[10px] text-zinc-500">
                  {projectDirectory
                    ? "从左侧项目树的“片段”节点添加第一个片段"
                    : "项目中的角色、服装、道具、场景、片段和输出会显示在左侧项目树中"}
                </p>
                <Button
                  type="button"
                  onClick={() =>
                    (projectDirectory
                      ? addShot()
                      : chooseProjectDirectory())
                  }
                  size="sm"
                  className="mt-4 bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
                >
                  {projectDirectory ? "添加片段" : "创建项目"}
                </Button>
              </div>
            </div>
          </section>
          <aside className="control-panel border-l border-border bg-card">
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div>
                <p className="text-sm font-medium">暂无生成设置</p>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  创建片段后在中间编辑提示词，在右侧设置视频参数。
                </p>
              </div>
            </div>
          </aside>
        </div>
        {addDialog && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
            onMouseDown={() => setAddDialog(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 className="text-sm font-semibold">新增片段</h2>
              <label htmlFor="new-shot-title" className="field-label mt-4">
                片段名称
              </label>
              <input
                id="new-shot-title"
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
                autoFocus
              />
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                创建后可在中间编辑提示词，在右侧设置视频参数。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setAddDialog(false)}>
                  取消
                </Button>
                <Button
                  onClick={confirmAddShot}
                  className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
                >
                  创建片段
                </Button>
              </div>
            </div>
          </div>
        )}
        {projectError && (
          <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#14161b] shadow-2xl shadow-black/50">
              <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
                <span className="grid size-8 place-items-center rounded-lg bg-red-400/10 text-red-300">
                  <CircleAlert className="size-4" />
                </span>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">创建项目失败</h2>
                  <p className="mt-0.5 text-[10px] text-zinc-500">项目文件没有被覆盖</p>
                </div>
                <button type="button" className="ml-auto rounded-md p-1.5 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200" onClick={() => setProjectError(null)} aria-label="关闭">
                  <X className="size-4" />
                </button>
              </div>
              <div className="px-5 py-5 text-xs leading-5 text-zinc-300">{projectError}</div>
              <div className="flex justify-end border-t border-white/8 bg-black/10 px-5 py-3">
                <Button type="button" size="sm" onClick={() => setProjectError(null)} className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">知道了</Button>
              </div>
            </div>
          </div>
        )}
        {projectNameDialog && (
          <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <h2 className="text-base font-semibold">新建项目</h2>
              <p className="mt-2 text-xs text-muted-foreground">先填写项目名称，下一步选择项目保存位置。</p>
              <label htmlFor="new-project-name-empty" className="field-label mt-5 block">项目名称</label>
              <input
                id="new-project-name-empty"
                value={newProjectName}
                onChange={(event) => setNewProjectName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && newProjectName.trim()) {
                    event.preventDefault();
                    void createProjectDirectory();
                  }
                  if (event.key === "Escape") setProjectNameDialog(false);
                }}
                className="mt-2 h-10 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none transition focus:border-[#f4bd50] focus:ring-2 focus:ring-[#f4bd50]/20"
                autoFocus
              />
              <div className="mt-6 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setProjectNameDialog(false)}>取消</Button>
                <Button type="button" disabled={!newProjectName.trim()} onClick={() => void createProjectDirectory()} className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">选择保存位置</Button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <WindowChrome />
      {renderAssetDialog()}
      {renderAssetDeleteDialog()}
      {renderProjectDeleteDialog()}
      {renderEngineSettingsDialog()}
      {assetSubjectPickerOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={closeAssetPicker}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              {assetPickerView !== "actions" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setAssetPickerView(
                      assetPickerView === "items" ? "categories" : "actions",
                    );
                    setAssetPickerCategory(
                      assetPickerView === "items" ? assetPickerCategory : null,
                    );
                  }}
                  aria-label="返回"
                  title="返回"
                >
                  <ArrowLeft className="size-4" />
                </Button>
              )}
              <h2 className="text-sm font-semibold">
                {assetPickerView === "items"
                  ? pickerCategoryOptions.find(
                      (category) => category.type === assetPickerCategory,
                    )?.label
                  : referencePickerTarget
                    ? "添加当前镜头参考素材"
                    : "从资产库绑定主体"}
              </h2>
            </div>
            {assetPickerView === "actions" && (
              <>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {referencePickerTarget
                    ? "选择上传方式"
                    : "从资产库选择角色、场景、服装或道具。"}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {referencePickerTarget && (
                    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-3 text-center text-xs text-primary hover:bg-primary/10">
                      <ImagePlus className="size-5" />
                      直接上传
                      <input
                        type="file"
                        accept={
                          referencePickerTarget.kind === "image"
                            ? "image/*"
                            : referencePickerTarget.kind === "video"
                              ? "video/*"
                              : "audio/*"
                        }
                        className="hidden"
                        onChange={(event) => {
                          const target = referencePickerTarget;
                          if (!target) return;
                          closeAssetPicker();
                          void uploadReference(event, target.kind, target.index);
                        }}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    onClick={() => setAssetPickerView("categories")}
                    className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-border px-3 py-3 text-center text-xs hover:border-primary/50 hover:bg-primary/5"
                  >
                    <FolderOpen className="size-5 text-primary" />
                    资产库
                    <span className="text-[9px] text-muted-foreground">
                      {hasPickerAssets ? `${pickerAssets.length} 项` : "暂无资产"}
                    </span>
                  </button>
                </div>
              </>
            )}
            {assetPickerView === "categories" && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {pickerCategoryOptions.length ? (
                  pickerCategoryOptions.map(({ type, label, icon: Icon, count }) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setAssetPickerCategory(type);
                        setAssetPickerView("items");
                      }}
                      className="flex min-h-20 items-center gap-3 rounded-lg border border-border px-3 py-3 text-left hover:border-primary/50 hover:bg-primary/5"
                    >
                      <Icon className="size-4 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">{label}</span>
                        <span className="text-[9px] text-muted-foreground">{count} 项</span>
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="col-span-2 py-6 text-center text-[10px] text-muted-foreground">
                    暂无可用资产
                  </p>
                )}
              </div>
            )}
            {assetPickerView === "items" && (
              <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto">
                {selectedPickerAssets.map((asset) => (
                  <button
                    key={`${asset.type}-${asset.name}`}
                    type="button"
                    onClick={() => {
                      closeAssetPicker();
                      void bindProjectAsset(asset, referencePickerTarget ?? undefined);
                    }}
                    className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:border-primary/50"
                  >
                    <span className="grid size-8 place-items-center overflow-hidden rounded bg-muted">
                      {asset.thumbnail ? (
                        <img src={asset.thumbnail} alt="" className="size-full object-cover" />
                      ) : (
                        <Package className="size-3" />
                      )}
                    </span>
                    <span className="truncate">{asset.name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground">{assetLabel(asset)}</span>
                  </button>
                ))}
                {!selectedPickerAssets.length && (
                  <p className="py-6 text-center text-[10px] text-muted-foreground">
                    暂无可用资产
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={closeAssetPicker}>
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_16px_rgba(244,189,80,0.16)]">
            <Clapperboard className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">视频创作</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setWorkspaceMode("launcher")}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-zinc-400 hover:bg-white/8 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            工作台
          </Button>
          <div
            className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${comfyConnected === true ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-400" : comfyConnected === false ? "border-red-500/20 bg-red-500/8 text-red-400" : "border-white/10 bg-white/5 text-zinc-400"}`}
          >
            <span
              className={`size-1.5 rounded-full ${comfyConnected === true ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : comfyConnected === false ? "bg-red-400" : "bg-zinc-500"}`}
            />
            {comfyConnected === true
              ? "已连接引擎"
              : comfyConnected === false
                ? "引擎未连接"
                : "正在检测引擎"}
          </div>
          <Button
            type="button"
            onClick={openEngineSettings}
            variant="ghost"
            size="icon-sm"
            className="size-8 text-zinc-400 hover:bg-white/8 hover:text-foreground"
            aria-label="ComfyUI 连接设置"
            title="ComfyUI 连接设置"
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </header>

      <div
        className="workspace-grid relative"
        style={{
          gridTemplateColumns: `${railWidth}px minmax(420px, 1fr) ${panelWidth}px`,
        }}
      >
        <aside className="shot-rail overflow-y-auto border-r border-border bg-[#090a0d]">
          <div className="flex items-center justify-between p-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              项目管理
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                onClick={chooseProjectDirectory}
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="新建项目"
                title="新建项目"
              >
                <Plus className="size-3.5" />
              </Button>
              <Button
                type="button"
                onClick={() => void importProjectDirectory()}
                variant="ghost"
                size="icon-sm"
                className="size-7"
                aria-label="导入项目"
                title="导入项目"
              >
                <FolderInput className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="p-3">
            <ProjectTree
              projects={visibleProjects}
                activeProjectId={projectIdRef.current}
              onSelectProject={selectProjectById}
              onRemoveProject={requestProjectDeletion}
              onDeleteAsset={requestProjectAssetDeletion}
              assets={projectAssets}
              outputFiles={projectOutputFiles}
              shots={shots.map((shot) => ({
                id: shot.id,
                title: shot.title,
                detail: shotDetail(shot),
                state: shot.state,
              }))}
              activeShot={activeShot}
              onSelectShot={selectShot}
              onAddShot={addShot}
              onAddAsset={openAssetDialog}
              onRenameShot={renameShot}
              onDeleteShot={deleteShot}
            />
          </div>
        </aside>
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            resizeRail(event);
          }}
          className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none"
          style={{ left: railWidth }}
          aria-label="调整镜头区域宽度"
        />

        <section
          ref={previewStageRef}
          className="preview-stage relative flex min-w-0 flex-col bg-[#090a0d]"
        >
          <div className="flex items-center justify-between border-b border-white/7 px-4 py-2.5">
            <div>
              <p className="text-xs font-medium text-zinc-200">
                片段 {shots[activeShot].id} · {shots[activeShot].title}
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                {model} · {turboMode ? "加速" : "标准"} · {activeMode} ·{" "}
                {resolution} · {duration} · {fps}
                {activeStage ? ` · ${activeStage}` : ""}
                {videoUrl
                  ? ` · ${shotFileNames[shots[activeShot].id] ?? `${safeFileStem(shots[activeShot].title)}.mp4`}`
                  : ""}
                {shotElapsed(shots[activeShot].id) !== undefined
                  ? ` · 耗时 ${formatElapsed(shotElapsed(shots[activeShot].id)!)}`
                  : ""}
              </p>
            </div>
          </div>
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-3">
            <div className="video-frame group relative aspect-video h-full max-h-[calc(100%-6rem)] w-auto max-w-full flex-none overflow-hidden rounded-md border border-white/10 bg-[#0e1117] shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(43,65,77,.34),transparent_42%),linear-gradient(160deg,#141820_0%,#090a0e_62%)]" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
              {videoUrl ? (
                <video
                  key={videoUrl}
                  ref={videoRef}
                  src={videoUrl}
                  preload="metadata"
                  controls
                  className="absolute inset-0 size-full object-contain"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center">
                  <Film className="size-7 text-zinc-700" aria-hidden="true" />
                </div>
              )}
            </div>
            <div
              ref={previewControlsRef}
              className="mt-3 flex w-full max-w-3xl flex-col items-center gap-1.5"
            >
              <p className="text-center text-[10px] text-zinc-500">
                {!videoUrl
                  ? "生成视频后，可从播放器进度条定位画面"
                  : activeShot >= shots.length - 1
                    ? "请先创建下一个镜头，才能设置连续首帧"
                    : "拖动播放器进度条定位画面，再设为下一镜头首帧"}
              </p>
              <Button
                onClick={() => void captureFrameForNextShot()}
                disabled={!videoUrl || activeShot >= shots.length - 1}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-white/10 bg-white/5 px-3 text-[10px] text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                title={frameButtonTitle}
              >
                <ImagePlus className="size-3.5" />
                选作下一镜头首帧
              </Button>
            </div>
          </div>
          <div
            className="relative flex min-h-0 flex-none flex-col overflow-hidden border-t border-white/7 bg-card/35"
            style={{ height: promptPanelHeight }}
          >
            <div
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                resizePromptPanel(event);
              }}
              className="group absolute inset-x-0 z-30 -top-0.5 h-2 cursor-row-resize touch-none"
              aria-label="调整提示词区域高度"
              title="拖动分隔线调整提示词区域高度"
            >
              <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/15 transition-colors group-hover:bg-primary/60" />
            </div>
            <div className="flex items-center justify-between px-4 pt-3">
              <span className="field-label">H3 提示词模块</span>
              <div className="flex items-center gap-1.5">
                {taskShot && (
                  <>
                    <label htmlFor="visual-style" className="sr-only">视觉风格</label>
                    <select
                      id="visual-style"
                      value={shotVisualStyles[taskShot.id] ?? "natural_cinematic"}
                      onChange={(event) => {
                        const value = event.target.value as VisualStyleKey;
                        setShotVisualStyles((current) => ({ ...current, [taskShot.id]: value }));
                        void writeClipManifest(taskShot, { visualStyle: value });
                      }}
                      className="h-7 min-w-40 rounded-md border border-white/20 bg-black px-2 text-[10px] text-white outline-none focus:border-primary/60"
                    >
                      {Object.entries(visualStylePresets).map(([key, preset]) => (
                        <option key={key} value={key} className="bg-black text-white">{preset.label}</option>
                      ))}
                    </select>
                  </>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  disabled={!prompt.trim() || Boolean(taskShot && promptOptimizing[taskShot.id])}
                  onClick={() => void optimizeH3Prompt()}
                >
                  {taskShot && promptOptimizing[taskShot.id] ? "优化中…" : "优化提示词"}
                </Button>
                <span className="text-[10px] text-zinc-500">{activeMode}</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden px-4 pt-2">
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => {
                  const value = event.target.value;
                  setPrompt(value);
                  updatePromptMention(value, event.target.selectionStart);
                  if (taskShot) {
                    setOptimizedPrompts((current) => {
                      const next = { ...current };
                      delete next[promptStoreKey(taskShot.id, activeMode)];
                      return next;
                    });
                  }
                  if (taskShot)
                    setShotPrompts((current) => ({
                      ...current,
                      [promptStoreKey(taskShot.id, activeMode)]: value,
                    }));
                }}
                onClick={(event) =>
                  updatePromptMention(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                  )
                }
                onKeyUp={(event) =>
                  !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", "Escape"].includes(
                    event.key,
                  ) &&
                  updatePromptMention(
                    event.currentTarget.value,
                    event.currentTarget.selectionStart,
                  )
                }
                onKeyDown={(event) => {
                  const visibleMentionCount = mentionOptions.length;
                  if (!promptMention || !visibleMentionCount) return;
                  if (
                    event.key === "ArrowDown" ||
                    event.key === "ArrowRight" ||
                    event.key === "ArrowUp" ||
                    event.key === "ArrowLeft"
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const direction =
                      event.key === "ArrowDown" || event.key === "ArrowRight"
                        ? 1
                        : -1;
                    setPromptMention((current) =>
                      current
                        ? {
                            ...current,
                            selected:
                              (current.selected + direction + visibleMentionCount) %
                              visibleMentionCount,
                          }
                        : current,
                    );
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    event.stopPropagation();
                    insertReferenceMention(
                      mentionOptions[promptMention.selected] ?? mentionOptions[0],
                    );
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setPromptMention(null);
                  }
                }}
                placeholder="在这里输入镜头提示词，然后点击“优化提示词”生成符合 H3 规范的完整提示词"
                className="min-h-40 h-full w-full resize-none overflow-y-auto rounded-lg border border-border bg-muted/25 p-3 font-mono text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
              />
              {promptMention && mentionOptions.length > 0 && (
                <div
                  className="fixed z-[80] max-h-64 w-64 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl"
                  style={{ left: mentionPosition.left, top: mentionPosition.top }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {mentionOptions.map((option, index) => (
                        <button
                          key={`${option.assetKey}-${option.token}`}
                          type="button"
                          aria-selected={index === promptMention.selected}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            insertReferenceMention(option);
                          }}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] text-zinc-300 hover:bg-primary/10 hover:text-primary ${index === promptMention.selected ? "bg-primary/10 text-primary" : ""}`}
                        >
                          <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                            {option.url ? (
                              option.kind === "video" ? (
                                <video src={option.url} muted className="size-full object-cover" />
                              ) : (
                                <img src={option.url} alt="" className="size-full object-cover" />
                              )
                            ) : (
                              <Package className="size-3 text-muted-foreground" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{option.name}</span>
                          <span className="shrink-0 text-[9px] text-muted-foreground">
                            {option.token}
                          </span>
                        </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative mt-auto shrink-0 border-t border-border/60 bg-card/95 p-4 backdrop-blur">
              <div className="pointer-events-none absolute bottom-full left-0 right-0 min-h-4 text-center text-[9px] font-medium">
                {promptNotice && (
                  <span
                    className={
                      promptNotice.type === "success"
                        ? "text-emerald-400/85"
                        : "text-red-300/90"
                    }
                  >
                    {promptNotice.text}
                  </span>
                )}
              </div>
              <Button
                type="button"
                onClick={openPromptViewer}
                className="h-10 w-full gap-1.5 bg-[#f4bd50] px-3 text-[10px] font-semibold text-[#17120a] hover:bg-[#ffd070]"
              >
                <Eye className="size-3.5" />
                查看最终提示词
              </Button>
            </div>
          </div>
        </section>
        <div
          onPointerDown={(event) => {
            event.preventDefault();
            resizePanel(event);
          }}
          className="absolute inset-y-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none"
          style={{ right: panelWidth }}
          aria-label="调整视频模型区域宽度"
        />

        <aside className="control-panel border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
              <p className="text-sm font-semibold">视频模型</p>
              <select
                value={model}
                onChange={(event) => {
                  const value = event.target
                    .value as keyof typeof modelProfiles;
                  setModel(value);
                  updateSetting("model", value);
                }}
                aria-label="选择视频模型"
                className="select-like w-full appearance-none"
              >
                <option>H3</option>
              </select>
              <p className="col-start-2 text-[10px] leading-4 text-muted-foreground">
                当前仅支持 H3
              </p>
            </div>
          </div>
          <div className="control-scroll space-y-5 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <p className="text-xs font-medium">采样模式</p>
                <div
                  role="radiogroup"
                  aria-label="采样模式"
                  className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"
                >
                  <label
                    className={`cursor-pointer rounded-md px-1.5 py-1.5 text-center text-[10px] font-medium transition ${turboMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="sampling-mode"
                      checked={turboMode}
                      onChange={() => {
                        setTurboMode(true);
                        updateSetting("turbo", true);
                      }}
                      className="sr-only"
                    />
                    加速
                    <br />
                    <span className="text-[9px] font-normal text-muted-foreground">
                      4 步
                    </span>
                  </label>
                  <label
                    className={`cursor-pointer rounded-md px-1.5 py-1.5 text-center text-[10px] font-medium transition ${!turboMode ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <input
                      type="radio"
                      name="sampling-mode"
                      checked={!turboMode}
                      onChange={() => {
                        setTurboMode(false);
                        updateSetting("turbo", false);
                      }}
                      className="sr-only"
                    />
                    标准
                    <br />
                    <span className="text-[9px] font-normal text-muted-foreground">
                      20 步
                    </span>
                  </label>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <label htmlFor="seed" className="field-label">
                  随机种子
                </label>
                <div className="mt-2 flex h-[34px] items-center rounded-lg border border-border bg-muted/30 pl-2">
                  <input
                    id="seed"
                    value={seed}
                    disabled={seedMode === "random"}
                    onChange={(event) =>
                      (() => {
                        const value = event.target.value.replace(/\D/g, "");
                        setSeed(value);
                        updateSetting("seed", value);
                      })()
                    }
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-55"
                    inputMode="numeric"
                  />
                  <button
                    onClick={() => {
                      const nextMode =
                        seedMode === "fixed" ? "random" : "fixed";
                      setSeedMode(nextMode);
                      updateSetting("seedMode", nextMode);
                      if (nextMode === "random")
                        (() => {
                          const value = String(
                            Math.floor(
                              Math.random() *
                                (Number.MAX_SAFE_INTEGER - 1000000000000000),
                            ) + 1000000000000000,
                          );
                          setSeed(value);
                          updateSetting("seed", value);
                        })();
                    }}
                    className={`grid h-full w-8 place-items-center transition hover:text-primary ${seedMode === "random" ? "text-primary" : "text-muted-foreground"}`}
                    aria-label={
                      seedMode === "random"
                        ? "切换为固定种子"
                        : "切换为随机种子"
                    }
                    aria-pressed={seedMode === "random"}
                    title={seedMode === "random" ? "随机种子" : "固定种子"}
                  >
                    <Dice5 className="size-3.5" />
                  </button>
                </div>
                <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">
                  固定种子便于复现，随机种子用于探索不同结果。
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label htmlFor="duration" className="field-label">
                  时长
                </label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(event) => {
                    setDuration(event.target.value);
                    updateSetting("duration", event.target.value);
                  }}
                  className="select-like mt-2 appearance-none"
                >
                  {Array.from({ length: 14 }, (_, index) => {
                    const seconds = index + 2;
                    return <option key={seconds}>{seconds} 秒</option>;
                  })}
                </select>
              </div>
              <div>
                <label htmlFor="resolution" className="field-label">
                  分辨率
                </label>
                <select
                  id="resolution"
                  value={
                    shotSettings[shots[activeShot].id]?.resolution ??
                    availableResolution
                  }
                  onChange={(event) => {
                    setResolution(event.target.value);
                    updateSetting("resolution", event.target.value);
                  }}
                  className="select-like mt-2 appearance-none"
                >
                  {profile.resolutions.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="aspect" className="field-label">
                  画幅
                </label>
                <select
                  id="aspect"
                  value={aspect}
                  onChange={(event) => {
                    setAspect(event.target.value);
                    updateSetting("aspect", event.target.value);
                  }}
                  className="select-like mt-2 appearance-none"
                >
                  <option>16:9</option>
                  <option>9:16</option>
                  <option>2.35:1</option>
                  <option>1:1</option>
                  <option>4:3</option>
                  <option>3:4</option>
                </select>
              </div>
              <div>
                <label className="field-label">帧率</label>
                <select
                  value={fps}
                  onChange={(event) => {
                    setFps(event.target.value);
                    updateSetting("fps", event.target.value);
                  }}
                  className="select-like mt-2 appearance-none"
                >
                  <option>24 fps</option>
                  <option>30 fps</option>
                  <option>60 fps</option>
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">生成模式</label>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
                {modes.map((item) => (
                  <button
                    key={item}
                    onClick={() => changeGenerationMode(item)}
                    className={`rounded-md px-1 py-1.5 text-[10px] font-medium transition ${activeMode === item ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {activeMode === "I2VA" && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
                <div>
                  <label className="field-label">关键帧方式</label>
                  <div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
                    {(
                      [
                        ["first", "首帧"],
                        ["last", "尾帧"],
                        ["first_last", "首尾帧"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => {
                          setKeyframeMode(value);
                          updateSetting("keyframeMode", value);
                        }}
                        className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition ${keyframeMode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  className={`grid gap-2 ${keyframeMode === "first_last" ? "grid-cols-2" : "grid-cols-1"}`}
                >
                  {(keyframeMode === "last"
                    ? ["尾帧"]
                    : keyframeMode === "first_last"
                      ? ["首帧", "尾帧"]
                      : ["首帧"]
                  ).map((label) => {
                    const frame = keyframes[`${shots[activeShot].id}-${label}`];
                    return (
                      <label
                        key={label}
                        className="upload-tile relative w-full overflow-hidden"
                      >
                        {frame && (
                          <button
                            type="button"
                            className="absolute right-1 top-1 z-20 grid size-5 place-items-center rounded-full bg-black/75 text-white/80 transition hover:bg-red-500 hover:text-white"
                            aria-label={"删除" + label}
                            title={"删除" + label}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              const key = shots[activeShot].id + "-" + label;
                              const previousFrame = keyframes[key];
                              keyframeUploadTokensRef.current[key] =
                                (keyframeUploadTokensRef.current[key] ?? 0) + 1;
                              keyframesRef.current = { ...keyframesRef.current };
                              delete keyframesRef.current[key];
                              setKeyframes((current) => {
                                const next = { ...current };
                                delete next[key];
                                return next;
                              });
                              void deleteKeyframeSourceFile(previousFrame?.sourcePath);
                              if (previousFrame?.url.startsWith("blob:")) URL.revokeObjectURL(previousFrame.url);
                            }}
                          >
                            <X className="size-3" />
                          </button>
                        )}
                        {frame ? (
                          <img
                            src={frame.url}
                            alt={`${label}缩略图`}
                            className="absolute inset-0 size-full object-cover opacity-70"
                          />
                        ) : (
                          <ImagePlus />
                        )}
                        <span className="relative rounded bg-black/60 px-1.5 py-0.5">
                          {frame?.name ?? `添加${label}`}
                        </span>
                        <small className="relative rounded bg-black/60 px-1">
                          {label === "首帧"
                            ? "对齐 0.00 秒"
                            : "对齐视频结束时刻"}
                        </small>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            if (!file) return;
                            const currentShot = shots[activeShot];
                            const frameLabel = label as "首帧" | "尾帧";
                            await uploadKeyframe(currentShot, file, frameLabel);
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                <p className="text-[9px] leading-4 text-muted-foreground">
                  底层模式：
                  {keyframeMode === "first"
                    ? "I2VA · 从首帧向后发展"
                    : keyframeMode === "last"
                      ? "L2VA · 最终落到尾帧"
                      : "FL2VA · 生成首尾帧之间的连续路径"}
                </p>
              </div>
            )}

            {activeMode === "R2VA" && (
              <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-3">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label">参考图片</label>
                    <span className="text-[10px] text-muted-foreground">
                      {referenceCount("image", profile.images)} /{" "}
                      {profile.images}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {Array.from(
                      { length: referenceSlotCount("image", profile.images) },
                      (_, index) => referenceTile("image", index),
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label">参考视频</label>
                    <span className="text-[10px] text-muted-foreground">
                      {referenceCount("video", profile.videos)} /{" "}
                      {profile.videos}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {Array.from(
                      { length: referenceSlotCount("video", profile.videos) },
                      (_, index) => referenceTile("video", index),
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="field-label">独立音频</label>
                    <span className="text-[10px] text-muted-foreground">
                      {referenceCount("audio", profile.audios)} /{" "}
                      {profile.audios}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {Array.from(
                      { length: referenceSlotCount("audio", profile.audios) },
                      (_, index) => referenceTile("audio", index),
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 p-4 backdrop-blur">
            {generationNotice && (
              <output aria-live="assertive" className="mb-2 block text-center text-[10px] text-red-300">
                {generationNotice}
              </output>
            )}
            <Button
              onClick={toggleGeneration}
              className="h-10 w-full bg-[#f4bd50] font-semibold text-[#17120a] hover:bg-[#ffd070]"
            >
              {activeTask ? (
                <CircleStop />
              ) : canRegenerate ? (
                <RotateCcw />
              ) : (
                <Film />
              )}
              {activeTask
                ? "停止生成"
                : activeSubmitting
                  ? "提交中"
                  : canRegenerate
                    ? "重新生成"
                    : "生成视频"}
            </Button>
          </div>
        </aside>
      </div>
      {projectError && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#14161b] shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3 border-b border-white/8 px-5 py-4">
              <span className="grid size-8 place-items-center rounded-lg bg-red-400/10 text-red-300">
                <CircleAlert className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">创建项目失败</h2>
                <p className="mt-0.5 text-[10px] text-zinc-500">项目文件没有被覆盖</p>
              </div>
              <button type="button" className="ml-auto rounded-md p-1.5 text-zinc-500 transition hover:bg-white/8 hover:text-zinc-200" onClick={() => setProjectError(null)} aria-label="关闭">
                <X className="size-4" />
              </button>
            </div>
            <div className="px-5 py-5 text-xs leading-5 text-zinc-300">{projectError}</div>
            <div className="flex justify-end border-t border-white/8 bg-black/10 px-5 py-3">
              <Button type="button" size="sm" onClick={() => setProjectError(null)} className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">知道了</Button>
            </div>
          </div>
        </div>
      )}
      {projectNameDialog && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-sm"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
          >
            <h2 className="text-base font-semibold">新建项目</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              先填写项目名称，下一步选择项目保存位置。
            </p>
            <label htmlFor="new-project-name" className="field-label mt-5 block">
              项目名称
            </label>
            <input
              id="new-project-name"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && newProjectName.trim()) {
                  event.preventDefault();
                  void createProjectDirectory();
                }
                if (event.key === "Escape") setProjectNameDialog(false);
              }}
              className="mt-2 h-10 w-full rounded-xl border border-border bg-muted/30 px-3 text-sm outline-none transition focus:border-[#f4bd50] focus:ring-2 focus:ring-[#f4bd50]/20"
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setProjectNameDialog(false)}>
                取消
              </Button>
              <Button
                type="button"
                disabled={!newProjectName.trim()}
                onClick={() => void createProjectDirectory()}
                className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
              >
                选择保存位置
              </Button>
            </div>
          </div>
        </div>
      )}
      {addDialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setAddDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">新增片段</h2>
            <label htmlFor="new-shot-title" className="field-label mt-4">
              片段名称
            </label>
            <input
              id="new-shot-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
              autoFocus
            />
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              创建后可在中间编辑提示词，在右侧设置视频参数。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAddDialog(false)}>
                取消
              </Button>
              <Button
                onClick={confirmAddShot}
                className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
              >
                创建片段
              </Button>
            </div>
          </div>
        </div>
      )}
      {renameIndex !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setRenameIndex(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">编辑片段名称</h2>
              <button
                type="button"
                onClick={() => setRenameIndex(null)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭编辑片段名称"
              >
                <X className="size-4" />
              </button>
            </div>
            <label htmlFor="rename-shot-title" className="field-label mt-4">
              片段名称
            </label>
            <input
              id="rename-shot-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void confirmRenameShot();
                }
                if (event.key === "Escape") setRenameIndex(null);
              }}
              className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
              autoFocus
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameIndex(null)}>
                取消
              </Button>
              <Button
                onClick={confirmRenameShot}
                disabled={!newTitle.trim()}
                className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]"
              >
                保存名称
              </Button>
            </div>
          </div>
        </div>
      )}
      {deleteIndex !== null && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setDeleteIndex(null)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">删除片段</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              请选择删除方式：仅从视频创作移除不会修改磁盘文件；从磁盘删除会同时删除片段目录和输出文件。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteIndex(null)}>
                取消
              </Button>
              <Button variant="outline" onClick={() => void confirmDeleteShot(false)}>
                仅从视频创作移除
              </Button>
              <Button variant="destructive" onClick={() => void confirmDeleteShot(true)}>
                从磁盘删除
              </Button>
            </div>
          </div>
        </div>
      )}
      {promptViewerOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => closePromptViewer()}
        >
          <div
            className="flex h-[min(78vh,680px)] w-full max-w-3xl flex-col rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">优化后的提示词</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                当前镜头的 H3 提示词 · {activeMode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => closePromptViewer()}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭优化后的提示词"
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={promptDraft}
              readOnly
              placeholder="当前片段暂无可显示的提示词"
              className="mt-4 min-h-0 flex-1 resize-none rounded-lg border border-border bg-muted/25 p-3 font-mono text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyPromptViewer()}
                className="h-8 gap-1.5 px-4 text-xs"
              >
                <Clipboard className="size-3.5" />
                {promptCopied ? "已复制" : "复制"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => closePromptViewer()}
                className="h-8 px-4 text-xs"
              >
                关闭
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
