---
name: director-video
description: Operate the local ComfyUI Director Desk to inspect projects, bind reference assets, prepare H3 prompts, and render videos through its HTTP API. Use when an agent needs to generate or manage Director Desk clips without clicking the React UI.
metadata:
  short-description: Generate Director Desk videos from an agent
---

# Director Video

Use this skill when the user asks an agent to work with a local ComfyUI Director Desk project or generate a clip from project assets. The project directory, `script.json`, and each clip's `clip.json` are the source of truth.

## Operating Rules

- Use the bundled `scripts/directorctl.mjs` from this Skill directory; never simulate browser clicks or edit temporary UI state. When working from the Director Desk repository, `node scripts/directorctl.mjs` is also available as a compatibility entrypoint.
- Do not call the Director Desk `/api/optimize-prompt` endpoint for agent work. Optimize the prompt in the current Codex/Claude session, preferably with the `h3-prompt-writing` skill when available, then pass the finished prompt with `render --prompt` or `render --prompt-file`.
- Before a mutation, inspect the project with `inspect`, `clips`, and `clip` when the target is unclear.
- Bind project-relative assets with `bind`. It preserves stable H3 slots such as `01-image-0` and writes the same `references.subjects` structure used by the React app.
- Use `prepare` to upload source files that are missing `comfyName` and verify the final reference arrays before rendering.
- Before every render, ask the user to confirm the generation settings: video model, generation mode, duration, resolution, aspect ratio, FPS, and turbo/acceleration. Existing values in `clip.json` are a proposal to show the user, not permission to submit.
- Do not call `render` until the user confirms those settings. Pass the confirmed values explicitly with `--mode`, `--model`, `--duration`, `--resolution`, `--aspect`, `--fps`, and `--turbo true|false`; do not silently rely on CLI defaults.
- Use `render --wait` for a completed video. A submitted task is not a successful render; only report success after the command returns `status: completed` and an output path.
- Preserve the user's original prompt. The renderer selects `prompt.selected`; an optimized prompt may be a string or the R2VA section object used by `clip.json`.
- When an agent-written prompt is supplied, it takes precedence for this render without destroying the original prompt in `clip.json`. Save it into the manifest only when the user explicitly asks to persist the optimization.
- Do not exceed H3 limits: 9 images, 3 videos, and 3 audios. Never reorder existing references just to fill a slot.
- Ask for or infer a project path only from the user's workspace context. Do not scan unrelated directories or upload files outside the selected project.

## Commands

Read [references/cli.md](references/cli.md) for syntax, output fields, and retry behavior. For H3 section formatting and R2VA reference semantics, read [references/h3-rules.md](references/h3-rules.md).

Typical flow:

```text
node scripts/directorctl.mjs status
node scripts/directorctl.mjs inspect --project <project>
node scripts/directorctl.mjs bind --project <project> --clip 01 --asset "资产/角色/男主_角色参考_多视角.png" --subject 男主 --role character
node scripts/directorctl.mjs prepare --project <project> --clip 01
node scripts/directorctl.mjs render --project <project> --clip 01 --mode R2VA --model H3 --duration 12 --resolution "864 × 480" --aspect "16:9" --fps 24 --turbo true --wait
```

If generation fails, return the actual error and keep the manifest intact. Retry only after correcting the reported input, service, or resource problem; do not silently submit duplicate jobs.
