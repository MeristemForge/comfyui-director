'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleStop, Clapperboard, CloudCog, Dice5, FileAudio, Film, FolderOpen, ImagePlus, MoreHorizontal, Play, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';

type Shot = { id: string; title: string; detail: string; meta: string; state: string };
const initialShots: Shot[] = [];
const shotPromptDefaults: Record<string, string> = {};
const modelProfiles = {
  H3: { modes: ['T2VA', 'I2VA', 'R2VA'], images: 9, videos: 3, audios: 3, resolutions: ['608 × 352', '736 × 416', '864 × 480', '960 × 544', '1056 × 608', '1152 × 640', '1216 × 672', '1280 × 736', '1344 × 768'] },
  'LTX 2.5': { modes: ['T2V', 'I2V'], images: 1, videos: 1, audios: 0, resolutions: ['768 × 512', '1024 × 576', '1280 × 720', '1920 × 1080'] },
  'Wan 3.0': { modes: ['T2V', 'I2V', 'V2V'], images: 4, videos: 1, audios: 1, resolutions: ['832 × 480', '1280 × 720', '1280 × 768', '1920 × 1080'] },
} as const;
type ShotSettings = { duration: string; resolution: string; aspect: string; fps: string; mode: string; model: keyof typeof modelProfiles; turbo: boolean };
const shotSettingDefaults: ShotSettings = { duration: '6 秒', resolution: '864 × 480', aspect: '16:9', fps: '24 fps', mode: 'T2VA', model: 'H3', turbo: true };

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};
type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  removeEntry?: (name: string, options?: { recursive?: boolean }) => Promise<void>;
};

function openDirectoryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('comfyui-director', 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('handles')) database.createObjectStore('handles');
      if (!database.objectStoreNames.contains('state')) database.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDirectorState(state: PersistedDirectorState) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction('state', 'readwrite').objectStore('state').put(state, 'director-state');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  database.close();
}

async function loadDirectorState() {
  const database = await openDirectoryDatabase();
  const state = await new Promise<PersistedDirectorState | undefined>((resolve, reject) => {
    const request = database.transaction('state', 'readonly').objectStore('state').get('director-state');
    request.onsuccess = () => resolve(request.result as PersistedDirectorState | undefined); request.onerror = () => reject(request.error);
  });
  database.close();
  return state;
}

async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const database = await openDirectoryDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction('handles', 'readwrite').objectStore('handles').put(handle, 'output-directory');
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  database.close();
}

async function loadDirectoryHandle() {
  const database = await openDirectoryDatabase();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const request = database.transaction('handles', 'readonly').objectStore('handles').get('output-directory');
    request.onsuccess = () => resolve(request.result as FileSystemDirectoryHandle | undefined); request.onerror = () => reject(request.error);
  });
  database.close();
  return handle;
}
type ShotTask = { promptId: string; seed: string; seedMode: 'fixed' | 'random'; prompt: string; title: string; fileName: string; duration: string; resolution: string; aspect: string; fps: string; mode: string; model: keyof typeof modelProfiles; turbo: boolean; steps: number; startedAt: number; keyframeMode: string; inputImage?: string; referenceImages?: string[]; referenceVideos?: string[]; referenceAudios?: string[] };
type ReferenceKind = 'image' | 'video' | 'audio';
type ReferenceAsset = { name: string; url: string; comfyName?: string; comfySubfolder?: string; kind: ReferenceKind };
type PersistedReferenceAsset = { name: string; comfyName?: string; comfySubfolder?: string; kind: ReferenceKind };
type PersistedDirectorState = { shots?: typeof initialShots; shotPrompts?: Record<string, string>; shotSettings?: Record<string, ShotSettings>; shotVideos?: Record<string, string>; shotFileNames?: Record<string, string>; shotProgress?: Record<string, number>; generationDurations?: Record<string, number>; referenceAssets?: Record<string, PersistedReferenceAsset> };
type PromptMention = { start: number; end: number; query: string };
type ReferenceMentionOption = { kind: ReferenceKind; index: number; token: string; name: string; url: string; ready: boolean };

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function safeFileStem(title: string) {
  return (title.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim().replace(/[. ]+$/g, '').slice(0, 120) || '未命名镜头');
}

