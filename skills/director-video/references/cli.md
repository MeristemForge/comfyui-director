# directorctl reference

The complete, self-contained CLI is bundled at `scripts/directorctl.mjs` inside this Skill. From the Director Desk repository, the top-level `scripts/directorctl.mjs` is also available as a compatibility entrypoint.

All commands emit JSON. Add `--pretty` for readable output. The default Director Desk URL is `http://localhost:3000`; `DIRECTOR_URL` and `COMFYUI_URL` can override it.

## Read commands

```text
node scripts/directorctl.mjs status
node scripts/directorctl.mjs inspect --project <path>
node scripts/directorctl.mjs assets --project <path>
node scripts/directorctl.mjs clips --project <path>
node scripts/directorctl.mjs clip --project <path> --clip <id>
```

`assets` lists files below `资产/`. `clip` returns the complete version 2 manifest, including persisted reference slots and the separate `prompts.T2VA`, `prompts.I2VA`, and `prompts.R2VA` records. Rendering uses a mode's `optimized` string when present and otherwise uses its `original` string.

## Bind and prepare

```text
node scripts/directorctl.mjs bind --project <path> --clip <id> --asset "资产/角色/男主_角色参考_多视角.png" --subject 男主 --role character
node scripts/directorctl.mjs prepare --project <path> --clip <id>
```

`--asset` may be repeated or may name an asset directory. Supported roles include `character`, `wardrobe`, `object`, `environment`, `video`, and `audio`; the role is optional when the asset folder identifies it. `bind` writes `sourcePath`, `name`, `kind`, `role`, and a stable `assetKey`. `prepare` uploads only references that have a valid `sourcePath` but no `comfyName`, then persists the returned ComfyUI filename.

## Render

Before invoking render, ask the user to confirm all of these values, even when `clip.json` already contains them:

| Setting | CLI option | Example |
| --- | --- | --- |
| Video model | `--model` | `H3` |
| Generation mode | `--mode` | `R2VA` |
| Duration | `--duration` | `12` |
| Resolution | `--resolution` | `864 × 480` |
| Aspect ratio | `--aspect` | `16:9` |
| Frame rate | `--fps` | `24` |
| Acceleration | `--turbo` | `true` or `false` |

Then pass the confirmed values explicitly:

```text
node scripts/directorctl.mjs render --project <path> --clip <id> --mode R2VA --model H3 --duration 12 --resolution "864 × 480" --aspect "16:9" --fps 24 --turbo true --wait
node scripts/directorctl.mjs render --project <path> --clip <id> --mode R2VA --model H3 --duration 12 --resolution "864 × 480" --aspect "16:9" --fps 24 --turbo true --wait --timeout 3600
```

Optional overrides are `--prompt`, `--prompt-file`, `--mode`, `--duration`, `--resolution`, `--aspect`, `--fps`, `--model`, `--turbo false`, `--seed`, `--seed-mode`, `--keyframe-mode`, `--image`, and `--last-image`. `--keyframe-mode` applies only to I2VA; `clip.json.generation.keyframeMode` is present only when `generation.mode` is `I2VA`. Use `--prompt` for a short direct value or `--prompt-file` to avoid Windows command-line length limits for a long H3 prompt. An explicit prompt override is used only for that render and does not overwrite `clip.json`'s original/optimized record. The command calls `/api/generate`, polls `/api/generate/status`, calls `/api/output/finalize`, downloads the finalized video, and updates `clip.json` with `output` and generation metadata.

The CLI does not invoke `/api/optimize-prompt`. The calling agent is responsible for prompt editing in its own context, then passes the result through one of the two prompt override options.

Without `--wait`, `render` returns `status: submitted` and `prompt_id`; the agent must not claim that a video was generated. With `--wait`, timeout is bounded and a timeout is an error, not a success.
