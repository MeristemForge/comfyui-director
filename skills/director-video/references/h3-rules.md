# H3 rules used by the Director Desk

The Director Desk sends H3 API workflow parameters through the Director HTTP API. Agents should not patch ComfyUI workflow node IDs directly.

For R2VA, references are sent in the array order represented by `assetKey` slots:

- `01-image-0` becomes the first H3 Picture input.
- `01-video-0` becomes the first H3 Video input.
- `01-audio-0` becomes the first H3 Audio input.

Keep subject labels and reference ordinals consistent in `subject_definitions`, `summary`, `retention_analysis`, and `detailed_description`. Do not invent a subject or asset that is not in the manifest.

The prompt record may be either a plain string or:

```json
{
  "original": "user draft",
  "optimized": {
    "subject_definitions": "...",
    "summary": "...",
    "retention_analysis": "...",
    "detailed_description": "...",
    "overall_soundscape": "...",
    "non_diegetic_music": "..."
  },
  "selected": "optimized"
}
```

`directorctl` reads the string prompt for the active generation mode, preferring `optimized` and falling back to `original`, then sends it to `/api/generate`. Duration, resolution, aspect, FPS, model, turbo, seed, and keyframe settings come from `generation` unless an explicit CLI override is supplied.
