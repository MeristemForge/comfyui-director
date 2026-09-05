"use client";

import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Box,
  CircleStop,
  Clapperboard,
  Dice5,
  Eye,
  FileAudio,
  Film,
  FolderInput,
  FolderOpen,
  ImagePlus,
  MapPinned,
  MoreHorizontal,
  Package,
  Palette,
  Play,
  Plus,
  RotateCcw,
  Settings,
  Shirt,
  SlidersHorizontal,
  Trash2 as TrashIcon,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ProjectTree,
  type ProjectTreeAsset,
  type ProjectTreeCharacterFile,
} from "@/components/project-tree";

type Shot = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  state: string;
};
type ProjectShotRecord = Shot & {
  references?: { subjects?: PromptSubject[] };
  generation?: { mode?: string; duration?: number; resolution?: string; aspect?: string; fps?: number; model?: keyof typeof modelProfiles; turbo?: boolean; seed?: string; seedMode?: "fixed" | "random"; keyframeMode?: string; steps?: number };
  subjects?: PromptSubject[];
  prompt?: {
    integrated_multimodal_description?: string;
    subject_definitions?: string;
    summary?: string;
    retention_analysis?: string;
    detailed_description?: PromptSegment[];
    overall_soundscape?: string;
    non_diegetic_music?: string;
  };
};
type ProjectAssetType =
  "character" | "scene" | "clothing" | "prop" | "video" | "audio" | "custom";
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
  lighting: string;
  emotion: string;
  music: string;
};
type PromptBuilderSettingsInput = Partial<PromptBuilderSettings>;
type PromptSubject = {
  name: string;
  assetKeys: string[];
  assetRoles?: Record<string, string>;
  children?: PromptSubject[];
};
function referenceLabel(assetKey: string) {
  const match = assetKey.match(/-(image|video|audio)-(\d+)$/);
  if (!match) return null;
  const label = match[1] === "image" ? "Picture" : match[1] === "video" ? "Video" : "Audio";
  return `<${label} ${Number(match[2]) + 1}>`;
}
function referenceRoleText(role: string) {
  return ({
    identity: "facial identity and frontal appearance reference",
    full_body: "full-body multi-view reference",
    clothing: "authoritative wardrobe reference",
    pose: "pose and body-language reference",
    environment: "environment reference",
    object: "object-design reference",
    style: "visual-style reference",
  } as Record<string, string>)[role] ?? "visual reference";
}
function buildSubjectDefinitions(subjects: PromptSubject[]) {
  return subjects.filter((subject) => subject.name.trim()).map((subject, index) => {
    const own = subject.assetKeys.map((key) => {
      const label = referenceLabel(key);
      return label ? `${label} provides the ${referenceRoleText(subject.assetRoles?.[key] ?? "composite")}` : "";
    }).filter(Boolean);
    const children = (subject.children ?? []).map((child) => {
      const refs = child.assetKeys.map((key) => referenceLabel(key)).filter(Boolean);
      const role = child.assetRoles?.[child.assetKeys[0]] ?? "composite";
      const noun = role === "clothing" ? "wardrobe reference" : role === "object" ? "prop reference" : role === "environment" ? "environment reference" : "associated reference";
      const referenceText = refs.length
        ? `${refs.length === 1 ? refs[0] : `${refs.slice(0, -1).join(", ")}, and ${refs.at(-1)}`}, which ${refs.length === 1 ? "provides" : "together provide"} the ${referenceRoleText(role)}`
        : "";
      return `The ${noun} "${child.name.trim()}" is assigned to <Subject ${index + 1}>${referenceText ? ` and is defined by ${referenceText}.` : "."}`;
    }).join(" ");
    return `<Subject ${index + 1}> is the subject named "${subject.name.trim()}"${own.length ? `. ${own.join(". ")}.` : "."}${children ? ` ${children}` : ""}`;
  }).join("\n");
}
function buildRetentionAnalysis(subjects: PromptSubject[]) {
  return subjects.filter((subject) => subject.name.trim()).flatMap((subject, index) => {
    const roles = subject.assetKeys.map((key) => subject.assetRoles?.[key] ?? "composite");
    const ownOnlyWardrobe = roles.length > 0 && roles.every((role) => role === "clothing");
    if (ownOnlyWardrobe) return [];
    return [`<Subject ${index + 1}> (appears throughout the target video): fully_preserved - preserve ${subject.name.trim()}'s identity, facial features, hairstyle, and body proportions throughout the target video.`];
  }).join("\n");
}
type PromptSegment = {
  id: string;
  description: string;
  settings: PromptBuilderSettings;
  start?: number;
  end?: number;
};
type Ref2vaFields = {
  summary: string;
  retentionAnalysis: string;
  soundscape: string;
  music: string;
};
const ref2vaDefaults: Ref2vaFields = {
  summary: "",
  retentionAnalysis: "",
  soundscape:
    "Use natural diegetic ambience and synchronized physical sounds supported by the visible environment, actions, objects, and spatial context. Keep the sound realistic, restrained, and grounded in the scene. Do not add unrelated sounds or invent dialogue. Spoken lines are defined only in detailed_description.",
  music: "N/A",
};
const promptBuilderDefaults: PromptBuilderSettings = {
  style: "realistic_cinematic",
  framing: "",
  camera: "",
  lens: "",
  lighting: "",
  emotion: "",
  music: "none",
};
function normalizePromptBuilderSettings(
  settings?: PromptBuilderSettingsInput,
): PromptBuilderSettings {
  const normalizedMusic =
    settings?.music && settings.music !== "none"
      ? "music"
      : promptBuilderDefaults.music;
  return { ...promptBuilderDefaults, ...settings, music: normalizedMusic };
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
  ] as const,
  framing: [
    ["closeup", "特写"],
    ["close", "近景"],
    ["medium_close", "中近景"],
    ["medium", "中景"],
    ["two_shot", "双人中景（同框）"],
    ["over_shoulder", "过肩镜头"],
    ["insert", "局部特写"],
  ],
  camera: [
    ["static", "静止"],
    ["push_slow", "慢速推近"],
    ["pull_slow", "慢速拉远"],
    ["track", "跟拍"],
    ["pan", "横摇"],
    ["tilt", "上下摇"],
    ["arc", "弧线环绕"],
    ["rack_focus", "焦点转移"],
    ["handheld", "轻微手持"],
  ],
  lens: [
    ["ultra_wide_14", "超广角 · 14mm"],
    ["ultra_wide_18", "超广角 · 18mm"],
    ["wide_24", "广角 · 24mm"],
    ["wide_28", "广角 · 28mm"],
    ["natural_35", "自然视角 · 35mm"],
    ["standard_50", "标准人像 · 50mm"],
    ["portrait_85", "人像长焦 · 85mm"],
    ["tele_135", "长焦 · 135mm"],
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
const subjectAssetRoleOptions = [
  ["identity", "人物脸部身份参考"],
  ["full_body", "人物全身多视角参考"],
  ["environment", "场景环境参考"],
  ["object", "道具物体参考"],
  ["clothing", "人物服装参考"],
  ["pose", "人物姿态参考"],
  ["style", "视觉风格参考"],
] as const;
const subjectAssetRoleGroups = [
  {
    label: "人物",
    values: ["identity", "full_body", "composite", "clothing", "pose"],
  },
  { label: "场景与物体", values: ["environment", "object"] },
  { label: "视觉属性", values: ["style"] },
] as const;
const promptBuilderPhrases: Record<
  keyof PromptBuilderSettings,
  Record<string, string>
> = {
  style: {
    realistic_cinematic:
      "Realistic live-action cinematic imagery with coherent lighting, natural skin texture, and detailed facial features.",
    natural_documentary:
      "Naturalistic documentary live-action imagery with available-light realism, authentic textures, and observational detail.",
    commercial_clean:
      "Polished commercial live-action imagery with clean composition, controlled illumination, precise details, and refined color reproduction.",
    vintage_film:
      "Live-action imagery with a restrained vintage 35mm film character, organic grain, natural contrast, and period-appropriate color response.",
    music_video:
      "Stylized live-action music-video imagery with deliberate composition, expressive visual rhythm, and controlled color design.",
    noir: "Cinematic live-action noir imagery with shaped contrast, selective highlights, textured shadows, and restrained monochrome-leaning color.",
    soft_romance:
      "Cinematic live-action romantic imagery with gentle natural light, soft tonal transitions, and intimate visual detail.",
    animation_3d:
      "High-quality 3D animated cinematic imagery with coherent materials, expressive facial detail, controlled lighting, and stable character design.",
  },
  framing: {
    closeup: "a close-up shot",
    close: "a close shot",
    medium_close: "a medium close-up shot",
    medium: "a medium shot",
    two_shot: "a medium two-shot",
    over_shoulder: "an over-the-shoulder shot",
    insert: "an insert close-up shot",
  },
  camera: {
    static: "The camera holds a static shot",
    push_slow: "The camera pushes in with small amplitude at slow speed",
    pull_slow: "The camera pulls back with small amplitude at slow speed",
    track: "The camera tracks the subject with small amplitude at slow speed",
    pan: "The camera pans gently with small amplitude at slow speed",
    tilt: "The camera tilts gently with small amplitude at slow speed",
    arc: "The camera moves in a subtle arc with small amplitude at slow speed",
    rack_focus:
      "The focus shifts gently between the foreground and background subject",
    handheld: "The camera has a restrained handheld film-camera movement",
  },
  lens: {
    ultra_wide_14:
      "Use a 14mm ultra-wide-angle cinematic lens with controlled perspective and deep environmental context",
    ultra_wide_18:
      "Use an 18mm ultra-wide-angle cinematic lens with natural perspective and clear environmental context",
    wide_24:
      "Use a 24mm wide-angle cinematic lens with gentle spatial depth and natural subject-to-background separation",
    wide_28:
      "Use a 28mm wide-angle cinematic lens with a natural sense of space and restrained perspective",
    natural_35:
      "Use a 35mm cinematic lens with a natural perspective and moderate background separation",
    standard_50:
      "Use a wide-aperture 50mm standard cinematic lens for natural human proportions, detailed facial features, and shallow depth of field",
    portrait_85:
      "Use a wide-aperture 85mm portrait telephoto lens with flattering facial proportions, compressed space, and shallow depth of field",
    tele_135:
      "Use a 135mm telephoto cinematic lens with compressed space, isolated subject detail, and strongly softened background",
    wide_shallow:
      "Use a wide-aperture 50mm standard cinematic lens for natural human proportions, detailed facial features, and shallow depth of field",
    standard:
      "Use a wide-aperture 50mm standard cinematic lens for natural human proportions, detailed facial features, and shallow depth of field",
    handheld:
      "Use a 35mm cinematic lens with a subtle handheld film-camera feeling and moderate background separation",
  },
  lighting: {
    warm: "Warm golden lighting shapes the scene with soft natural shadows",
    cool: "Cool blue lighting creates restrained highlights and soft shadows",
    daylight: "Neutral daylight keeps colors natural and skin tones accurate",
    sunset: "Low sunset light creates warm highlights and long gentle shadows",
    soft: "Soft diffused natural light keeps the skin tones gentle and realistic",
    backlight:
      "Soft backlight creates a clean rim around the subject while keeping the face readable",
    high_contrast:
      "High-contrast lighting creates defined highlights and controlled shadows",
    low_key:
      "Low-key lighting keeps the scene dark with selective highlights on the subject",
    neon: "Colored practical lights create controlled reflections and contrast",
    practical:
      "Visible practical lights motivate the illumination with realistic falloff",
  },
  emotion: {
    joy: "The performance conveys genuine joy through bright eyes, a relaxed face, and natural movement",
    anger:
      "The performance conveys controlled anger through a tense jaw, focused eyes, and restrained movement",
    sadness:
      "The performance conveys quiet sadness through softened eyes, lowered energy, and subtle pauses",
    fear: "The performance conveys fear through alert eyes, guarded posture, and small hesitant movements",
    surprise:
      "The performance conveys surprise through widened eyes, a brief pause, and a spontaneous reaction",
    disgust:
      "The performance conveys restrained disgust through a tightened expression and slight withdrawal",
    shy: "The performance conveys shyness through averted eyes, a small smile, and hesitant movement",
    embarrassed:
      "The performance conveys embarrassment through a fleeting blush, lowered gaze, and an awkward pause",
    nervous:
      "The performance carries visible nervousness through restless fingers, shallow breath, and uncertain eye contact",
    restrained: "The performance remains restrained and emotionally controlled",
    intimate:
      "The performance feels intimate, with subtle eye contact and close reactions",
    calm: "The performance remains calm and natural with relaxed movement",
    lonely:
      "The performance conveys quiet loneliness through stillness and a distant gaze",
    hopeful:
      "The performance conveys hope through softened features, lifted eyes, and gentle forward movement",
    determined:
      "The performance conveys determination through focused eyes, steady posture, and deliberate movement",
    playful:
      "The performance feels playful through a light smile, lively eyes, and teasing movement",
    longing:
      "The performance conveys longing through sustained eye contact, hesitation, and a softened expression",
    tense:
      "The performance carries visible tension through tight posture, focused eyes, and small controlled movements",
  },
  music: {
    none: "N/A",
    music:
      "Subtle non-diegetic background music supports the scene without overpowering the original sound",
  },
};

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

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction("handles", "readwrite")
      .objectStore("handles")
      .put(handle, "output-directory");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  database.close();
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

async function loadDirectoryHandle() {
  const database = await openDirectoryDatabase();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>(
    (resolve, reject) => {
      const request = database
        .transaction("handles", "readonly")
        .objectStore("handles")
        .get("output-directory");
      request.onsuccess = () =>
        resolve(request.result as FileSystemDirectoryHandle | undefined);
      request.onerror = () => reject(request.error);
    },
  );
  database.close();
  return handle;
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
type PromptMention = { start: number; end: number; query: string };
type ReferenceMentionOption = {
  kind: ReferenceKind;
  index: number;
  token: string;
  name: string;
  url: string;
  ready: boolean;
  assetKey: string;
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
const dialogueTranslations: Record<string, string> = {};

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatPromptDescription(
  description: string,
  speakerIds: Map<string, number>,
  subjects: PromptSubject[] = [],
) {
  let nextSpeakerId = Math.max(0, ...speakerIds.values()) + 1;
  const replaceSubjectMentions = (text: string) =>
    text
      .split(/(<d>[\s\S]*?<\/d>)/gi)
      .map((part, partIndex) => {
        if (partIndex % 2 === 1) return part;
        return subjects.reduce((value, subject, subjectIndex) => {
          const name = subject.name.trim();
          if (!name) return value;
          return value.replace(
            new RegExp(
              `["“”']?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["“”']?`,
              "gi",
            ),
            `<Subject ${subjectIndex + 1}>`,
          );
        }, part);
      })
      .join("");
  return description
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || /^<d>/.test(trimmed)) return trimmed;
      if (/<d>[\s\S]*<\/d>/i.test(trimmed))
        return replaceSubjectMentions(trimmed);
      const match = trimmed.match(/^([^:：\n]{1,24})\s*[:：]\s*(.+)$/);
      if (!match) return replaceSubjectMentions(trimmed);
      const speaker = match[1].trim();
      const originalWords = match[2].trim();
      const words = dialogueTranslations[originalWords] ?? originalWords;
      if (!words) return trimmed;
      if (!speakerIds.has(speaker)) speakerIds.set(speaker, nextSpeakerId++);
      const language = /[\u4e00-\u9fff]/.test(words) ? "Chinese" : "English";
      const subjectIndex = subjects.findIndex(
        (subject) =>
          subject.name.trim().toLowerCase() === speaker.toLowerCase(),
      );
      const speakerLabel =
        subjectIndex >= 0 ? `<Subject ${subjectIndex + 1}>` : speaker;
      return replaceSubjectMentions(
        `${speakerLabel} (S${speakerIds.get(speaker)}) says: <d>[${language}] ${words}</d>`,
      );
    })
    .filter(Boolean)
    .join(" ");
}

