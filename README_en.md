# dsh-SkillCard · skill cards

[![npm](https://img.shields.io/npm/v/dsh-skillcard?color=blue)](https://www.npmjs.com/package/dsh-skillcard)
[![license](https://img.shields.io/npm/l/dsh-skillcard)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4c8bf5)](https://github.com/Thegongyx/dsh-skillcard)

[中文](README.md) | English

**Turn the sentence you retype every day into a card: pick it, fill two blanks, press Run — and the answer comes back to you.**

A skill-card plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The parts of a
recurring prompt that change become `${variables}`; everything else is frozen, so the same task is asked
the same way every time.

> Before: `查看深圳明天的天气` — retyped from scratch for every city and every day.
> After: `查看${地点}在${日期}的天气` → fill in “上海”, “后天” → Run → the answer.

---

## Why install it

| | |
| --- | --- |
| **Stable wording** | The template is frozen; only the variables move, so prompts stop drifting |
| **Less typing** | Two selects and two inputs, then Enter |
| **The answer comes back** | No tab-hopping through the conversation: the reply appears in the card and can be copied |
| **Skills actually load** | A card's `skill` is sent as a `/name` gesture, which the host expands at `agent/pre-step` — the same path as typing `/weather` by hand |
| **Auditable** | Every card keeps its own run history: time, status, prompt, full answer; expandable, deletable in bulk |
| **Generatable** | Say “turn this sentence into a skill card” and the agent writes the template, extracts the variables and saves it |

## Quick start

```sh
# from npm
dsh plugin --profile web add dsh-skillcard

# or from a local tarball
dsh plugin --profile web add ./dsh-skillcard-0.4.1.tgz
```

Restart the profile, refresh the page, then:

1. Click **⚡ Skill cards** in the bottom-left corner (same row as the remote target switch)
2. Pick a card → fill the variables → **Run**
3. The answer appears below and is written into that card's run history

Install from the tarball or from npm, **not from a `link:` directory**: a linked install reads the manifest
before the build, and `main` points at `lib/`, so it will not resolve.

## Three surfaces

```
sidebar → Skill cards      manage: directory / new / edit / delete / AI generate / search
sidebar → ⚡ (footer)      use: pick a card → fill → Run → answer → history
composer                   unchanged: cards just think the sentence for you
```

The popover is, top to bottom: the **card picker** (searchable, shows each card's skill) → variables →
preview → run target → result → run history. The whole history row toggles on click.

## Run target: workspace × preset × provider × model

Each run creates a fresh Session, and every target has a default:

| Target | Default |
| --- | --- |
| Workspace | the workspace that owns the most recently touched Session |
| Preset | the **standard** preset (falls back to the deployment default) |
| Provider / model | the default route from the model catalog |

The chosen provider/model is pinned on the new Session with `session/selectModel` before its first turn.
A refused pin is not fatal — the run continues on the Session default and the popover says why. Sessions
are titled `卡片 · <card>` and can be opened from the result block.

## What a card looks like

```json
{
  "id": "sc_lqk3j2a1b2c",
  "title": "查天气",
  "description": "查某地某天的天气",
  "template": "使用天气技能帮我查看${地点}在${日期}的天气",
  "variables": [
    { "name": "地点", "label": "地点", "example": "深圳" },
    { "name": "日期", "label": "日期", "example": "明天" }
  ],
  "category": "天气",
  "skill": "weather"
}
```

`variables` is re-derived from the template on every write, so the two can never disagree. Both `${name}`
and `{{name}}` are accepted.

## Local-first data

| File | Contents |
| --- | --- |
| `<DSH_HOME>/skillcard/cards.json` | cards |
| `<DSH_HOME>/skillcard/runs.json` | run history (last 300 rows; deleting a card deletes its history) |

Both are written only by the host half, atomically (temp file + rename). An unparseable file is renamed to
`.corrupt-<timestamp>` and reported instead of being silently overwritten.

## Configuration

```yaml
- id: dsh-skillcard
  config:
    defaultExpanded: true    # directory starts expanded
    showSidebarEntry: true   # show the ⚡ entry in the sidebar footer
```

## Agent tool

The plugin registers a `skillcard` tool (`list / get / create / update / delete`), so this can happen in a
conversation:

> **You**: turn “使用天气技能帮我查看深圳明天的天气” into a skill card
> **Agent**: Saved 「查天气」: `使用天气技能帮我查看${地点}在${日期}的天气`

## Development

Sources are TypeScript; the runtime is what the build produces:

```sh
npm install --ignore-scripts
npm run build        # src/host.ts → lib/index.js (ESM); src/client.ts → lib/client.js (CJS factory)
npm run typecheck    # tsc --noEmit, strict
npm test             # build + typecheck + smoke suite
```

- `src/host.ts` — host half (card store, HTTP bridge, `skillcard` tool)
- `src/client.ts` — browser half (three slots, store, runner, components)
- `src/shared.ts` — domain model and pure template helpers used by both halves
- `src/contracts.d.ts` — **hand-written** dsh contracts; deliberately not depending on the release-candidate
  SDK type packages, so a dsh upgrade cannot break `tsc`

The smoke suite mounts all three slots against a minimal React stand-in, clicks through
new / AI-generate / edit / run / expand-history, and asserts that the tree never throws, that both locale
dictionaries are complete, that the default target is correct, that `/skill` injection happens, and that
both the running and the settled history rows are written. It runs the **built** bundle, so it also guards
the build pipeline — but it does not replace looking at the real UI in a browser.

## Notes and limits

- One fresh Session per run (one card = one run, no context bleed); the sidebar therefore gains `卡片 · …` rows
- Answers are shown as plain text, not rendered Markdown (the host renderer is not pulled in)
- A failed history write is reported but never blocks the answer

## License

[MIT](LICENSE) © Thegongyx
