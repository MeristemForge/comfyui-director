'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, CircleStop, Clapperboard, CloudCog, Dice5, Film, FileAudio, ImagePlus, MoreHorizontal, Play, Plus, RotateCcw, Settings2, Sparkles, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';

const shots = [
  { id: '01', title: '雨夜抵达', detail: '8s · I2VA', state: '已选定' },
  { id: '02', title: '回望城市', detail: '6s · R2VA', state: '生成中' },
  { id: '03', title: '走入车站', detail: '5s · T2VA', state: '草稿' },
];
const modes = ['T2VA', 'I2VA', 'R2VA'];
const modelProfiles = {
  'H3-标准': { images: 9, videos: 3, audios: 3, resolutions: ['608 × 352', '736 × 416', '864 × 480', '960 × 544', '1056 × 608', '1152 × 640', '1216 × 672', '1280 × 736', '1344 × 768'] },
  'H3-加速': { images: 9, videos: 3, audios: 3, resolutions: ['608 × 352', '736 × 416', '864 × 480', '960 × 544', '1056 × 608', '1152 × 640', '1216 × 672', '1280 × 736', '1344 × 768'] },
  'LTX 2.5': { images: 1, videos: 1, audios: 0, resolutions: ['768 × 512', '1024 × 576', '1280 × 720', '1920 × 1080'] },
  'Wan 3.0': { images: 4, videos: 1, audios: 1, resolutions: ['832 × 480', '1280 × 720', '1280 × 768', '1920 × 1080'] },
} as const;