function normalizeActionDescription(description: string) {
  let normalized = description.trim();
  // Dialogue is controlled only by explicit <d> tags. Remove unquoted speech
  // cues instead of turning them into extra model instructions.
  normalized = normalized.replace(
    /\s+and\s+begins?\s+to\s+(?:answer|respond|reply)\b/gi,
    "",
  );
  normalized = normalized.replace(
    /\s+and\s+starts?\s+to\s+(?:answer|respond|reply)\b/gi,
    "",
  );
  normalized = normalized.replace(
    /\bbegins?\s+to\s+(?:answer|respond|reply)\b/gi,
    "",
  );
  normalized = normalized.replace(
    /\bstarts?\s+to\s+(?:answer|respond|reply)\b/gi,
    "",
  );
  normalized = normalized.replace(
    /[，,、]\s*(?:开始回答|开始回应|准备回答|准备回应)/g,
    "",
  );
  normalized = normalized.replace(
    /(?:开始回答|开始回应|准备回答|准备回应)/g,
    "",
  );
  normalized = normalized
    .replace(/\s+([.!?。！？])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Remove common shot-composition prefixes while preserving the actual action.
  normalized = normalized.replace(
    /^\s*(?:a|an|the)\s+(?:extreme\s+)?(?:close-up|close|medium\s+close-up|medium|wide|two-shot|over-the-shoulder)\s+shot\s+(?:shows|presents)\s+/i,
    "",
  );
  normalized = normalized.replace(
    /^\s*the\s+camera\s+cuts\s+to\s+(?:a|an|the)\s+(?:extreme\s+)?(?:close-up|close|medium\s+close-up|medium|wide|two-shot|over-the-shoulder)\s+(?:shot\s+)?(?:of|showing)\s+/i,
    "",
  );
  normalized = normalized.replace(/^\s*镜头切换至(?:[^。；，]*)(?:的)?/i, "");
  normalized = normalized.replace(
    /^\s*(?:摄像机|摄影机)[^。！？]*[。！？]\s*/i,
    "",
  );
  // Drop standalone camera instructions; camera settings are emitted below.
  normalized = normalized
    .split(/(?<=[.!?。！？])\s+/)
    .filter(
      (sentence) =>
        !/^\s*(?:the\s+)?camera\s+(?:moves|cuts|pushes|pulls|pans|tilts|tracks|zooms|holds|stays|remains)\b/i.test(
          sentence,
        ) &&
        !/^\s*(?:摄像机|摄影机)\s*(?:缓慢|平稳|向前|向后|推近|拉远|横摇|俯仰|跟拍)/.test(
          sentence,
        ),
    )
    .join(" ")
    .trim();
  return normalized;
}

const promptFieldNames = [
  "subject_definitions",
  "reference_mapping",
  "summary",
  "retention_analysis",
  "detailed_description",
  "overall_soundscape",
  "non_diegetic_music",
];

function readPromptField(promptText: string, fieldName: string) {
  const fields = promptFieldNames
    .filter((field) => field !== fieldName)
    .map((field) => field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const match = promptText.match(
    new RegExp(
      `(?:^|\\n)\\s*${fieldName}\\s*:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${fields})\\s*:|$)`,
      "i",
    ),
  );
  return match?.[1]?.trim() ?? "";
}

function promptHasField(promptText: string, fieldName: string) {
  return new RegExp(`(?:^|\\n)\\s*${fieldName}\\s*:`, "i").test(promptText);
}

function readPromptSubjects(promptText: string) {
  const definitions = readPromptField(
    promptText,
    "subject_definitions",
  ).replace(/\\(?=<)/g, "");
  return [
    ...definitions.matchAll(
      /<Subject\s+(\d+)>\s+is\s+the\s+subject\s+named\s+["“]([^"”]+)["”]([\s\S]*?)(?=\n|$)/gi,
    ),
  ].map((match) => ({
    index: Number(match[1]),
    name: match[2].trim(),
    tokens: [...match[3].matchAll(/<(?:Picture|Video|Audio)\s+\d+>/gi)].map(
      (token) => token[0],
    ),
  }));
}

type ParsedPromptShot = {
  number: number;
  action: string;
  camera: string;
  start?: number;
};

function readPromptShots(
  promptText: string,
  totalSeconds: number,
): ParsedPromptShot[] {
  const normalized = promptText.replace(/\r\n/g, "\n");
  const headingPattern =
    /(?:\bSHOT\s+(\d+)(?:\s+\(starts\s+at\s+(\d+):([\d.]+)\))?|\[Shot\s+(\d+)\](?:\s+At\s+(\d+):([\d.]+),?)?)\s*(?=\n?\s*Action\s*:)/gi;
  const headings = [...normalized.matchAll(headingPattern)];
  return headings.map((heading, index) => {
    const startOffset = (heading.index ?? 0) + heading[0].length;
    const endOffset =
      index + 1 < headings.length
        ? (headings[index + 1].index ?? normalized.length)
        : normalized.length;
    const body = normalized.slice(startOffset, endOffset);
    const actionText =
      body
        .match(
          /(?:^|\n)\s*Action\s*:\s*([\s\S]*?)(?=\n\s*(?:Camera|Wardrobe|Continuity)\s*:|$)/i,
        )?.[1]
        ?.trim() ?? "";
    const action = actionText
      .replace(
        /\s*No spoken dialogue or vocalization occurs in this shot\.\s*$/i,
        "",
      )
      .trim();
    const camera =
      body
        .match(
          /(?:^|\n)\s*Camera\s*:\s*([\s\S]*?)(?=\n\s*(?:Wardrobe|Continuity)\s*:|$)/i,
        )?.[1]
        ?.trim() ?? "";
    const minuteText = heading[2] ?? heading[5];
    const secondText = heading[3] ?? heading[6];
    const minutes = minuteText !== undefined ? Number(minuteText) : 0;
    const seconds = secondText !== undefined ? Number(secondText) : 0;
    const parsedStart =
      minuteText !== undefined || secondText !== undefined
        ? minutes * 60 + seconds
        : undefined;
    return {
      number: Number(heading[1] ?? heading[4]),
      action:
        action === "No specific action or dialogue is provided for this shot."
          ? ""
          : action,
      camera,
      start:
        parsedStart === undefined
          ? undefined
          : Math.max(0, Math.min(totalSeconds, parsedStart)),
    };
  });
}

function inferPromptCameraSettings(
  cameraText: string,
  existing?: PromptBuilderSettingsInput,
) {
  const normalized = normalizePromptBuilderSettings(existing);
  if (!cameraText || /No specific camera language is set/i.test(cameraText))
    return { ...normalized, framing: "", camera: "", lens: "" };
  (["framing", "camera", "lens"] as const).forEach((key) => {
    const option = promptBuilderOptions[key].find(([value]) =>
      cameraText
        .toLowerCase()
        .includes(promptBuilderPhrases[key][value].toLowerCase()),
    );
    if (option) normalized[key] = option[0];
  });
  return normalized;
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

function stableAssetId(type: string, name: string) {
  const stem = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `asset-${type}-${stem || Date.now()}`;
}

const projectAssetFolders = [
  "角色",
  "场景",
  "服装",
  "道具",
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

async function readCharacterThumbnail(
  character: FileSystemDirectoryHandle,
): Promise<string | undefined> {
  try {
    const manifest = await character.getFileHandle("character.json");
    const data = JSON.parse(await (await manifest.getFile()).text()) as {
      references?: Array<{ role?: string; category?: string; file?: string }>;
    };
    const preferred = data.references?.find(
      (reference) =>
        reference.role === "identity" || reference.category === "半身正脸",
    )?.file;
    if (!preferred) return undefined;
    const identity = await character.getDirectoryHandle("身份");
    const file = await identity.getFileHandle(preferred);
    return URL.createObjectURL(await file.getFile());
  } catch {
    return undefined;
  }
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
          references?: { subjects?: PromptSubject[] };
          prompt?: {
            subject_definitions?: string;
            summary?: string;
            retention_analysis?: string;
            detailed_description?: PromptSegment[];
            overall_soundscape?: string;
            non_diegetic_music?: string;
          };
        };
        const generation = data.generation ?? {};
        const durationText = `${generation.duration ?? 6}s`;
        const resolutionText = generation.resolution ?? "864×480";
        const fpsText = `${generation.fps ?? 24}fps`;
        return {
          id: clip.id,
          title: clip.title,
          detail: `${durationText} · ${generation.mode ?? "T2VA"} · ${resolutionText} · ${fpsText}`,
          meta: `${generation.aspect ?? "16:9"}${data.output ? " · 已归档" : ""}`,
          state: data.output ? "已完成" : "草稿",
          generation,
          subjects: data.references?.subjects,
          references: data.references,
          prompt: data.prompt,
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
  const [generationStatus, setGenerationStatus] = useState("等待生成");
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
  const [outputDirectory, setOutputDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] =
    useState("未选择输出目录");
  const [projectDirectory, setProjectDirectory] =
    useState<FileSystemDirectoryHandle | null>(null);
  const [projectDirectories, setProjectDirectories] = useState<
    FileSystemDirectoryHandle[]
  >([]);
  const [projectDirectoryName, setProjectDirectoryName] =
    useState("未选择项目目录");
  const [projectCharacterNames, setProjectCharacterNames] = useState<string[]>(
    [],
  );
  const [projectCharacterThumbnails, setProjectCharacterThumbnails] = useState<
    Record<string, string>
  >({});
  const [projectCharacterFiles, setProjectCharacterFiles] = useState<
    Record<string, ProjectTreeCharacterFile[]>
  >({});
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
  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [promptDraft, setPromptDraft] = useState("");
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
  const [subjectMention, setSubjectMention] = useState<{
    segmentIndex: number;
    start: number;
    query: string;
    selected: number;
  } | null>(null);
  const [mentionPosition, setMentionPosition] = useState({ left: 16, top: 16 });
  const [addDialog, setAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renameIndex, setRenameIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [projectDeleteCandidate, setProjectDeleteCandidate] = useState<
    string | null
  >(null);
  const [characterDialog, setCharacterDialog] = useState(false);
  const [assetSubjectPickerOpen, setAssetSubjectPickerOpen] = useState(false);
  const [assetSubjectParentIndex, setAssetSubjectParentIndex] = useState<
    number | null
  >(null);
  const assetSubjectParentIndexRef = useRef<number | null>(null);
  const [assetDialog, setAssetDialog] = useState(false);
  const [assetType, setAssetType] = useState<ProjectAssetType | null>(null);
  const [newAssetName, setNewAssetName] = useState("");
  const [newCustomAssetFile, setNewCustomAssetFile] = useState<File | null>(
    null,
  );
  const [newClothingFile, setNewClothingFile] = useState<File | null>(null);
  const [newPropFile, setNewPropFile] = useState<File | null>(null);
  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterHalfBodyFile, setNewCharacterHalfBodyFile] =
    useState<File | null>(null);
  const [newCharacterFullBodyFile, setNewCharacterFullBodyFile] =
    useState<File | null>(null);
  const [newCharacterVoiceFile, setNewCharacterVoiceFile] =
    useState<File | null>(null);
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
  const outputDirectoryTitle = "打开导演台输出目录";
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
  const activeStyle = taskShot
    ? normalizePromptBuilderSettings(
        activeSegments[0]?.settings ?? promptBuilderSettings[taskShot.id],
      ).style
    : promptBuilderDefaults.style;
  useEffect(() => {
    const savedComfyUrl = window.localStorage.getItem("comfyui-url");
    if (savedComfyUrl) {
      setComfyUrl(savedComfyUrl);
      setComfyUrlDraft(savedComfyUrl);
    }
  }, []);

  useEffect(() => {
    if (activeMode !== "R2VA" || !taskShot) return;
    setRef2vaFields((current) => {
      const existing = current[taskShot.id];
      const legacySoundscapes = [
        "McDonald's indoor ambience, customer conversations, footsteps, register beeps, paper movement, and synchronized object handling.",
        "Use only realistic, synchronized physical sounds directly supported by visible actions and objects, such as footsteps, breathing, fabric movement, door movement, and object handling. Do not add mood-setting ambience, horror atmosphere, emotional sound beds, drones, tension effects, or unrequested music.",
        "Use natural diegetic ambience and synchronized physical sounds appropriate to the visible environment, character actions, object handling, and spatial context. Keep the sound realistic and do not add unrelated sounds.",
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
    const existingRetention =
      ref2vaFields[taskShot.id]?.retentionAnalysis?.trim() ?? "";
    if (
      !subjects.length ||
      !existingRetention ||
      !/^<Subject\s+\d+>/i.test(existingRetention)
    )
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
  const mentionOptions = promptMention
    ? referenceMentionOptions().filter((option) =>
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
      if (saved.shotPrompts) setShotPrompts(saved.shotPrompts);
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
          if (projectShots) applyProjectShotRecords(projectShots);
          if (saved.promptSubjects)
            setPromptSubjects(compactedReferences.subjects);
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
                      url: asset.comfyName
                        ? `/api/video?${params.toString()}`
                        : "",
                    },
                  ];
                }),
              ),
            );
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
        const fields = ref2vaFields[shot.id] ?? ref2vaDefaults;
        const detailedDescription = promptSegments[shot.id] ?? [];
        const promptData = settings.mode === "R2VA"
          ? {
              subject_definitions: buildSubjectDefinitions(promptSubjects[shot.id] ?? []),
              summary: fields.summary,
              retention_analysis: buildRetentionAnalysis(promptSubjects[shot.id] ?? []) || fields.retentionAnalysis,
              detailed_description: detailedDescription,
              overall_soundscape: fields.soundscape,
              non_diegetic_music: fields.music,
            }
          : {
              integrated_multimodal_description: detailedDescription
                .map((segment) => segment.description.trim())
                .filter(Boolean)
                .join("\n\n"),
              overall_soundscape: fields.soundscape,
              non_diegetic_music: fields.music,
            };
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
          prompt: promptData,
          output: shotVideos[shot.id]
            ? (shotFileNames[shot.id] ??
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
    ref2vaFields,
    promptSegments,
    shotPrompts,
    shotVideos,
    shotFileNames,
    keyframeMode,
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
    setPrompt(shotPrompts[taskShot.id] ?? "");
    setPromptNotice(null);
    setSettingsSegmentIndex(null);
    setActivePromptSegment((current) => ({
      ...current,
      [taskShot.id]: Math.min(
        current[taskShot.id] ?? 0,
        Math.max(0, getPromptSegments(taskShot.id).length - 1),
      ),
    }));
    setVideoUrl(shotVideos[taskShot.id] ?? null);
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
  }, [storageReady, taskShot?.id]);

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
    setPrompt(shotPrompts[nextShot.id] ?? "");
    setVideoUrl(shotVideos[nextShot.id] ?? null);
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
        prompt: {
          integrated_multimodal_description: "",
          overall_soundscape: ref2vaDefaults.soundscape,
          non_diegetic_music: ref2vaDefaults.music,
        },
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
      setPrompt(shotPrompts[nextShot.id] ?? "");
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
  function shotMeta(shot: Shot) {
    const settings = getShotSettings(shot);
    return `${settings.resolution.replace(/\s*×\s*/, "×")} · ${settings.aspect} · ${settings.fps.replace(/\s+/g, "")}`;
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
  function updatePromptSegment(index: number, patch: Partial<PromptSegment>) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSegments((current) => {
      const segments = [...getPromptSegments(shotId)];
      if (!segments[index]) return current;
      segments[index] = { ...segments[index], ...patch };
      return { ...current, [shotId]: segments };
    });
  }
  function getMentionSubjects() {
    return taskShot
      ? (promptSubjects[taskShot.id] ?? []).filter((subject) =>
          subject.name.trim(),
        )
      : [];
  }
  function commitSubjectMention(index: number) {
    if (!subjectMention || !taskShot) return;
    const subjects = getMentionSubjects();
    const filtered = subjects.filter((item) =>
      item.name.toLowerCase().includes(subjectMention.query.toLowerCase()),
    );
    const subject = filtered[index];
    if (!subject) return;
    const subjectIndex = subjects.indexOf(subject);
    const segment = activeSegments[subjectMention.segmentIndex];
    if (!segment) return;
    const before = segment.description.slice(0, subjectMention.start);
    const after = segment.description.slice(
      subjectMention.start + 1 + subjectMention.query.length,
    );
    updatePromptSegment(subjectMention.segmentIndex, {
      description: `${before}<Subject ${subjectIndex + 1}> ${after}`,
    });
    setSubjectMention(null);
  }
  function addPromptSegment() {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSegments((current) => {
      // Adding a scene must not rewrite manually authored time ranges. Append the
      // new scene after the current last scene and use the remaining timeline.
      const total = Number.parseFloat(duration) || 6;
      const saved = current[shotId];
      const segments = (
        saved?.length
          ? saved
          : [
              {
                id: `${shotId}-segment-1`,
                description: "",
                settings: normalizePromptBuilderSettings(
                  promptBuilderSettings[shotId],
                ),
                start: 0,
                end: total,
              },
            ]
      ).map((segment, index) => ({
        ...segment,
        settings: normalizePromptBuilderSettings(segment.settings),
        start:
          typeof segment.start === "number"
            ? segment.start
            : index === 0
              ? 0
              : (total * index) / (saved?.length || 1),
        end:
          typeof segment.end === "number"
            ? segment.end
            : (total * (index + 1)) / (saved?.length || 1),
      }));
      const last = segments[segments.length - 1];
      const start = Math.max(0, Math.min(total, last.end ?? total));
      segments.push({
        id: `${shotId}-segment-${Date.now()}`,
        description: "",
        settings: { ...promptBuilderDefaults },
        start,
        end: total,
      });
      setActivePromptSegment((active) => ({
        ...active,
        [shotId]: segments.length - 1,
      }));
      return { ...current, [shotId]: segments };
    });
  }
  function removePromptSegment(index: number) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSegments((current) => {
      const segments = getPromptSegments(shotId).filter(
        (_, segmentIndex) => segmentIndex !== index,
      );
      const next = segments.length
        ? segments
        : [
            {
              id: `${shotId}-segment-1`,
              description: "",
              settings: { ...promptBuilderDefaults },
            },
          ];
      setActivePromptSegment((active) => ({
        ...active,
        [shotId]: Math.min(active[shotId] ?? 0, next.length - 1),
      }));
      return { ...current, [shotId]: next };
    });
  }
  function updatePromptSubject(index: number, patch: Partial<PromptSubject>) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      if (!subjects[index]) return current;
      subjects[index] = { ...subjects[index], ...patch };
      return { ...current, [shotId]: subjects };
    });
  }
  function addPromptSubject() {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => ({
      ...current,
      [shotId]: [...(current[shotId] ?? []), { name: "", assetKeys: [] }],
    }));
  }
  function removePromptSubject(index: number) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    const subject = promptSubjects[shotId]?.[index];
    const collectSubjectKeys = (item: PromptSubject): string[] => [
      ...item.assetKeys,
      ...(item.children ?? []).flatMap(collectSubjectKeys),
    ];
    const removedKeys = new Set(subject ? collectSubjectKeys(subject) : []);
    const remainingSubjects = (promptSubjects[shotId] ?? []).filter(
      (_, subjectIndex) => subjectIndex !== index,
    );
    const retainedKeys = new Set(remainingSubjects.flatMap(collectSubjectKeys));
    setPromptSubjects((current) => ({
      ...current,
      [shotId]: remainingSubjects,
    }));
    if (removedKeys.size)
      setReferenceAssets((current) => {
        const next = { ...current };
        removedKeys.forEach((key) => {
          if (!retainedKeys.has(key)) {
            if (next[key]?.url.startsWith("blob:"))
              URL.revokeObjectURL(next[key].url);
            delete next[key];
          }
        });
        return next;
      });
  }
  function addSubjectReference(subjectIndex: number, assetKey: string) {
    const shotId = shots[activeShot]?.id;
    if (!shotId || !assetKey) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subject = subjects[subjectIndex];
      if (!subject || subject.assetKeys.includes(assetKey)) return current;
      subjects[subjectIndex] = {
        ...subject,
        assetKeys: [...subject.assetKeys, assetKey],
      };
      return { ...current, [shotId]: subjects };
    });
  }
  function removeSubjectReference(subjectIndex: number, assetKey: string) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subject = subjects[subjectIndex];
      if (!subject) return current;
      subjects[subjectIndex] = {
        ...subject,
        assetKeys: subject.assetKeys.filter((key) => key !== assetKey),
      };
      return { ...current, [shotId]: subjects };
    });
  }
  function toggleReferenceSubject(assetKey: string) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subjectIndex = subjects.findIndex((subject) =>
        subject.assetKeys.includes(assetKey),
      );
      if (subjectIndex >= 0) {
        const nextKeys = subjects[subjectIndex].assetKeys.filter(
          (key) => key !== assetKey,
        );
        if (nextKeys.length)
          subjects[subjectIndex] = {
            ...subjects[subjectIndex],
            assetKeys: nextKeys,
          };
        else subjects.splice(subjectIndex, 1);
      } else {
        subjects.push({ name: "", assetKeys: [assetKey] });
      }
      return { ...current, [shotId]: subjects };
    });
  }
  function setReferenceSubjectName(assetKey: string, name: string) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    const normalized = name.trim();
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      let sourceIndex = subjects.findIndex((subject) =>
        subject.assetKeys.includes(assetKey),
      );
      if (sourceIndex < 0) {
        if (!normalized) return current;
        subjects.push({ name: normalized, assetKeys: [assetKey] });
        return { ...current, [shotId]: subjects };
      }
      subjects[sourceIndex] = { ...subjects[sourceIndex], name };
      if (normalized) {
        const targetIndex = subjects.findIndex(
          (subject, index) =>
            index !== sourceIndex &&
            subject.name.trim().toLowerCase() === normalized.toLowerCase(),
        );
        if (targetIndex >= 0) {
          subjects[targetIndex] = {
            ...subjects[targetIndex],
            assetKeys: [
              ...new Set([...subjects[targetIndex].assetKeys, assetKey]),
            ],
            assetRoles: {
              ...subjects[targetIndex].assetRoles,
              ...subjects[sourceIndex].assetRoles,
            },
          };
          subjects.splice(sourceIndex, 1);
        }
      }
      return { ...current, [shotId]: subjects };
    });
  }
  function toggleSubjectAsset(subjectIndex: number, assetKey: string) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subject = subjects[subjectIndex];
      if (!subject) return current;
      const hasAsset = subject.assetKeys.includes(assetKey);
      subjects[subjectIndex] = {
        ...subject,
        assetKeys: hasAsset
          ? subject.assetKeys.filter((key) => key !== assetKey)
          : [...subject.assetKeys, assetKey],
      };
      if (!subjects[subjectIndex].assetKeys.length)
        subjects.splice(subjectIndex, 1);
      return { ...current, [shotId]: subjects };
    });
  }
  function moveSubjectAsset(subjectIndex: number, from: number, to: number) {
    const shotId = shots[activeShot]?.id;
    if (!shotId || from === to) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subject = subjects[subjectIndex];
      if (!subject) return current;
      const keys = [...subject.assetKeys];
      const [moved] = keys.splice(from, 1);
      if (!moved) return current;
      keys.splice(to, 0, moved);
      subjects[subjectIndex] = { ...subject, assetKeys: keys };
      return { ...current, [shotId]: subjects };
    });
  }
  function projectSubjectLibrary() {
    const library = new Map<string, PromptSubject>();
    Object.values(promptSubjects)
      .flat()
      .forEach((subject) => {
        const name = subject.name.trim();
        if (!name) return;
        const existing = library.get(name.toLowerCase());
        if (existing) {
          existing.assetKeys = [
            ...new Set([...existing.assetKeys, ...subject.assetKeys]),
          ];
          existing.assetRoles = {
            ...existing.assetRoles,
            ...subject.assetRoles,
          };
        } else
          library.set(name.toLowerCase(), {
            ...subject,
            assetKeys: [...new Set(subject.assetKeys)],
          });
      });
    return [...library.values()];
  }
  function useProjectSubject(subject: PromptSubject) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    const remappedAssets: Record<string, ReferenceAsset> = {};
    const assetKeyMap = new Map<string, string>();
    subject.assetKeys.forEach((assetKey, index) => {
      const asset = referenceAssets[assetKey];
      const kind = asset?.kind ?? (assetKey.includes("-video-") ? "video" : assetKey.includes("-audio-") ? "audio" : "image");
      const nextKey = referenceKey(shotId, kind, nextReferenceIndex(shotId, kind, Object.keys(remappedAssets)));
      assetKeyMap.set(assetKey, nextKey);
      if (asset) remappedAssets[nextKey] = asset;
    });
    setPromptSubjects((current) => {
      const existing = current[shotId] ?? [];
      if (
        existing.some(
          (item) =>
            item.name.trim().toLowerCase() ===
            subject.name.trim().toLowerCase(),
        )
      )
        return current;
      return {
        ...current,
        [shotId]: [
          ...existing,
          {
            ...subject,
            assetKeys: subject.assetKeys.map((key) => assetKeyMap.get(key) ?? key),
            assetRoles: Object.fromEntries(
              subject.assetKeys.map((key) => [assetKeyMap.get(key) ?? key, subject.assetRoles?.[key] ?? "composite"]),
            ),
          },
        ],
      };
    });
    if (Object.keys(remappedAssets).length)
      setReferenceAssets((current) => ({ ...current, ...remappedAssets }));
  }
  async function bindCharacterAsset(name: string) {
    const shotId = taskShot?.id;
    if (!shotId || !projectDirectory) return;
    ensureReferenceMode(shotId);
    const parentIndex = assetSubjectParentIndexRef.current;
    if (
      parentIndex !== null &&
      (promptSubjects[shotId]?.[parentIndex]?.children ?? []).some(
        (child) => child.name.trim().toLowerCase() === asset.name.trim().toLowerCase(),
      )
    ) {
      setAssetSubjectPickerOpen(false);
      setAssetSubjectParentIndex(null);
      assetSubjectParentIndexRef.current = null;
      setGenerationStatus(`子主体“${asset.name}”已经添加`);
      return;
    }
    if (
      parentIndex === null &&
      (promptSubjects[shotId] ?? []).some(
        (subject) =>
          subject.name.trim().toLowerCase() === name.trim().toLowerCase(),
      )
    ) {
      if (parentIndex === null) {
        setPromptSubjects((current) => {
          const existing = current[shotId] ?? [];
          const cleaned = existing.map((subject) => {
            const children = (subject.children ?? []).filter(
              (child) =>
                child.name.trim().toLowerCase() !== name.trim().toLowerCase(),
            );
            return children.length === (subject.children ?? []).length
              ? subject
              : { ...subject, children };
          });
          return cleaned.some((subject, index) => subject !== existing[index])
            ? { ...current, [shotId]: cleaned }
            : current;
        });
      }
      setAssetSubjectPickerOpen(false);
      assetSubjectParentIndexRef.current = null;
      setAssetSubjectParentIndex(null);
      setGenerationStatus(`主体“${name}”已经添加到当前片段`);
      return;
    }
    try {
      const characters = await getProjectAssetFolder(projectDirectory, "角色");
      const character = await characters.getDirectoryHandle(name);
      const manifest = await character.getFileHandle("character.json");
      const data = JSON.parse(await (await manifest.getFile()).text()) as {
        references?: Array<{ role?: string; file?: string; mimeType?: string }>;
      };
      const uploadedKeys: string[] = [];
      const uploadedRoles: string[] = [];
      for (const reference of data.references ?? []) {
        if (
          !reference.file ||
          !reference.role ||
          !["identity", "full_body", "voice"].includes(reference.role)
        )
          continue;
        const folderName = reference.role === "voice" ? "声音" : "身份";
        const source = await (
          await character.getDirectoryHandle(folderName)
        ).getFileHandle(reference.file);
        const file = await source.getFile();
        const kind: ReferenceKind =
          reference.role === "voice" ? "audio" : "image";
        const index = nextReferenceIndex(shotId, kind, uploadedKeys);
        const key = referenceKey(shotId, kind, index);
        const url = URL.createObjectURL(file);
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
          throw new Error(uploaded.error ?? `上传${file.name}失败`);
        setReferenceAssets((current) => ({
          ...current,
          [key]: {
            name: file.name,
            url,
            comfyName: uploaded.name,
            comfySubfolder: uploaded.subfolder || undefined,
            kind,
            sourcePath: `资产/角色/${name}/${folderName}/${reference.file}`,
          },
        }));
        uploadedKeys.push(key);
        uploadedRoles.push(reference.role);
      }
      setPromptSubjects((current) => {
        let subjects = [...(current[shotId] ?? [])];
        if (parentIndex === null) {
          subjects = subjects.map((subject) => ({
            ...subject,
            children: (subject.children ?? []).filter(
              (child) =>
                child.name.trim().toLowerCase() !== name.trim().toLowerCase(),
            ),
          }));
        }
        const child = {
          name,
          assetKeys: uploadedKeys,
          assetRoles: Object.fromEntries(
            uploadedKeys.map((key, index) => [key, uploadedRoles[index] ?? "composite"]),
          ),
        };
        if (
          parentIndex !== null &&
          subjects[parentIndex]
        ) {
          const parent = subjects[parentIndex];
          if (
            (parent.children ?? []).some(
              (item) =>
                item.name.trim().toLowerCase() === name.trim().toLowerCase(),
            )
          )
            return current;
          subjects[parentIndex] = {
            ...parent,
            children: [...(parent.children ?? []), child],
          };
          return { ...current, [shotId]: subjects };
        }
        if (
          subjects.some(
            (subject) =>
              subject.name.trim().toLowerCase() === name.trim().toLowerCase(),
          )
        )
          return current;
        return { ...current, [shotId]: [...subjects, child] };
      });
      setAssetSubjectPickerOpen(false);
      setAssetSubjectParentIndex(null);
      assetSubjectParentIndexRef.current = null;
      setGenerationStatus(`已将角色“${name}”绑定到当前片段`);
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? `绑定角色失败：${error.message}`
          : "绑定角色失败",
      );
    }
  }
  async function bindProjectAsset(asset: ProjectTreeAsset) {
    if (asset.type === "character") return bindCharacterAsset(asset.name);
    const shotId = taskShot?.id;
    if (!shotId || !projectDirectory) return;
    ensureReferenceMode(shotId);
    const parentIndex = assetSubjectParentIndexRef.current;
    if (
      parentIndex === null &&
      (promptSubjects[shotId] ?? []).some(
        (subject) =>
          subject.name.trim().toLowerCase() === asset.name.trim().toLowerCase(),
      )
    ) {
      setAssetSubjectPickerOpen(false);
      setGenerationStatus(`主体“${asset.name}”已经添加到当前片段`);
      return;
    }
    try {
      const folderName =
        asset.type === "clothing"
          ? "服装"
          : asset.type === "prop"
            ? "道具"
            : asset.type === "scene"
              ? "场景"
              : asset.type === "custom"
                ? "自定义"
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
      const assetDirectory = await folder.getDirectoryHandle(asset.name);
      const manifest = await assetDirectory.getFileHandle(manifestName);
      const data = JSON.parse(await (await manifest.getFile()).text()) as {
        references?: Array<{ file?: string; role?: string; mimeType?: string }>;
      };
      const uploadedKeys: string[] = [];
      const uploadedRoles: string[] = [];
      for (const reference of data.references ?? []) {
        if (!reference.file) continue;
        const source = await assetDirectory.getFileHandle(reference.file);
        const file = await source.getFile();
        const kind: ReferenceKind = file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("video/")
            ? "video"
            : "image";
        const role =
          reference.role ??
          (asset.type === "clothing"
            ? "clothing"
            : asset.type === "prop"
            ? "object"
            : asset.type === "scene"
              ? "environment"
              : "composite");
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
        const response = await fetch("/api/upload", {
          method: "POST",
          body: (() => {
            const form = new FormData();
            form.append("image", file, file.name);
            form.append("kind", kind);
            form.append("comfy_url", comfyUrl);
            return form;
          })(),
        });
        const uploaded = (await response.json().catch(() => ({}))) as {
          name?: string;
          subfolder?: string;
          error?: string;
        };
        if (!response.ok || !uploaded.name)
          throw new Error(uploaded.error ?? `上传${file.name}失败`);
        setReferenceAssets((current) => ({
          ...current,
          [key]: {
            name: file.name,
            url: URL.createObjectURL(file),
            comfyName: uploaded.name,
            comfySubfolder: uploaded.subfolder || undefined,
            kind,
            sourcePath: `资产/${folderName}/${asset.name}/${reference.file}`,
          },
        }));
        uploadedKeys.push(key);
        uploadedRoles.push(role);
      }
      setPromptSubjects((current) => {
        const subjects = [...(current[shotId] ?? [])];
        const child = {
          name: asset.name,
          assetKeys: uploadedKeys,
          assetRoles: Object.fromEntries(
            uploadedKeys.map((key, index) => [key, uploadedRoles[index] ?? "composite"]),
          ),
        };
        if (
          parentIndex !== null &&
          subjects[parentIndex]
        ) {
          const parent = subjects[parentIndex];
          if (
            (parent.children ?? []).some(
              (item) =>
                item.name.trim().toLowerCase() ===
                asset.name.trim().toLowerCase(),
            )
          )
            return current;
          subjects[parentIndex] = {
            ...parent,
            children: [...(parent.children ?? []), child],
          };
          return { ...current, [shotId]: subjects };
        }
        if (
          subjects.some(
            (subject) =>
              subject.name.trim().toLowerCase() ===
              asset.name.trim().toLowerCase(),
          )
        )
          return current;
        return { ...current, [shotId]: [...subjects, child] };
      });
      setAssetSubjectPickerOpen(false);
      setAssetSubjectParentIndex(null);
      assetSubjectParentIndexRef.current = null;
      setGenerationStatus(`已将资产“${asset.name}”绑定到当前片段`);
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? `绑定资产失败：${error.message}`
          : "绑定资产失败",
      );
    }
  }
  function bindReferenceToSubject(assetKey: string, subjectIndex: number) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      let subjects = [...(current[shotId] ?? [])];
      subjects = subjects.map((subject) => ({
        ...subject,
        assetKeys: subject.assetKeys.filter((key) => key !== assetKey),
      }));
      const target = subjects[subjectIndex];
      if (!target) return current;
      subjects[subjectIndex] = {
        ...target,
        assetKeys: [...target.assetKeys, assetKey],
      };
      return { ...current, [shotId]: subjects };
    });
  }
  function updateSubjectAssetRole(
    subjectIndex: number,
    assetKey: string,
    role: string,
  ) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setPromptSubjects((current) => {
      const subjects = [...(current[shotId] ?? [])];
      const subject = subjects[subjectIndex];
      if (!subject) return current;
      subjects[subjectIndex] = {
        ...subject,
        assetRoles: { ...subject.assetRoles, [assetKey]: role },
      };
      return { ...current, [shotId]: subjects };
    });
  }
  function generateH3Prompt(promptMode = activeMode) {
    if (!taskShot) return;
    const durationSeconds = Number.parseFloat(duration) || 6;
    const segments = getPromptSegments(taskShot.id);
    const rawPrompt = prompt.trim();
    const plainPrompt =
      rawPrompt &&
      !/^(?:For the target video|How the reference pictures align|(?:subject_definitions|integrated_multimodal_description):)/i.test(
        rawPrompt,
      )
        ? rawPrompt
        : "";
    const frameMode = promptMode === "I2VA" ? keyframeMode : null;
    const frameAnchor =
      frameMode === "first_last"
        ? "The opening composition follows <Picture 1>, and the action develops continuously toward the final composition established by <Picture 2>."
        : frameMode === "last"
          ? "The action develops continuously toward the final composition established by <Picture 1>."
          : frameMode === "first"
            ? "The opening composition, subjects, clothing, lighting, and spatial relationships remain consistent with <Picture 1> as the action develops forward."
            : "";
    const speakerIds = new Map<string, number>();
    const subjects = promptSubjects[taskShot.id] ?? [];
    const refFields = {
      ...ref2vaDefaults,
      ...(ref2vaFields[taskShot.id] ?? {}),
    };
    const childReferenceBindings = (subject: PromptSubject) =>
      (subject.children ?? []).flatMap((child) =>
        child.assetKeys
          .map((assetKey) => {
            const reference = referenceMentionOptions().find(
              (item) => item.assetKey === assetKey,
            );
            return reference
              ? {
                  child,
                  reference,
                  role: child.assetRoles?.[assetKey] ?? "composite",
                }
              : null;
          })
          .filter(
            (
              binding,
            ): binding is {
              child: PromptSubject;
              reference: ReferenceMentionOption;
              role: string;
            } => Boolean(binding),
          ),
      );
    const promptSegmentsText = segments
      .map((segment, index) => {
        const settings = { ...promptBuilderDefaults, ...segment.settings };
        const description =
          segment.description.trim() || (index === 0 ? plainPrompt : "");
        // Do not invent story actions when the user leaves a scene description blank.
        // The generated prompt should make the missing input explicit instead.
        const segmentDescription = formatPromptDescription(
          normalizeActionDescription(
            description ||
              "No specific action or dialogue is provided for this shot.",
          ),
          speakerIds,
          subjects,
        );
        const dialogueGuard = /<d>[^<]*<\/d>/i.test(segmentDescription)
          ? ""
          : " No spoken dialogue or vocalization occurs in this shot.";
        const start = Math.max(
          0,
          Math.min(
            durationSeconds,
            segment.start ?? (durationSeconds * index) / segments.length,
          ),
        );
        const timing =
          index === 0
            ? ""
            : ` At ${Math.floor(start / 60)
                .toString()
                .padStart(
                  2,
                  "0",
                )}:${(start % 60).toFixed(3).padStart(6, "0")},`;
        const cameraParts = [
          settings.framing && promptBuilderPhrases.framing[settings.framing],
          settings.camera && promptBuilderPhrases.camera[settings.camera],
          settings.lens && promptBuilderPhrases.lens[settings.lens],
        ].filter(Boolean);
        return `[Shot ${index + 1}]${timing}\nAction:\n${segmentDescription}${dialogueGuard}\nCamera:\n${cameraParts.length ? cameraParts.join(". ") + "." : "No specific camera language is set; follow the action naturally."}`;
      })
      .join("\n\n");
    const globalSettings = normalizePromptBuilderSettings(
      segments[0]?.settings ?? promptBuilderSettings[taskShot.id],
    );
    const styleOpening =
      promptBuilderPhrases.style[globalSettings.style] ??
      promptBuilderPhrases.style.realistic_cinematic;
    const musicSettings = globalSettings;
    const sound = ref2vaDefaults.soundscape;
    const customSoundscape = refFields.soundscape.trim();
    const soundscape = customSoundscape || sound;
    const music =
      musicSettings.music === "music"
        ? promptBuilderPhrases.music.music
        : promptBuilderPhrases.music.none;
    const refs = promptMode === "R2VA" ? referenceMentionOptions() : [];
    const subjectDefinitions = subjects
      .filter((subject) => subject.name.trim())
      .map((subject, index) => {
        const subjectRefs = subject.assetKeys
          .map((assetKey) =>
            refs.find((reference) => reference.assetKey === assetKey),
          )
          .filter((reference): reference is ReferenceMentionOption =>
            Boolean(reference),
          );
        const roles = subjectRefs.map(
          (reference) =>
            subject.assetRoles?.[reference.assetKey] ?? "composite",
        );
        const subjectKind = roles.includes("clothing")
          ? "clothing asset"
          : roles.includes("object")
            ? "prop asset"
            : roles.includes("environment")
              ? "environment asset"
              : roles.includes("voice")
                ? "audio-linked subject"
                : "subject";
        const sourceText = subjectRefs.length
          ? `, with ${subjectRefs
              .map((reference) => {
                const role =
                  subject.assetRoles?.[reference.assetKey] ?? "composite";
                const roleText =
                  role === "identity"
                    ? "facial identity reference"
                    : role === "full_body"
                      ? "full-body character reference showing the frontal view and left and right three-quarter views"
                      : role === "clothing"
                        ? "wardrobe reference"
                        : role === "pose"
                          ? "pose reference"
                          : role === "environment"
                            ? "environment reference"
                            : role === "object"
                              ? "object reference"
                              : role === "style"
                                ? "visual-style reference"
                                : "visual reference";
                return role === "clothing"
                  ? `${roleText} ${reference.token} (the sole authority for this subject's clothing and accessories throughout the target video; preserve all visible garment details consistently)`
                  : `${roleText} ${reference.token}`;
              })
              .join(", and ")}`
          : "";
        const childBindings = childReferenceBindings(subject);
        const childText = childBindings.length
          ? ` ${Array.from(
              new Map(
                childBindings.map(({ child, reference, role }) => [
                  child.name.trim().toLowerCase(),
                  { child, reference, role },
                ]),
              ).values(),
            )
              .map(({ child, role }) => {
                const references = childBindings
                  .filter(
                    (binding) =>
                      binding.child.name.trim().toLowerCase() ===
                      child.name.trim().toLowerCase(),
                  )
                  .map((binding) => binding.reference.token)
                  .join(", ");
                if (role === "clothing")
                  return `The subject wears the wardrobe asset named "${child.name.trim()}" shown in ${references}; this wardrobe reference is authoritative for the subject's clothing and accessories.`;
                if (role === "object")
                  return `The subject is associated with the prop asset named "${child.name.trim()}" shown in ${references}; preserve its visible design and placement when handled or shown.`;
                if (role === "environment")
                  return `The subject is situated in the environment asset named "${child.name.trim()}" shown in ${references}; preserve the environment's visible layout.`;
                return `The subject is accompanied by the asset named "${child.name.trim()}" shown in ${references}; preserve their visual relationship.`;
              })
              .join(" ")}`
          : "";
        return `<Subject ${index + 1}> is the ${subjectKind} named "${subject.name.trim()}"${sourceText}.${childText}`;
      })
      .join("\n");
    const referenceSummary = refs.length
      ? ` Use ${refs.map((reference) => reference.token).join(", ")} according to the subject, role, and temporal position assigned above.`
      : "";
    const visualBody = `${styleOpening} ${frameAnchor ? `${frameAnchor} ` : ""}${promptSegmentsText}\n\nContinuity:\nMaintain subject identity, facial features, hairstyle, body proportions, clothing, object positions, and spatial relationships throughout the target video. Maintain each subject's world-space position, screen-side relationship, facing direction, relative distance, and interaction geometry across shot changes. Unless the Action explicitly changes them, a cut may change framing or viewpoint but must not relocate, swap, or re-stage the subjects. Follow the assigned references consistently. A wardrobe reference is authoritative for its assigned subject; unless the Action explicitly changes the wardrobe, preserve it unchanged across every shot and do not replace, redesign, simplify, or borrow clothing or accessories from another reference. Dialogue and vocal audio follow only explicit <d> lines; speak lines in written order, one speaker at a time, without overlap, repetition, extension, or invention. Avoid unintended cuts, subtitles, and logos.${referenceSummary}`;
    let nextPrompt: string;
    if (promptMode === "R2VA") {
      const definitions =
        subjectDefinitions ||
        "<Subject 1> is the main subject described in the shot and should remain visually consistent throughout the target video.";
      const subjectRetention = subjects
        .filter((subject) => subject.name.trim())
        .map((subject, index) => {
          return `<Subject ${index + 1}> (appears throughout the target video): fully_preserved - preserve ${subject.name.trim()}'s identity, facial features, hairstyle, and body proportions throughout the target video.`;
        });
      const referenceRetention = refs
        .filter((reference) => reference.kind !== "image")
        .map((reference) =>
          reference.kind === "audio"
            ? `<${reference.token.slice(1, -1)}> (used throughout the target video): reference - use the referenced audio characteristics without copying an unrelated source signal.`
            : `<${reference.token.slice(1, -1)}> (used throughout the target video): weak_reference - use only the assigned source structure or motion relationship.`,
        );
      const summaryPrefix =
        "[reference generation] The target video is generated based on the provided references.";
      const customSummary = refFields.summary
        .trim()
        .replace(
          /^\[reference generation\]\s*The target video is (?:a realistic (?:live-action )?cinematic scene|generated) based on the provided references\.?\s*/i,
          "",
        )
        .trim();
      const summary = customSummary
        ? `${summaryPrefix} ${customSummary}`
        : summaryPrefix;
      const retentionAnalysis = refFields.retentionAnalysis
        .trim()
        .replace(
          /\(appears in \[Shot 1\]\)/gi,
          "(appears throughout the target video)",
        )
        .replace(/throughout the shot/gi, "throughout the target video");
      const wardrobeSubjects = subjects.filter((subject) =>
        subject.assetKeys.some(
          (assetKey) =>
            (subject.assetRoles?.[assetKey] ?? "composite") === "clothing",
        ) || childReferenceBindings(subject).some((binding) => binding.role === "clothing"),
      );
      const wardrobeContinuity =
        wardrobeSubjects.length &&
        !/exact wardrobe reference|wardrobe.*unchanged|garment or accessory/i.test(
          retentionAnalysis,
        )
          ? `\n${wardrobeSubjects.map((subject) => `The wardrobe reference assigned to "${subject.name.trim()}" is authoritative: preserve the exact clothing, colors, materials, accessories, and wearing state throughout the target video unless an explicit action changes them.`).join("\n")}`
          : "";
      nextPrompt = `subject_definitions:\n${definitions}\n\nsummary:\n${summary}\n\nretention_analysis:\n${retentionAnalysis || [...subjectRetention, ...referenceRetention].join("\n") || "<Subject 1> remains consistent throughout the target video."}${wardrobeContinuity}\n\ndetailed_description:\n${visualBody}\n\noverall_soundscape: ${soundscape}\n\nnon_diegetic_music: ${refFields.music.trim() || music}`;
    } else {
      const alignment =
        frameMode === "first_last"
          ? `How the reference pictures align with the target video — Picture 1 aligns with the 0.00-second mark of the target video; Picture 2 aligns with the ${durationSeconds.toFixed(2)}-second mark of the target video.`
          : frameMode === "last"
            ? `How the reference pictures align with the target video — <Picture 1> aligns with the ${durationSeconds.toFixed(2)}-second mark of the target video.`
            : frameMode === "first"
              ? "For the target video, at 0.00 seconds into the target video, <Picture 1> is fully referenced."
              : "";
      const field =
        promptMode === "T2VA"
          ? "integrated_multimodal_description"
          : "integrated_multimodal_description";
      nextPrompt = `${alignment ? `${alignment}\n\n` : ""}${field}:\n${visualBody}\n\noverall_soundscape: ${soundscape}\n\nnon_diegetic_music: ${music}`;
    }
    setPrompt(nextPrompt);
    setShotPrompts((current) => ({ ...current, [taskShot.id]: nextPrompt }));
    return nextPrompt;
  }
  function changeGenerationMode(nextMode: string) {
    setMode(nextMode);
    updateSetting("mode", nextMode);
    generateH3Prompt(nextMode);
  }
  function detectPromptTemplateMode(value: string) {
    const normalized = value.trim();
    if (!normalized) return null;
    if (/^subject_definitions:/i.test(normalized)) return "R2VA";
    if (
      /^(?:For the target video|How the reference pictures align)/i.test(
        normalized,
      )
    )
      return "I2VA";
    if (/^integrated_multimodal_description:/i.test(normalized)) return "T2VA";
    return null;
  }
  function openPromptViewer() {
    const nextPrompt = generateH3Prompt(activeMode);
    setPromptDraft(nextPrompt ?? "");
    setPromptViewerOpen(true);
  }
  function savePromptDraft() {
    if (!taskShot) return;
    const nextPrompt = promptDraft.trim();
    setPrompt(nextPrompt);
    setShotPrompts((current) => ({ ...current, [taskShot.id]: nextPrompt }));
    const total = Number.parseFloat(duration) || 6;
    const parsedShots = readPromptShots(nextPrompt, total);
    let syncedFields = false;
    if (parsedShots.length) {
      const existing = getPromptSegments(taskShot.id);
      const parsed = parsedShots.map((shot, index) => {
        const fallbackStart =
          index === 0
            ? 0
            : (existing[index]?.start ?? (total * index) / parsedShots.length);
        const start = shot.start ?? fallbackStart;
        return {
          ...(existing[index] ?? {
            id: `${taskShot.id}-segment-${index + 1}`,
            settings: { ...promptBuilderDefaults },
          }),
          description: shot.action,
          settings: inferPromptCameraSettings(
            shot.camera,
            existing[index]?.settings,
          ),
          start: Math.max(0, Math.min(total, start)),
          end: total,
        };
      });
      parsed.forEach((segment, index) => {
        const nextStart = parsed[index + 1]?.start;
        parsed[index] = {
          ...segment,
          end:
            nextStart === undefined
              ? total
              : Math.max(segment.start ?? 0, nextStart),
        };
      });
      setPromptSegments((current) => ({ ...current, [taskShot.id]: parsed }));
      setActivePromptSegment((current) => ({
        ...current,
        [taskShot.id]: Math.min(current[taskShot.id] ?? 0, parsed.length - 1),
      }));
      syncedFields = true;
    }
    if (promptHasField(nextPrompt, "subject_definitions")) {
      const summary = readPromptField(nextPrompt, "summary");
      const retentionAnalysis = readPromptField(
        nextPrompt,
        "retention_analysis",
      );
      const soundscape = readPromptField(nextPrompt, "overall_soundscape");
      const music = readPromptField(nextPrompt, "non_diegetic_music");
      const parsedSubjects = readPromptSubjects(nextPrompt);
      const editableSummary = summary
        .replace(
          /^\[reference generation\]\s*The target video is generated based on the provided references\.?\s*/i,
          "",
        )
        .trim();
      if (parsedSubjects.length) {
        const options = referenceMentionOptions();
        setPromptSubjects((current) => {
          const existing = current[taskShot.id] ?? [];
          const subjects = parsedSubjects.map((parsedSubject, index) => {
            const previous = existing[index];
            const referencedKeys = parsedSubject.tokens
              .map((token) =>
                options.find(
                  (option) =>
                    option.token.toLowerCase() === token.toLowerCase(),
                ),
              )
              .filter((option): option is ReferenceMentionOption =>
                Boolean(option),
              )
              .filter(
                (option, optionIndex, allOptions) =>
                  allOptions.findIndex((candidate) => {
                    const candidateAsset = referenceAssets[candidate.assetKey];
                    const optionAsset = referenceAssets[option.assetKey];
                    if (candidateAsset && optionAsset) {
                      const candidateIdentity = candidateAsset.comfyName
                        ? `${candidateAsset.comfySubfolder ?? ""}/${candidateAsset.comfyName}`
                        : candidateAsset.name;
                      const optionIdentity = optionAsset.comfyName
                        ? `${optionAsset.comfySubfolder ?? ""}/${optionAsset.comfyName}`
                        : optionAsset.name;
                      return candidateIdentity === optionIdentity;
                    }
                    return candidate.assetKey === option.assetKey;
                  }) === optionIndex,
              )
              .map((option) => option.assetKey);
            return {
              ...(previous ?? { assetKeys: referencedKeys }),
              name: parsedSubject.name,
              assetKeys: referencedKeys.length
                ? referencedKeys
                : (previous?.assetKeys ?? []),
            };
          });
          return { ...current, [taskShot.id]: subjects };
        });
      }
      setRef2vaFields((current) => ({
        ...current,
        [taskShot.id]: {
          ...ref2vaDefaults,
          ...(current[taskShot.id] ?? {}),
          ...(promptHasField(nextPrompt, "summary")
            ? { summary: editableSummary }
            : {}),
          ...(promptHasField(nextPrompt, "retention_analysis")
            ? { retentionAnalysis }
            : {}),
          ...(promptHasField(nextPrompt, "overall_soundscape")
            ? { soundscape }
            : {}),
          ...(promptHasField(nextPrompt, "non_diegetic_music")
            ? { music }
            : {}),
        },
      }));
      syncedFields = true;
    }
    setPromptViewerOpen(false);
    setPromptNotice({
      type: "success",
      text: syncedFields
        ? "完整提示词已保存，并同步到 H3 提示词模块"
        : "完整提示词已保存（未检测到可回写的结构化片段）",
    });
  }
  function shotElapsed(shotId: string) {
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
  async function chooseOutputDirectory() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setGenerationStatus("当前浏览器不支持目录选择");
      return;
    }
    try {
      const directory = await picker();
      const writableDirectory = directory as WritableDirectoryHandle;
      const permission = writableDirectory.requestPermission
        ? await writableDirectory.requestPermission({ mode: "readwrite" })
        : "granted";
      if (permission !== "granted") {
        setGenerationStatus("没有输出目录写入权限");
        return;
      }
      setOutputDirectory(directory);
      setOutputDirectoryName(directory.name || "已选择输出目录");
      void saveDirectoryHandle(directory).catch(() => {
        // The current selection remains usable even if persistence is unavailable.
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setGenerationStatus("选择输出目录失败");
    }
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
        const characters = await getProjectAssetFolder(directory, "角色");
        const names: string[] = [];
        const thumbnails: Record<string, string> = {};
        for await (const [entryName, entry] of characters.entries())
          if (entry.kind === "directory") {
            names.push(entryName);
            const thumbnail = await readCharacterThumbnail(
              await characters.getDirectoryHandle(entryName),
            );
            if (thumbnail) thumbnails[entryName] = thumbnail;
          }
        setProjectCharacterNames(names);
        setProjectCharacterThumbnails(thumbnails);
      } catch {
        setProjectCharacterNames([]);
      }
      try {
        const loaded = await readProjectShots(directory);
        if (loaded) applyProjectShotRecords(loaded);
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
    const names: string[] = [];
    const files: Record<string, ProjectTreeCharacterFile[]> = {};
    const thumbnails: Record<string, string> = {};
    try {
      const characters = await getProjectAssetFolder(projectDirectory, "角色");
      for await (const [entryName, entry] of characters.entries())
        if (entry.kind === "directory") {
          names.push(entryName);
          const character = await characters.getDirectoryHandle(entryName);
          const rows: ProjectTreeCharacterFile[] = [];
          for await (const [category, categoryEntry] of character.entries())
            if (categoryEntry.kind === "directory") {
              const folder = await character.getDirectoryHandle(category);
              for await (const [fileName, fileEntry] of folder.entries())
                if (fileEntry.kind === "file")
                  rows.push({ name: fileName, category });
            }
          files[entryName] = rows;
          const thumbnail = await readCharacterThumbnail(character);
          if (thumbnail) thumbnails[entryName] = thumbnail;
        }
    } catch {
      /* Projects can be valid even when the character folder is empty or missing. */
    }
    setProjectCharacterNames(names);
    setProjectCharacterThumbnails(thumbnails);
    setProjectCharacterFiles(files);
    const assets: ProjectTreeAsset[] = [];
    for (const type of [
      "scene",
      "clothing",
      "prop",
      "audio",
      "custom",
    ] as const) {
      try {
        const folderName =
          type === "scene"
            ? "场景"
            : type === "clothing"
              ? "服装"
              : type === "prop"
                ? "道具"
                : type === "audio"
                  ? "音频"
                  : "自定义";
        const folder = await getProjectAssetFolder(
          projectDirectory,
          folderName,
        );
        for await (const [name, entry] of folder.entries()) {
          const assetType =
            type === "scene" && entry.kind === "directory" ? "scene" : type;
          assets.push({
            name,
            type: assetType,
            thumbnail:
              assetType === "clothing" && entry.kind === "directory"
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
    setGenerationStatus(`项目树已刷新，找到 ${names.length} 个角色`);
  }
  function applyProjectShotRecords(records: ProjectShotRecord[]) {
    setShots(
      records.map(
        ({ generation: _generation, references: _references, prompt: _prompt, ...shot }) => shot,
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
    setShotPrompts({});
    const segments = Object.fromEntries(
      records
        .filter((record) => record.prompt?.detailed_description?.length)
        .map((record) => [record.id, record.prompt!.detailed_description!]),
    );
    setPromptSegments(segments);
    const fields = Object.fromEntries(
      records
        .filter((record) => record.prompt)
        .map((record) => [
          record.id,
          {
            ...ref2vaDefaults,
            summary: record.prompt?.summary ?? "",
            retentionAnalysis: record.prompt?.retention_analysis ?? "",
            soundscape:
              record.prompt?.overall_soundscape ?? ref2vaDefaults.soundscape,
            music: record.prompt?.non_diegetic_music ?? ref2vaDefaults.music,
          },
        ]),
    );
    setRef2vaFields(fields);
    const subjects = Object.fromEntries(
      records
        .filter((record) => record.subjects?.length)
        .map((record) => [
          record.id,
          record.subjects!,
        ]),
    );
    setPromptSubjects(subjects);
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
      if (loaded) applyProjectShotRecords(loaded);
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
          setProjectCharacterNames([]);
          setProjectCharacterFiles({});
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
  async function removeProjectCharacter(name: string) {
    if (
      !projectDirectory ||
      !window.confirm(
        `确定删除角色“${name}”吗？\n\n这会删除该角色的身份参考图、声音文件和角色配置。`,
      )
    )
      return;
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
        window.alert("没有角色目录删除权限，请重新授权后再试");
        return;
      }
      const characters = await getProjectAssetFolder(projectDirectory, "角色");
      if (!characters.removeEntry) {
        window.alert("当前浏览器不支持删除角色目录");
        return;
      }
      await characters.removeEntry(name, { recursive: true });
      setProjectCharacterNames((current) =>
        current.filter((item) => item !== name),
      );
      setProjectCharacterFiles((current) => {
        const next = { ...current };
        delete next[name];
        return next;
      });
      setGenerationStatus(`已删除角色“${name}”`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `删除角色“${name}”失败：${error.message}`
          : `删除角色“${name}”失败，请检查项目目录权限`;
      setGenerationStatus(message);
      window.alert(message);
    }
  }
  async function removeProjectAsset(asset: ProjectTreeAsset) {
    if (!projectDirectory) return;
    const label =
      asset.type === "scene"
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
    if (!window.confirm(`确定删除${label}“${asset.name}”吗？`)) return;
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
      const folderName =
        asset.type === "scene"
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
      const folder = await getProjectAssetFolder(projectDirectory, folderName);
      if (!folder.removeEntry) {
        window.alert("当前浏览器不支持删除资产");
        return;
      }
      await folder.removeEntry(asset.name, { recursive: true });
      setProjectAssets((current) =>
        current.filter(
          (item) => !(item.type === asset.type && item.name === asset.name),
        ),
      );
      setGenerationStatus(`已删除${label}“${asset.name}”`);
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? `删除${label}“${asset.name}”失败：${error.message}`
          : `删除${label}“${asset.name}”失败，请检查项目目录权限`;
      setGenerationStatus(message);
      window.alert(message);
    }
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
      setEngineSettingsOpen(false);
      setGenerationStatus(`ComfyUI 地址已更新：${normalized}`);
    } catch {
      setGenerationStatus(
        "请输入有效的 ComfyUI 地址，例如 http://127.0.0.1:8188",
      );
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
          className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">ComfyUI 连接设置</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">
                生成、状态查询和参考素材上传都会使用这个地址。
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEngineSettingsOpen(false)}
              className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="关闭 ComfyUI 连接设置"
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
      setProjectCharacterNames([]);
      setProjectCharacterFiles({});
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
      if (loaded) applyProjectShotRecords(loaded);
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
            if (loaded) applyProjectShotRecords(loaded);
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
          setProjectCharacterNames([]);
          setProjectCharacterFiles({});
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
    setNewCustomAssetFile(null);
    setAssetDialog(true);
  }
  async function createNamedAsset(
    kind: "scene" | "clothing" | "prop" | "custom",
  ) {
    const name = newAssetName.trim();
    if (!name || !projectDirectory) return;
    try {
      const folderName =
        kind === "scene"
          ? "场景"
          : kind === "clothing"
            ? "服装"
            : kind === "prop"
              ? "道具"
              : "自定义";
      const manifestName =
        kind === "scene"
          ? "scene.json"
          : kind === "clothing"
            ? "clothing.json"
            : kind === "prop"
              ? "prop.json"
              : "asset.json";
      const label =
        kind === "scene"
          ? "场景"
          : kind === "clothing"
            ? "服装"
            : kind === "prop"
              ? "道具"
              : "自定义资产";
      const folder = await getProjectAssetFolder(projectDirectory, folderName, {
        create: true,
      });
      const asset = await folder.getDirectoryHandle(name, { create: true });
      const file = await asset.getFileHandle(manifestName, { create: true });
      const writable = await file.createWritable();
      const attachedFile =
        kind === "clothing"
          ? newClothingFile
          : kind === "prop"
            ? newPropFile
            : kind === "custom"
              ? newCustomAssetFile
              : null;
      const references = attachedFile
        ? [
            {
              file: attachedFile.name,
              mimeType: attachedFile.type,
              role:
                kind === "clothing"
                  ? "clothing"
                  : kind === "prop"
                    ? "object"
                    : undefined,
            },
          ]
        : [];
      await writable.write(
        JSON.stringify(
          {
            id: stableAssetId(kind, name),
            name,
            type: kind,
            createdAt: new Date().toISOString(),
            references,
          },
          null,
          2,
        ),
      );
      await writable.close();
      if (attachedFile) {
        if (
          (kind === "clothing" || kind === "prop") &&
          !attachedFile.type.startsWith("image/")
        )
          throw new Error(
            `${kind === "clothing" ? "服装" : "道具"}参考必须是图片文件`,
          );
        const target = await asset.getFileHandle(attachedFile.name, {
          create: true,
        });
        const targetWritable = await target.createWritable();
        await targetWritable.write(await attachedFile.arrayBuffer());
        await targetWritable.close();
      }
      setProjectAssets((current) =>
        current.some((item) => item.type === kind && item.name === name)
          ? current
          : [
              ...current,
              {
                name,
                type: kind,
                thumbnail:
                  kind === "clothing" && attachedFile
                    ? URL.createObjectURL(attachedFile)
                    : undefined,
              },
            ],
      );
      setNewAssetName("");
      setNewClothingFile(null);
      setNewPropFile(null);
      setAssetDialog(false);
      setGenerationStatus(`${label}“${name}”已创建`);
    } catch {
      const label =
        kind === "scene"
          ? "场景"
          : kind === "clothing"
            ? "服装"
            : kind === "prop"
              ? "道具"
              : "自定义资产";
      setGenerationStatus(`创建${label}失败，请检查项目目录权限或名称`);
    }
  }
  async function uploadProjectAsset(
    event: React.ChangeEvent<HTMLInputElement>,
    kind: "audio",
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !projectDirectory) return;
    try {
      const folder = await getProjectAssetFolder(projectDirectory, "音频", {
        create: true,
      });
      const target = await folder.getFileHandle(file.name, { create: true });
      const writable = await target.createWritable();
      await writable.write(await file.arrayBuffer());
      await writable.close();
      setProjectAssets((current) =>
        current.some((asset) => asset.type === kind && asset.name === file.name)
          ? current
          : [...current, { name: file.name, type: kind }],
      );
      setAssetDialog(false);
      setGenerationStatus(`音频“${file.name}”已添加`);
    } catch {
      setGenerationStatus("添加音频失败，请检查项目目录权限");
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
        description: "创建角色身份与声音参考目录",
        icon: UserRound,
      },
      {
        type: "scene",
        label: "场景",
        description: "创建场景及环境参考目录",
        icon: MapPinned,
      },
      {
        type: "clothing",
        label: "服装",
        description: "创建可复用的服装资产目录",
        icon: Shirt,
      },
      {
        type: "prop",
        label: "道具",
        description: "创建可复用的道具资产目录",
        icon: Package,
      },
      {
        type: "audio",
        label: "音频",
        description: "导入音频参考素材",
        icon: AudioLines,
      },
      {
        type: "custom",
        label: "自定义资产",
        description: "创建任意类型的可复用资产",
        icon: Box,
      },
    ];
    const namedAssetLabel =
      assetType === "scene"
        ? "场景"
        : assetType === "clothing"
          ? "服装"
          : assetType === "prop"
            ? "道具"
            : assetType === "custom"
              ? "自定义资产"
              : "";
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
            角色只包含身份和声音；服装、道具、场景、音频和自定义资产可复用。
          </p>
          {!assetType ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {options.map(({ type, label, description, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    type === "character"
                      ? (setAssetDialog(false), setCharacterDialog(true))
                      : setAssetType(type)
                  }
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
              {(assetType === "scene" ||
                assetType === "clothing" ||
                assetType === "prop" ||
                assetType === "custom") && (
                <>
                  <label htmlFor="new-asset-name" className="field-label">
                    {namedAssetLabel}名称
                  </label>
                  <input
                    id="new-asset-name"
                    value={newAssetName}
                    onChange={(event) => setNewAssetName(event.target.value)}
                    placeholder={
                      assetType === "scene"
                        ? "例如：麦当劳店内"
                        : assetType === "clothing"
                          ? "例如：男主的灰色风衣"
                          : assetType === "prop"
                            ? "例如：桌上的咖啡杯"
                            : "例如：年代设定、镜头模板或品牌规范"
                    }
                    className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
                    autoFocus
                  />
                  {(assetType === "clothing" || assetType === "prop") && (
                    <>
                      <label
                        htmlFor="new-reference-asset-file"
                        className="field-label mt-4"
                      >
                        {assetType === "clothing" ? "服装" : "道具"}参考图
                      </label>
                      <input
                        id="new-reference-asset-file"
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          assetType === "clothing"
                            ? setNewClothingFile(
                                event.target.files?.[0] ?? null,
                              )
                            : setNewPropFile(event.target.files?.[0] ?? null)
                        }
                        className="mt-2 block w-full text-xs text-muted-foreground"
                      />
                    </>
                  )}
                  {assetType === "clothing" && (
                    <>
                      <label
                        htmlFor="new-clothing-file"
                        className="field-label mt-4"
                      >
                        服装参考图
                      </label>
                      <input
                        id="new-clothing-file"
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          setNewClothingFile(event.target.files?.[0] ?? null)
                        }
                        className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
                      />
                    </>
                  )}
                  {assetType === "custom" && (
                    <>
                      <label
                        htmlFor="new-custom-asset-file"
                        className="field-label mt-4"
                      >
                        附带文件（可选）
                      </label>
                      <input
                        id="new-custom-asset-file"
                        type="file"
                        onChange={(event) =>
                          setNewCustomAssetFile(event.target.files?.[0] ?? null)
                        }
                        className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
                      />
                    </>
                  )}
                  <div className="mt-5 flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setAssetType(null)}>
                      返回
                    </Button>
                    <Button
                      onClick={() => void createNamedAsset(assetType)}
                      disabled={!newAssetName.trim() || !projectDirectory}
                    >
                      创建{namedAssetLabel}
                    </Button>
                  </div>
                </>
              )}
              {assetType === "audio" && (
                <>
                  <label className="field-label">选择音频文件</label>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={(event) =>
                      void uploadProjectAsset(event, "audio")
                    }
                    className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:font-medium file:text-primary-foreground"
                  />
                  <div className="mt-5 flex justify-end">
                    <Button variant="ghost" onClick={() => setAssetType(null)}>
                      返回
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
  async function createCharacter() {
    const name = newCharacterName.trim();
    if (!name) return;
    const halfBodyFile = newCharacterHalfBodyFile;
    const fullBodyFile = newCharacterFullBodyFile;
    const voiceFile = newCharacterVoiceFile;
    if (!halfBodyFile || !fullBodyFile) {
      setGenerationStatus("请先上传半身正脸和全身多视角身份参考图");
      return;
    }
    if (
      !halfBodyFile.type.startsWith("image/") ||
      !fullBodyFile.type.startsWith("image/")
    ) {
      setGenerationStatus("身份参考必须是图片文件");
      return;
    }
    if (voiceFile && !voiceFile.type.startsWith("audio/")) {
      setGenerationStatus("声音参考必须是音频文件");
      return;
    }
    if (!projectDirectory) {
      setGenerationStatus("请先选择项目目录");
      return;
    }
    try {
      const characters = await getProjectAssetFolder(projectDirectory, "角色", {
        create: true,
      });
      const character = await characters.getDirectoryHandle(name, {
        create: true,
      });
      const identity = await character.getDirectoryHandle("身份", {
        create: true,
      });
      const voice = await character.getDirectoryHandle("声音", {
        create: true,
      });
      const identityReferences = [
        {
          role: "identity",
          view: "front_half",
          file: halfBodyFile.name,
          mimeType: halfBodyFile.type,
        },
        {
          role: "full_body",
          view: "multi_view",
          file: fullBodyFile.name,
          mimeType: fullBodyFile.type,
        },
      ];
      for (const identityReference of [
        { file: halfBodyFile, category: "半身正脸" },
        { file: fullBodyFile, category: "全身多视角" },
      ]) {
        const target = await identity.getFileHandle(
          identityReference.file.name,
          { create: true },
        );
        const writable = await target.createWritable();
        await writable.write(await identityReference.file.arrayBuffer());
        await writable.close();
      }
      const voiceReference = voiceFile
        ? { role: "voice", file: voiceFile.name, mimeType: voiceFile.type }
        : null;
      if (voiceFile) {
        const voiceTarget = await voice.getFileHandle(voiceFile.name, {
          create: true,
        });
        const voiceWritable = await voiceTarget.createWritable();
        await voiceWritable.write(await voiceFile.arrayBuffer());
        await voiceWritable.close();
      }
      const file = await character.getFileHandle("character.json", {
        create: true,
      });
      const writable = await file.createWritable();
      await writable.write(
        JSON.stringify(
          {
            id: stableAssetId("character", name),
            name,
            type: "character",
            createdAt: new Date().toISOString(),
            references: [
              ...identityReferences,
              ...(voiceReference ? [voiceReference] : []),
            ],
          },
          null,
          2,
        ),
      );
      await writable.close();
      setProjectCharacterNames((current) =>
        current.includes(name) ? current : [...current, name],
      );
      setProjectCharacterThumbnails((current) => ({
        ...current,
        [name]: URL.createObjectURL(halfBodyFile),
      }));
      const shotId = shots[activeShot]?.id;
      if (shotId)
        setPromptSubjects((current) => ({
          ...current,
          [shotId]: (current[shotId] ?? []).some(
            (subject) => subject.name.trim() === name,
          )
            ? (current[shotId] ?? [])
            : [...(current[shotId] ?? []), { name, assetKeys: [] }],
        }));
      setNewCharacterName("");
      setNewCharacterHalfBodyFile(null);
      setNewCharacterFullBodyFile(null);
      setNewCharacterVoiceFile(null);
      setCharacterDialog(false);
      setGenerationStatus(`角色“${name}”已创建`);
    } catch {
      setGenerationStatus("创建角色失败，请检查项目目录权限或角色名称");
    }
  }
  async function writeProjectManifest() {
    if (!projectDirectory) return;
    const file = await projectDirectory.getFileHandle("script.json", {
      create: true,
    });
    const writable = await file.createWritable();
    await writable.write(
      JSON.stringify(
        {
          project: { name: projectDirectoryName, version: 1 },
          clips: shots.map((item) => ({
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
    const subjects = shotSubjects
      .filter((subject) => subject.name.trim())
      .map((subject) => {
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
        return {
          subjectId: `subject-${shot.id}-${safeFileStem(subject.name.trim())}`,
          name: subject.name.trim(),
          references,
          ...(children.length ? { children } : {}),
        };
      });
    const manifestMode =
      (overrides.generation as { mode?: string } | undefined)?.mode ?? "T2VA";
    await writable.write(
      JSON.stringify(
        {
          id: shot.id,
          title: shot.title,
          ...(manifestMode === "R2VA" ? { references: { subjects } } : {}),
          ...overrides,
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
  async function openComfyOutputDirectory() {
    if (comfyUrl === "http://127.0.0.1:8188") {
      try {
        const helperResponse = await fetch(
          "http://127.0.0.1:3101/open-output",
          { method: "POST" },
        );
        const helperResult = (await helperResponse
          .json()
          .catch(() => ({}))) as { opened?: boolean };
        if (helperResponse.ok && helperResult.opened) {
          setGenerationStatus("已打开导演台输出目录");
          return;
        }
      } catch {
        // The helper is available when the project is started with `npm run dev`.
      }
    }
    try {
      const response = await fetch(
        `/api/output/open?comfy_url=${encodeURIComponent(comfyUrl)}`,
        { method: "POST" },
      );
      const result = (await response.json().catch(() => ({}))) as {
        opened?: boolean;
        path?: string;
        url?: string;
        error?: string;
      };
      if (!response.ok || !result.opened)
        throw new Error(result.error ?? "无法打开导演台输出目录");
      setGenerationStatus("已打开导演台输出目录");
    } catch (error) {
      setGenerationStatus(
        error instanceof Error
          ? `打开输出目录失败：${error.message}`
          : "打开输出目录失败",
      );
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
        if (archivedToProject)
          await writeClipManifest(targetShot, { output: finalName });
      } catch {
        archiveFailed = true;
        setGenerationStatus("视频已生成，但归档到项目片段目录失败");
      }
      setShotStages((current) => ({ ...current, [shotId]: "已完成" }));
      setShots((items) =>
        items.map((item) =>
          item.id === shotId ? { ...item, state: "已完成" } : item,
        ),
      );
      if (activeShotIdRef.current === shotId) {
        setVideoUrl(finalUrl);
        setGenerationStatus(
          archiveFailed
            ? "已完成，但归档到项目片段目录失败"
            : archivedToProject
              ? "已完成，视频已复制到当前项目片段"
              : "已完成，视频保留在 ComfyUI 输出目录",
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
    if (activeMode === "I2VA") {
      const frameLabels =
        keyframeMode === "first_last"
          ? ["首帧", "尾帧"]
          : [keyframeMode === "last" ? "尾帧" : "首帧"];
      const options: Array<ReferenceMentionOption | null> = frameLabels.map(
        (label, index) => {
          const frame = keyframes[`${taskShot.id}-${label}`];
          if (!frame) return null;
          return {
            kind: "image" as const,
            index,
            token: `<Picture ${index + 1}>`,
            name: frame.name,
            url: frame.url,
            ready: true,
            assetKey: `${taskShot.id}-${label}`,
          };
        },
      );
      return options.filter(
        (option): option is ReferenceMentionOption => option !== null,
      );
    }
    if (activeMode !== "R2VA") return [];
    const kindLabels: Record<ReferenceKind, string> = {
      image: "Picture",
      video: "Video",
      audio: "Audio",
    };
    const kindOrder: Record<ReferenceKind, number> = {
      image: 0,
      video: 1,
      audio: 2,
    };
    const options: Array<ReferenceMentionOption | null> = Object.entries(
      referenceAssets,
    ).map(([key, asset]) => {
      const prefix = `${taskShot.id}-`;
      if (!key.startsWith(prefix)) return null;
      const [kindText, indexText] = key.slice(prefix.length).split("-");
      if (kindText !== "image" && kindText !== "video" && kindText !== "audio")
        return null;
      const index = Number(indexText);
      if (!Number.isInteger(index)) return null;
      const kind = kindText as ReferenceKind;
      return {
        kind,
        index,
        token: `<${kindLabels[kind]} ${index + 1}>`,
        name: asset.name,
        url: asset.url,
        ready: true,
        assetKey: key,
      };
    });
    return options
      .filter((option): option is ReferenceMentionOption => option !== null)
      .sort(
        (left, right) =>
          kindOrder[left.kind] - kindOrder[right.kind] ||
          left.index - right.index,
      );
  }

  function updatePromptMention(value: string, caret: number | null) {
    if (caret === null) return;
    const atIndex = value.lastIndexOf("@", caret - 1);
    if (atIndex < 0) {
      setPromptMention(null);
      return;
    }
    const previous = value[atIndex - 1];
    if (previous && !/[\s([{,，。！？]/.test(previous)) {
      setPromptMention(null);
      return;
    }
    const query = value.slice(atIndex + 1, caret);
    if (/[\s<>{}]/.test(query)) {
      setPromptMention(null);
      return;
    }
    setPromptMention({ start: atIndex, end: caret, query });
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
    const popupHeight = 224;
    const rightSideLeft = markerRect.right + 6;
    const left =
      rightSideLeft + popupWidth <= window.innerWidth - 8
        ? rightSideLeft
        : Math.max(8, markerRect.left - popupWidth - 6);
    const top = Math.min(
      Math.max(8, markerRect.top - 4),
      Math.max(8, window.innerHeight - popupHeight - 8),
    );
    setMentionPosition({ left, top });
    mirror.remove();
  }

  function insertReferenceMention(option: ReferenceMentionOption) {
    if (!promptMention || !taskShot) return;
    const token = `${option.token} `;
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
              setShots((items) =>
                items.map((item) =>
                  item.id === shotId ? { ...item, state: "已完成" } : item,
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
    setVideoUrl(null);
    setSubmittingShots((current) => ({ ...current, [shotId]: true }));
    void fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shot_id: shotId,
        shot_title: taskShot.title,
        prompt,
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
            prompt,
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

  if (!taskShot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        {renderAssetDialog()}
        {renderProjectDeleteDialog()}
        {renderEngineSettingsDialog()}
        {characterDialog && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
            onMouseDown={() => setCharacterDialog(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 className="text-sm font-semibold">添加角色</h2>
              <label
                htmlFor="new-character-name-empty"
                className="field-label mt-4"
              >
                角色名称
              </label>
              <input
                id="new-character-name-empty"
                value={newCharacterName}
                onChange={(event) => setNewCharacterName(event.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
                autoFocus
              />
              <label
                htmlFor="new-character-half-body-empty"
                className="field-label mt-4"
              >
                半身正脸身份参考图
              </label>
              <input
                id="new-character-half-body-empty"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setNewCharacterHalfBodyFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              />
              <label
                htmlFor="new-character-full-body-empty"
                className="field-label mt-4"
              >
                全身多视角身份参考图
              </label>
              <input
                id="new-character-full-body-empty"
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setNewCharacterFullBodyFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              />
              <label
                htmlFor="new-character-voice-empty"
                className="field-label mt-4"
              >
                声音参考（可选）
              </label>
              <input
                id="new-character-voice-empty"
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  setNewCharacterVoiceFile(event.target.files?.[0] ?? null)
                }
                className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
              />
              <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
                两张身份参考图必填；声音参考可稍后补充。
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setCharacterDialog(false)}
                >
                  取消
                </Button>
                <Button
                  onClick={() => void createCharacter()}
                  disabled={
                    !newCharacterName.trim() ||
                    !newCharacterHalfBodyFile ||
                    !newCharacterFullBodyFile ||
                    !projectDirectory
                  }
                >
                  创建角色
                </Button>
              </div>
            </div>
          </div>
        )}
        {assetSubjectPickerOpen && (
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
            onMouseDown={() => setAssetSubjectPickerOpen(false)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <h2 className="text-sm font-semibold">从资产库绑定主体</h2>
              <p className="mt-1 text-[10px] text-muted-foreground">
                选择角色、服装、道具或场景，绑定到当前片段主体。
              </p>
              <div className="mt-4 space-y-1.5">
                {projectCharacterNames.length ? (
                  projectCharacterNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => void bindCharacterAsset(name)}
                      className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:border-primary/50"
                    >
                      <span className="grid size-8 place-items-center overflow-hidden rounded bg-muted">
                        {projectCharacterThumbnails[name] ? (
                          <img
                            src={projectCharacterThumbnails[name]}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : (
                          <UserRound className="size-3" />
                        )}
                      </span>
                      <span className="truncate">{name}</span>
                      <span className="ml-auto text-[9px] text-muted-foreground">
                        角色
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="py-3 text-center text-[10px] text-muted-foreground">
                    暂无角色资产
                  </p>
                )}
                {projectAssets.map((asset) => (
                  <button
                    key={`${asset.type}-${asset.name}`}
                    type="button"
                    onClick={() => void bindProjectAsset(asset)}
                    className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:border-primary/50"
                  >
                    <span className="grid size-8 place-items-center overflow-hidden rounded bg-muted">
                      {asset.thumbnail ? (
                        <img
                          src={asset.thumbnail}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-3" />
                      )}
                    </span>
                    <span className="truncate">{asset.name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      {asset.type === "clothing" ? "服装" : asset.type === "scene" ? "场景" : asset.type === "prop" ? "道具" : asset.type === "audio" ? "音频" : asset.type === "video" ? "视频" : "自定义"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAssetSubjectPickerOpen(false)}
                >
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
                onDeleteCharacter={removeProjectCharacter}
                onDeleteAsset={removeProjectAsset}
                characterFiles={projectCharacterFiles}
                assets={projectAssets}
                outputFiles={projectOutputFiles}
                projectName={projectDirectoryName}
                characters={projectCharacterNames.map((name) => ({
                  name,
                  thumbnail: projectCharacterThumbnails[name],
                }))}
                shots={[]}
                activeShot={0}
                onSelectShot={() => undefined}
                onAddShot={addShot}
                onAddAsset={openAssetDialog}
                onSelectCharacter={(name) => {
                  const subject = projectSubjectLibrary().find(
                    (item) => item.name === name,
                  );
                  if (subject) useProjectSubject(subject);
                }}
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
      {renderProjectDeleteDialog()}
      {renderEngineSettingsDialog()}
      {characterDialog && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setCharacterDialog(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">添加角色</h2>
            <label htmlFor="new-character-name" className="field-label mt-4">
              角色名称
            </label>
            <input
              id="new-character-name"
              value={newCharacterName}
              onChange={(event) => setNewCharacterName(event.target.value)}
              className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none"
              autoFocus
            />
            <label
              htmlFor="new-character-half-body"
              className="field-label mt-4"
            >
              半身正脸身份参考图
            </label>
            <input
              id="new-character-half-body"
              type="file"
              accept="image/*"
              onChange={(event) =>
                setNewCharacterHalfBodyFile(event.target.files?.[0] ?? null)
              }
              className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
            />
            <label
              htmlFor="new-character-full-body"
              className="field-label mt-4"
            >
              全身多视角身份参考图
            </label>
            <input
              id="new-character-full-body"
              type="file"
              accept="image/*"
              onChange={(event) =>
                setNewCharacterFullBodyFile(event.target.files?.[0] ?? null)
              }
              className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
            />
            <label htmlFor="new-character-voice" className="field-label mt-4">
              声音参考（可选）
            </label>
            <input
              id="new-character-voice"
              type="file"
              accept="audio/*"
              onChange={(event) =>
                setNewCharacterVoiceFile(event.target.files?.[0] ?? null)
              }
              className="mt-2 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground"
            />
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              两张身份参考图必填；声音参考可稍后补充。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCharacterDialog(false)}>
                取消
              </Button>
              <Button
                onClick={() => void createCharacter()}
                disabled={
                  !newCharacterName.trim() ||
                  !newCharacterHalfBodyFile ||
                  !newCharacterFullBodyFile ||
                  !projectDirectory
                }
              >
                创建角色
              </Button>
            </div>
          </div>
        </div>
      )}
      {assetSubjectPickerOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setAssetSubjectPickerOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="text-sm font-semibold">从资产库绑定主体</h2>
            <p className="mt-1 text-[10px] text-muted-foreground">
              选择角色、服装、道具或场景，绑定到当前片段主体。
            </p>
            <div className="mt-4 space-y-1.5">
              {projectCharacterNames.length ? (
                projectCharacterNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => void bindCharacterAsset(name)}
                    className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:border-primary/50"
                  >
                    <span className="grid size-8 place-items-center overflow-hidden rounded bg-muted">
                      {projectCharacterThumbnails[name] ? (
                        <img
                          src={projectCharacterThumbnails[name]}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-3" />
                      )}
                    </span>
                    <span className="truncate">{name}</span>
                    <span className="ml-auto text-[9px] text-muted-foreground">
                      角色
                    </span>
                  </button>
                ))
              ) : (
                <p className="py-3 text-center text-[10px] text-muted-foreground">
                  暂无角色资产
                </p>
              )}
              {projectAssets.map((asset) => (
                <button
                  key={`${asset.type}-${asset.name}`}
                  type="button"
                  onClick={() => void bindProjectAsset(asset)}
                  className="flex w-full items-center gap-2 rounded-md border border-border p-2 text-left text-xs hover:border-primary/50"
                >
                  <span className="grid size-8 place-items-center overflow-hidden rounded bg-muted">
                    {asset.thumbnail ? (
                      <img
                        src={asset.thumbnail}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <Package className="size-3" />
                    )}
                  </span>
                  <span className="truncate">{asset.name}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground">
                    {asset.type === "clothing" ? "服装" : asset.type === "scene" ? "场景" : asset.type === "prop" ? "道具" : asset.type === "audio" ? "音频" : asset.type === "video" ? "视频" : "自定义"}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAssetSubjectPickerOpen(false)}
              >
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
              onDeleteCharacter={removeProjectCharacter}
              onDeleteAsset={removeProjectAsset}
              characterFiles={projectCharacterFiles}
              assets={projectAssets}
              outputFiles={projectOutputFiles}
              projectName={projectDirectoryName}
              characters={projectCharacterNames.map((name) => ({
                name,
                thumbnail: projectCharacterThumbnails[name],
              }))}
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
              onSelectCharacter={(name) => {
                const subject = projectSubjectLibrary().find(
                  (item) => item.name === name,
                );
                if (subject) useProjectSubject(subject);
              }}
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
              <span className="text-[10px] text-zinc-500">{activeMode}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pt-2">
              {activeMode === "R2VA" && (
                <div className="rounded-lg border border-border bg-muted/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="field-label">
                      参考主体（subject_definitions）
                    </span>
                    <Button
                      type="button"
                      onClick={() => {
                        assetSubjectParentIndexRef.current = null;
                        setAssetSubjectParentIndex(null);
                        setAssetSubjectPickerOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[10px]"
                      aria-label="添加主体"
                      title="从资产库添加主体"
                    >
                      <Plus className="size-3" />
                      添加主体
                    </Button>
                  </div>
                  {projectSubjectLibrary().filter((subject) =>
                    (promptSubjects[taskShot.id] ?? []).some(
                      (item) => item.name.trim().toLowerCase() === subject.name.trim().toLowerCase(),
                    ),
                  ).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {projectSubjectLibrary().filter((subject) =>
                        (promptSubjects[taskShot.id] ?? []).some(
                          (item) => item.name.trim().toLowerCase() === subject.name.trim().toLowerCase(),
                        ),
                      ).map((subject) => {
                        const used = (promptSubjects[taskShot.id] ?? []).some(
                          (item) =>
                            item.name.trim().toLowerCase() ===
                            subject.name.trim().toLowerCase(),
                        );
                        return (
                          <button
                            key={subject.name}
                            type="button"
                            disabled={used}
                            onClick={() => useProjectSubject(subject)}
                            className={`rounded border px-2 py-1 text-[9px] ${used ? "border-primary/30 bg-primary/10 text-primary/60" : "border-border bg-muted/20 hover:border-primary/50"}`}
                          >
                            {used ? "已使用 · " : "使用 · "}
                            {subject.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-2 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-1.5">
                    {(promptSubjects[taskShot.id] ?? []).map(
                      (subject, subjectIndex) => (
                        <div
                          key={`subject-${subjectIndex}`}
                          className="flex min-w-0 flex-col gap-1.5 rounded-md border border-primary/35 bg-primary/5 p-1.5"
                        >
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <input
                              value={subject.name}
                              onChange={(event) =>
                                subject.assetKeys[0]
                                  ? setReferenceSubjectName(
                                      subject.assetKeys[0],
                                      event.target.value,
                                    )
                                  : updatePromptSubject(subjectIndex, {
                                      name: event.target.value,
                                    })
                              }
                              placeholder="主体名称，如：男主"
                              aria-label={`主体 ${subjectIndex + 1} 名称`}
                              className="h-7 min-w-0 flex-1 basis-32 rounded border border-border/70 bg-black/10 px-1.5 text-[10px] outline-none placeholder:text-muted-foreground"
                            />
                            <div className="order-3 flex min-w-0 basis-full flex-wrap gap-1.5">
                              {subject.assetKeys.map((assetKey) => {
                                const option = referenceMentionOptions().find(
                                  (item) => item.assetKey === assetKey,
                                );
                                return option ? (
                                  <div key={assetKey} className="w-24 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleSubjectAsset(
                                          subjectIndex,
                                          assetKey,
                                        )
                                      }
                                      className="flex w-full items-center gap-1 rounded border border-primary/30 bg-primary/10 p-1 text-left"
                                      title="点击取消绑定"
                                    >
                                      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-black/20">
                                        {option.kind === "image" ? (
                                          <img
                                            src={option.url}
                                            alt=""
                                            className="size-full object-contain"
                                          />
                                        ) : option.kind === "video" ? (
                                          <video
                                            src={option.url}
                                            muted
                                            className="size-full object-contain"
                                          />
                                        ) : (
                                          <FileAudio className="size-3 text-muted-foreground" />
                                        )}
                                      </span>
                                      <span className="min-w-0 truncate text-[9px]">
                                        {option.token}
                                        <br />
                                        <span className="text-muted-foreground">
                                          {option.name}
                                        </span>
                                      </span>
                                    </button>
                                  </div>
                                ) : null;
                              })}
                              {subject.children?.map((child, childIndex) =>
                                child.assetKeys.map((assetKey) => {
                                  const option = referenceMentionOptions().find(
                                    (item) => item.assetKey === assetKey,
                                  );
                                  return option ? (
                                    <div
                                      key={`child-${childIndex}-${assetKey}`}
                                      className="flex w-24 shrink-0 items-center gap-1 rounded border border-primary/20 bg-primary/5 p-1"
                                      title={`${child.name}（子主体）`}
                                    >
                                      <span className="grid size-7 shrink-0 place-items-center overflow-hidden rounded bg-black/20">
                                        {option.kind === "image" ? (
                                          <img
                                            src={option.url}
                                            alt=""
                                            className="size-full object-contain"
                                          />
                                        ) : option.kind === "video" ? (
                                          <video
                                            src={option.url}
                                            muted
                                            className="size-full object-contain"
                                          />
                                        ) : (
                                          <FileAudio className="size-3" />
                                        )}
                                      </span>
                                      <span className="min-w-0 truncate text-[9px]">
                                        {option.token}
                                        <br />
                                        <span className="text-muted-foreground">
                                          {child.name}
                                        </span>
                                      </span>
                                    </div>
                                  ) : null;
                                }),
                              )}
                            </div>
                            <div className="order-2 flex shrink-0 items-center gap-0.5">
                              <Button
                                type="button"
                                onClick={() => {
                                  assetSubjectParentIndexRef.current = subjectIndex;
                                  setAssetSubjectParentIndex(subjectIndex);
                                  setAssetSubjectPickerOpen(true);
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-7 gap-1 px-2 text-[10px] text-zinc-500 hover:bg-primary/10 hover:text-primary"
                                aria-label="添加关联参考"
                                title="添加关联参考"
                              >
                                <Plus className="size-3" />
                                添加关联参考
                              </Button>
                              <Button
                                type="button"
                                onClick={() =>
                                  removePromptSubject(subjectIndex)
                                }
                                variant="ghost"
                                size="icon-sm"
                                className="size-7 text-zinc-500 hover:bg-red-500/10 hover:text-red-300"
                                aria-label={`删除主体 ${subjectIndex + 1}`}
                                title="删除主体"
                              >
                                <X className="size-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}
              {activeMode === "R2VA" && (
                <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2">
                  {(
                    [
                      [
                        "summary",
                        "任务摘要（summary）",
                        "手动填写本次视频的整体意图",
                      ],
                      [
                        "retentionAnalysis",
                        "保留分析（retention_analysis）",
                        "说明主体、身份、服装和参考内容需要如何保持",
                      ],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label key={key}>
                      <span className="field-label">{label}</span>
                      <textarea
                        value={ref2vaFields[taskShot.id]?.[key] ?? ""}
                        onChange={(event) =>
                          setRef2vaFields((current) => ({
                            ...current,
                            [taskShot.id]: {
                              ...ref2vaDefaults,
                              ...(current[taskShot.id] ?? {}),
                              [key]: event.target.value,
                            },
                          }))
                        }
                        placeholder={placeholder}
                        className="mt-1 min-h-14 w-full resize-y rounded-md border border-border bg-muted/25 p-2 text-[10px] leading-4 outline-none placeholder:text-muted-foreground focus:border-primary/60"
                      />
                    </label>
                  ))}
                </div>
              )}
              <div className="rounded-lg border border-border bg-muted/20 p-2">
                <div className="flex items-center justify-between">
                  <span className="field-label">
                    详细描述（detailed_description）
                  </span>
                  <Button
                    type="button"
                    onClick={() => setStylePanelOpen(true)}
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[10px] text-zinc-300"
                  >
                    <Palette className="size-3" />
                    视觉风格
                  </Button>
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {activeSegments.map((segment, index) => (
                    <div
                      key={"row-" + segment.id}
                      className="relative rounded-md border border-border/70 bg-muted/15 p-1.5"
                    >
                      <div className="flex min-w-0 items-end gap-1.5">
                        <span className="field-label mb-2 w-10 shrink-0">
                          画面 {index + 1}
                        </span>
                        <label className="shrink-0">
                          <span className="field-label mb-1">开始</span>
                          <input
                            type="number"
                            min="0"
                            max={durationSeconds}
                            step="0.1"
                            value={segment.start ?? 0}
                            onChange={(event) =>
                              updatePromptSegment(index, {
                                start: Number(event.target.value) || 0,
                              })
                            }
                            className="h-8 w-14 rounded border border-border bg-muted/25 px-1.5 text-[10px] outline-none"
                          />
                        </label>
                        <label className="shrink-0">
                          <span className="field-label mb-1">结束</span>
                          <input
                            type="number"
                            min="0"
                            max={durationSeconds}
                            step="0.1"
                            value={segment.end ?? durationSeconds}
                            onChange={(event) =>
                              updatePromptSegment(index, {
                                end: Number(event.target.value) || 0,
                              })
                            }
                            className="h-8 w-14 rounded border border-border bg-muted/25 px-1.5 text-[10px] outline-none"
                          />
                        </label>
                        <div className="relative min-w-0 flex-1">
                          <input
                            value={segment.description}
                            onChange={(event) => {
                              const value = event.target.value;
                              updatePromptSegment(index, {
                                description: value,
                              });
                              const at = value.lastIndexOf("@");
                              const query = at >= 0 ? value.slice(at + 1) : "";
                              if (at >= 0 && !/[\s<>{}]/.test(query))
                                setSubjectMention({
                                  segmentIndex: index,
                                  start: at,
                                  query,
                                  selected: 0,
                                });
                              else setSubjectMention(null);
                            }}
                            onKeyDown={(event) => {
                              if (
                                !subjectMention ||
                                subjectMention.segmentIndex !== index
                              )
                                return;
                              const options = getMentionSubjects().filter(
                                (subject) =>
                                  subject.name
                                    .toLowerCase()
                                    .includes(
                                      subjectMention.query.toLowerCase(),
                                    ),
                              );
                              if (
                                event.key === "ArrowDown" ||
                                event.key === "ArrowUp"
                              ) {
                                event.preventDefault();
                                setSubjectMention({
                                  ...subjectMention,
                                  selected:
                                    (subjectMention.selected +
                                      (event.key === "ArrowDown"
                                        ? 1
                                        : options.length - 1)) %
                                    Math.max(1, options.length),
                                });
                              } else if (event.key === "Enter") {
                                event.preventDefault();
                                commitSubjectMention(subjectMention.selected);
                              } else if (event.key === "Escape")
                                setSubjectMention(null);
                            }}
                            placeholder="输入 @ 选择主体引用"
                            className="h-8 w-full rounded border border-border bg-muted/25 px-2 text-[10px] outline-none placeholder:text-muted-foreground"
                          />
                          {subjectMention?.segmentIndex === index && (
                            <div className="absolute bottom-full left-0 z-40 mb-1 w-64 rounded-lg border border-border bg-card p-1 shadow-xl">
                              {getMentionSubjects()
                                .filter((subject) =>
                                  subject.name
                                    .toLowerCase()
                                    .includes(
                                      subjectMention.query.toLowerCase(),
                                    ),
                                )
                                .map((subject, optionIndex) => {
                                  const thumb = subject.assetKeys
                                    .map((key) =>
                                      referenceMentionOptions().find(
                                        (item) => item.assetKey === key,
                                      ),
                                    )
                                    .find((item) => item?.kind === "image");
                                  return (
                                    <button
                                      type="button"
                                      key={optionIndex}
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        commitSubjectMention(optionIndex);
                                      }}
                                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[10px] ${optionIndex === subjectMention.selected ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}
                                    >
                                      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded bg-muted">
                                        {thumb ? (
                                          <img
                                            src={thumb.url}
                                            alt=""
                                            className="size-full object-cover"
                                          />
                                        ) : (
                                          <span className="text-[9px] text-muted-foreground">
                                            主体
                                          </span>
                                        )}
                                      </span>
                                      <span className="truncate">
                                        {subject.name}
                                      </span>
                                    </button>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          onClick={() => setSettingsSegmentIndex(index)}
                          variant="outline"
                          size="sm"
                          className="h-8 shrink-0 gap-1 px-2 text-[10px] text-zinc-300"
                        >
                          <SlidersHorizontal className="size-3" />
                          镜头语言
                        </Button>
                        <Button
                          type="button"
                          onClick={() => removePromptSegment(index)}
                          disabled={activeSegments.length <= 1}
                          variant="ghost"
                          size="icon-sm"
                          className="size-8 shrink-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-30"
                          aria-label={"删除画面 " + (index + 1)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    onClick={addPromptSegment}
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-3 text-[10px] text-zinc-300 hover:bg-white/8"
                  >
                    <Plus className="size-3" />
                    添加画面
                  </Button>
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  每个画面可设置开始和结束秒数；生成时会按时间范围、画面顺序和各自的镜头语言写入
                  H3 提示词。
                </p>
              </div>
              {activeMode === "R2VA" && (
                <div className="grid gap-2 rounded-lg border border-border bg-muted/20 p-2">
                  {(
                    [
                      [
                        "soundscape",
                        "环境声音（overall_soundscape）",
                        "填写环境声和动作声；不要重复对白",
                      ],
                      [
                        "music",
                        "非叙事音乐（non_diegetic_music）",
                        "填写观众听到但角色听不到的背景音乐，没有则填 N/A",
                      ],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label key={key}>
                      <span className="field-label">{label}</span>
                      <textarea
                        value={ref2vaFields[taskShot.id]?.[key] ?? ""}
                        onChange={(event) =>
                          setRef2vaFields((current) => ({
                            ...current,
                            [taskShot.id]: {
                              ...ref2vaDefaults,
                              ...(current[taskShot.id] ?? {}),
                              [key]: event.target.value,
                            },
                          }))
                        }
                        placeholder={placeholder}
                        className="mt-1 min-h-14 w-full resize-y rounded-md border border-border bg-muted/25 p-2 text-[10px] leading-4 outline-none placeholder:text-muted-foreground focus:border-primary/60"
                      />
                    </label>
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
                查看完整提示词
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
                <h2 className="text-sm font-semibold">完整提示词</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  内容根据当前片段的 clip.json 提示词字段实时拼接 · {activeMode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPromptViewerOpen(false)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭完整提示词"
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
                variant="ghost"
                onClick={() => setPromptViewerOpen(false)}
                className="h-8 px-4 text-xs"
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}
      {stylePanelOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onMouseDown={() => setStylePanelOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">视觉风格</h2>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  应用于当前片段的 detailed_description 开场风格，只生成一次。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStylePanelOpen(false)}
                className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label="关闭视觉风格"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="field-label mb-1">风格预设</span>
                <select
                  value={activeStyle}
                  onChange={(event) =>
                    updatePromptBuilder("style", event.target.value, 0)
                  }
                  aria-label="视觉风格预设"
                  className="select-like h-9 w-full appearance-none px-2 text-xs"
                >
                  <option value="">未设置（使用默认写实风格）</option>
                  {promptBuilderOptions.style.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="mt-3 text-[9px] leading-4 text-muted-foreground">
              风格控制视觉媒介、质感、色彩和整体呈现；景别、运镜与焦段仍在镜头语言中单独设置。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  updatePromptBuilder("style", "realistic_cinematic", 0)
                }
                className="h-8 px-4 text-xs"
              >
                恢复默认
              </Button>
              <Button
                type="button"
                onClick={() => setStylePanelOpen(false)}
                className="h-8 bg-[#f4bd50] px-4 text-xs font-semibold text-[#17120a] hover:bg-[#ffd070]"
              >
                完成
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
