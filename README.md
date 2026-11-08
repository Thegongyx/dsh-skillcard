# dsh-SkillCard · 技能卡片

[中文](README.md) | [English](README_en.md)

[![npm](https://img.shields.io/npm/v/dsh-skillcard?color=blue)](https://www.npmjs.com/package/dsh-skillcard)
[![license](https://img.shields.io/npm/l/dsh-skillcard)](LICENSE)
[![dsh plugin](https://img.shields.io/badge/dsh-plugin-4c8bf5)](https://github.com/Thegongyx/dsh-skillcard)

**把「你每天都要重打一遍的那句话」变成一张卡片：填两个空，点执行，答案直接回来。**

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 用的技能卡片插件。一句提示词里
会变的部分抽成 `${变量}`，其余措辞原样冻结——于是同样的任务，每次都是同一句话。

> 以前：`使用天气技能帮我查看深圳明天的天气`（明天换个城市就重打一遍）
> 现在：`使用天气技能帮我查看${地点}在${日期}的天气` → 填「上海」「后天」→ 执行 → 答案

---

## 为什么值得装

| | |
| --- | --- |
| **措辞稳定** | 模板冻结，只有变量在变，不会越问越跑偏 |
| **少打字** | 两个下拉、两个输入框，回车即走 |
| **答案直接回来** | 不用切到会话里翻；跑完就地显示，可复制 |
| **技能真的生效** | 卡片带 `skill` 时以 `/技能名` 注入，宿主按技能手势加载正文，不是"提了一嘴" |
| **有据可查** | 每张卡自己的执行历史：时间、状态、提问、完整回答，可展开、可批量删 |
| **能交给 Agent 生成** | 说一句"把这句话做成技能卡片"，它自己抽变量、写工具、存好 |

## 30 秒上手

```sh
# 方式一：npm
dsh plugin --profile web add dsh-skillcard

# 方式二：本地目录 / tarball
dsh plugin --profile web add ./dsh-skillcard-0.3.0.tgz
```

重启 profile、刷新页面，然后：

1. 点左下角 **⚡ 技能卡片**（和「远程目标切换」同一排）
2. 选卡片 → 填变量 → **执行**
3. 答案出现在下面，同时写进这张卡的执行历史

想把常用卡片固定在手边？把侧栏「技能卡片」面板里的详情页点 **在浮层里执行**，浮层会带着这张卡打开。

## 三个位置，三种职责

```
侧栏 → 技能卡片          管理：目录 / 新建 / 编辑 / 删除 / AI 生成 / 搜索
侧栏 → ⚡（底部）          使用：选卡 → 填空 → 执行 → 看答案 → 翻历史
对话 → 输入框           照常：卡片只是替你把话想好，不抢输入框
```

浮层里依次是：**卡片下拉选择框**（带搜索、`/技能名` 可见）→ 变量 → 预览 → 执行目标 → 结果 →
执行历史。整行可点展开，再点收起。

## 执行目标：工作区 × 模式 × 提供商 × 模型

每次执行都会新建一个会话，四个目标各有默认值：

| 目标 | 默认 |
| --- | --- |
| 工作区 | 最近会话所在的工作区 |
| 模式（Agent preset） | **普通/标准** preset（没有就退回部署默认） |
| 提供商 / 模型 | 模型目录里的默认项 |

选好的 provider/model 会在首轮之前用 `session/selectModel` 钉在那条会话上；钉不住时照常跑，
并在浮层里说明原因。会话会被命名为「卡片 · <标题>」，随时可以点「打开会话」看完整轨迹。

## 卡片长什么样

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

`variables` 每次保存都由模板重新推导，模板和变量不可能对不上。`${名称}` 与 `{{名称}}` 都认。

## 数据都在本地

| 文件 | 内容 |
| --- | --- |
| `<DSH_HOME>/skillcard/cards.json` | 卡片 |
| `<DSH_HOME>/skillcard/runs.json` | 执行历史（最近 300 条，删卡片会连带删历史） |

两份都是 Host 独占写入、临时文件 + rename 原子落盘；解析失败会把坏文件改名成 `.corrupt-<时间戳>`
再报错，绝不静默覆盖。

## 配置

```yaml
- id: dsh-skillcard
  config:
    defaultExpanded: true    # 目录默认展开
    showSidebarEntry: true   # 显示侧栏底部 ⚡ 入口
```

## 也能让 Agent 代劳

插件注册了 `skillcard` 工具（`list / get / create / update / delete`）。所以这段对话可以直接发生：

> **你**：把「使用天气技能帮我查看深圳明天的天气」做成技能卡片
> **Agent**：已保存「查天气」：`使用天气技能帮我查看${地点}在${日期}的天气`

## 开发

源码是 TypeScript，构建产物才是运行时：

```sh
npm install --ignore-scripts
npm run build        # src/host.ts → lib/index.js（ESM）；src/client.ts → lib/client.js（CJS 工厂）
npm run typecheck    # tsc --noEmit，strict
npm test             # 构建 + 类型检查 + 冒烟测试
```

- `src/host.ts` 宿主半边（卡片库、HTTP 桥、`skillcard` 工具）
- `src/client.ts` 浏览器半边（三个 slot、store、runner、组件）
- `src/shared.ts` 两半共用的领域模型与模板纯函数
- `src/contracts.d.ts` **手写**的 dsh 契约（故意不引 rc 阶段周更的 SDK 类型包，升级 dsh 不会弄崩 `tsc`）

安装时请用 tarball 或 npm 包，不要用 `link:` 目录——链接安装读到的是构建前的清单，
升级后 `main` 指向 `lib/`，链接会找不到入口。

## 自测

```sh
npm test
```

用最小 React 替身挂载三个 slot，点击「新建 / AI 生成 / 编辑 / 执行 / 展开历史」，断言组件树不抛错、
中英词条齐全、默认目标正确、`/技能名` 注入生效、运行中与完成的记录都写入。它跑的是 **lib/ 里的
构建产物**，所以能验证构建管线本身；它只覆盖代码路径，不替代浏览器里的真实观感。

## 技术说明

- Host 半：卡片库 + `/api/dsh-skillcard/*` 同源桥接（`sec-fetch-site`/`Origin` 与 `Host` 校验）+ `skillcard` 工具
- 浏览器半：`sidebar.panellist` 面板、`main` 管理页、`sidebar.footer.action` 浮层；样式只用 `--dsw-alias-*` 主题变量
- 结果取回：`session/wait` 轮询 `assistant/message` 的文本；停止用 `session/cancel`；待确认/超时各有状态
- 技能注入走宿主的 `/name` 手势扫描（`agent/pre-step`），所以和手打 `/weather` 完全一致

## 已知边界

- 每次执行新建会话（一张卡一次运行，互不串上下文）；侧栏会因此多出「卡片 · xxx」行
- 结果以纯文本回显，不做 Markdown 渲染（不引入宿主的渲染器）
- 历史写入失败会提示，但不会阻塞答案显示

## License

[MIT](LICENSE) © Thegongyx

---

## English

**Turn the sentence you retype every day into a fill-in card: pick a card, fill the blanks, press Run, get the answer.**

`dsh-skillcard` is a plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It
freezes the wording of a recurring prompt into a template with `${variables}` so the same task is asked
the same way, every time — and hands the answer back inside the card instead of hiding it in a chat.

- **Three surfaces**: a management panel (directory, editor, agent-generated cards, search), a
  sidebar-foot popover (card picker → variables → Run → answer → history), and the normal composer.
- **Real runs**: each execution creates a session in the chosen workspace / preset / provider / model,
  pins the model with `session/selectModel`, submits the prompt and polls `session/wait` until the turn
  settles. Stop, timeout, needs-input and interrupted states are explicit.
- **Skills actually load**: a card's `skill` is sent as a `/name` gesture, which the host expands at
  `agent/pre-step` — the same path as typing `/weather` by hand.
- **Local-first**: cards and run history are JSON files under `<DSH_HOME>/skillcard/`, written atomically
  by the host half.
- **Agent tool**: `skillcard` (`list / get / create / update / delete`) lets the model build cards for you.

```sh
dsh plugin --profile web add dsh-skillcard
```

MIT © Thegongyx
