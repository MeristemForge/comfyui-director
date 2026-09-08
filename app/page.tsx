"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Box,
  CircleStop,
  Clapperboard,
  Dice5,
  Eye,
  Film,
  FolderInput,
  FolderOpen,
  ImagePlus,
  MapPinned,
  MoreHorizontal,
  Package,
  Play,
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

type Ref2vaPromptManifest = {
  subject_definitions: string;
  summary: string;
  retention_analysis: string;
  detailed_description: string;
  overall_soundscape: string;
  non_diegetic_music: string;
};
type Shot = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  state: string;
  prompt?: string | Partial<Ref2vaPromptManifest>;
};
type ProjectShotRecord = Shot & {
  output?: string;
  references?: { subjects?: PersistedPromptSubject[] };
  generation?: { mode?: string; duration?: number; resolution?: string; aspect?: string; fps?: number; model?: keyof typeof modelProfiles; turbo?: boolean; seed?: string; seedMode?: "fixed" | "random"; keyframeMode?: string; steps?: number };
  prompt?: string | Partial<Ref2vaPromptManifest>;
  promptOriginal?: string;
  promptOptimized?: string;
};
type ProjectAssetType =
  "character" | "scene" | "clothing" | "prop" | "video" | "audio" | "custom";
const assetUsageOptions: Record<ProjectAssetType, readonly string[]> = {
  character: ["角色参考"],
  scene: ["场景参考"],
  clothing: ["服装参考"],
  prop: ["道具参考"],
  video: ["动作参考", "镜头参考", "表演参考"],
  audio: ["声音参考", "环境音", "音乐参考"],
  custom: [],
};
const initialShots: Shot[] = [];
const shotPromptDefaults: Record<string, string> = {};
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
  "LTX 2.5": {
    modes: ["T2V", "I2V"],
    images: 1,
    videos: 1,
    audios: 0,
    resolutions: ["768 × 512", "1024 × 576", "1280 × 720", "1920 × 1080"],
  },
  "Wan 3.0": {
    modes: ["T2V", "I2V", "V2V"],
    images: 4,
    videos: 1,
    audios: 1,
    resolutions: ["832 × 480", "1280 × 720", "1280 × 768", "1920 × 1080"],
  },
} as const;
type ShotSettings = {
  duration: string;
  resolution: string;
  aspect: string;
  fps: string;
  mode: string;
  model: keyof typeof modelProfiles;
  turbo: boolean;
};
const shotSettingDefaults: ShotSettings = {
  duration: "6 秒",
  resolution: "864 × 480",
  aspect: "16:9",
  fps: "24 fps",
  mode: "T2VA",
  model: "H3",
  turbo: true,
};
type PromptBuilderSettings = {
  style: string;
  framing: string;
  camera: string;
  lens: string;
};
type PromptBuilderSettingsInput = Partial<PromptBuilderSettings>;
const promptBuilderDefaults: PromptBuilderSettings = {
  style: "realistic_cinematic",
  framing: "",
  camera: "",
  lens: "",
};
type PromptSubject = {
  name: string;
  assetKeys: string[];
  assetRoles?: Record<string, string>;
  children?: PromptSubject[];
  visualRetention?: "fully_preserved" | "partially_preserved" | "attribute_transfer" | "weak_reference";
  audioRetention?: "fully_copy" | "partially_copy" | "reference" | "weak_reference";
  retentionTargetId?: string;
  referenceRetentions?: Record<string, {
    visual?: "fully_preserved" | "partially_preserved" | "attribute_transfer" | "weak_reference";
    audio?: "fully_copy" | "partially_copy" | "reference" | "weak_reference";
    targetSubjectId?: string;
    preserveFeatures?: string[];
    referenceScopes?: string[];
  }>;
};
type PersistedPromptReference = {
  assetKey?: string;
  role?: string;
  name?: string;
  kind?: ReferenceKind;
  comfyName?: string;
  comfySubfolder?: string;
  sourcePath?: string;
};
type PersistedPromptSubject = {
  subjectId?: string;
  name?: string;
  role?: string;
  references?: PersistedPromptReference[];
  relation?: { parentSubjectId?: string };
  assetKeys?: string[];
  assetRoles?: Record<string, string>;
  children?: PersistedPromptSubject[];
};
type Ref2vaFields = {
  summary: string;
  taskType: "reference generation" | "video editing" | "video continuation";
  audioProcessing: Array<"audio reuse" | "audio reference">;
  retentionAnalysis: string;
  soundscape: string;
  music: string;
};
const ref2vaDefaults: Ref2vaFields = {
  summary: "",
  taskType: "reference generation",
  audioProcessing: [],
  retentionAnalysis: "",
  soundscape: "",
  music: "N/A",
};
function normalizePromptBuilderSettings(
  settings?: PromptBuilderSettingsInput,
): PromptBuilderSettings {
  return {
    style: settings?.style ?? promptBuilderDefaults.style,
    framing: settings?.framing ?? promptBuilderDefaults.framing,
    camera: settings?.camera ?? promptBuilderDefaults.camera,
    lens: settings?.lens ?? promptBuilderDefaults.lens,
  };
}
const promptBuilderOptions = {
  style: [
    ["realistic_cinematic", "写实电影"],
    ["natural_documentary", "自然纪实"],
    ["commercial_clean", "商业广告"],
    ["vintage_film", "复古胶片"],
    ["music_video", "风格化 MV"],
    ["noir", "黑色电影"],
    ["soft_romance", "柔和爱情片"],
    ["animation_3d", "三维动画"],
    ["hitchcock_suspense", "希区柯克式悬疑"],
    ["neo_noir", "现代黑色电影"],
    ["arthouse_minimal", "作者电影·极简"],
  ] as const,
  framing: [
    ["extreme_closeup", "大特写"], ["closeup", "特写"], ["close", "近景"],
    ["medium_close", "中近景"], ["medium", "中景"], ["medium_wide", "中全景"],
    ["wide", "全景"], ["extreme_wide", "大远景"],
  ],
  camera: [
    ["static", "固定镜头"], ["push_slow", "推镜"], ["pull_slow", "拉镜"],
    ["front_follow", "前跟"], ["back_follow", "后跟"], ["side_follow", "侧跟"],
    ["track", "横移"], ["pan", "摇镜"], ["crane_up", "升镜"], ["crane_down", "降镜"],
    ["arc", "环绕"], ["handheld_follow", "手持跟拍"], ["gimbal_follow", "稳定器跟拍"], ["dolly_zoom", "希区柯克推拉"],
  ],
  lens: [
    ["front_level", "正面平视"], ["side", "侧面"], ["back", "背面"],
    ["low_angle", "低机位"], ["high_angle", "高机位"], ["overhead", "俯拍"],
    ["upward", "仰拍"], ["over_shoulder", "过肩"], ["pov", "第一人称"],
  ],
  lighting: [
    ["warm", "暖黄色"],
    ["cool", "冷蓝色"],
    ["daylight", "自然日光"],
    ["sunset", "夕阳光"],
    ["soft", "柔和漫射"],
    ["backlight", "轮廓逆光"],
    ["high_contrast", "高反差"],
    ["low_key", "低调暗光"],
    ["neon", "霓虹光"],
    ["practical", "实景灯光"],
  ],
  emotion: [
    ["joy", "喜悦"],
    ["anger", "愤怒"],
    ["sadness", "悲伤"],
    ["fear", "恐惧"],
    ["surprise", "惊讶"],
    ["disgust", "厌恶"],
    ["shy", "害羞"],
    ["embarrassed", "难为情"],
    ["nervous", "紧张不安"],
    ["restrained", "克制"],
    ["intimate", "暧昧亲密"],
    ["calm", "平静"],
    ["lonely", "孤独"],
    ["hopeful", "充满希望"],
    ["determined", "坚定"],
    ["playful", "俏皮"],
    ["longing", "渴望"],
    ["tense", "压迫紧绷"],
  ],
  music: [
    ["none", "无背景配乐（仅原声）"],
    ["music", "有背景配乐"],
  ],
} as const;
type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
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

function openDirectoryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("comfyui-director", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("handles"))
        database.createObjectStore("handles");
      if (!database.objectStoreNames.contains("state"))
        database.createObjectStore("state");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectorState(state: PersistedDirectorState) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction("state", "readwrite")
      .objectStore("state")
      .put(state, "director-state");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}

async function loadDirectorState() {
  const database = await openDirectoryDatabase();
  const state = await new Promise<PersistedDirectorState | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("state", "readonly")
        .objectStore("state")
        .get("director-state");
      request.onsuccess = () =>
        resolve(request.result as PersistedDirectorState | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return state;
}

async function saveProjectDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction("handles", "readwrite")
      .objectStore("handles")
      .put(handle, "project-directory");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}
async function clearProjectDirectoryHandle() {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction("handles", "readwrite")
      .objectStore("handles")
      .delete("project-directory");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}