export default function Home() {
  const [activeShot, setActiveShot] = useState(0);
  const [shots, setShots] = useState(initialShots);
  const [mode, setMode] = useState('T2VA');
  const [model, setModel] = useState<keyof typeof modelProfiles>('H3');
  const [turboMode, setTurboMode] = useState(true);
  const [keyframeMode, setKeyframeMode] = useState<'first' | 'last' | 'first_last'>('first');
  const [shotProgress, setShotProgress] = useState<Record<string, number>>({});
  const [shotStages, setShotStages] = useState<Record<string, string>>({});
  const [railWidth, setRailWidth] = useState(188);
  const [panelWidth, setPanelWidth] = useState(380);
  const [generationStatus, setGenerationStatus] = useState('等待生成');
  const [shotTasks, setShotTasks] = useState<Record<string, ShotTask>>({});
  const [generationDurations, setGenerationDurations] = useState<Record<string, number>>({});
  const [elapsedNow, setElapsedNow] = useState(Date.now());
  const [submittingShots, setSubmittingShots] = useState<Record<string, boolean>>({});
  const clientId = 'comfyui-director-ui';
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [shotVideos, setShotVideos] = useState<Record<string, string>>({});
  const [shotFileNames, setShotFileNames] = useState<Record<string, string>>({});
  const [keyframes, setKeyframes] = useState<Record<string, { name: string; url: string; comfyName?: string }>>({});
  const [referenceAssets, setReferenceAssets] = useState<Record<string, ReferenceAsset>>({});
  const [outputDirectory, setOutputDirectory] = useState<FileSystemDirectoryHandle | null>(null);
  const [outputDirectoryName, setOutputDirectoryName] = useState('未选择输出目录');
  const [seed, setSeed] = useState('7483926150842719');
  const [seedMode, setSeedMode] = useState<'fixed' | 'random'>('fixed');
  const [fps, setFps] = useState('24 fps');
  const [duration, setDuration] = useState('6 秒');
  const [resolution, setResolution] = useState('864 × 480');
  const [aspect, setAspect] = useState('16:9');
  const [prompt, setPrompt] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const [promptMention, setPromptMention] = useState<PromptMention | null>(null);
  const [mentionPosition, setMentionPosition] = useState({ left: 16, top: 16 });
  const [addDialog, setAddDialog] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [shotPrompts, setShotPrompts] = useState<Record<string, string>>(shotPromptDefaults);
  const [shotSettings, setShotSettings] = useState<Record<string, ShotSettings>>(() => Object.fromEntries(shots.map((shot) => [shot.id, { ...shotSettingDefaults, duration: `${shot.detail.match(/\d+/)?.[0] ?? 6} 秒`, mode: (shot.detail.match(/T2VA|I2VA|R2VA/)?.[0] ?? 'T2VA'), aspect: shot.id === '02' ? '2.35:1' : '16:9', resolution: shot.meta.split('·')[0].trim().replace(/\s*×\s*/, ' × ') }])));
  const [storageReady, setStorageReady] = useState(false);
  const [comfyConnected, setComfyConnected] = useState<boolean | null>(null);
  const profile = modelProfiles[model];
  const outputDirectoryTitle = outputDirectory ? `输出目录：${outputDirectoryName}` : '未选择输出目录，视频默认保存在 ComfyUI output 目录';
  const modes = profile.modes;
  const activeMode = (modes as readonly string[]).includes(mode) ? mode : modes[0];
  const availableResolution = (profile.resolutions as readonly string[]).includes(resolution) ? resolution : profile.resolutions[profile.resolutions.length - 1];
  const taskShot = shots[activeShot];
  const activeShotIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeTask = taskShot ? shotTasks[taskShot.id] : undefined;
  const activeSubmitting = taskShot ? Boolean(submittingShots[taskShot.id]) : false;
  const generating = Boolean(activeTask || activeSubmitting);
  const progress = taskShot ? shotProgress[taskShot.id] ?? (taskShot.state === '已完成' ? 100 : 0) : 0;
  const activeStage = taskShot ? shotStages[taskShot.id] : undefined;
  const frameButtonTitle = !videoUrl ? '先生成或加载当前镜头视频' : activeShot >= shots.length - 1 ? '请先创建下一个镜头' : '先用播放器进度条定位画面，再设为下一镜头首帧';
  const mentionOptions = promptMention ? referenceMentionOptions().filter((option) => `${option.token} ${option.name}`.toLowerCase().includes(promptMention.query.toLowerCase())) : [];

  useEffect(() => {
    let disposed = false;
    const restoreState = async () => {
      let localState: PersistedDirectorState | null = null;
      try {
        localState = JSON.parse(window.localStorage.getItem('comfyui-director-state') ?? 'null') as PersistedDirectorState | null;
      } catch {
        // Ignore malformed local state and try the project state instead.
      }
      const indexedState = typeof indexedDB === 'undefined' ? null : await loadDirectorState().catch(() => null);
      if (disposed) return;
      const saved: PersistedDirectorState = {
        ...(indexedState ?? {}),
        ...(localState ?? {}),
        referenceAssets: { ...(indexedState?.referenceAssets ?? {}), ...(localState?.referenceAssets ?? {}) },
      };
      if (saved.shots?.length) {
        const restoredShots = saved.shots.map((shot) => shot.state === '生成中' ? { ...shot, state: '草稿' } : shot);
        setShots(restoredShots);
        setActiveShot((current) => Math.min(current, restoredShots.length - 1));
      }
      if (saved.shotPrompts) setShotPrompts(saved.shotPrompts);
      if (saved.shotSettings) setShotSettings(saved.shotSettings);
      if (saved.shotVideos) setShotVideos(saved.shotVideos);
      if (saved.shotFileNames) setShotFileNames(saved.shotFileNames);
      if (saved.shotProgress) setShotProgress(saved.shotProgress);
      if (saved.generationDurations) setGenerationDurations(saved.generationDurations);
      if (saved.referenceAssets) setReferenceAssets(Object.fromEntries(Object.entries(saved.referenceAssets).map(([key, asset]) => {
        const params = new URLSearchParams({ filename: asset.comfyName ?? '', type: 'input' });
        if (asset.comfySubfolder) params.set('subfolder', asset.comfySubfolder);
        return [key, { ...asset, url: asset.comfyName ? `/api/video?${params.toString()}` : '' }];
      })));
      setStorageReady(true);
    };
    void restoreState();
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const persistedReferences = Object.fromEntries(Object.entries(referenceAssets).map(([key, asset]) => [key, { name: asset.name, comfyName: asset.comfyName, comfySubfolder: asset.comfySubfolder, kind: asset.kind }]));
    const state = { shots, shotPrompts, shotSettings, shotVideos, shotFileNames, shotProgress, generationDurations, referenceAssets: persistedReferences };
    window.localStorage.setItem('comfyui-director-state', JSON.stringify(state));
    if (typeof indexedDB !== 'undefined') void saveDirectorState(state).catch(() => {
      // Local storage remains available when IndexedDB is unavailable.
    });
  }, [storageReady, shots, shotPrompts, shotSettings, shotVideos, shotFileNames, shotProgress, generationDurations, referenceAssets]);

  useEffect(() => {
    activeShotIdRef.current = taskShot?.id ?? null;
  }, [taskShot?.id]);

  useEffect(() => {
    if (!storageReady || !taskShot) return;
    const settings = shotSettings[taskShot.id] ?? shotSettingDefaults;
    setPrompt(shotPrompts[taskShot.id] ?? '');
    setVideoUrl(shotVideos[taskShot.id] ?? null);
    setDuration(settings.duration); setResolution(settings.resolution); setAspect(settings.aspect); setFps(settings.fps); setMode(settings.mode); setModel(settings.model); setTurboMode(settings.turbo);
    setGenerationStatus(taskShot.state === '已完成' ? '已完成' : taskShot.state === '生成中' ? '正在生成' : taskShot.state === '失败' ? '生成失败' : taskShot.state === '已停止' ? '已停止' : '等待生成');
  }, [storageReady, taskShot?.id]);

  useEffect(() => {
    if (!Object.keys(shotTasks).length) return;
    const timer = window.setInterval(() => setElapsedNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [shotTasks]);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    void loadDirectoryHandle().then(async (handle) => {
      if (!handle) return;
      const writableHandle = handle as WritableDirectoryHandle;
      const permission = writableHandle.queryPermission ? await writableHandle.queryPermission({ mode: 'readwrite' }) : 'prompt';
      if (permission === 'granted') {
        setOutputDirectory(handle);
        setOutputDirectoryName(handle.name || '已选择输出目录');
      }
    }).catch(() => {
      // IndexedDB may be unavailable in private browsing; manual selection still works.
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const checkConnection = async () => {
      try {
        const response = await fetch('/api/comfyui/status', { cache: 'no-store' });
        const result = await response.json() as { connected?: boolean };
        if (!disposed) setComfyConnected(result.connected === true);
      } catch {
        if (!disposed) setComfyConnected(false);
      }
    };
    void checkConnection();
    const timer = window.setInterval(() => { void checkConnection(); }, 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, []);

  function selectShot(index: number) {
    const nextShot = shots[index];
    const settings = shotSettings[nextShot.id];
    const shotResolution = settings?.resolution ?? nextShot.meta.split('·')[0].trim();
    setActiveShot(index);
    activeShotIdRef.current = nextShot.id;
    setPrompt(shotPrompts[nextShot.id] ?? ''); setVideoUrl(shotVideos[nextShot.id] ?? null);
    setGenerationStatus(nextShot.state === '已完成' ? '已完成' : nextShot.state === '生成中' ? '正在生成' : nextShot.state === '失败' ? '生成失败' : nextShot.state === '已停止' ? '已停止' : '等待生成');
    if (nextShot.state !== '生成中') setShotProgress((current) => ({ ...current, [nextShot.id]: nextShot.state === '已完成' ? 100 : 0 }));
    setDuration(settings?.duration ?? `${nextShot.detail.match(/\d+/)?.[0] ?? 6} 秒`); setResolution(shotResolution); setAspect(settings?.aspect ?? '16:9'); setFps(settings?.fps ?? '24 fps'); setMode(settings?.mode ?? 'T2VA'); setModel(settings?.model ?? 'H3'); setTurboMode(settings?.turbo ?? shotSettingDefaults.turbo);
  }
  function addShot() {
    setNewTitle(`未命名镜头 ${String(shots.length + 1).padStart(2, '0')}`); setAddDialog(true); return;
  }
  function confirmAddShot() {
    const title = newTitle.trim(); if (!title) return;
    const id = String(shots.reduce((max, shot) => Math.max(max, Number(shot.id) || 0), 0) + 1).padStart(2, '0');
    const shot = { id, title: title.trim(), detail: '6s · T2VA', meta: '864×480 · 16:9 · 24fps', state: '草稿' };
    setShots((current) => [...current, shot]);
    setShotPrompts((current) => ({ ...current, [id]: '' }));
    setShotSettings((current) => ({ ...current, [id]: { ...shotSettingDefaults } }));
    setActiveShot(shots.length);
    activeShotIdRef.current = id;
    setPrompt(''); setDuration('6 秒'); setResolution('864 × 480'); setAspect('16:9'); setFps('24 fps'); setMode('T2VA'); setModel('H3'); setTurboMode(true); setVideoUrl(null); setGenerationStatus('等待生成'); setShotProgress((current) => ({ ...current, [id]: 0 })); setAddDialog(false);
  }
  function renameShot(index: number) {
    const current = shots[index];
    const title = window.prompt('重命名镜头', current.title);
    if (!title?.trim()) return;
    setShots((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, title: title.trim() } : item));
  }
  function deleteShot(index: number) {
    setDeleteIndex(index); return;
  }
  async function deleteSavedShotFiles(shotId: string) {
    if (!outputDirectory) return;
    const writableDirectory = outputDirectory as WritableDirectoryHandle;
    if (!writableDirectory.removeEntry) return;
    const permission = writableDirectory.queryPermission ? await writableDirectory.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (permission !== 'granted') throw new Error('输出目录没有写入权限');
    try {
      await writableDirectory.removeEntry(`shot-${shotId}`, { recursive: true });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
    }
    // Remove files from the earlier flat layout as well.
    for (const name of [`shot-${shotId}.mp4`, `shot-${shotId}.json`]) {
      try { await writableDirectory.removeEntry(name); } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
    }
  }
  async function confirmDeleteShot() {
    if (deleteIndex === null) return;
    const index = deleteIndex;
    const deletedId = shots[index]?.id;
    if (deletedId) {
      try {
        await deleteSavedShotFiles(deletedId);
      } catch {
        if (activeShotIdRef.current === deletedId) setGenerationStatus('镜头已删除，但输出文件删除失败');
      }
    }
    const next = shots.filter((_, itemIndex) => itemIndex !== index);
    setShots(next);
    if (deletedId) {
      setShotPrompts((current) => { const nextPrompts = { ...current }; delete nextPrompts[deletedId]; return nextPrompts; });
      setShotSettings((current) => { const nextSettings = { ...current }; delete nextSettings[deletedId]; return nextSettings; });
      setShotVideos((current) => { const nextVideos = { ...current }; delete nextVideos[deletedId]; return nextVideos; });
      setShotFileNames((current) => { const nextFileNames = { ...current }; delete nextFileNames[deletedId]; return nextFileNames; });
      setShotProgress((current) => { const nextProgress = { ...current }; delete nextProgress[deletedId]; return nextProgress; });
      setGenerationDurations((current) => { const nextDurations = { ...current }; delete nextDurations[deletedId]; return nextDurations; });
      setShotTasks((current) => { const nextTasks = { ...current }; delete nextTasks[deletedId]; return nextTasks; });
      setSubmittingShots((current) => { const nextSubmitting = { ...current }; delete nextSubmitting[deletedId]; return nextSubmitting; });
      setReferenceAssets((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${deletedId}-`))));
    }
    const nextIndex = next.length ? Math.min(activeShot, next.length - 1) : 0;
    setActiveShot(nextIndex);
    const nextShot = next[nextIndex];
    if (nextShot) {
      const settings = shotSettings[nextShot.id] ?? shotSettingDefaults;
      setPrompt(shotPrompts[nextShot.id] ?? '');
      setVideoUrl(shotVideos[nextShot.id] ?? null);
      setDuration(settings.duration); setResolution(settings.resolution); setAspect(settings.aspect); setFps(settings.fps); setMode(settings.mode); setModel(settings.model); setTurboMode(settings.turbo);
      setGenerationStatus(nextShot.state === '已完成' ? '已完成' : nextShot.state === '生成中' ? '正在生成' : nextShot.state === '失败' ? '生成失败' : nextShot.state === '已停止' ? '已停止' : '等待生成');
    } else {
      setPrompt(''); setVideoUrl(null); setGenerationStatus('等待生成');
    }
    setDeleteIndex(null);
  }
  function updateSetting<K extends keyof ShotSettings>(key: K, value: ShotSettings[K]) {
    const shotId = shots[activeShot]?.id;
    if (!shotId) return;
    setShotSettings((current) => ({ ...current, [shotId]: { ...current[shotId], [key]: value } }));
  }
  function getShotSettings(shot: Shot) {
    return shotSettings[shot.id] ?? shotSettingDefaults;
  }
  function shotDetail(shot: Shot) {
    const settings = getShotSettings(shot);
    return `${settings.duration.replace(/\s*秒$/, 's')} · ${settings.mode} · ${settings.turbo ? '加速' : '标准'}`;
  }
  function shotMeta(shot: Shot) {
    const settings = getShotSettings(shot);
    return `${settings.resolution.replace(/\s*×\s*/, '×')} · ${settings.aspect} · ${settings.fps.replace(/\s+/g, '')}`;
  }
  function shotElapsed(shotId: string) {
    const task = shotTasks[shotId];
    return task ? elapsedNow - task.startedAt : generationDurations[shotId];
  }
  function stageForNode(nodeId: string | null | undefined) {
    if (!nodeId) return null;
    if (['119', '120', '127', '128', '134', '135', '143', '144', '145'].includes(nodeId)) return '加载模型';
    if (['125', '124', '123', '126', '131', '132', '133', '136', '137', '138', '139'].includes(nodeId)) return '正在采样';
    if (['121', '122'].includes(nodeId)) return '解码视频';
    if (nodeId === '130') return '封装视频';
    if (nodeId === '92') return '保存视频';
    return null;
  }
  async function chooseOutputDirectory() {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) {
      setGenerationStatus('当前浏览器不支持目录选择');
      return;
    }
    try {
      const directory = await picker();
      const writableDirectory = directory as WritableDirectoryHandle;
      const permission = writableDirectory.requestPermission ? await writableDirectory.requestPermission({ mode: 'readwrite' }) : 'granted';
      if (permission !== 'granted') {
        setGenerationStatus('没有输出目录写入权限');
        return;
      }
      setOutputDirectory(directory);
      setOutputDirectoryName(directory.name || '已选择输出目录');
      void saveDirectoryHandle(directory).catch(() => {
        // The current selection remains usable even if persistence is unavailable.
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setGenerationStatus('选择输出目录失败');
    }
  }
  async function saveVideoToDirectory(url: string, shotId: string, task: ShotTask, source?: string) {
    if (!outputDirectory) return;
    try {
      const writableDirectory = outputDirectory as WritableDirectoryHandle;
      const currentPermission = writableDirectory.queryPermission ? await writableDirectory.queryPermission({ mode: 'readwrite' }) : 'granted';
      if (currentPermission !== 'granted') throw new Error('输出目录没有写入权限，请重新选择目录');
      const response = await fetch(url);
      if (!response.ok) throw new Error('无法读取生成视频');
      const shotDirectory = await outputDirectory.getDirectoryHandle(`shot-${shotId}`, { create: true });
      const file = await shotDirectory.getFileHandle(task.fileName, { create: true });
      const writable = await file.createWritable();
      await writable.write(await response.blob());
      await writable.close();
      const metadata = await shotDirectory.getFileHandle('shot.json', { create: true });
      const metadataWriter = await metadata.createWritable();
      const elapsedMilliseconds = Date.now() - task.startedAt;
      await metadataWriter.write(JSON.stringify({
        id: shotId,
        file: task.fileName,
        shot_title: task.title,
        source: source ?? url,
        status: 'completed',
        prompt: task.prompt,
        noise_seed: task.seed,
        seed_mode: task.seedMode,
        model: task.model,
        mode: task.mode,
        turbo: task.turbo,
        steps: task.steps,
        keyframe_mode: task.keyframeMode,
        input_image: task.inputImage ?? null,
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
      }, null, 2));
      await metadataWriter.close();
      if (activeShotIdRef.current === shotId) setGenerationStatus('已完成，已保存到输出目录');
    } catch {
      if (activeShotIdRef.current === shotId) setGenerationStatus('已完成，保存到输出目录失败');
    }
  }
  async function uploadFrame(event: React.ChangeEvent<HTMLDivElement>) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });
    const response = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, mime: file.type, data }) });
    const uploaded = await response.json();
    const label = keyframeMode === 'last' ? '尾帧' : '首帧';
    const key = `${shots[activeShot].id}-${label}`;
    setKeyframes((current) => ({ ...current, [key]: { name: file.name, url: URL.createObjectURL(file), comfyName: uploaded.name } }));
  }

  function referenceKey(shotId: string, kind: ReferenceKind, index: number) {
    return `${shotId}-${kind}-${index}`;
  }

  async function uploadReference(event: React.ChangeEvent<HTMLInputElement>, kind: ReferenceKind, index: number) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !taskShot) return;
    const key = referenceKey(taskShot.id, kind, index);
    const url = URL.createObjectURL(file);
    setReferenceAssets((current) => ({ ...current, [key]: { name: file.name, url, kind } }));
    try {
      const form = new FormData();
      form.append('image', file);
      form.append('kind', kind);
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const uploaded = await response.json() as { name?: string; subfolder?: string; error?: string };
      if (!response.ok || !uploaded.name) throw new Error(uploaded.error ?? '上传参考素材失败');
      setReferenceAssets((current) => ({ ...current, [key]: { name: file.name, url, comfyName: uploaded.name, comfySubfolder: uploaded.subfolder || undefined, kind } }));
    } catch {
      setGenerationStatus('参考素材上传失败');
    }
  }

  function removeReference(kind: ReferenceKind, index: number) {
    if (!taskShot) return;
    const key = referenceKey(taskShot.id, kind, index);
    const asset = referenceAssets[key];
    if (asset?.url.startsWith('blob:')) URL.revokeObjectURL(asset.url);
    setReferenceAssets((current) => {
      const next = { ...current };
      const prefix = `${taskShot.id}-${kind}-`;
      const remaining = Object.entries(current)
        .filter(([entryKey]) => entryKey.startsWith(prefix))
        .map(([entryKey, entryAsset]) => ({ index: Number(entryKey.slice(prefix.length)), asset: entryAsset }))
        .filter((entry) => Number.isInteger(entry.index) && entry.index !== index)
        .sort((left, right) => left.index - right.index);
      Object.keys(next).filter((entryKey) => entryKey.startsWith(prefix)).forEach((entryKey) => { delete next[entryKey]; });
      remaining.forEach(({ asset: entryAsset }, nextIndex) => { next[referenceKey(taskShot.id, kind, nextIndex)] = entryAsset; });
      return next;
    });
  }

  function referenceCount(kind: ReferenceKind, limit: number) {
    if (!taskShot) return 0;
    return Array.from({ length: limit }, (_, index) => referenceAssets[referenceKey(taskShot.id, kind, index)]?.comfyName).filter(Boolean).length;
  }

  function referenceComfyFile(asset: ReferenceAsset | undefined) {
    if (!asset) return undefined;
    const filename = asset.comfyName ?? asset.name;
    return asset.comfySubfolder ? `${asset.comfySubfolder}/${filename}` : filename;
  }

  function referenceSlotCount(kind: ReferenceKind, limit: number) {
    if (!taskShot) return 0;
    const used = Array.from({ length: limit }, (_, index) => Boolean(referenceAssets[referenceKey(taskShot.id, kind, index)]));
    const usedCount = used.filter(Boolean).length;
    return Math.min(limit, Math.max(1, usedCount + 1));
  }

  function referenceTile(kind: ReferenceKind, index: number) {
    if (!taskShot) return null;
    const key = referenceKey(taskShot.id, kind, index);
    const asset = referenceAssets[key];
    const label = kind === 'image' ? `图 ${index + 1}` : kind === 'video' ? `视频 ${index + 1}` : `音频 ${index + 1}`;
    const accept = kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : 'audio/*';
    const accessibleLabel = asset ? `${label}：${asset.name}，点击替换` : `添加${label}`;
    return <label key={key} className="reference-slot relative overflow-hidden" aria-label={accessibleLabel} title={accessibleLabel}>
      {asset && kind === 'image' && <img src={asset.url} alt={`${label}缩略图`} className="absolute inset-0 size-full bg-black/30 object-contain opacity-80" />}
      {asset && kind === 'video' && <video src={asset.url} muted className="absolute inset-0 size-full bg-black/30 object-contain opacity-80" />}
      {!asset && <Plus aria-hidden="true" />}
      {asset && <span className="relative max-w-full truncate rounded bg-black/60 px-1.5 py-0.5">{asset.name}</span>}
      {asset && <button type="button" className="absolute right-0.5 top-0.5 z-20 grid size-4 place-items-center rounded-full bg-black/75 text-white/80 transition hover:bg-red-500 hover:text-white" aria-label={`删除${label}`} title={`删除${label}`} onMouseDown={(event) => event.preventDefault()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeReference(kind, index); }}><X className="size-3" /></button>}
      <input type="file" accept={accept} className="hidden" onChange={(event) => void uploadReference(event, kind, index)} />
    </label>;
  }

  function referenceMentionOptions() {
    if (!taskShot) return [] as ReferenceMentionOption[];
    const kindLabels: Record<ReferenceKind, string> = { image: 'Picture', video: 'Video', audio: 'Audio' };
    const kindOrder: Record<ReferenceKind, number> = { image: 0, video: 1, audio: 2 };
    return Object.entries(referenceAssets)
      .map(([key, asset]) => {
        const prefix = `${taskShot.id}-`;
        if (!key.startsWith(prefix)) return null;
        const [kindText, indexText] = key.slice(prefix.length).split('-');
        if (kindText !== 'image' && kindText !== 'video' && kindText !== 'audio') return null;
        const index = Number(indexText);
        if (!Number.isInteger(index)) return null;
        const kind = kindText as ReferenceKind;
        return { kind, index, token: `<${kindLabels[kind]} ${index + 1}>`, name: asset.name, url: asset.url, ready: true };
      })
      .filter((option): option is ReferenceMentionOption => Boolean(option))
      .sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind] || left.index - right.index);
  }

  function updatePromptMention(value: string, caret: number | null) {
    if (caret === null) return;
    const atIndex = value.lastIndexOf('@', caret - 1);
    if (atIndex < 0) { setPromptMention(null); return; }
    const previous = value[atIndex - 1];
    if (previous && !/[\s([{,，。！？]/.test(previous)) { setPromptMention(null); return; }
    const query = value.slice(atIndex + 1, caret);
    if (/[\s<>{}]/.test(query)) { setPromptMention(null); return; }
    setPromptMention({ start: atIndex, end: caret, query });
    const textarea = promptRef.current;
    if (!textarea) return;
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    const marker = document.createElement('span');
    const textareaRect = textarea.getBoundingClientRect();
    mirror.style.position = 'fixed';
    mirror.style.left = `${textareaRect.left - textarea.scrollLeft}px`;
    mirror.style.top = `${textareaRect.top - textarea.scrollTop}px`;
    mirror.style.visibility = 'hidden';
    mirror.style.pointerEvents = 'none';
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.boxSizing = 'border-box';
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.font = style.font;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = 'break-word';
    mirror.textContent = value.slice(0, caret) || '\u200b';
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const markerRect = marker.getBoundingClientRect();
    const popupWidth = 256;
    const popupHeight = 224;
    const rightSideLeft = markerRect.right + 6;
    const left = rightSideLeft + popupWidth <= window.innerWidth - 8
      ? rightSideLeft
      : Math.max(8, markerRect.left - popupWidth - 6);
    const top = Math.min(Math.max(8, markerRect.top - 4), Math.max(8, window.innerHeight - popupHeight - 8));
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
      setGenerationStatus(nextShot ? '视频尚未加载完成，无法截取当前帧' : '请先创建下一个镜头');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      setGenerationStatus('视频尚未加载完成，无法截取当前帧');
      return;
    }
    try {
      video.pause();
      if (video.seeking) {
        await new Promise<void>((resolve) => {
          let timeout = window.setTimeout(finish, 600);
          function finish() {
            window.clearTimeout(timeout);
            video.removeEventListener('seeked', finish);
            resolve();
          }
          video.addEventListener('seeked', finish, { once: true });
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建画布');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法提取视频帧')), 'image/png'));
      const sourceShotId = shots[activeShot].id;
      const fileName = `continuity-${sourceShotId}-to-${nextShot.id}-${Math.round(video.currentTime * 1000)}.png`;
      const url = URL.createObjectURL(blob);
      const key = `${nextShot.id}-首帧`;
      setKeyframes((current) => ({ ...current, [key]: { name: fileName, url } }));
      setShotSettings((current) => ({ ...current, [nextShot.id]: { ...(current[nextShot.id] ?? shotSettingDefaults), mode: 'I2VA' } }));
      setKeyframeMode('first');
      const form = new FormData();
      form.append('image', new File([blob], fileName, { type: 'image/png' }));
      const response = await fetch('/api/upload', { method: 'POST', body: form });
      const uploaded = await response.json() as { name?: string };
      if (!response.ok || !uploaded.name) throw new Error('上传首帧失败');
      setKeyframes((current) => ({ ...current, [key]: { name: fileName, url, comfyName: uploaded.name } }));
      setGenerationStatus(`已将当前帧设为镜头 ${nextShot.id} 首帧`);
    } catch {
      setGenerationStatus('提取或上传当前帧失败');
    }
  }

  function resizeRail(event: React.PointerEvent) {
    const startX = event.clientX;
    const startWidth = railWidth;
    const move = (moveEvent: PointerEvent) => setRailWidth(Math.max(150, Math.min(320, startWidth + moveEvent.clientX - startX)));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  }
  function resizePanel(event: React.PointerEvent) {
    const startX = event.clientX;
    const startWidth = panelWidth;
    const move = (moveEvent: PointerEvent) => setPanelWidth(Math.max(300, Math.min(520, startWidth - (moveEvent.clientX - startX))));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  }

  useEffect(() => {
    const tasks = Object.entries(shotTasks);
    if (!tasks.length) return;
    let disposed = false;
    const poll = async () => {
      await Promise.all(tasks.map(async ([shotId, task]) => {
        try {
          const result = await fetch(`/api/generate/status?id=${encodeURIComponent(task.promptId)}&shot=${encodeURIComponent(shotId)}&seed=${encodeURIComponent(task.seed)}&seed_mode=${task.seedMode}`).then((response) => response.json());
          if (disposed) return;
          if (result.status === 'queued') {
            if (activeShotIdRef.current === shotId) setGenerationStatus(`排队中${result.position ? ` · 前面 ${result.position - 1} 个任务` : ''}`);
            return;
          }
          if (result.status === 'running' && (!shotStages[shotId] || shotStages[shotId] === '排队中')) {
            setShotStages((current) => ({ ...current, [shotId]: '正在采样' }));
            if (activeShotIdRef.current === shotId) setGenerationStatus('正在采样');
          }
          if (result.status === 'completed') {
            setGenerationDurations((current) => ({ ...current, [shotId]: Date.now() - task.startedAt }));
            setShotFileNames((current) => ({ ...current, [shotId]: task.fileName }));
            setShotStages((current) => ({ ...current, [shotId]: '已完成' }));
            setShotTasks((current) => { const next = { ...current }; delete next[shotId]; return next; });
            setShotProgress((current) => ({ ...current, [shotId]: 100 }));
            setShotVideos((videos) => ({ ...videos, [shotId]: result.url }));
            setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: '已完成' } : item));
            if (activeShotIdRef.current === shotId) { setVideoUrl(result.url); setGenerationStatus('已完成'); }
            void saveVideoToDirectory(result.url, shotId, task, result.source);
          }
          if (result.status === 'error') {
            setShotTasks((current) => { const next = { ...current }; delete next[shotId]; return next; });
            setShotProgress((current) => ({ ...current, [shotId]: 0 }));
            setShotStages((current) => ({ ...current, [shotId]: '生成失败' }));
            setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: '失败' } : item));
            if (activeShotIdRef.current === shotId) setGenerationStatus(result.error ?? '生成失败');
          }
        } catch {
          // Keep polling while ComfyUI is temporarily unavailable.
        }
      }));
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 1200);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [shotTasks, shotStages]);

  useEffect(() => {
    const taskIds = Object.values(shotTasks).map((task) => task.promptId);
    if (!taskIds.length) return;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://127.0.0.1:8188/ws?clientId=${encodeURIComponent(clientId)}`);
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const message = JSON.parse(event.data) as { type?: string; data?: { prompt_id?: string; node?: string | null; value?: number; max?: number; step?: number; steps?: number; progress?: { value?: number; max?: number }; nodes?: Record<string, { value?: number; max?: number; state?: string }> } };
        const data = message.data;
        if (!data) return;
        const promptId = data.prompt_id;
        const matchedTask = promptId && taskIds.includes(promptId)
          ? Object.entries(shotTasks).find(([, task]) => task.promptId === promptId)
          : taskIds.length === 1 ? Object.entries(shotTasks)[0] : undefined;
        if (!matchedTask) return;
        const shotId = matchedTask[0];
        const eventStage = stageForNode(data.node);
        if (eventStage) {
          setShotStages((current) => ({ ...current, [shotId]: eventStage }));
          if (activeShotIdRef.current === shotId) setGenerationStatus(eventStage);
        }
        let ratio: number | null = null;
        if (Number.isFinite(data.step) && Number.isFinite(data.steps) && data.steps! > 0) ratio = data.step! / data.steps!;
        if (message.type === 'progress' && Number.isFinite(data.value) && Number.isFinite(data.max) && data.max! > 0) ratio = data.value! / data.max!;
        if (ratio === null && data.progress && Number.isFinite(data.progress.value) && Number.isFinite(data.progress.max) && data.progress.max! > 0) {
          ratio = data.progress.value! / data.progress.max!;
        }
        if (message.type === 'progress_state' && data.nodes) {
          const nodes = Object.values(data.nodes);
          const runningNode = nodes.find((node) => node.state === 'running' || node.state === 'executing');
          const currentNode = runningNode ?? nodes.find((node) => Number(node.value) < Number(node.max));
          if (currentNode && Number.isFinite(currentNode.value) && Number.isFinite(currentNode.max) && Number(currentNode.max) > 0) {
            ratio = Number(currentNode.value) / Number(currentNode.max);
          }
        }
        const stage = eventStage ?? (message.type === 'progress' || message.type === 'progress_state' ? '正在采样' : null);
        if (ratio === null && !stage) return;
        let percentage = stage === '加载模型' ? 5 : stage === '正在采样' ? 10 : stage === '解码视频' ? 90 : stage === '封装视频' ? 97 : stage === '保存视频' ? 99 : 1;
        if (ratio !== null) {
          const normalized = Math.max(0, Math.min(1, ratio));
          percentage = stage === '加载模型' ? normalized * 10 : stage === '解码视频' ? 90 + normalized * 7 : stage === '封装视频' ? 97 + normalized * 2 : stage === '保存视频' ? 99 : 10 + normalized * 80;
          if (stage === '正在采样' && activeShotIdRef.current === shotId) {
            const currentStep = Math.min(matchedTask[1].steps, Math.max(0, Math.round(normalized * matchedTask[1].steps)));
            setGenerationStatus(`正在采样 · ${currentStep}/${matchedTask[1].steps} 步`);
          }
        }
        setShotProgress((current) => ({ ...current, [shotId]: Math.max(0, Math.min(99, Math.round(percentage))) }));
      } catch {
        // Ignore non-JSON or unsupported ComfyUI events.
      }
    };
    return () => socket.close();
  }, [shotTasks]);

  function toggleGeneration() {
    if (!taskShot) return;
    const shotId = taskShot.id;
    if (activeTask) {
      void fetch('/api/generate/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt_id: activeTask.promptId }) });
      setShotTasks((current) => { const next = { ...current }; delete next[shotId]; return next; });
      setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: '已停止' } : item));
      setShotProgress((current) => ({ ...current, [shotId]: 0 }));
      setShotStages((current) => ({ ...current, [shotId]: '已停止' }));
      setGenerationStatus('已停止');
      return;
    }
    if (activeSubmitting) return;
    setVideoUrl(null);
    const firstFrame = keyframes[`${shotId}-首帧`];
    const submittedSeed = seedMode === 'random' ? String(Math.floor(Math.random() * 9000000000000000) + 1000000000000000) : seed;
    const startedAt = Date.now();
    setSubmittingShots((current) => ({ ...current, [shotId]: true }));
    const taskSettings = shotSettings[shotId] ?? { ...shotSettingDefaults, duration, resolution: availableResolution, aspect, fps, mode: activeMode, model, turbo: turboMode };
    const fileName = `${safeFileStem(taskShot.title)}.mp4`;
    const references = activeMode === 'R2VA' ? {
      images: Array.from({ length: profile.images }, (_, index) => referenceComfyFile(referenceAssets[referenceKey(shotId, 'image', index)])).filter((name): name is string => Boolean(name)),
      videos: Array.from({ length: profile.videos }, (_, index) => referenceComfyFile(referenceAssets[referenceKey(shotId, 'video', index)])).filter((name): name is string => Boolean(name)),
      audios: Array.from({ length: profile.audios }, (_, index) => referenceComfyFile(referenceAssets[referenceKey(shotId, 'audio', index)])).filter((name): name is string => Boolean(name)),
    } : undefined;
    void fetch('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shot_id: shotId, shot_title: taskShot.title, prompt, seed: submittedSeed, duration, resolution: availableResolution, fps, model, turbo: turboMode, mode: activeMode, image: firstFrame?.comfyName, client_id: clientId, ...(references ? { images: references.images, videos: references.videos, audios: references.audios } : {}) }) }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setSubmittingShots((current) => { const next = { ...current }; delete next[shotId]; return next; }); setShotTasks((current) => ({ ...current, [shotId]: { promptId: result.prompt_id, seed: submittedSeed, seedMode, prompt, title: taskShot.title, fileName, duration: taskSettings.duration, resolution: taskSettings.resolution, aspect: taskSettings.aspect, fps: taskSettings.fps, mode: taskSettings.mode, model: taskSettings.model, turbo: taskSettings.turbo, steps: turboMode ? 4 : 20, startedAt, keyframeMode, inputImage: firstFrame?.comfyName, referenceImages: references?.images, referenceVideos: references?.videos, referenceAudios: references?.audios } })); if (activeShotIdRef.current === shotId) setGenerationStatus('已提交，等待 ComfyUI 排队'); }).catch(() => { setSubmittingShots((current) => { const next = { ...current }; delete next[shotId]; return next; }); setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: '失败' } : item)); if (activeShotIdRef.current === shotId) setGenerationStatus('提交失败'); });
    setGenerationStatus('正在提交');
    setShots((items) => items.map((item) => item.id === shotId ? { ...item, state: '生成中' } : item));
    setShotProgress((current) => ({ ...current, [shotId]: 0 }));
    setShotStages((current) => ({ ...current, [shotId]: '排队中' }));
    if (seedMode === 'random') setSeed(submittedSeed);
  }

  if (!taskShot) {
    return (
      <main className="min-h-screen bg-background text-foreground">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div><p className="text-sm font-semibold tracking-tight">导演台</p></div>
          <div className="flex items-center gap-2"><div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${comfyConnected === true ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400' : comfyConnected === false ? 'border-red-500/20 bg-red-500/8 text-red-400' : 'border-white/10 bg-white/5 text-zinc-400'}`}><span className={`size-1.5 rounded-full ${comfyConnected === true ? 'bg-emerald-400' : comfyConnected === false ? 'bg-red-400' : 'bg-zinc-500'}`} />{comfyConnected === true ? 'ComfyUI 已连接' : comfyConnected === false ? 'ComfyUI 未连接' : '正在检测 ComfyUI'}</div><Button onClick={() => void chooseOutputDirectory()} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" title={outputDirectoryTitle} aria-label={outputDirectoryTitle}><FolderOpen className="size-3.5" /><span className="hidden max-w-32 truncate sm:inline">{outputDirectoryName}</span></Button><Button variant="ghost" size="icon" aria-label="设置"><Settings2 /></Button></div>
        </header>
        <div className="workspace-grid relative" style={{ gridTemplateColumns: `${railWidth}px minmax(420px, 1fr) ${panelWidth}px` }}>
          <aside className="shot-rail border-r border-border bg-card/70"><div className="flex items-center justify-between px-3 py-3"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">镜头</span><Button onClick={addShot} variant="ghost" size="icon-sm" aria-label="添加镜头"><Plus /></Button></div><div className="grid place-items-center px-4 py-12 text-center"><p className="text-xs text-muted-foreground">还没有镜头</p><Button onClick={addShot} variant="ghost" size="sm" className="mt-3">添加镜头</Button></div></aside>
          <section className="preview-stage flex min-w-0 flex-col bg-[#090a0d]"><div className="grid flex-1 place-items-center"><div className="text-center"><Clapperboard className="mx-auto size-8 text-zinc-600" /><p className="mt-3 text-sm text-zinc-400">请先创建一个镜头</p><Button onClick={addShot} size="sm" className="mt-4 bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">添加镜头</Button></div></div></section>
          <aside className="control-panel border-l border-border bg-card"><div className="grid flex-1 place-items-center p-6 text-center"><div><p className="text-sm font-medium">暂无生成设置</p><p className="mt-2 text-[10px] leading-4 text-muted-foreground">创建镜头后在这里设置提示词和视频参数。</p></div></div></aside>
          <footer className="task-bar col-span-full flex items-center border-t border-border bg-card px-4"><span className="text-[10px] text-muted-foreground">暂无镜头任务</span></footer>
        </div>
        {addDialog && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setAddDialog(false)}><div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-sm font-semibold">新增镜头</h2><label htmlFor="new-shot-title" className="field-label mt-4">镜头名称</label><input id="new-shot-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none" autoFocus /><p className="mt-3 text-[10px] leading-4 text-muted-foreground">创建后可在右侧编辑提示词和生成参数。</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAddDialog(false)}>取消</Button><Button onClick={confirmAddShot} className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">创建镜头</Button></div></div></div>}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div>
          <div><p className="text-sm font-semibold tracking-tight">导演台</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`hidden items-center gap-2 rounded-full border px-3 py-1.5 text-xs sm:flex ${comfyConnected === true ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400' : comfyConnected === false ? 'border-red-500/20 bg-red-500/8 text-red-400' : 'border-white/10 bg-white/5 text-zinc-400'}`}><span className={`size-1.5 rounded-full ${comfyConnected === true ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : comfyConnected === false ? 'bg-red-400' : 'bg-zinc-500'}`} />{comfyConnected === true ? 'ComfyUI 已连接' : comfyConnected === false ? 'ComfyUI 未连接' : '正在检测 ComfyUI'}</div>
          <div className="flex items-center gap-1">
            <Button onClick={() => void chooseOutputDirectory()} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" title={outputDirectoryTitle} aria-label={outputDirectoryTitle}><FolderOpen className="size-3.5" /><span className="hidden max-w-32 truncate sm:inline">{outputDirectoryName}</span></Button>
            <Button variant="ghost" size="icon" aria-label="设置"><Settings2 /></Button>
          </div>
        </div>
      </header>

      <div className="workspace-grid relative" style={{ gridTemplateColumns: `${railWidth}px minmax(420px, 1fr) ${panelWidth}px` }}>
        <aside className="shot-rail overflow-y-auto border-r border-border bg-card/70">
          <div className="flex items-center justify-between px-3 py-3"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">镜头</span><Button onClick={addShot} variant="ghost" size="icon-sm" aria-label="添加镜头"><Plus /></Button></div>
          <div className="space-y-1 px-2">
            {shots.map((shot, index) => (
              <button key={shot.id} onClick={() => selectShot(index)} className={`group relative w-full rounded-xl border p-2.5 text-left transition ${activeShot === index ? 'border-primary/35 bg-primary/10' : 'border-transparent hover:bg-muted/50'}`}>
                <div className="flex gap-2.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#181a1f] text-xs font-medium text-zinc-500 ring-1 ring-white/6">{shot.id}</div>
                  <div className="min-w-0 flex-1"><p onDoubleClick={(event) => { event.stopPropagation(); renameShot(index); }} className="truncate pr-5 text-xs font-medium">{shot.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{shotDetail(shot)}</p><p className="mt-0.5 truncate text-[9px] text-muted-foreground/70">{shotMeta(shot)}</p></div>
                </div>
                <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); deleteShot(index); }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); deleteShot(index); } }} className="absolute bottom-2 right-2 rounded p-1 text-muted-foreground opacity-0 transition hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100" aria-label={`删除镜头 ${shot.id}`}><Trash2 className="size-3" /></span>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className={`size-1.5 rounded-full ${shot.state === '生成中' ? 'bg-amber-400' : shot.state === '已选定' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{shot.state}</div>
              </button>
            ))}
          </div>
        </aside>
        <div onPointerDown={(event) => { event.preventDefault(); resizeRail(event); }} className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none" style={{ left: railWidth }} aria-label="调整镜头区域宽度" />

        <section className="preview-stage flex min-w-0 flex-col bg-[#090a0d]">
          <div className="flex items-center justify-between border-b border-white/7 px-4 py-2.5">
            <div><p className="text-xs font-medium text-zinc-200">镜头 {shots[activeShot].id} · {shots[activeShot].title}</p><p className="mt-0.5 text-[10px] text-zinc-500">{model} · {turboMode ? '加速' : '标准'} · {activeMode} · {resolution} · {duration} · {fps}{activeStage ? ` · ${activeStage}` : ''}{videoUrl ? ` · ${shotFileNames[shots[activeShot].id] ?? `${safeFileStem(shots[activeShot].title)}.mp4`}` : ''}{shotElapsed(shots[activeShot].id) !== undefined ? ` · 耗时 ${formatElapsed(shotElapsed(shots[activeShot].id)!)}` : ''}</p></div>
            <Button variant="ghost" size="icon-sm" className="text-zinc-400 hover:bg-white/8" aria-label="更多操作"><MoreHorizontal /></Button>
          </div>
          <div className="relative flex min-h-[300px] flex-1 flex-col items-center justify-center overflow-hidden p-3">
            <div className="video-frame group relative aspect-video w-full max-w-3xl flex-none overflow-hidden rounded-md border border-white/10 bg-[#0e1117] shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(43,65,77,.34),transparent_42%),linear-gradient(160deg,#141820_0%,#090a0e_62%)]" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
              {videoUrl ? <video key={videoUrl} ref={videoRef} src={videoUrl} preload="metadata" controls className="absolute inset-0 size-full object-contain" /> : <div className="absolute inset-0 grid place-items-center"><button className="grid size-14 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60" aria-label="播放视频"><Play className="ml-0.5 size-5 fill-current" /></button></div>}
            </div>
            <div className="mt-3 flex w-full max-w-3xl flex-col items-center gap-1.5"><p className="text-center text-[10px] text-zinc-500">{!videoUrl ? '生成视频后，可从播放器进度条定位画面' : activeShot >= shots.length - 1 ? '请先创建下一个镜头，才能设置连续首帧' : '拖动播放器进度条定位画面，再设为下一镜头首帧'}</p><Button onClick={() => void captureFrameForNextShot()} disabled={!videoUrl || activeShot >= shots.length - 1} variant="outline" size="sm" className="h-8 gap-1.5 border-white/10 bg-white/5 px-3 text-[10px] text-zinc-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40" title={frameButtonTitle}><ImagePlus className="size-3.5" />选作下一镜头首帧</Button></div>
          </div>
        </section>
        <div onPointerDown={(event) => { event.preventDefault(); resizePanel(event); }} className="absolute inset-y-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none" style={{ right: panelWidth }} aria-label="调整视频模型区域宽度" />

        <aside className="control-panel border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3"><div className="flex items-center justify-between gap-2"><p className="shrink-0 whitespace-nowrap text-sm font-semibold">视频模型</p><select value={model} onChange={(event) => { const value = event.target.value as keyof typeof modelProfiles; setModel(value); updateSetting('model', value); }} aria-label="选择视频模型" className="select-like w-[92px] min-w-0 appearance-none"><option>H3</option></select></div><p className="mt-1 text-[10px] text-muted-foreground">当前仅接入 H3 ComfyUI 工作流</p></div>
          <div className="control-scroll space-y-5 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"><p className="text-xs font-medium">采样模式</p><div role="radiogroup" aria-label="采样模式" className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1"><label className={`cursor-pointer rounded-md px-1.5 py-1.5 text-center text-[10px] font-medium transition ${turboMode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><input type="radio" name="sampling-mode" checked={turboMode} onChange={() => { setTurboMode(true); updateSetting('turbo', true); }} className="sr-only" />加速<br /><span className="text-[9px] font-normal text-muted-foreground">4 步</span></label><label className={`cursor-pointer rounded-md px-1.5 py-1.5 text-center text-[10px] font-medium transition ${!turboMode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}><input type="radio" name="sampling-mode" checked={!turboMode} onChange={() => { setTurboMode(false); updateSetting('turbo', false); }} className="sr-only" />标准<br /><span className="text-[9px] font-normal text-muted-foreground">20 步</span></label></div></div>
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2.5"><label htmlFor="seed" className="field-label">随机种子</label><div className="mt-2 flex h-[34px] items-center rounded-lg border border-border bg-muted/30 pl-2"><input id="seed" value={seed} disabled={seedMode === 'fixed'} onChange={(event) => setSeed(event.target.value.replace(/\D/g, ''))} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-55" inputMode="numeric" /><button onClick={() => { const nextMode = seedMode === 'fixed' ? 'random' : 'fixed'; setSeedMode(nextMode); if (nextMode === 'random') setSeed(String(Math.floor(Math.random() * 9000000000000000) + 1000000000000000)); }} className={`grid h-full w-8 place-items-center transition hover:text-primary ${seedMode === 'random' ? 'text-primary' : 'text-muted-foreground'}`} aria-label={seedMode === 'random' ? '切换为固定种子' : '切换为随机种子'} aria-pressed={seedMode === 'random'} title={seedMode === 'random' ? '随机种子' : '固定种子'}><Dice5 className="size-3.5" /></button></div><p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">固定种子便于复现，随机种子用于探索不同结果。</p></div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div><label htmlFor="duration" className="field-label">时长</label><select id="duration" value={duration} onChange={(event) => { setDuration(event.target.value); updateSetting('duration', event.target.value); }} className="select-like mt-2 appearance-none">{Array.from({ length: 14 }, (_, index) => { const seconds = index + 2; return <option key={seconds}>{seconds} 秒</option>; })}</select></div>
              <div><label htmlFor="resolution" className="field-label">分辨率</label><select id="resolution" value={shotSettings[shots[activeShot].id]?.resolution ?? availableResolution} onChange={(event) => { setResolution(event.target.value); updateSetting('resolution', event.target.value); }} className="select-like mt-2 appearance-none">{profile.resolutions.map((value) => <option key={value}>{value}</option>)}</select></div>
              <div><label htmlFor="aspect" className="field-label">画幅</label><select id="aspect" value={aspect} onChange={(event) => { setAspect(event.target.value); updateSetting('aspect', event.target.value); }} className="select-like mt-2 appearance-none"><option>16:9</option><option>9:16</option><option>2.35:1</option><option>1:1</option><option>4:3</option><option>3:4</option></select></div>
              <div><label className="field-label">帧率</label><select value={fps} onChange={(event) => { setFps(event.target.value); updateSetting('fps', event.target.value); }} className="select-like mt-2 appearance-none"><option>24 fps</option><option>30 fps</option><option>60 fps</option></select></div>
            </div>
            <div><label className="field-label">生成模式</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">{modes.map((item) => <button key={item} onClick={() => { setMode(item); updateSetting('mode', item); }} className={`rounded-md px-1 py-1.5 text-[10px] font-medium transition ${activeMode === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div></div>

            {activeMode === 'I2VA' && <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
              <div><label className="field-label">关键帧方式</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
                {([['first', '首帧'], ['last', '尾帧'], ['first_last', '首尾帧']] as const).map(([value, label]) => <button key={value} onClick={() => setKeyframeMode(value)} className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition ${keyframeMode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
              </div></div>
              <div onChange={uploadFrame} className={`grid gap-2 ${keyframeMode === 'first_last' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(keyframeMode === 'last' ? ['尾帧'] : keyframeMode === 'first_last' ? ['首帧', '尾帧'] : ['首帧']).map((label) => { const frame = keyframes[`${shots[activeShot].id}-${label}`]; return <label key={label} className="upload-tile relative w-full overflow-hidden">{frame ? <img src={frame.url} alt={`${label}缩略图`} className="absolute inset-0 size-full object-cover opacity-70" /> : <ImagePlus />}<span className="relative rounded bg-black/60 px-1.5 py-0.5">{frame?.name ?? `添加${label}`}</span><small className="relative rounded bg-black/60 px-1">{label === '首帧' ? '对齐 0.00 秒' : '对齐视频结束时刻'}</small><input type="file" accept="image/*" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const key = `${shots[activeShot].id}-${label}`; const url = URL.createObjectURL(file); setKeyframes((current) => ({ ...current, [key]: { name: file.name, url } })); const form = new FormData(); form.append('image', file); try { const response = await fetch('/api/upload', { method: 'POST', body: form }); const uploaded = await response.json(); if (uploaded.name) setKeyframes((current) => ({ ...current, [key]: { name: file.name, url, comfyName: uploaded.name } })); } catch { /* local preview remains available */ } }} /></label>; })}
              </div>
              <p className="text-[9px] leading-4 text-muted-foreground">底层模式：{keyframeMode === 'first' ? 'I2VA · 从首帧向后发展' : keyframeMode === 'last' ? 'L2VA · 最终落到尾帧' : 'FL2VA · 生成首尾帧之间的连续路径'}</p>
            </div>}

            {activeMode === 'R2VA' && <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-3">
              <div><div className="flex items-center justify-between"><label className="field-label">参考图片</label><span className="text-[10px] text-muted-foreground">{referenceCount('image', profile.images)} / {profile.images}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: referenceSlotCount('image', profile.images) }, (_, index) => referenceTile('image', index))}</div></div>
              <div><div className="flex items-center justify-between"><label className="field-label">参考视频</label><span className="text-[10px] text-muted-foreground">{referenceCount('video', profile.videos)} / {profile.videos}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: referenceSlotCount('video', profile.videos) }, (_, index) => referenceTile('video', index))}</div></div>
              <div><div className="flex items-center justify-between"><label className="field-label">独立音频</label><span className="text-[10px] text-muted-foreground">{referenceCount('audio', profile.audios)} / {profile.audios}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: referenceSlotCount('audio', profile.audios) }, (_, index) => referenceTile('audio', index))}</div></div>
            </div>}
            <div>
              <label htmlFor="shot-prompt" className="field-label">镜头提示词</label>
              <div className="relative">
                <Textarea ref={promptRef} id="shot-prompt" value={prompt} onChange={(event) => { const value = event.target.value; setPrompt(value); setShotPrompts((current) => ({ ...current, [shots[activeShot].id]: value })); updatePromptMention(value, event.target.selectionStart); }} onClick={(event) => updatePromptMention(event.currentTarget.value, event.currentTarget.selectionStart)} onSelect={(event) => updatePromptMention(event.currentTarget.value, event.currentTarget.selectionStart)} onKeyDown={(event) => { if (event.key === 'Escape') setPromptMention(null); if (event.key === 'Enter' && promptMention) { const options = referenceMentionOptions().filter((option) => `${option.token} ${option.name}`.toLowerCase().includes(promptMention.query.toLowerCase())); if (options[0]) { event.preventDefault(); insertReferenceMention(options[0]); } } }} onBlur={() => window.setTimeout(() => setPromptMention(null), 120)} className="mt-2 min-h-32 resize-none bg-muted/25 text-xs leading-5" />
                {promptMention && <div className="fixed z-50 max-h-56 w-64 overflow-y-auto rounded-lg border border-border bg-card p-1.5 shadow-xl" style={{ left: mentionPosition.left, top: mentionPosition.top }}>
                  {mentionOptions.length ? mentionOptions.map((option) => <button key={`${option.kind}-${option.index}`} type="button" className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => insertReferenceMention(option)}>
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded border border-border bg-muted/40">{option.kind === 'image' ? <img src={option.url} alt="" className="size-full object-contain" /> : option.kind === 'video' ? <video src={option.url} muted className="size-full object-contain" /> : <FileAudio className="size-4 text-muted-foreground" />}</span>
                    <span className="min-w-0 flex-1"><span className="block font-mono text-[10px] text-foreground">{option.token}</span><span className="block truncate text-[9px] text-muted-foreground">{option.name}</span></span>
                  </button>) : <p className="px-2.5 py-2 text-[10px] text-muted-foreground">暂无匹配的参考素材</p>}
                </div>}
              </div>
            </div>
          </div>
          <div className="border-t border-border p-4"><Button onClick={toggleGeneration} className="h-10 w-full bg-[#f4bd50] font-semibold text-[#17120a] hover:bg-[#ffd070]">{activeTask ? <CircleStop /> : <Film />}{activeTask ? '停止生成' : activeSubmitting ? '提交中' : '生成视频'}</Button></div>
        </aside>

        <footer className="task-bar col-span-full flex items-center gap-4 border-t border-border bg-card px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-400"><CloudCog className="size-4" /></div><div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="truncate">镜头 {taskShot.id} · {taskShot.title} · {model} {turboMode ? '加速' : '标准'} {activeMode} · {generationStatus}</span><span className="ml-3 font-mono text-muted-foreground">{progress}%</span></div><Progress value={progress} className="[&_[data-slot=progress-indicator]]:bg-amber-400" /></div></div>
          <Button onClick={() => { if (!generating) toggleGeneration(); }} disabled={generating} variant="ghost" size="icon-sm" aria-label="重试生成" title="重试生成"><RotateCcw /></Button>
        </footer>
      </div>
      {addDialog && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setAddDialog(false)}><div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-sm font-semibold">新增镜头</h2><label htmlFor="new-shot-title" className="field-label mt-4">镜头名称</label><input id="new-shot-title" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} className="mt-2 h-9 w-full rounded-lg border border-border bg-muted/30 px-3 text-xs outline-none" autoFocus /><p className="mt-3 text-[10px] leading-4 text-muted-foreground">创建后可在右侧编辑提示词和生成参数。</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setAddDialog(false)}>取消</Button><Button onClick={confirmAddShot} className="bg-[#f4bd50] text-[#17120a] hover:bg-[#ffd070]">创建镜头</Button></div></div></div>}
      {deleteIndex !== null && <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={() => setDeleteIndex(null)}><div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><h2 className="text-sm font-semibold">删除镜头</h2><p className="mt-2 text-xs text-muted-foreground">确定删除“{shots[deleteIndex].title}”吗？此操作无法撤销。</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteIndex(null)}>取消</Button><Button variant="destructive" onClick={confirmDeleteShot}>删除镜头</Button></div></div></div>}
    </main>
  );
}