export default function Home() {
  const [activeShot, setActiveShot] = useState(1);
  const [mode, setMode] = useState('R2VA');
  const [model, setModel] = useState<keyof typeof modelProfiles>('H3-标准');
  const [keyframeMode, setKeyframeMode] = useState<'first' | 'last' | 'first_last'>('first');
  const [progress, setProgress] = useState(68);
  const [playhead, setPlayhead] = useState(3.42);
  const [railWidth, setRailWidth] = useState(188);
  const [panelWidth, setPanelWidth] = useState(380);
  const [generating, setGenerating] = useState(true);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [seed, setSeed] = useState('284731906');
  const [seedMode, setSeedMode] = useState<'fixed' | 'random'>('fixed');
  const [fps, setFps] = useState('24 fps');
  const [duration, setDuration] = useState('6 秒');
  const [resolution, setResolution] = useState('1344 × 768');
  const [aspect, setAspect] = useState('16:9');
  const [prompt, setPrompt] = useState('雨夜，一名年轻女人站在空旷站台边缘，身后的城市灯光被雨水拉成长长的倒影。她缓慢回头看向远处，外套被风轻轻吹动。镜头以小幅度、慢速向前推进，最后停在她克制而坚定的表情上。');
  const profile = modelProfiles[model];
  const availableResolution = profile.resolutions.includes(resolution) ? resolution : profile.resolutions[profile.resolutions.length - 1];

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
    if (!generating) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 2, 100);
        if (next >= 100) setGenerating(false);
        return next;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [generating]);

  function toggleGeneration() {
    if (generating) {
      setGenerating(false);
      return;
    }
    if (seedMode === 'random') setSeed(String(Math.floor(Math.random() * 999999999)));
    setProgress(0);
    setGenerating(true);
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <div className="flex items-center gap-3">
          <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Clapperboard className="size-4" /></div>
          <div><p className="text-sm font-semibold tracking-tight">导演台</p><p className="text-[10px] text-muted-foreground">雨夜车站 · 3 个镜头</p></div>
          <ChevronDown className="ml-1 size-4 text-muted-foreground" />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/8 px-3 py-1.5 text-xs text-emerald-400 sm:flex"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />ComfyUI 已连接</div>
          <Button variant="ghost" size="icon" aria-label="设置"><Settings2 /></Button>
        </div>
      </header>

      <div className="workspace-grid relative" style={{ gridTemplateColumns: `${railWidth}px minmax(420px, 1fr) ${panelWidth}px` }}>
        <aside className="shot-rail border-r border-border bg-card/70">
          <div className="flex items-center justify-between px-3 py-3"><span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">镜头</span><Button variant="ghost" size="icon-sm" aria-label="添加镜头"><Plus /></Button></div>
          <div className="space-y-1 px-2">
            {shots.map((shot, index) => (
              <button key={shot.id} onClick={() => setActiveShot(index)} className={`w-full rounded-xl border p-2.5 text-left transition ${activeShot === index ? 'border-primary/35 bg-primary/10' : 'border-transparent hover:bg-muted/50'}`}>
                <div className="flex gap-2.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#181a1f] text-xs font-medium text-zinc-500 ring-1 ring-white/6">{shot.id}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{shot.title}</p><p className="mt-1 text-[10px] text-muted-foreground">{shot.detail}</p></div>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className={`size-1.5 rounded-full ${shot.state === '生成中' ? 'bg-amber-400' : shot.state === '已选定' ? 'bg-emerald-400' : 'bg-zinc-600'}`} />{shot.state}</div>
              </button>
            ))}
          </div>
        </aside>
        <div onPointerDown={(event) => { event.preventDefault(); resizeRail(event); }} className="absolute inset-y-0 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none" style={{ left: railWidth }} aria-label="调整镜头区域宽度" />

        <section className="preview-stage flex min-w-0 flex-col bg-[#090a0d]">
          <div className="flex items-center justify-between border-b border-white/7 px-4 py-2.5">
            <div><p className="text-xs font-medium text-zinc-200">镜头 {shots[activeShot].id} · {shots[activeShot].title}</p><p className="mt-0.5 text-[10px] text-zinc-500">版本 V03 · 1920 × 1080 · 6 秒</p></div>
            <Button variant="ghost" size="icon-sm" className="text-zinc-400 hover:bg-white/8" aria-label="更多操作"><MoreHorizontal /></Button>
          </div>
          <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden p-3">
            <div className="video-frame group relative aspect-video w-full overflow-hidden rounded-md border border-white/10 bg-[#0e1117] shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(43,65,77,.34),transparent_42%),linear-gradient(160deg,#141820_0%,#090a0e_62%)]" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
              <div className="absolute inset-0 grid place-items-center"><button className="grid size-14 place-items-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur transition hover:scale-105 hover:bg-black/60" aria-label="播放视频"><Play className="ml-0.5 size-5 fill-current" /></button></div>
              <div className="absolute bottom-3 left-3 rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] text-zinc-300">00:{playhead.toFixed(3).padStart(6, '0')} / 00:06.000</div>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-white/7 px-4 py-3">
            <div className="flex gap-2">{['V01', 'V02', 'V03'].map((version) => <button key={version} className={`rounded-md px-2.5 py-1 text-[10px] ${version === 'V03' ? 'bg-white text-black' : 'bg-white/6 text-zinc-400 hover:bg-white/10'}`}>{version}</button>)}</div>
            <Button variant="outline" size="sm" className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10">设为选定版本</Button>
          </div>
        </section>
        <div onPointerDown={(event) => { event.preventDefault(); resizePanel(event); }} className="absolute inset-y-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none" style={{ right: panelWidth }} aria-label="调整视频模型区域宽度" />

        <aside className="control-panel border-l border-border bg-card">
          <div className="border-b border-border px-4 py-3"><div className="flex items-center justify-between gap-2"><p className="shrink-0 whitespace-nowrap text-sm font-semibold">视频模型</p><select value={model} onChange={(event) => setModel(event.target.value as keyof typeof modelProfiles)} aria-label="选择视频模型" className="select-like w-[92px] min-w-0 appearance-none"><option>H3-标准</option><option>H3-加速</option><option>LTX 2.5</option><option>Wan 3.0</option></select></div><p className="mt-1 text-[10px] text-muted-foreground">当前模型能力会自动适配下方参数</p></div>
          <div className="control-scroll space-y-5 overflow-y-auto p-4">
            <div className="grid grid-cols-4 gap-2">
              <div><label htmlFor="duration" className="field-label">时长</label><select id="duration" value={duration} onChange={(event) => setDuration(event.target.value)} className="select-like mt-2 appearance-none">{Array.from({ length: 14 }, (_, index) => { const seconds = index + 2; return <option key={seconds}>{seconds} 秒</option>; })}</select></div>
              <div><label htmlFor="resolution" className="field-label">模型分辨率</label><select id="resolution" value={availableResolution} onChange={(event) => setResolution(event.target.value)} className="select-like mt-2 appearance-none">{profile.resolutions.map((value) => <option key={value}>{value}</option>)}</select></div>
              <div><label htmlFor="aspect" className="field-label">画幅</label><select id="aspect" value={aspect} onChange={(event) => setAspect(event.target.value)} className="select-like mt-2 appearance-none"><option>16:9</option><option>9:16</option><option>2.35:1</option><option>1:1</option><option>4:3</option><option>3:4</option></select></div>
              <div><label className="field-label">帧率</label><select value={fps} onChange={(event) => setFps(event.target.value)} className="select-like mt-2 appearance-none"><option>24 fps</option><option>30 fps</option><option>60 fps</option></select></div>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div><div className="flex items-center justify-between"><label htmlFor="seed" className="field-label">Noise Seed</label><div className="flex rounded-md bg-muted/50 p-0.5"><button onClick={() => setSeedMode('fixed')} className={`px-2 py-1 text-[9px] ${seedMode === 'fixed' ? 'rounded bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>固定</button><button onClick={() => setSeedMode('random')} className={`px-2 py-1 text-[9px] ${seedMode === 'random' ? 'rounded bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>随机</button></div></div><div className="mt-2 flex h-[34px] items-center rounded-lg border border-border bg-muted/30 pl-2"><input id="seed" value={seed} onChange={(event) => setSeed(event.target.value.replace(/\D/g, ''))} className="min-w-0 flex-1 bg-transparent font-mono text-[11px] outline-none" inputMode="numeric" /><button disabled={seedMode === 'fixed'} onClick={() => setSeed(String(Math.floor(Math.random() * 999999999)))} className="grid h-full w-8 place-items-center text-muted-foreground hover:text-primary disabled:cursor-not-allowed disabled:opacity-25" aria-label="重新抽取随机种子"><Dice5 className="size-3.5" /></button></div></div>
              <label className="flex h-[34px] items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 text-[10px]"><Switch size="sm" checked={generateAudio} onCheckedChange={setGenerateAudio} /><span>生成音频</span></label>
            </div>
            <div><label className="field-label">生成模式</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">{modes.map((item) => <button key={item} onClick={() => setMode(item)} className={`rounded-md px-1 py-1.5 text-[10px] font-medium transition ${mode === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{item}</button>)}</div></div>

            {mode === 'I2VA' && <div className="space-y-3 rounded-xl border border-border bg-muted/15 p-3">
              <div><label className="field-label">关键帧方式</label><div className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
                {([['first', '首帧'], ['last', '尾帧'], ['first_last', '首尾帧']] as const).map(([value, label]) => <button key={value} onClick={() => setKeyframeMode(value)} className={`rounded-md px-2 py-1.5 text-[10px] font-medium transition ${keyframeMode === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
              </div></div>
              <div className={`grid gap-2 ${keyframeMode === 'first_last' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(keyframeMode === 'last' ? ['尾帧'] : keyframeMode === 'first_last' ? ['首帧', '尾帧'] : ['首帧']).map((label) => <button key={label} className="upload-tile w-full"><ImagePlus /><span>添加{label}</span><small>{label === '首帧' ? '对齐 0.00 秒' : '对齐视频结束时刻'}</small></button>)}
              </div>
              <p className="text-[9px] leading-4 text-muted-foreground">底层模式：{keyframeMode === 'first' ? 'I2VA · 从首帧向后发展' : keyframeMode === 'last' ? 'L2VA · 最终落到尾帧' : 'FL2VA · 生成首尾帧之间的连续路径'}</p>
            </div>}

            {mode === 'R2VA' && <div className="space-y-4 rounded-xl border border-border bg-muted/15 p-3">
              <div><div className="flex items-center justify-between"><label className="field-label">参考图片</label><span className="text-[10px] text-muted-foreground">0 / {profile.images}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: profile.images }, (_, index) => <button key={`picture-${index}`} className="reference-slot" aria-label={`添加参考图片 ${index + 1}`}><ImagePlus /><span>图 {index + 1}</span></button>)}</div></div>
              <div><div className="flex items-center justify-between"><label className="field-label">参考视频</label><span className="text-[10px] text-muted-foreground">0 / {profile.videos}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: profile.videos }, (_, index) => <button key={`video-${index}`} className="reference-slot wide" aria-label={`添加参考视频 ${index + 1}`}><Video /><span>视频 {index + 1}</span></button>)}</div></div>
              <div><div className="flex items-center justify-between"><label className="field-label">独立音频</label><span className="text-[10px] text-muted-foreground">0 / {profile.audios}</span></div><div className="mt-2 grid grid-cols-3 gap-1.5">{Array.from({ length: profile.audios }, (_, index) => <button key={`audio-${index}`} className="reference-slot wide" aria-label={`添加独立音频 ${index + 1}`}><FileAudio /><span>音频 {index + 1}</span></button>)}</div></div>
            </div>}
            <div>
              <div className="flex items-center justify-between"><label htmlFor="shot-prompt" className="field-label">镜头描述</label><button className="flex items-center gap-1 text-[10px] text-primary"><Sparkles className="size-3" />整理为 {model} 提示词</button></div>
              <Textarea id="shot-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-2 min-h-32 resize-none bg-muted/25 text-xs leading-5" />
              <p className="mt-1.5 text-[9px] leading-4 text-muted-foreground">输出档位由导演台统一管理，提交时会按当前模型与画幅映射为可用尺寸。</p>
            </div>
          </div>
          <div className="border-t border-border p-4"><Button onClick={toggleGeneration} className="h-10 w-full bg-[#f4bd50] font-semibold text-[#17120a] hover:bg-[#ffd070]">{generating ? <CircleStop /> : <Film />}{generating ? '停止生成' : '生成视频'}</Button></div>
        </aside>

        <footer className="task-bar col-span-full flex items-center gap-4 border-t border-border bg-card px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3"><div className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-400/10 text-amber-400"><CloudCog className="size-4" /></div><div className="min-w-0 flex-1"><div className="mb-1.5 flex items-center justify-between text-[10px]"><span className="truncate">镜头 02 · H3 R2VA · 正在采样</span><span className="ml-3 font-mono text-muted-foreground">{progress}%</span></div><Progress value={progress} className="[&_[data-slot=progress-indicator]]:bg-amber-400" /></div></div>
          <Button variant="ghost" size="icon-sm" aria-label="重试"><RotateCcw /></Button>
        </footer>
      </div>
    </main>
  );
}