async function loadProjectDirectoryHandle() {
  const database = await openDirectoryDatabase();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("handles", "readonly")
        .objectStore("handles")
        .get("project-directory");
      request.onsuccess = () =>
        resolve(request.result as FileSystemDirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return handle;
}
async function saveProjectDirectoryHandles(
  handles: FileSystemDirectoryHandle[],
) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction("handles", "readwrite")
      .objectStore("handles")
      .put(handles, "project-directories");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
}
async function loadProjectDirectoryHandles() {
  const database = await openDirectoryDatabase();
  const handles = await new Promise<FileSystemDirectoryHandle[] | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("handles", "readonly")
        .objectStore("handles")
        .get("project-directories");
      request.onsuccess = () =>
        resolve(request.result as FileSystemDirectoryHandle[] | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return handles ?? [];
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
  prompt: string;
  title: string;
  fileName: string;
  duration: string;
  resolution: string;
  aspect: string;
  fps: string;
  mode: string;
  model: keyof typeof modelProfiles;
  turbo: boolean;
  steps: number;
  startedAt: number;
  keyframeMode: string;
  inputImage?: string;
  lastImage?: string;
  referenceImages?: string[];
  referenceVideos?: string[];
  referenceAudios?: string[];
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
type PersistedReferenceAsset = {
  name: string;
  comfyName?: string;
  comfySubfolder?: string;
  kind: ReferenceKind;
  sourcePath?: string;
};
type PersistedKeyframe = { name: string; comfyName?: string };
type PersistedDirectorState = {
  shots?: typeof initialShots;
  shotPrompts?: Record<string, string>;
  promptBuilderSettings?: Record<string, PromptBuilderSettings>;
  promptSubjects?: Record<string, PromptSubject[]>;
  promptSegments?: Record<string, PromptSegment[]>;
  ref2vaFields?: Record<string, Ref2vaFields>;
  shotSettings?: Record<string, ShotSettings>;
  shotVideos?: Record<string, string>;
  shotFileNames?: Record<string, string>;
  shotProgress?: Record<string, number>;
  generationDurations?: Record<string, number>;
  shotTasks?: Record<string, ShotTask>;
  shotStages?: Record<string, string>;
  keyframes?: Record<string, PersistedKeyframe>;
  referenceAssets?: Record<string, PersistedReferenceAsset>;
};
type PromptMention = {
  start: number;
  end: number;
  query: string;
  selected: number;
};
type ClipPromptRecord = {
  original: string;
  optimized?: Partial<Ref2vaPromptManifest> | string;
  selected: "original" | "optimized";
};
function normalizePrompt(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const prompt = value as Partial<Ref2vaPromptManifest>;
  const sections = [
    ["subject_definitions", prompt.subject_definitions],
    ["summary", prompt.summary],
    ["retention_analysis", prompt.retention_analysis],
    ["detailed_description", prompt.detailed_description],
    ["overall_soundscape", prompt.overall_soundscape],
    ["non_diegetic_music", prompt.non_diegetic_music],
  ].filter(
    ([, section]) => typeof section === "string" && section.trim(),
  ) as Array<[string, string]>;
  if (
    sections.length === 1 &&
    sections[0][0] === "detailed_description"
  )
    return sections[0][1].trim();
  return sections.map(([name, section]) => `${name}:\n${section}`).join("\n\n");
}
function toRef2vaPromptManifest(value: unknown): Ref2vaPromptManifest {
  const text = normalizePrompt(value);
  const names = [
    "subject_definitions",
    "summary",
    "retention_analysis",
    "detailed_description",
    "overall_soundscape",
    "non_diegetic_music",
  ] as const;
  const sections = Object.fromEntries(
    names.map((name, index) => {
      const start = new RegExp(`(?:^|\\n)${name}\\s*:\\s*`, "i").exec(text);
      if (!start) return [name, ""];
      const contentStart = start.index + start[0].length;
      const next = names
        .slice(index + 1)
        .map((nextName) => new RegExp(`(?:^|\\n)${nextName}\\s*:\\s*`, "i").exec(text))
        .find((match) => match && match.index >= contentStart);
      return [name, text.slice(contentStart, next?.index ?? text.length).trim()];
    }),
  ) as Record<(typeof names)[number], string>;
  const legacyIntegrated = new RegExp(
    `(?:^|\\n)integrated_multimodal_description\\s*:\\s*([\\s\\S]*?)(?=\\n(?:overall_soundscape|non_diegetic_music)\\s*:|$)`,
    "i",
  ).exec(text);
  if (!sections.detailed_description && legacyIntegrated) {
    sections.detailed_description = legacyIntegrated[1].trim();
  }
  for (const name of ["overall_soundscape", "non_diegetic_music"] as const) {
    if (sections[name]) continue;
    const legacy = new RegExp(
      `(?:^|\\n)${name}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:overall_soundscape|non_diegetic_music)\\s*:|$)`,
      "i",
    ).exec(text);
    if (legacy) sections[name] = legacy[1].trim();
  }
  if (!names.some((name) => sections[name])) sections.detailed_description = text;
  return {
    subject_definitions: sections.subject_definitions,
    summary: sections.summary,
    retention_analysis: sections.retention_analysis,
    detailed_description: sections.detailed_description,
    overall_soundscape: sections.overall_soundscape,
    non_diegetic_music: sections.non_diegetic_music,
  };
}
type ReferenceMentionOption = {
  kind: ReferenceKind;
  index: number;
  token: string;
  name: string;
  url: string;
  ready: boolean;
  assetKey: string;
  category?: string;
};
type H3ReferenceMapping = {
  picture: string;
  subject: string;
  role: string;
  assetName: string;
  usage?: string;
  description?: string;
};

function normalizePromptSubjects(subjects: Record<string, PromptSubject[]>) {
  return Object.fromEntries(
    Object.entries(subjects).map(([shotId, shotSubjects]) => {
      const topLevelNames = new Set(
        shotSubjects.map((subject) => subject.name.trim().toLowerCase()),
      );
      return [
        shotId,
        shotSubjects.map((subject) => {
          const children = (subject.children ?? []).filter(
            (child) => !topLevelNames.has(child.name.trim().toLowerCase()),
          );
          return children.length === (subject.children ?? []).length
            ? subject
            : { ...subject, children };
        }),
      ];
    }),
  ) as Record<string, PromptSubject[]>;
}

function compactPersistedReferences(
  references: Record<string, PersistedReferenceAsset>,
  subjects: Record<string, PromptSubject[]>,
) {
  const remap = new Map<string, string>();
  const compacted: Record<string, PersistedReferenceAsset> = {};
  const groups = new Map<string, Array<[string, PersistedReferenceAsset, number]>>();
  Object.entries(references).forEach(([key, asset]) => {
    const match = key.match(/^(.*)-(image|video|audio)-(\d+)$/);
    if (!match) {
      compacted[key] = asset;
      return;
    }
    const groupKey = `${match[1]}-${match[2]}`;
    const group = groups.get(groupKey) ?? [];
    group.push([key, asset, Number(match[3])]);
    groups.set(groupKey, group);
  });
  groups.forEach((entries) => {
    entries
      .sort((left, right) => left[2] - right[2])
      .forEach(([key, asset], index) => {
        const match = key.match(/^(.*)-(image|video|audio)-\d+$/);
        if (!match) return;
        const nextKey = `${match[1]}-${match[2]}-${index}`;
        remap.set(key, nextKey);
        compacted[nextKey] = asset;
      });
  });
  const compactedSubjects = Object.fromEntries(
    Object.entries(subjects).map(([shotId, shotSubjects]) => [
      shotId,
      shotSubjects.map((subject) => ({
        ...subject,
        assetKeys: subject.assetKeys.map((key) => remap.get(key) ?? key),
        children: subject.children?.map((child) => ({
          ...child,
          assetKeys: child.assetKeys.map((key) => remap.get(key) ?? key),
        })),
      })),
    ]),
  ) as Record<string, PromptSubject[]>;
  return { references: compacted, subjects: compactedSubjects };
}

function normalizePersistedReferenceRole(role: string | undefined) {
  return role === "wardrobe" ? "clothing" : role?.trim() || "composite";
}

function inferReferenceKind(
  key: string,
  kind: ReferenceKind | undefined,
): ReferenceKind {
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  const inferred = key.match(/-(image|video|audio)-\d+$/)?.[1];
  return inferred === "video" || inferred === "audio" ? inferred : "image";
}

function restoreProjectShotReferences(
  persistedSubjects: PersistedPromptSubject[] | undefined,
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
    fallbackRole?: string,
  ) => {
    const assetKey = reference.assetKey?.trim();
    if (!assetKey) return;
    const role = normalizePersistedReferenceRole(reference.role ?? fallbackRole);
    if (!subject.assetKeys.includes(assetKey)) subject.assetKeys.push(assetKey);
    subject.assetRoles = { ...subject.assetRoles, [assetKey]: role };
    if (referenceAssets[assetKey]) return;
    const kind = inferReferenceKind(assetKey, reference.kind);
    const restoredAsset = {
      name: reference.name?.trim() || assetKey,
      comfyName: reference.comfyName,
      comfySubfolder: reference.comfySubfolder,
      kind,
    };
    referenceAssets[assetKey] = {
      ...restoredAsset,
      url: referenceAssetUrl(restoredAsset, comfyUrl),
      ...(reference.sourcePath ? { sourcePath: reference.sourcePath } : {}),
    };
  };

  const collect = (
    record: PersistedPromptSubject,
    inheritedParentId?: string,
  ) => {
    const subject: PromptSubject = {
      name: record.name?.trim() || "未命名主体",
      assetKeys: [],
      assetRoles: {},
    };
    (record.references ?? []).forEach((reference) =>
      addReference(subject, reference, record.role),
    );
    (record.assetKeys ?? []).forEach((assetKey) =>
      addReference(subject, {
        assetKey,
        role: record.assetRoles?.[assetKey] ?? record.role,
      }),
    );
    nodes.push({
      id: record.subjectId?.trim() || `restored-subject-${nodes.length}`,
      subject,
      parentId: record.relation?.parentSubjectId?.trim() || inheritedParentId,
    });
    const parentId = nodes[nodes.length - 1].id;
    (record.children ?? []).forEach((child) => collect(child, parentId));
  };
  (persistedSubjects ?? []).forEach((subject) => collect(subject));

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
  const parts = sourcePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  const pathParts = parts[0] === "资产" ? parts.slice(1) : parts;
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
  form.append("kind", kind);
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

const projectAssetFolders = [
  "角色",
  "场景",
  "服装",
  "道具",
  "视频",
  "音频",
  "自定义",
] as const;

/** Resolve the canonical 资产/<type> folder while still reading legacy root-level folders. */
async function getProjectAssetFolder(
  project: FileSystemDirectoryHandle,
  folderName: string,
  options: { create?: boolean } = {},
) {
  if (options.create) {
    const assets = await project.getDirectoryHandle("资产", { create: true });
    return assets.getDirectoryHandle(folderName, { create: true });
  }
  try {
    const assets = await project.getDirectoryHandle("资产");
    try {
      return await assets.getDirectoryHandle(folderName);
    } catch {
      // A partially migrated project may have this asset type at the legacy root.
    }
  } catch {
    // Legacy projects do not have an 资产 folder yet.
  }
  return project.getDirectoryHandle(folderName);
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

async function readAssetThumbnail(
  asset: FileSystemDirectoryHandle,
): Promise<string | undefined> {
  try {
    const manifest = await asset.getFileHandle("clothing.json");
    const data = JSON.parse(await (await manifest.getFile()).text()) as {
      references?: Array<{ file?: string }>;
    };
    const fileName = data.references?.[0]?.file;
    if (!fileName) return undefined;
    return URL.createObjectURL(
      await (await asset.getFileHandle(fileName)).getFile(),
    );
  } catch {
    return undefined;
  }
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
): Promise<ProjectShotRecord[] | null> {
  const scriptFile = await handle.getFileHandle("script.json");
  const script = JSON.parse(await (await scriptFile.getFile()).text()) as {
    clips?: Array<{ id: string; title: string }>;
  };
  if (!Array.isArray(script.clips)) return null;
  const clips = await handle.getDirectoryHandle("片段", { create: true });
  return Promise.all(
    script.clips.map(async (clip) => {
      try {
        const folder = await clips.getDirectoryHandle(
          `${clip.id}-${safeFileStem(clip.title)}`,
        );
        const file = await folder.getFileHandle("clip.json");
        const data = JSON.parse(await (await file.getFile()).text()) as {
          generation?: ProjectShotRecord["generation"];
          output?: string;
          references?: { subjects?: PersistedPromptSubject[] };
          prompt?: string | Partial<Ref2vaPromptManifest> | ClipPromptRecord;
        };
        const generation = data.generation ?? {};
        const durationText = `${generation.duration ?? 6}s`;
        const resolutionText = generation.resolution ?? "864×480";
        const fpsText = `${generation.fps ?? 24}fps`;
        let output = typeof data.output === "string" ? data.output : undefined;
        if (!output) {
          const entries = (folder as FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }).entries();
          for await (const [name, entry] of entries) {
            if (entry.kind === "file" && /\.(mp4|webm|mov)$/i.test(name)) { output = name; break; }
          }
        }
        const savedPrompt = data.prompt;
        const promptRecord =
          savedPrompt &&
          typeof savedPrompt === "object" &&
          "original" in savedPrompt
            ? (savedPrompt as ClipPromptRecord)
            : null;
        return {
          id: clip.id,
          title: clip.title,
          detail: `${durationText} · ${generation.mode ?? "T2VA"} · ${resolutionText} · ${fpsText}`,
          meta: `${generation.aspect ?? "16:9"}${output ? " · 已归档" : ""}`,
          state: output ? "已完成" : "草稿",
          output,
          generation,
          references: data.references,
          prompt: promptRecord
            ? normalizePrompt(promptRecord.original)
            : normalizePrompt(savedPrompt),
          promptOriginal: promptRecord
            ? normalizePrompt(promptRecord.original)
            : undefined,
          promptOptimized: promptRecord?.optimized
            ? normalizePrompt(promptRecord.optimized)
            : undefined,
        };
      } catch {
        return {
          id: clip.id,
          title: clip.title,
          detail: "6s · R2VA · 864×480 · 24fps",
          meta: "16:9",
          state: "草稿",
        };
      }
    }),
  );
}

export default function Home() {
  const [activeShot, setActiveShot] = useState(0);
  const [shots, setShots] = useState(initialShots);
  const [mode, setMode] = useState("T2VA");
  const [model, setModel] = useState<keyof typeof modelProfiles>("H3");
  const [turboMode, setTurboMode] = useState(true);
  const [keyframeMode, setKeyframeMode] = useState<
    "first" | "last" | "first_last"
  >("first");
  const [shotProgress, setShotProgress] = useState<Record<string, number>>({});
  const [shotStages, setShotStages] = useState<Record<string, string>>({});
  const [railWidth, setRailWidth] = useState(220);
  const [panelWidth, setPanelWidth] = useState(420);
  const [, setGenerationStatus] = useState("等待生成");
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
    Record<string, { name: string; url: string; comfyName?: string }>
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
  const [promptOptimizing, setPromptOptimizing] = useState(false);
  const [llmExecutablePath, setLlmExecutablePath] = useState("");
  const [promptBuilderSettings, setPromptBuilderSettings] = useState<
    Record<string, PromptBuilderSettings>
  >({});
  const [promptSubjects, setPromptSubjects] = useState<
    Record<string, PromptSubject[]>
  >({});
  const [promptSegments, setPromptSegments] = useState<
    Record<string, PromptSegment[]>
  >({});
  const [ref2vaFields, setRef2vaFields] = useState<
    Record<string, Ref2vaFields>
  >({});
  const [activePromptSegment, setActivePromptSegment] = useState<
    Record<string, number>
  >({});
  const [promptPanelHeight, setPromptPanelHeight] = useState(300);
  const [settingsSegmentIndex, setSettingsSegmentIndex] = useState<
    number | null
  >(null);
  const [promptViewerOpen, setPromptViewerOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
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
    string | null
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
  const [shotPrompts, setShotPrompts] =
    useState<Record<string, string>>(shotPromptDefaults);
  const [shotSettings, setShotSettings] = useState<
    Record<string, ShotSettings>
  >(() =>
    Object.fromEntries(
      shots.map((shot) => [
        shot.id,
        {
          ...shotSettingDefaults,
          duration: `${shot.detail.match(/\d+/)?.[0] ?? 6} 秒`,
          mode: shot.detail.match(/T2VA|I2VA|R2VA/)?.[0] ?? "T2VA",
          aspect: shot.id === "02" ? "2.35:1" : "16:9",
          resolution: shot.meta
            .split("·")[0]
            .trim()
            .replace(/\s*×\s*/, " × "),
        },
      ]),
    ),
  );
  const [storageReady, setStorageReady] = useState(false);
  const [comfyConnected, setComfyConnected] = useState<boolean | null>(null);
  const [comfyUrl, setComfyUrl] = useState("http://127.0.0.1:8188");
  const [comfyUrlDraft, setComfyUrlDraft] = useState("http://127.0.0.1:8188");
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
    ? projectDirectories.map((directory) => ({ name: directory.name }))
    : projectDirectory
      ? [{ name: projectDirectoryName }]
      : [];
  const activeShotIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeTask = taskShot ? shotTasks[taskShot.id] : undefined;
  const activeSubmitting = taskShot
    ? Boolean(submittingShots[taskShot.id])
    : false;
  const canRegenerate = Boolean(
    taskShot &&
    ["已完成", "失败", "文件缺失", "已停止"].includes(taskShot.state),
  );
  const activeStage = taskShot ? shotStages[taskShot.id] : undefined;
  const activeSegments = taskShot ? getPromptSegments(taskShot.id) : [];
  const activeSegmentIndex = taskShot
    ? Math.min(
        activePromptSegment[taskShot.id] ?? 0,
        Math.max(0, activeSegments.length - 1),
      )
    : 0;
  const durationSeconds = Number.parseFloat(duration) || 6;
  const settingsSegment =
    settingsSegmentIndex !== null ? activeSegments[settingsSegmentIndex] : null;
  useEffect(() => {
    const savedComfyUrl = window.localStorage.getItem("comfyui-url");
    if (savedComfyUrl) {
      setComfyUrl(savedComfyUrl);
      setComfyUrlDraft(savedComfyUrl);
    }
    setLlmExecutablePath(window.localStorage.getItem("llm-executable-path") ?? "");
  }, []);

  useEffect(() => {
    if (activeMode !== "R2VA" || !taskShot) return;
    setRef2vaFields((current) => {
      const existing = current[taskShot.id];
      const legacySoundscapes = [
        "McDonald's indoor ambience, customer conversations, footsteps, register beeps, paper movement, and synchronized object handling.",
        "Use only realistic, synchronized physical sounds directly supported by visible actions and objects, such as footsteps, breathing, fabric movement, door movement, and object handling. Do not add mood-setting ambience, horror atmosphere, emotional sound beds, drones, tension effects, or unrequested music.",
        "Use natural diegetic ambience and synchronized physical sound effects based on the visible environment and actions. Keep the sound realistic and grounded in the scene. Do not add unrelated sounds or invent additional dialogue. Spoken dialogue is defined only in detailed_description.",
        "Use realistic diegetic ambience appropriate to the visible environment, together with synchronized physical sounds directly supported by visible actions and objects. Keep all sounds natural and restrained. Do not add horror atmosphere, emotional sound beds, drones, tension effects, or unrequested music.",
      ];
      const nextSoundscape =
        !existing?.soundscape?.trim() ||
        legacySoundscapes.includes(existing.soundscape.trim())
          ? ref2vaDefaults.soundscape
          : existing.soundscape;
      const nextMusic = existing?.music?.trim() || ref2vaDefaults.music;
      if (
        existing?.soundscape === nextSoundscape &&
        existing?.music === nextMusic
      )
        return current;
      return {
        ...current,
        [taskShot.id]: {
          ...ref2vaDefaults,
          ...(existing ?? {}),
          soundscape: nextSoundscape,
          music: nextMusic,
        },
      };
    });
    const subjects = (promptSubjects[taskShot.id] ?? []).filter((subject) =>
      subject.name.trim(),
    );
    if (!subjects.length)
      return;
    const defaults = subjects
      .map((subject, index) => {
        const name = subject.name.trim();
        const isScene =
          /场景|环境|店|室内|街道|建筑|空间|background|environment/i.test(name);
        const isObject = /道具|物体|杯|票|餐|pizza|coffee|object|prop/i.test(
          name,
        );
        const text = isScene
          ? "preserve spatial layout, lighting, color palette, architectural structure, and key props."
          : isObject
            ? "preserve shape, material, color, size, and spatial relationships."
            : "preserve identity, facial features, hairstyle, and body proportions.";
        return `<Subject ${index + 1}> (appears throughout the target video): fully_preserved - ${text}`;
      })
      .join("\n");
    setRef2vaFields((current) => ({
      ...current,
      [taskShot.id]: {
        ...ref2vaDefaults,
        ...(current[taskShot.id] ?? {}),
        retentionAnalysis: defaults,
      },
    }));
  }, [activeMode, taskShot?.id, promptSubjects]);

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
      let localState: PersistedDirectorState | null = null;
      const persistedComfyUrl =
        window.localStorage.getItem("comfyui-url")?.trim() ||
        "http://127.0.0.1:8188";
      try {
        localState = JSON.parse(
          window.localStorage.getItem("comfyui-director-state") ?? "null",
        ) as PersistedDirectorState | null;
      } catch {
        // Ignore malformed local state and try the project state instead.
      }
      const indexedState =
        typeof indexedDB === "undefined"
          ? null
          : await loadDirectorState().catch(() => null);
      if (disposed) return;
      const savedProjectHandle =
        typeof indexedDB === "undefined"
          ? null
          : await loadProjectDirectoryHandle().catch(() => null);
      const projectHandle =
        savedProjectHandle &&
        (await isDirectoryHandleAvailable(savedProjectHandle))
          ? savedProjectHandle
          : null;
      if (savedProjectHandle && !projectHandle)
        void clearProjectDirectoryHandle().catch(() => undefined);
      if (projectHandle) {
        setProjectDirectory(projectHandle);
        setProjectDirectoryName(projectHandle.name || "项目目录");
      }
      const savedProjectHandles =
        typeof indexedDB === "undefined"
          ? []
          : await loadProjectDirectoryHandles().catch(() => []);
      const projectHandles = (
        await Promise.all(
          savedProjectHandles.map(async (handle) =>
            (await isDirectoryHandleAvailable(handle)) ? handle : null,
          ),
        )
      ).filter((handle): handle is FileSystemDirectoryHandle =>
        Boolean(handle),
      );
      if (projectHandles.length !== savedProjectHandles.length)
        void saveProjectDirectoryHandles(projectHandles).catch(() => undefined);
      if (projectHandles.length) setProjectDirectories(projectHandles);
      const saved: PersistedDirectorState = {
        ...(indexedState ?? {}),
        ...(localState ?? {}),
        referenceAssets: {
          ...(indexedState?.referenceAssets ?? {}),
          ...(localState?.referenceAssets ?? {}),
        },
      };
      const restoredSubjects = normalizePromptSubjects(saved.promptSubjects ?? {});
      const compactedReferences = compactPersistedReferences(
        saved.referenceAssets ?? {},
        restoredSubjects,
      );
      if (saved.shots?.length && !projectHandle) {
        setShots(saved.shots);
        setActiveShot((current) => Math.min(current, saved.shots!.length - 1));
      }
      if (saved.shotPrompts) {
        setShotPrompts(
          Object.fromEntries(
            Object.entries(saved.shotPrompts).map(([id, value]) => [
              id,
              normalizePrompt(value),
            ]),
          ),
        );
      }
      if (saved.promptBuilderSettings)
        setPromptBuilderSettings(saved.promptBuilderSettings);
      if (saved.promptSubjects) setPromptSubjects(compactedReferences.subjects);
      if (saved.promptSegments) setPromptSegments(saved.promptSegments);
      if (saved.ref2vaFields) setRef2vaFields(saved.ref2vaFields);
      if (saved.shotSettings) setShotSettings(saved.shotSettings);
      if (saved.shotVideos) setShotVideos(saved.shotVideos);
      if (saved.shotFileNames) setShotFileNames(saved.shotFileNames);
      if (saved.shotProgress) setShotProgress(saved.shotProgress);
      if (saved.generationDurations)
        setGenerationDurations(saved.generationDurations);
      if (saved.shotTasks) setShotTasks(saved.shotTasks);
      if (saved.shotStages) setShotStages(saved.shotStages);
      if (saved.keyframes)
        setKeyframes(
          Object.fromEntries(
            Object.entries(saved.keyframes).map(([key, frame]) => {
              const params = new URLSearchParams({
                filename: frame.comfyName ?? "",
                type: "input",
                comfy_url: persistedComfyUrl,
              });
              return [
                key,
                {
                  ...frame,
                  url: frame.comfyName ? `/api/video?${params.toString()}` : "",
                },
              ];
            }),
          ),
        );
      if (saved.referenceAssets)
        setReferenceAssets(
          Object.fromEntries(
            Object.entries(compactedReferences.references).map(([key, asset]) => {
              const params = new URLSearchParams({
                filename: asset.comfyName ?? "",
                type: "input",
                comfy_url: persistedComfyUrl,
              });
              if (asset.comfySubfolder)
                params.set("subfolder", asset.comfySubfolder);
              return [
                key,
                {
                  ...asset,
                  url: asset.comfyName ? `/api/video?${params.toString()}` : "",
                },
              ];
            }),
          ),
        );
      if (projectHandle) {
        try {
          const projectShots = await readProjectShots(projectHandle);
          // A readable project manifest is authoritative, including an empty
          // clips list. Never let the global fallback state leak into another
          // project's editor.
          resetProjectEditorState();
          if (projectShots) {
            const restoredAssets = applyProjectShotRecords(projectShots);
            await hydrateProjectReferenceAssets(
              projectHandle,
              restoredAssets,
              persistedComfyUrl,
            );
          }
          setActiveShot(0);
        } catch {
          // Keep local state when the persisted directory handle is unavailable.
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
    if (!storageReady) return;
    const persistedReferences = Object.fromEntries(
      Object.entries(referenceAssets).map(([key, asset]) => [
        key,
        {
          name: asset.name,
          comfyName: asset.comfyName,
          comfySubfolder: asset.comfySubfolder,
          kind: asset.kind,
          sourcePath: asset.sourcePath,
        },
      ]),
    );
    const persistedKeyframes = Object.fromEntries(
      Object.entries(keyframes).map(([key, frame]) => [
        key,
        { name: frame.name, comfyName: frame.comfyName },
      ]),
    );
    const state = {
      shots,
      shotPrompts,
      promptBuilderSettings,
      promptSubjects,
      promptSegments,
      ref2vaFields,
      shotSettings,
      shotVideos,
      shotFileNames,
      shotProgress,
      generationDurations,
      shotTasks,
      shotStages,
      keyframes: persistedKeyframes,
      referenceAssets: persistedReferences,
    };
    window.localStorage.setItem(
      "comfyui-director-state",
      JSON.stringify(state),
    );
    if (typeof indexedDB !== "undefined")
      void saveDirectorState(state).catch(() => {
        // Local storage remains available when IndexedDB is unavailable.
      });
  }, [
    storageReady,
    shots,
    shotPrompts,
    promptBuilderSettings,
    promptSubjects,
    promptSegments,
    ref2vaFields,
    shotSettings,
    shotVideos,
    shotFileNames,
    shotProgress,
    generationDurations,
    shotTasks,
    shotStages,
    keyframes,
    referenceAssets,
  ]);

  useEffect(() => {
    if (!storageReady || !projectDirectory) return;
    void refreshProjectTree();
  }, [storageReady, projectDirectory]);

  useEffect(() => {
    if (!projectDirectory || !storageReady || !shots.length) return;
    void (async () => {
      for (const shot of shots) {
        const settings = shotSettings[shot.id] ?? shotSettingDefaults;
        const promptData =
          optimizedPrompts[shot.id] ??
          shotPrompts[shot.id] ??
          (shot.id === taskShot?.id ? prompt : "");
        await writeClipManifest(shot, {
          generation: {
            mode: settings.mode,
            duration: Number.parseFloat(settings.duration) || 6,
            resolution: settings.resolution,
            aspect: settings.aspect,
            fps: Number.parseInt(settings.fps, 10) || 24,
            model: settings.model,
            turbo: settings.turbo,
            ...(shotTasks[shot.id]
              ? { seed: shotTasks[shot.id].seed, seedMode: shotTasks[shot.id].seedMode, steps: shotTasks[shot.id].steps }
              : {}),
            ...(shot.id === taskShot?.id && settings.mode === "I2VA"
              ? { keyframeMode }
              : {}),
          },
          promptOriginal: shotPrompts[shot.id] ??
            (shot.id === taskShot?.id ? prompt : ""),
          promptOptimized: optimizedPrompts[shot.id],
          prompt: promptData,
          output: shotVideos[shot.id] || shot.output
            ? (shotFileNames[shot.id] ?? shot.output ??
              `shot-${shot.id}-${safeFileStem(shot.title)}.mp4`)
            : undefined,
        });
      }
      await writeProjectManifest();
    })().catch(() => undefined);
  }, [
    projectDirectory,
    storageReady,
    shots,
    shotSettings,
    promptSubjects,
    promptSegments,
    shotPrompts,
    optimizedPrompts,
    shotVideos,
    shotFileNames,
    keyframeMode,
    referenceAssets,
  ]);

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
    setPrompt(normalizePrompt(shotPrompts[taskShot.id]));
    setPromptNotice(null);
    setSettingsSegmentIndex(null);
    setActivePromptSegment((current) => ({
      ...current,
      [taskShot.id]: Math.min(
        current[taskShot.id] ?? 0,
        Math.max(0, getPromptSegments(taskShot.id).length - 1),
      ),
    }));
    setVideoUrl(shotVideos[taskShot.id] ?? (taskShot as typeof taskShot & { output?: string }).output ?? null);
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
    if (!storageReady) return;
    const candidates = shots
      .filter(
        (shot) =>
          (shot.state === "已完成" || shot.state === "文件缺失") &&
          !shotTasks[shot.id] &&
          shotVideos[shot.id],
      )
      .map((shot) => {
        const stableFileName = `shot-${shot.id}-${safeFileStem(shot.title)}.mp4`;
        return {
          id: shot.id,
          state: shot.state,
          url: shotVideos[shot.id]!,
          stableFileName,
          fallbackUrl: `/api/video?filename=${encodeURIComponent(stableFileName)}&subfolder=director&comfy_url=${encodeURIComponent(comfyUrl)}`,
        };
      });
    if (!candidates.length) return;
    let disposed = false;
    const probe = async (url: string) => {
      let result: "exists" | "missing" | "unknown" = "unknown";
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { Range: "bytes=0-0" },
          signal: AbortSignal.timeout(2500),
        });
        result = response.ok
          ? "exists"
          : response.status === 404
            ? "missing"
            : "unknown";
        await response.body?.cancel();
      } catch {
        result = "unknown";
      }
      return result;
    };
    const verify = async ({
      id,
      state,
      url,
      stableFileName,
      fallbackUrl,
    }: (typeof candidates)[number]) => {
      let result = await probe(url);
      let resolvedUrl = url;
      if (result === "missing" && fallbackUrl !== url) {
        const fallbackResult = await probe(fallbackUrl);
        if (fallbackResult === "exists") {
          result = fallbackResult;
          resolvedUrl = fallbackUrl;
          setShotFileNames((current) =>
            current[id] === stableFileName
              ? current
              : { ...current, [id]: stableFileName },
          );
          setShotVideos((current) =>
            current[id] === fallbackUrl
              ? current
              : { ...current, [id]: fallbackUrl },
          );
        }
      }
      if (disposed || result === "unknown") return;
      if (result === "exists") {
        if (state === "文件缺失") {
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
  }, [storageReady, shots, shotVideos, shotFileNames, shotTasks]);

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
      settings?.resolution ?? nextShot.meta.split("·")[0].trim();
    setActiveShot(index);
    activeShotIdRef.current = nextShot.id;
    setPrompt(normalizePrompt(shotPrompts[nextShot.id]));
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
    if (nextShot.state !== "生成中")
      setShotProgress((current) => ({
        ...current,
        [nextShot.id]: nextShot.state === "已完成" ? 100 : 0,
      }));
    setDuration(
      settings?.duration ?? `${nextShot.detail.match(/\d+/)?.[0] ?? 6} 秒`,
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
    if (!title) return;
    const id = String(
      shots.reduce((max, shot) => Math.max(max, Number(shot.id) || 0), 0) + 1,
    ).padStart(2, "0");
    const shot = {
      id,
      title: title.trim(),
      detail: "6s · T2VA",
      meta: "864×480 · 16:9 · 24fps",
      state: "草稿",
    };
    setShots((current) => [...current, shot]);
    try {
      await writeClipManifest(shot, {
        generation: { mode: "T2VA", model: "H3", duration: 6, resolution: "864 × 480", aspect: "16:9", fps: 24, turbo: true, seed: "7483926150842719", seedMode: "fixed" },
        prompt: "",
      });
    } catch {
      setGenerationStatus(
        "片段已创建，但项目目录没有写入权限，请重新选择项目目录",
      );
    }
    setShotPrompts((current) => ({ ...current, [id]: "" }));
    setPromptBuilderSettings((current) => ({
      ...current,
      [id]: { ...promptBuilderDefaults },
    }));
    // Each shot owns its subjects and references. Reuse is explicit via the
    // subject library, so a new shot cannot accidentally process prior-shot
    // characters that were never added to it.
    setPromptSubjects((current) => ({ ...current, [id]: [] }));
    setRef2vaFields((current) => ({
      ...current,
      [id]: { ...ref2vaDefaults, retentionAnalysis: "" },
    }));
    setPromptSegments((current) => ({ ...current, [id]: [] }));
    setShotSettings((current) => ({
      ...current,
      [id]: { ...shotSettingDefaults },
    }));
    // A deleted shot may have reused this id. Never inherit its old keyframes.
    setKeyframes((current) => {
      const next = { ...current };
      Object.keys(next)
        .filter((key) => key.startsWith(`${id}-`))
        .forEach((key) => delete next[key]);
      return next;
    });
    setReferenceAssets((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${id}-`))),
    );
    const clearShotEntry = <T,>(current: Record<string, T>) => {
      const next = { ...current };
      delete next[id];
      return next;
    };
    setShotVideos(clearShotEntry);
    setShotFileNames(clearShotEntry);
    setGenerationDurations(clearShotEntry);
    setShotTasks(clearShotEntry);
    setShotStages(clearShotEntry);
    setSubmittingShots(clearShotEntry);
    setActivePromptSegment(clearShotEntry);
    setActiveShot(shots.length);
    activeShotIdRef.current = id;
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
    setShotProgress((current) => ({ ...current, [id]: 0 }));
    setAddDialog(false);
  }
  function renameShot(index: number) {
    setNewTitle(shots[index]?.title ?? "");
    setRenameIndex(index);
  }
  function confirmRenameShot() {
    if (renameIndex === null || !newTitle.trim()) return;
    const title = newTitle.trim();
    setShots((items) =>
      items.map((item, itemIndex) =>
        itemIndex === renameIndex ? { ...item, title } : item,
      ),
    );
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
    const deletedId = shots[index]?.id;
    if (deletedId && deleteFromDisk) {
      try {
        await deleteSavedShotFiles(deletedId, shots[index]?.title ?? "");
      } catch {
        if (activeShotIdRef.current === deletedId)
          setGenerationStatus("镜头已删除，但输出文件删除失败");
      }
    }
    const next = shots.filter((_, itemIndex) => itemIndex !== index);
    setShots(next);
    try {
      await writeProjectManifest(next);
    } catch {
      setGenerationStatus("片段已从当前界面移除，但项目清单写入失败");
    }
    if (deletedId) {
      setShotPrompts((current) => {
        const nextPrompts = { ...current };
        delete nextPrompts[deletedId];
        return nextPrompts;
      });
      setPromptBuilderSettings((current) => {
        const nextBuilder = { ...current };
        delete nextBuilder[deletedId];
        return nextBuilder;
      });
      setPromptSubjects((current) => {
        const nextSubjects = { ...current };
        delete nextSubjects[deletedId];
        return nextSubjects;
      });
      setRef2vaFields((current) => {
        const nextFields = { ...current };
        delete nextFields[deletedId];
        return nextFields;
      });
      setPromptSegments((current) => {
        const nextSegments = { ...current };
        delete nextSegments[deletedId];
        return nextSegments;
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
      setShotProgress((current) => {
        const nextProgress = { ...current };
        delete nextProgress[deletedId];
        return nextProgress;
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
      setPrompt(normalizePrompt(shotPrompts[nextShot.id]));
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
      [shotId]: { ...shotSettingDefaults, ...(current[shotId] ?? {}), [key]: value },
    }));
  }
  function ensureReferenceMode(shotId: string) {
    const current = shotSettings[shotId] ?? shotSettingDefaults;
    if (current.mode === "R2VA") return;
    const next = { ...current, mode: "R2VA" };
    setShotSettings((settings) => ({ ...settings, [shotId]: next }));
    if (taskShot?.id === shotId) setMode("R2VA");
  }
  function getShotSettings(shot: Shot) {
    return { ...shotSettingDefaults, ...(shotSettings[shot.id] ?? {}) };
  }
  function shotDetail(shot: Shot) {
    const settings = getShotSettings(shot);
    return `${settings.duration.replace(/\s*秒$/, "s")} · ${settings.mode} · ${settings.turbo ? "加速" : "标准"} · ${settings.resolution.replace(/\s*×\s*/, "×")} · ${settings.fps.replace(/\s+/g, "")}`;
  }
  function updatePromptBuilder<K extends keyof PromptBuilderSettings>(
    key: K,
    value: PromptBuilderSettings[K],
    segmentIndex = activeSegmentIndex,
  ) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSegments((current) => {
      const segments = current[shotId]?.length
        ? current[shotId].map((segment) => ({
            ...segment,
            settings: normalizePromptBuilderSettings(segment.settings),
          }))
        : [
            {
              id: `${shotId}-segment-1`,
              description: "",
              settings: normalizePromptBuilderSettings(
                current[shotId]?.[0]?.settings,
              ),
            },
          ];
      const segment = segments[segmentIndex] ?? segments[0];
      segments[segmentIndex] = {
        ...segment,
        settings: {
          ...promptBuilderDefaults,
          ...segment.settings,
          [key]: value,
        },
      };
      return { ...current, [shotId]: segments };
    });
    setPromptBuilderSettings((current) => ({
      ...current,
      [shotId]: { ...promptBuilderDefaults, ...current[shotId], [key]: value },
    }));
  }
  function resetPromptBuilder(segmentIndex = activeSegmentIndex) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSegments((current) => {
      const segments = [...getPromptSegments(shotId)];
      if (!segments[segmentIndex]) return current;
      segments[segmentIndex] = {
        ...segments[segmentIndex],
        settings: { ...promptBuilderDefaults },
      };
      return { ...current, [shotId]: segments };
    });
    setPromptBuilderSettings((current) => ({
      ...current,
      [shotId]: { ...promptBuilderDefaults },
    }));
  }
  function getPromptSegments(shotId: string) {
    const saved = promptSegments[shotId];
    const total = Number.parseFloat(duration) || 6;
    if (saved?.length) {
      return saved.map((segment, index) => ({
        ...segment,
        settings: normalizePromptBuilderSettings(segment.settings),
        start:
          typeof segment.start === "number"
            ? segment.start
            : index === 0
              ? 0
              : (total * index) / saved.length,
        end:
          typeof segment.end === "number"
            ? segment.end
            : (total * (index + 1)) / saved.length,
      }));
    }
    return [
      {
        id: `${shotId}-segment-1`,
        description: "",
        settings: normalizePromptBuilderSettings(promptBuilderSettings[shotId]),
        start: 0,
        end: total,
      },
    ];
  }
  async function bindProjectAsset(asset: ProjectTreeAsset) {
    const shotId = taskShot?.id;
    if (!shotId || !projectDirectory) return;
    ensureReferenceMode(shotId);
    try {
      const folderName =
        asset.type === "character"
          ? "角色"
          : asset.type === "clothing"
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
      const manifestName =
        asset.type === "clothing"
          ? "clothing.json"
          : asset.type === "prop"
            ? "prop.json"
            : asset.type === "scene"
              ? "scene.json"
              : "asset.json";
      const folder = await getProjectAssetFolder(projectDirectory, folderName);
      let assetDirectory: FileSystemDirectoryHandle | null = null;
      let directFile: File | null = null;
      try {
        directFile = await (await folder.getFileHandle(asset.name)).getFile();
      } catch {
        assetDirectory = await folder.getDirectoryHandle(asset.name);
      }
      const data = assetDirectory
        ? (JSON.parse(
            await (
              await assetDirectory.getFileHandle(manifestName)
            ).getFile().then((file) => file.text()),
          ) as {
            references?: Array<{ file?: string; role?: string; mimeType?: string }>;
          })
        : null;
      const uploadedKeys: string[] = [];
      const uploadedRoles: string[] = [];
      const sourceFiles = directFile
        ? [{
            file: directFile,
            role:
              asset.type === "character"
                ? "character"
                : asset.type === "clothing"
                ? "clothing"
                : asset.type === "prop"
                  ? "object"
                  : asset.type === "scene"
                    ? "environment"
                    : "composite",
          }]
        : (data?.references ?? [])
            .filter((reference) => reference.file)
            .map(async (reference) => ({
              file: await (
                await assetDirectory!.getFileHandle(reference.file!)
              ).getFile(),
              role:
                reference.role ??
                (asset.type === "character"
                  ? "character"
                  : asset.type === "clothing"
                  ? "clothing"
                  : asset.type === "prop"
                    ? "object"
                    : asset.type === "scene"
                      ? "environment"
                      : "composite"),
            }));
      const resolvedSourceFiles = directFile
        ? sourceFiles
        : await Promise.all(sourceFiles);
      for (const sourceEntry of resolvedSourceFiles) {
        const file = sourceEntry.file;
        const kind: ReferenceKind = file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("video/")
            ? "video"
            : "image";
        const role = sourceEntry.role;
        const existingKey = Object.entries(referenceAssets).find(
          ([key, existing]) =>
            key.startsWith(`${shotId}-${kind}-`) &&
            existing.kind === kind &&
            existing.name.trim().toLowerCase() === file.name.trim().toLowerCase(),
        )?.[0];
        if (existingKey) {
          uploadedKeys.push(existingKey);
          uploadedRoles.push(role);
          continue;
        }
        const index = nextReferenceIndex(shotId, kind, uploadedKeys);
        const key = referenceKey(shotId, kind, index);
        const uploaded = await uploadReferenceFile(file, kind, comfyUrl);
        setReferenceAssets((current) => ({
          ...current,
          [key]: {
            name: file.name,
            url: URL.createObjectURL(file),
            ...uploaded,
            sourcePath: `资产/${folderName}/${asset.name}${directFile ? "" : `/${file.name}`}`,
          },
        }));
        uploadedKeys.push(key);
        uploadedRoles.push(role);
      }
      const parsedAsset = parseProjectAssetName(asset.name);
      setPromptSubjects((current) => {
        const subjects = [...(current[shotId] ?? [])];
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
  function changeGenerationMode(nextMode: string) {
    setMode(nextMode);
    updateSetting("mode", nextMode);
    const shot = shots[activeShot];
    if (shot) {
      const settings = {
        ...shotSettingDefaults,
        ...(shotSettings[shot.id] ?? {}),
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
        prompt:
          optimizedPrompts[shot.id] ??
          shotPrompts[shot.id] ??
          (shot.id === taskShot?.id ? prompt : ""),
      });
    }
  }
  function openPromptViewer() {
    setPromptDraft(
      taskShot ? optimizedPrompts[taskShot.id] ?? prompt : prompt,
    );
    setPromptViewerOpen(true);
  }
  function savePromptDraft() {
    if (!taskShot) return;
    const nextPrompt = promptDraft.trim();
    setOptimizedPrompts((current) => ({ ...current, [taskShot.id]: nextPrompt }));
    setPromptViewerOpen(false);
    setPromptNotice({ type: "success", text: "优化提示词已保存" });
  }  function shotElapsed(shotId: string) {
    const task = shotTasks[shotId];
    return task ? elapsedNow - task.startedAt : generationDurations[shotId];
  }
  function stageForNode(nodeId: string | null | undefined) {
    if (!nodeId) return null;
    if (
      ["119", "120", "127", "128", "134", "135", "143", "144", "145"].includes(
        nodeId,
      )
    )
      return "加载模型";
    if (
      [
        "125",
        "124",
        "123",
        "126",
        "131",
        "132",
        "133",
        "136",
        "137",
        "138",
        "139",
      ].includes(nodeId)
    )
      return "正在采样";
    if (["121", "122"].includes(nodeId)) return "解码视频";
    if (nodeId === "130") return "封装视频";
    if (nodeId === "92") return "保存视频";
    return null;
  }
  function resetProjectEditorState() {
    setShots([]);
    setActiveShot(0);
    setPrompt("");
    setVideoUrl(null);
    setShotPrompts({});
    setPromptBuilderSettings({});
    setPromptSubjects({});
    setPromptSegments({});
    setRef2vaFields({});
    setActivePromptSegment({});
    setShotSettings({});
    setShotVideos({});
    setShotFileNames({});
    setShotProgress({});
    setGenerationDurations({});
    setShotTasks({});
    setShotStages({});
    setSubmittingShots({});
    setKeyframes({});
    setReferenceAssets({});
    setPromptViewerOpen(false);
    setSettingsSegmentIndex(null);
  }
  async function chooseProjectDirectory() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setGenerationStatus("当前浏览器不支持本地项目目录");
      return;
    }
    try {
      const directory = await picker();
      const writable = directory as WritableDirectoryHandle;
      const permission = writable.requestPermission
        ? await writable.requestPermission({ mode: "readwrite" })
        : "granted";
      if (permission !== "granted") {
        setGenerationStatus("没有项目目录写入权限");
        return;
      }
      const assets = await directory.getDirectoryHandle("资产", {
        create: true,
      });
      for (const folderName of projectAssetFolders)
        await assets.getDirectoryHandle(folderName, { create: true });
      await directory.getDirectoryHandle("片段", { create: true });
      await directory.getDirectoryHandle("输出", { create: true });
      resetProjectEditorState();
      setProjectDirectory(directory);
      setProjectDirectories((current) => {
        const next = [
          ...current.filter((item) => item.name !== directory.name),
          directory,
        ];
        void saveProjectDirectoryHandles(next);
        return next;
      });
      setProjectDirectoryName(directory.name || "项目目录");
      void saveProjectDirectoryHandle(directory);
      try {
        const file = await directory.getFileHandle("script.json", {
          create: true,
        });
        const writable = await file.createWritable();
        await writable.write(
          JSON.stringify(
            {
              project: { name: directory.name || "未命名项目", version: 1 },
              clips: [],
            },
            null,
            2,
          ),
        );
        await writable.close();
      } catch {
        /* Keep the selected directory usable if manifest creation is unavailable. */
      }
      setGenerationStatus(`项目目录已就绪：${directory.name || "未命名项目"}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setGenerationStatus("创建项目目录失败");
    }
  }
  async function importProjectDirectory() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setGenerationStatus("当前浏览器不支持导入本地项目");
      return;
    }
    try {
      const directory = await picker();
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
          // Accept old projects whose asset categories live at the project root.
          if (folder === "资产") {
            let hasLegacyAssets = false;
            for (const assetFolder of projectAssetFolders) {
              try {
                await directory.getDirectoryHandle(assetFolder);
                hasLegacyAssets = true;
                break;
              } catch {
                /* Continue checking legacy folders. */
              }
            }
            if (hasLegacyAssets) continue;
          }
          missing.push(folder);
        }
      }
      resetProjectEditorState();
      setProjectDirectory(directory);
      setProjectDirectories((current) => {
        const next = [
          ...current.filter((item) => item.name !== directory.name),
          directory,
        ];
        void saveProjectDirectoryHandles(next);
        return next;
      });
      setProjectDirectoryName(directory.name || "导入项目");
      void saveProjectDirectoryHandle(directory);
      try {
        const loaded = await readProjectShots(directory);
        if (loaded) {
          const restoredAssets = applyProjectShotRecords(loaded);
          await hydrateProjectReferenceAssets(
            directory,
            restoredAssets,
            comfyUrl,
          );
        }
      } catch {
        // Keep an empty editor for projects without a readable manifest.
      }
      setGenerationStatus(
        missing.length
          ? `项目已导入，但缺少目录：${missing.join("、")}`
          : `项目已导入：${directory.name || "未命名项目"}`,
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setGenerationStatus("导入项目失败");
    }
  }
  async function refreshProjectTree() {
    if (!projectDirectory) {
      setGenerationStatus("请先新建或导入项目");
      return;
    }
    const assets: ProjectTreeAsset[] = [];
    for (const type of [
      "character",
      "scene",
      "clothing",
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
            : type === "clothing"
              ? "服装"
              : type === "prop"
                ? "道具"
                : type === "video"
                  ? "视频"
                : type === "audio"
                  ? "音频"
                  : "自定义";
        const folder = await getProjectAssetFolder(
          projectDirectory,
          folderName,
        );
        for await (const [name, entry] of folder.entries()) {
          if (type === "character" && entry.kind === "directory") continue;
          const assetType =
            type === "scene" && entry.kind === "directory" ? "scene" : type;
          assets.push({
            name,
            type: assetType,
            thumbnail:
              entry.kind === "file"
                ? await readAssetFileThumbnail(entry)
                : assetType === "clothing"
                  ? await readAssetThumbnail(
                      await folder.getDirectoryHandle(name),
                    )
                  : undefined,
          });
        }
      } catch {
        /* Optional asset folders are created on demand. */
      }
    }
    setProjectAssets(assets);
    let outputFiles: string[] | null = null;
    try {
      const output = await projectDirectory.getDirectoryHandle("输出");
      outputFiles = [];
      for await (const [name] of output.entries()) outputFiles.push(name);
    } catch {
      /* Imported projects may not have an output folder yet. */
    }
    setProjectOutputFiles(outputFiles);
    setGenerationStatus(`项目树已刷新，找到 ${assets.length} 个资产`);
  }
  function applyProjectShotRecords(records: ProjectShotRecord[]) {
    setShots(
      records.map(
        ({ generation: _generation, references: _references, ...shot }) => shot,
      ),
    );
    const settings = Object.fromEntries(
      records
        .filter((record) => record.generation)
        .map((record) => [
          record.id,
          {
            ...shotSettingDefaults,
            ...(shotSettings[record.id] ?? {}),
            ...(record.generation?.mode ? { mode: record.generation.mode } : {}),
            ...(record.generation?.duration ? { duration: `${record.generation.duration} 秒` } : {}),
            ...(record.generation?.resolution ? { resolution: record.generation.resolution.replace(/\s*[x×]\s*/i, " × ") } : {}),
            ...(record.generation?.aspect ? { aspect: record.generation.aspect } : {}),
            ...(record.generation?.fps ? { fps: `${record.generation.fps} fps` } : {}),
            ...(record.generation?.model ? { model: record.generation.model } : {}),
            ...(typeof record.generation?.turbo === "boolean" ? { turbo: record.generation.turbo } : {}),
          },
        ]),
    );
    setShotSettings(settings);
    setShotPrompts(
      Object.fromEntries(
        records
          .filter((record) => record.prompt)
          .map((record) => [
            record.id,
            normalizePrompt(record.promptOriginal ?? record.prompt),
          ]),
      ),
    );
    setOptimizedPrompts(
      Object.fromEntries(
        records
          .filter((record) => record.promptOptimized?.trim())
          .map((record) => [record.id, record.promptOptimized!.trim()]),
      ),
    );
    const restored: Record<string, PromptSubject[]> = {};
    const restoredReferenceAssets: Record<string, ReferenceAsset> = {};
    records.forEach((record) => {
      const shotReferences = restoreProjectShotReferences(
        record.references?.subjects,
        comfyUrl,
      );
      restored[record.id] = shotReferences.subjects;
      Object.assign(restoredReferenceAssets, shotReferences.referenceAssets);
    });
    setPromptSubjects(restored);
    setReferenceAssets(restoredReferenceAssets);
    return restoredReferenceAssets;
  }
  async function hydrateProjectReferenceAssets(
    project: FileSystemDirectoryHandle,
    assets: Record<string, ReferenceAsset>,
    comfyUrlValue: string,
  ) {
    const nextAssets = { ...assets };
    let restoredCount = 0;
    let missingCount = 0;
    for (const [assetKey, asset] of Object.entries(assets)) {
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
        const uploaded = await uploadReferenceFile(
          sourceFile,
          asset.kind,
          comfyUrlValue,
        );
        nextAssets[assetKey] = {
          ...asset,
          ...uploaded,
          url: referenceAssetUrl(uploaded, comfyUrlValue),
        };
        restoredCount += 1;
      } catch {
        missingCount += 1;
      }
    }
    if (restoredCount) setReferenceAssets(nextAssets);
    if (restoredCount || missingCount)
      setGenerationStatus(
        missingCount
          ? `已重新上传 ${restoredCount} 个引用，${missingCount} 个源文件无法恢复`
          : `已重新上传 ${restoredCount} 个项目引用`,
      );
  }
  async function selectProjectByName(name: string) {
    const handle = projectDirectories.find(
      (directory) => directory.name === name,
    );
    if (!handle) return;
    if (projectDirectory?.name === name) return;
    resetProjectEditorState();
    setProjectDirectory(handle);
    setProjectDirectoryName(handle.name);
    try {
      const loaded = await readProjectShots(handle);
      if (loaded) {
        const restoredAssets = applyProjectShotRecords(loaded);
        await hydrateProjectReferenceAssets(handle, restoredAssets, comfyUrl);
      }
      setActiveShot(0);
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "NotFound")
      ) {
        const next = projectDirectories.filter(
          (directory) => directory.name !== name,
        );
        setProjectDirectories(next);
        void saveProjectDirectoryHandles(next).catch(() => undefined);
        if (projectDirectory?.name === name) {
          setProjectDirectory(null);
          setProjectDirectoryName("未选择项目目录");
          setProjectAssets([]);
          setProjectOutputFiles(null);
          setShots([]);
          setActiveShot(0);
          void clearProjectDirectoryHandle().catch(() => undefined);
        }
        setGenerationStatus(`项目“${name}”已在电脑上删除，已从列表移除`);
      } else {
        setGenerationStatus(
          `项目“${handle.name}”的片段文件暂时无法读取，当前编辑区已清空`,
        );
      }
      return;
    }
    setGenerationStatus(`已切换项目：${handle.name}`);
  }
  function assetFolderName(asset: ProjectTreeAsset) {
    return asset.type === "character"
      ? "角色"
      : asset.type === "scene"
      ? "场景"
      : asset.type === "clothing"
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
      : asset.type === "clothing"
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
          subjects
            .map((subject) => ({
              ...subject,
              assetKeys: subject.assetKeys.filter(
                (key) => !matchesAsset(referenceAssets[key]?.sourcePath),
              ),
              children: (subject.children ?? []).map((child) => ({
                ...child,
                assetKeys: child.assetKeys.filter(
                  (key) => !matchesAsset(referenceAssets[key]?.sourcePath),
                ),
              })),
            }))
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
      // Assets may be either uploaded files or asset directories. Resolve the
      // same canonical location used by the scanner, with legacy fallback.
      let folder: FileSystemDirectoryHandle;
      try {
        const assetsRoot = await projectDirectory.getDirectoryHandle("资产");
        folder = await assetsRoot.getDirectoryHandle(folderName);
      } catch {
        folder = await projectDirectory.getDirectoryHandle(folderName);
      }
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
  function saveEngineSettings() {
    const draft = comfyUrlDraft.trim();
    try {
      const parsed = new URL(draft);
      if (!["http:", "https:"].includes(parsed.protocol))
        throw new Error("protocol");
      const normalized = parsed.toString().replace(/\/+$/, "");
      setComfyUrl(normalized);
      window.localStorage.setItem("comfyui-url", normalized);
      window.localStorage.setItem("llm-executable-path", llmExecutablePath.trim());
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
              <h2 className="text-sm font-semibold">导演台设置</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">
                配置 ComfyUI 连接和提示词优化服务。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEngineSettingsOpen(false)}
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="关闭导演台设置"
            >
              <X className="size-4" />
            </button>
          </div>
          <label htmlFor="comfyui-url" className="field-label mt-5">
            连接地址
          </label>
          <input
            id="comfyui-url"
            value={comfyUrlDraft}
            onChange={(event) => setComfyUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveEngineSettings();
              }
              if (event.key === "Escape") setEngineSettingsOpen(false);
            }}
            placeholder="http://127.0.0.1:8188"
            className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 font-mono text-xs outline-none focus:border-primary/60"
            autoFocus
          />
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            示例：http://127.0.0.1:8188 或局域网地址 http://192.168.1.20:8188。
          </p>
          <div className="mt-5 border-t border-border pt-4">
            <span className="field-label">本地 Agent CLI</span>
            <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
              填写用于优化 H3 提示词的本地命令行 Agent，系统会根据可执行文件名自动识别。
            </p>
            <div className="mt-3 space-y-3">
              <label className="block"><span className="field-label">Agent 可执行程序路径</span><input value={llmExecutablePath} onChange={(event) => setLlmExecutablePath(event.target.value)} placeholder="留空使用 PATH 中的 codex" className="mt-1 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 font-mono text-xs outline-none focus:border-primary/60" /></label>
              <p className="text-[9px] leading-4 text-muted-foreground">支持 Codex、Claude Code 和 Gemini CLI。请填写具体可执行文件，而不是其所在文件夹；留空时默认使用系统 PATH 中的 codex。</p>
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
  function requestProjectDeletion(name: string) {
    setProjectDeleteCandidate(name);
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
    const next = knownDirectories.filter(
      (directory) => directory.name !== name,
    );
    if (next.length === knownDirectories.length) return;
    setProjectDirectories(next);
    await saveProjectDirectoryHandles(next).catch(() => undefined);
    if (projectDirectory?.name !== name) {
      setProjectDeleteCandidate(null);
      setGenerationStatus(`项目“${name}”已从导演台移除，磁盘文件未改动`);
      return;
    }
    const nextHandle = next[0];
    if (!nextHandle) {
      setProjectDirectory(null);
      setProjectDirectoryName("未选择项目目录");
      setProjectAssets([]);
      setProjectOutputFiles(null);
      setShots([]);
      setActiveShot(0);
      await clearProjectDirectoryHandle().catch(() => undefined);
      setProjectDeleteCandidate(null);
      setGenerationStatus(`项目“${name}”已从导演台移除，磁盘文件未改动`);
      return;
    }
    setProjectDirectory(nextHandle);
    setProjectDirectoryName(nextHandle.name);
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
        `项目“${name}”已从导演台移除，已切换到“${nextHandle.name}”，磁盘文件未改动`,
      );
  }
  async function deleteProjectByName(name: string) {
    const knownDirectories = [
      ...projectDirectories,
      ...(projectDirectory &&
      !projectDirectories.some(
        (directory) => directory.name === projectDirectory.name,
      )
        ? [projectDirectory]
        : []),
    ];
    const handle = knownDirectories.find(
      (directory) => directory.name === name,
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
      const entries: string[] = [];
      for await (const [entryName] of handle.entries()) entries.push(entryName);
      for (const entryName of entries)
        await writable.removeEntry(entryName, { recursive: true });
      const next = knownDirectories.filter(
        (directory) => directory.name !== name,
      );
      setProjectDirectories(next);
      void saveProjectDirectoryHandles(next);
      const deletingActive = projectDirectory?.name === name;
      if (deletingActive) {
        const nextHandle = next[0];
        if (nextHandle) {
          resetProjectEditorState();
          setProjectDirectory(nextHandle);
          setProjectDirectoryName(nextHandle.name);
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
          setShots([]);
          setActiveShot(0);
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
    const name = projectDeleteCandidate;
    setProjectDeleteCandidate(null);
    if (name) void deleteProjectByName(name);
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
                {projectDeleteCandidate}
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
                void removeProjectFromDirector(projectDeleteCandidate)
              }
              className="h-auto w-full justify-start gap-2 px-3 py-2.5 text-left"
            >
              <FolderInput className="size-4 shrink-0 text-primary" />
              <span>
                <span className="block text-xs font-medium">
                  仅从导演台移除
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
          : kind === "clothing"
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
        type: "clothing",
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
                          : assetType === "clothing"
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
  async function writeProjectManifest(shotList = shots) {
    if (!projectDirectory) return;
    const file = await projectDirectory.getFileHandle("script.json", {
      create: true,
    });
    const writable = await file.createWritable();
    await writable.write(
      JSON.stringify(
        {
          project: { name: projectDirectoryName, version: 1 },
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
    shot: { id: string; title: string },
    overrides: Record<string, unknown> = {},
  ) {
    if (!projectDirectory) return;
    const permission = projectDirectory.queryPermission
      ? await projectDirectory.queryPermission({ mode: "readwrite" })
      : "granted";
    if (permission !== "granted" && projectDirectory.requestPermission) {
      const requested = await projectDirectory.requestPermission({
        mode: "readwrite",
      });
      if (requested !== "granted") {
        setGenerationStatus("项目目录写入权限已失效，请重新选择项目目录");
        return;
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
    const serializeReference = (assetKey: string, role: string) => ({
      assetKey,
      role: role === "clothing" ? "wardrobe" : role,
      ...(referenceAssets[assetKey]
        ? {
            name: referenceAssets[assetKey].name,
            kind: referenceAssets[assetKey].kind,
            comfyName: referenceAssets[assetKey].comfyName,
            comfySubfolder: referenceAssets[assetKey].comfySubfolder,
            ...(referenceAssets[assetKey].sourcePath ? { sourcePath: referenceAssets[assetKey].sourcePath } : {}),
          }
        : {}),
    });
    const relationForRole = (role: string) =>
      role === "clothing"
        ? "worn_by"
        : role === "object"
          ? "held_by"
          : role === "environment"
            ? "located_in"
            : "associated_with";
    const subjects: PersistedPromptSubject[] = shotSubjects
      .filter((subject) => subject.name.trim())
      .flatMap((subject) => {
        const references = subject.assetKeys.map((assetKey) =>
          serializeReference(
            assetKey,
            subject.assetRoles?.[assetKey] ?? "composite",
          ),
        );
        const children = (subject.children ?? []).map((child) => {
          const childRole =
            child.assetKeys
              .map((assetKey) => child.assetRoles?.[assetKey])
              .find(Boolean) ?? "composite";
          return {
            subjectId: `subject-${shot.id}-${safeFileStem(child.name.trim())}`,
            name: child.name.trim(),
            role: childRole === "clothing" ? "wardrobe" : childRole,
            relation: {
              type: relationForRole(childRole),
              parentSubjectId: `subject-${shot.id}-${safeFileStem(subject.name.trim())}`,
            },
            references: child.assetKeys.map((assetKey) =>
              serializeReference(
                assetKey,
                child.assetRoles?.[assetKey] ?? childRole,
              ),
            ),
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
    const manifestMode =
      (overrides.generation as { mode?: string } | undefined)?.mode ?? "T2VA";
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
    const { promptOriginal, promptOptimized, prompt: fallbackPrompt, ...restOverrides } = overrides as Record<string, unknown> & {
      promptOriginal?: unknown;
      promptOptimized?: unknown;
      prompt?: unknown;
    };
    const originalPrompt =
      typeof promptOriginal === "string"
        ? promptOriginal
        : normalizePrompt(fallbackPrompt);
    const optimizedPrompt =
      typeof promptOptimized === "string" && promptOptimized.trim()
        ? promptOptimized
        : undefined;
    const manifestPrompt =
      manifestMode === "R2VA"
        ? {
            original: originalPrompt,
            ...(optimizedPrompt
              ? { optimized: toRef2vaPromptManifest(optimizedPrompt) }
              : {}),
            selected: optimizedPrompt ? "optimized" : "original",
          }
        : optimizedPrompt ?? originalPrompt;
    const manifestOverrides = { ...restOverrides, prompt: manifestPrompt };
    await writable.write(
      JSON.stringify(
        {
          id: shot.id,
          title: shot.title,
          ...(manifestMode === "R2VA" && referencedSubjects.length
            ? { references: { subjects: referencedSubjects } }
            : {}),
          ...manifestOverrides,
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
    if (!projectDirectory || !videoUrl) return false;
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
    return true;
  }
  async function loadArchivedShotVideo(shot: { id: string; title: string }) {
    if (!projectDirectory) return null;
    const fileName = shotFileNames[shot.id] ?? (shot as typeof shot & { output?: string }).output;
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
    if (!source) {
      if (activeShotIdRef.current === shotId)
        setGenerationStatus("已完成，但未找到 ComfyUI 输出文件");
      return;
    }
    try {
      const elapsedMilliseconds = Date.now() - task.startedAt;
      const metadata = {
        id: shotId,
        file: task.fileName,
        shot_title: task.title,
        source,
        source_subfolder: sourceSubfolder ?? "",
        script: task.prompt,
        seed: task.seed,
        noise_seed: task.seed,
        seed_mode: task.seedMode,
        prompt_id: task.promptId,
        model: task.model,
        mode: task.mode,
        turbo: task.turbo,
        steps: task.steps,
        keyframe_mode: task.keyframeMode,
        input_image: task.inputImage ?? null,
        last_image: task.lastImage ?? null,
        reference_images: task.referenceImages ?? [],
        reference_videos: task.referenceVideos ?? [],
        reference_audios: task.referenceAudios ?? [],
        generation_duration_ms: elapsedMilliseconds,
        generation_duration: formatElapsed(elapsedMilliseconds),
        duration: task.duration,
        resolution: task.resolution,
        aspect: task.aspect,
        fps: task.fps,
        generated_at: new Date().toISOString(),
      };
      const payload = JSON.stringify({
        shot_id: shotId,
        shot_title: task.title,
        file_name: task.fileName,
        source,
        source_subfolder: sourceSubfolder ?? "",
        comfy_url: comfyUrl,
        metadata,
      });
      let finalUrl = url;
      const sourceName = source.split(/[\\/]/).pop() ?? "";
      const sourceFileName = sourceName
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
        .trim()
        .replace(/[. ]+$/g, "");
      let finalName = sourceFileName || task.fileName;
      try {
        let response: Response | null =
          comfyUrl === "http://127.0.0.1:8188"
            ? await fetch("http://127.0.0.1:3101/finalize-output", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
              })
            : null;
        if (!response || !response.ok) {
          response = await fetch("/api/output/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          });
        }
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
      setShotFileNames((current) => ({ ...current, [shotId]: finalName }));
      setShotVideos((current) => ({ ...current, [shotId]: finalUrl }));
      let archivedToProject = false;
      let archiveFailed = false;
      try {
        const targetShot = { id: shotId, title: task.title };
        archivedToProject = await archiveShotVideo(
          targetShot,
          finalUrl,
          finalName,
        );
        if (archivedToProject) {
          await writeClipManifest(targetShot, { output: finalName });
          await fetch("/api/output/cleanup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              filename: finalName,
              subfolder: "director",
              comfy_url: comfyUrl,
            }),
          });
        }
      } catch {
        archiveFailed = true;
        setGenerationStatus("视频已生成，但归档到项目片段目录失败");
      }
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
            ? "已完成，视频已复制到当前项目片段"
            : "生成完成，但归档到项目片段目录失败",
        );
      }
    } catch (error) {
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
    pendingKeys: string[] = [],
  ) {
    const prefix = `${shotId}-${kind}-`;
    const indices = [...Object.keys(referenceAssets), ...pendingKeys]
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
    return subjects.map((subject) => ({
      ...subject,
      assetKeys: subject.assetKeys
        .map(remap)
        .filter((assetKey): assetKey is string => Boolean(assetKey)),
      children: subject.children?.map((child) => ({
        ...child,
        assetKeys: child.assetKeys
          .map(remap)
          .filter((assetKey): assetKey is string => Boolean(assetKey)),
      })),
    }));
  }

  async function uploadReference(
    event: React.ChangeEvent<HTMLInputElement>,
    kind: ReferenceKind,
    index: number,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !taskShot) return;
    const key = referenceKey(taskShot.id, kind, index);
    const url = URL.createObjectURL(file);
    setReferenceAssets((current) => ({
      ...current,
      [key]: { name: file.name, url, kind },
    }));
    try {
      const form = new FormData();
      form.append("image", file, file.name);
      form.append("kind", kind);
      form.append("comfy_url", comfyUrl);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const uploaded = (await response.json().catch(() => ({}))) as {
        name?: string;
        subfolder?: string;
        error?: string;
      };
      if (!response.ok || !uploaded.name)
        throw new Error(
          uploaded.error ?? `上传参考素材失败（HTTP ${response.status}）`,
        );
      setReferenceAssets((current) => ({
        ...current,
        [key]: {
          name: file.name,
          url,
          comfyName: uploaded.name,
          comfySubfolder: uploaded.subfolder || undefined,
          kind,
        },
      }));
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? `参考素材上传失败：${error.message}`
          : "参考素材上传失败",
      );
    }
  }

  function removeReference(kind: ReferenceKind, index: number) {
    if (!taskShot) return;
    const key = referenceKey(taskShot.id, kind, index);
    const asset = referenceAssets[key];
    if (asset?.url.startsWith("blob:")) URL.revokeObjectURL(asset.url);
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
          if (!asset) {
            event.preventDefault();
            setReferencePickerTarget({ kind, index });
            setAssetPickerView("actions");
            setAssetPickerCategory(null);
            setAssetSubjectPickerOpen(true);
          }
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
          ready: true,
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
    const token = `${option.name} `;
    const nextPrompt = `${prompt.slice(0, promptMention.start)}${token}${prompt.slice(promptMention.end)}`;
    const nextCaret = promptMention.start + token.length;
    setPrompt(nextPrompt);
    setShotPrompts((current) => ({ ...current, [taskShot.id]: nextPrompt }));
    setPromptMention(null);
    window.requestAnimationFrame(() => {
      const textarea = promptRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  async function optimizeH3Prompt() {
    if (!taskShot || !prompt.trim() || promptOptimizing) return;
    if (!llmExecutablePath.trim()) {
      const message = "请先在导演台设置中配置本地 Agent 的可执行程序路径";
      setGenerationStatus(message);
      window.alert(message);
      setEngineSettingsOpen(true);
      return;
    }
    setPromptOptimizing(true);
    setGenerationStatus("正在使用本地 Agent CLI 优化提示词…");
    try {
      const shotSubjects = [
        ...(promptSubjects[taskShot.id] ?? []),
        ...(promptSubjects[taskShot.id] ?? []).flatMap(
          (subject) => subject.children ?? [],
        ),
      ];
      const referenceMapping: H3ReferenceMapping[] = shotSubjects.flatMap(
        (subject) =>
          subject.assetKeys.flatMap((assetKey) => {
            const match = assetKey.match(
              new RegExp(`^${taskShot.id}-(image|video|audio)-(\\d+)$`),
            );
            const asset = referenceAssets[assetKey];
            if (!match || !asset) return [];
            const kind = match[1] as ReferenceKind;
            const label = kind === "image" ? "Picture" : kind === "video" ? "Video" : "Audio";
            const parsedAsset = asset.sourcePath
              ? parseProjectAssetName(asset.name)
              : null;
            return [{
              picture: `<${label} ${Number(match[2]) + 1}>`,
              subject: parsedAsset?.name || subject.name.trim(),
              role: subject.assetRoles?.[assetKey] ?? "composite",
              assetName: asset.name,
              usage: parsedAsset?.usage,
              description: parsedAsset?.description,
            }];
          }),
      );
      const response = await fetch("/api/optimize-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: activeMode,
          duration: Number.parseFloat(duration) || 6,
          referenceMapping,
          executablePath: llmExecutablePath.trim() || undefined,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { prompt?: string; error?: string };
      if (!response.ok || typeof result.prompt !== "string" || !result.prompt.trim())
        throw new Error(result.error || "提示词优化失败");
      setOptimizedPrompts((current) => ({
        ...current,
        [taskShot.id]: result.prompt!,
      }));
      setGenerationStatus("提示词优化完成");
    } catch (error) {
      setGenerationStatus(error instanceof Error ? error.message : "提示词优化失败");
    } finally {
      setPromptOptimizing(false);
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
      const url = URL.createObjectURL(blob);
      const key = `${nextShot.id}-首帧`;
      setKeyframes((current) => ({
        ...current,
        [key]: { name: fileName, url },
      }));
      setShotSettings((current) => ({
        ...current,
        [nextShot.id]: {
          ...(current[nextShot.id] ?? shotSettingDefaults),
          mode: "I2VA",
        },
      }));
      setKeyframeMode("first");
      const form = new FormData();
      form.append("image", new File([blob], fileName, { type: "image/png" }));
      form.append("comfy_url", comfyUrl);
      const response = await fetch("/api/upload", {
        method: "POST",
        body: form,
      });
      const uploaded = (await response.json()) as { name?: string };
      if (!response.ok || !uploaded.name) throw new Error("上传首帧失败");
      setKeyframes((current) => ({
        ...current,
        [key]: { name: fileName, url, comfyName: uploaded.name },
      }));
      setGenerationStatus(`已将当前帧设为片段 ${nextShot.id} 首帧`);
    } catch {
      setGenerationStatus("提取或上传当前帧失败");
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
    const poll = async () => {
      await Promise.all(
        tasks.map(async ([shotId, task]) => {
          try {
            const result = (await fetch(
              `/api/generate/status?id=${encodeURIComponent(task.promptId)}&shot=${encodeURIComponent(shotId)}&seed=${encodeURIComponent(task.seed)}&seed_mode=${task.seedMode}&comfy_url=${encodeURIComponent(comfyUrl)}`,
            ).then((response) => response.json())) as {
              status?: string;
              position?: number;
              url?: string;
              source?: string;
              source_subfolder?: string;
              noise_seed?: string | number;
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
              if (!result.url) {
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
              setShotProgress((current) => ({ ...current, [shotId]: 100 }));
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
              const actualSeed =
                result.noise_seed === undefined ||
                result.noise_seed === null ||
                String(result.noise_seed).trim() === ""
                  ? task.seed
                  : String(result.noise_seed);
              void saveVideoToDirectory(
                result.url,
                shotId,
                { ...task, seed: actualSeed },
                result.source,
                result.source_subfolder,
              );
            }
            if (result.status === "error") {
              setShotTasks((current) => {
                const next = { ...current };
                delete next[shotId];
                return next;
              });
              setShotProgress((current) => ({ ...current, [shotId]: 0 }));
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

  useEffect(() => {
    const taskIds = Object.values(shotTasks).map((task) => task.promptId);
    if (!taskIds.length) return;
    let wsBase = "ws://127.0.0.1:8188";
    try {
      const parsed = new URL(comfyUrl);
      wsBase = `${parsed.protocol === "https:" ? "wss" : "ws"}://${parsed.host}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      // HTTP polling remains available when the configured address is invalid.
    }
    const socket = new WebSocket(
      `${wsBase}/ws?clientId=${encodeURIComponent(clientId)}`,
    );
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return;
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          data?: {
            prompt_id?: string;
            node?: string | null;
            value?: number;
            max?: number;
            step?: number;
            steps?: number;
            progress?: { value?: number; max?: number };
            nodes?: Record<
              string,
              { value?: number; max?: number; state?: string }
            >;
          };
        };
        const data = message.data;
        if (!data) return;
        const promptId = data.prompt_id;
        const matchedTask =
          promptId && taskIds.includes(promptId)
            ? Object.entries(shotTasks).find(
                ([, task]) => task.promptId === promptId,
              )
            : taskIds.length === 1
              ? Object.entries(shotTasks)[0]
              : undefined;
        if (!matchedTask) return;
        const shotId = matchedTask[0];
        const eventStage = stageForNode(data.node);
        if (eventStage) {
          setShotStages((current) => ({ ...current, [shotId]: eventStage }));
          if (activeShotIdRef.current === shotId)
            setGenerationStatus(eventStage);
        }
        let ratio: number | null = null;
        if (
          Number.isFinite(data.step) &&
          Number.isFinite(data.steps) &&
          data.steps! > 0
        )
          ratio = data.step! / data.steps!;
        if (
          message.type === "progress" &&
          Number.isFinite(data.value) &&
          Number.isFinite(data.max) &&
          data.max! > 0
        )
          ratio = data.value! / data.max!;
        if (
          ratio === null &&
          data.progress &&
          Number.isFinite(data.progress.value) &&
          Number.isFinite(data.progress.max) &&
          data.progress.max! > 0
        ) {
          ratio = data.progress.value! / data.progress.max!;
        }
        if (message.type === "progress_state" && data.nodes) {
          const nodes = Object.values(data.nodes);
          const runningNode = nodes.find(
            (node) => node.state === "running" || node.state === "executing",
          );
          const currentNode =
            runningNode ??
            nodes.find((node) => Number(node.value) < Number(node.max));
          if (
            currentNode &&
            Number.isFinite(currentNode.value) &&
            Number.isFinite(currentNode.max) &&
            Number(currentNode.max) > 0
          ) {
            ratio = Number(currentNode.value) / Number(currentNode.max);
          }
        }
        const stage =
          eventStage ??
          (message.type === "progress" || message.type === "progress_state"
            ? "正在采样"
            : null);
        if (ratio === null && !stage) return;
        let percentage =
          stage === "加载模型"
            ? 5
            : stage === "正在采样"
              ? 10
              : stage === "解码视频"
                ? 90
                : stage === "封装视频"
                  ? 97
                  : stage === "保存视频"
                    ? 99
                    : 1;
        if (ratio !== null) {
          const normalized = Math.max(0, Math.min(1, ratio));
          percentage =
            stage === "加载模型"
              ? normalized * 10
              : stage === "解码视频"
                ? 90 + normalized * 7
                : stage === "封装视频"
                  ? 97 + normalized * 2
                  : stage === "保存视频"
                    ? 99
                    : 10 + normalized * 80;
          if (stage === "正在采样" && activeShotIdRef.current === shotId) {
            const currentStep = Math.min(
              matchedTask[1].steps,
              Math.max(0, Math.round(normalized * matchedTask[1].steps)),
            );
            setGenerationStatus(
              `正在采样 · ${currentStep}/${matchedTask[1].steps} 步`,
            );
          }
        }
        setShotProgress((current) => ({
          ...current,
          [shotId]: Math.max(0, Math.min(99, Math.round(percentage))),
        }));
      } catch {
        // Ignore non-JSON or unsupported ComfyUI events.
      }
    };
    return () => socket.close();
  }, [shotTasks, comfyUrl]);

  function toggleGeneration() {
    if (!taskShot) return;
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
      setShotProgress((current) => ({ ...current, [shotId]: 0 }));
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
            Math.floor(Math.random() * 9000000000000000) + 1000000000000000,
          )
        : seed.trim() ||
          String(
            Math.floor(Math.random() * 9000000000000000) + 1000000000000000,
          );
    const startedAt = Date.now();
    const taskSettings = shotSettings[shotId] ?? {
      ...shotSettingDefaults,
      duration,
      resolution: availableResolution,
      aspect,
      fps,
      mode: activeMode,
      model,
      turbo: turboMode,
    };
    const fileName = `shot-${shotId}-${safeFileStem(taskShot.title)}.mp4`;
    const references =
      activeMode === "R2VA"
        ? {
            images: [
              ...Array.from({ length: profile.images }, (_, index) =>
              referenceComfyFile(
                referenceAssets[referenceKey(shotId, "image", index)],
              ),
              ).filter((name): name is string => Boolean(name)),
            ].slice(0, profile.images),
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
    const legacyReference =
      activeMode === "R2VA"
        ? Object.entries(referenceAssets).find(
            ([key, asset]) =>
              key.startsWith(`${shotId}-`) &&
              asset.comfyName &&
              !asset.comfyName.startsWith("director-ref-"),
          )
        : undefined;
    if (legacyReference) {
      setGenerationStatus(
        `参考素材“${legacyReference[1].name}”使用旧文件名，请重新上传后再生成`,
      );
      setShotStages((current) => ({
        ...current,
        [shotId]: "等待素材重新上传",
      }));
      return;
    }
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
      optimizedPrompts[shotId] ??
      (shotId === taskShot?.id && prompt.trim()
        ? prompt.trim()
        : (shotPrompts[shotId] ?? prompt));
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
        fps,
        model,
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
            prompt: generationPrompt,
            title: taskShot.title,
            fileName,
            duration: taskSettings.duration,
            resolution: taskSettings.resolution,
            aspect: taskSettings.aspect,
            fps: taskSettings.fps,
            mode: taskSettings.mode,
            model: taskSettings.model,
            turbo: taskSettings.turbo,
            steps: turboMode ? 4 : 20,
            startedAt,
            keyframeMode,
            inputImage: firstFrameName,
            lastImage:
              activeMode === "I2VA"
                ? keyframes[`${shotId}-尾帧`]?.comfyName
                : undefined,
            referenceImages: references?.images,
            referenceVideos: references?.videos,
            referenceAudios: references?.audios,
          },
        }));
        if (activeShotIdRef.current === shotId)
          setGenerationStatus("已提交，等待 ComfyUI 排队");
      })
      .catch((error: unknown) => {
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
        setShotProgress((current) => ({ ...current, [shotId]: 0 }));
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
    setShotProgress((current) => ({ ...current, [shotId]: 0 }));
    setShotStages((current) => ({ ...current, [shotId]: "排队中" }));
    if (seedMode === "random") setSeed(submittedSeed);
  }

  const pickerAssets = projectAssets.filter((asset) => {
    if (!referencePickerTarget)
      return ["character", "scene", "clothing", "prop"].includes(asset.type);
    if (referencePickerTarget.kind === "image")
      return !["audio", "video"].includes(asset.type);
    return asset.type === referencePickerTarget.kind;
  });
  const hasPickerAssets = pickerAssets.length > 0;
  const pickerCategoryOptions: Array<{
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
      type: "clothing",
      label: "服装",
      icon: Shirt,
      count: pickerAssets.filter((asset) => asset.type === "clothing").length,
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
  ].filter((category) => category.count > 0);
  const selectedPickerAssets = pickerAssets.filter(
    (asset) => asset.type === assetPickerCategory,
  );
  function closeAssetPicker() {
    setAssetSubjectPickerOpen(false);
    setReferencePickerTarget(null);
    setAssetPickerView("actions");
    setAssetPickerCategory(null);
  }

  if (!taskShot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        {renderAssetDialog()}
        {renderAssetDeleteDialog()}
        {renderProjectDeleteDialog()}
        {renderEngineSettingsDialog()}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Clapperboard className="size-4" />
            </div>
            <p className="text-sm font-semibold tracking-tight">导演台</p>
          </div>
          <div className="flex items-center gap-2">
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
                  onClick={() => void chooseProjectDirectory()}
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
                activeProjectName={projectDirectoryName}
                onSelectProject={selectProjectByName}
                onRemoveProject={requestProjectDeletion}
                onDeleteAsset={requestProjectAssetDeletion}
                assets={projectAssets}
                outputFiles={projectOutputFiles}
                projectName={projectDirectoryName}
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
                  onClick={() =>
                    void (projectDirectory
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
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
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
                      void bindProjectAsset(asset);
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
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-tight">导演台</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
                onClick={() => void chooseProjectDirectory()}
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
              activeProjectName={projectDirectoryName}
              onSelectProject={selectProjectByName}
              onRemoveProject={requestProjectDeletion}
              onDeleteAsset={requestProjectAssetDeletion}
              assets={projectAssets}
              outputFiles={projectOutputFiles}
              projectName={projectDirectoryName}
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
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-zinc-400 hover:bg-white/8"
              aria-label="更多操作"
            >
              <MoreHorizontal />
            </Button>
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
                  <button
                    className="grid size-14 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60"
                    aria-label="播放视频"
                  >
                    <Play className="ml-0.5 size-5 fill-current" />
                  </button>
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
                <Button
                  type="button"
                  size="sm"
                  className="h-7 px-2 text-[10px]"
                  disabled={!prompt.trim() || promptOptimizing}
                  onClick={() => void optimizeH3Prompt()}
                >
                  {promptOptimizing ? "优化中…" : "优化提示词"}
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
                      delete next[taskShot.id];
                      return next;
                    });
                  }
                  if (taskShot) setShotPrompts((current) => ({ ...current, [taskShot.id]: value }));
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
                查看优化后的提示词
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
                    disabled={seedMode === "fixed"}
                    onChange={(event) =>
                      setSeed(event.target.value.replace(/\D/g, ""))
                    }
                    className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-55"
                    inputMode="numeric"
                  />
                  <button
                    onClick={() => {
                      const nextMode =
                        seedMode === "fixed" ? "random" : "fixed";
                      setSeedMode(nextMode);
                      if (nextMode === "random")
                        setSeed(
                          String(
                            Math.floor(Math.random() * 9000000000000000) +
                              1000000000000000,
                          ),
                        );
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
                        onClick={() => setKeyframeMode(value)}
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
                              setKeyframes((current) => {
                                const next = { ...current };
                                delete next[key];
                                return next;
                              });
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
                            if (!file) return;
                            const key = `${shots[activeShot].id}-${label}`;
                            const url = URL.createObjectURL(file);
                            setKeyframes((current) => ({
                              ...current,
                              [key]: { name: file.name, url },
                            }));
                            const form = new FormData();
                            form.append("image", file, file.name);
                            form.append("kind", "image");
                            form.append("comfy_url", comfyUrl);
                            try {
                              const response = await fetch("/api/upload", {
                                method: "POST",
                                body: form,
                              });
                              const uploaded = (await response
                                .json()
                                .catch(() => ({}))) as { name?: string };
                              if (response.ok && uploaded.name)
                                setKeyframes((current) => ({
                                  ...current,
                                  [key]: {
                                    name: file.name,
                                    url,
                                    comfyName: uploaded.name,
                                  },
                                }));
                            } catch {
                              /* local preview remains available */
                            }
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
                  confirmRenameShot();
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
              请选择删除方式：仅从导演台移除不会修改磁盘文件；从磁盘删除会同时删除片段目录和输出文件。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteIndex(null)}>
                取消
              </Button>
              <Button variant="outline" onClick={() => void confirmDeleteShot(false)}>
                仅从导演台移除
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
          onMouseDown={() => setPromptViewerOpen(false)}
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
                onClick={() => setPromptViewerOpen(false)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭优化后的提示词"
              >
                <X className="size-4" />
              </button>
            </div>
            <textarea
              autoFocus
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              placeholder="当前片段暂无可显示的提示词"
              className="mt-4 min-h-0 flex-1 resize-none rounded-lg border border-border bg-muted/25 p-3 font-mono text-xs leading-5 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPromptViewerOpen(false)}
                className="h-8 px-4 text-xs"
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={() => {
                  savePromptDraft();
                  setPromptViewerOpen(false);
                }}
                className="h-8 bg-[#f4bd50] px-4 text-xs font-semibold text-[#17120a] hover:bg-[#ffd070]"
              >
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
      {settingsSegmentIndex !== null && settingsSegment && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setSettingsSegmentIndex(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">镜头语言</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  画面 {settingsSegmentIndex + 1} · {settingsSegment.start ?? 0}
                  s - {settingsSegment.end ?? durationSeconds}s
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsSegmentIndex(null)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭镜头语言"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {(
                [
                  ["lens", "镜头焦段"],
                  ["framing", "景别"],
                  ["camera", "运镜"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="min-w-0">
                  <span className="field-label mb-1">{label}</span>
                  <select
                    value={
                      settingsSegment.settings[key] ??
                      promptBuilderDefaults[key]
                    }
                    onChange={(event) =>
                      updatePromptBuilder(
                        key,
                        event.target.value,
                        settingsSegmentIndex ?? 0,
                      )
                    }
                    aria-label={label}
                    className="select-like h-9 min-w-0 w-full appearance-none px-2 text-xs"
                  >
                    <option value="">未设置</option>
                    {promptBuilderOptions[key].map(([value, optionLabel]) => (
                      <option key={value} value={value}>
                        {optionLabel}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => resetPromptBuilder(settingsSegmentIndex ?? 0)}
                className="h-8 px-4 text-xs"
              >
                重置
              </Button>
              <Button
                type="button"
                onClick={() => setSettingsSegmentIndex(null)}
                className="h-8 px-4 text-xs"
              >
                完成
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}










