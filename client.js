/**
 * dsh-skillcard — client half (browser bundle).
 *
 * Two surfaces over one card library:
 *  1. `sidebar.panellist` row + `main` panel "技能卡片": the directory of
 *     collapsible groups where the user manages cards (manual editor, agent
 *     generation) and hands a card to the popover.
 *  2. `sidebar.footer.action`: the quick entry beside Settings — the same row as
 *     the remote target switch — that opens a small popover with the card
 *     picker, the fill-in form, the run controls and the execution history.
 *
 * A card renders its ${variables} into a prompt; running it admits that prompt
 * through `session/prompt` on the most recently touched Session (a root-scoped
 * slot has no composer), and falls back to a new Session's draft when no
 * Session is available. Filling the composer by hand stays the other path.
 *
 * All card data goes through the host bridge in `index.js`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-skillcard',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'skillcard'
    const PANEL_ID = 'skillcards'
    const API = '/api/dsh-skillcard'
    const VAR_RE = /\$\{([^{}\n]+)\}/g
    /** Same grammar the host's skill-gesture scan uses for a `/name` token. */
    const SKILL_TOKEN_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

    // ---------------------------------------------------------------- locale
    const zh = {
      'panel.title': '技能卡片',
      'panel.subtitle': '{count} 张卡片 · 填好变量就能发给 Agent',
      'panel.new': '新建',
      'panel.ai': 'AI 生成',
      'panel.refresh': '刷新',
      'panel.loading': '正在读取卡片…',
      'panel.emptyTitle': '还没有技能卡片',
      'panel.emptyBody': '用「AI 生成」把一句常用提示词变成填空卡片，或者手动新建一张。',
      'panel.emptySelect': '从左边目录里选一张卡片',
      'dir.title': '目录',
      'dir.all': '全部卡片',
      'dir.uncategorized': '未分组',
      'dir.expand': '展开',
      'dir.collapse': '折叠',
      'card.edit': '编辑',
      'card.delete': '删除',
      'card.use': '执行',
      'card.copy': '复制提示词',
      'card.copied': '已复制',
      'card.uses': '用过 {count} 次',
      'card.skill': '技能 {name}',
      'card.variables': '变量',
      'card.preview': '预览',
      'card.noVariables': '这张卡片没有变量，可以直接执行。',
      'card.missing': '还差：{names}',
      'form.title': '标题',
      'form.category': '分组',
      'form.skill': '关联技能',
      'form.description': '说明',
      'form.template': '提示词模板',
      'form.templateHint': '用 变量 占位符标出每次都要改的部分，例如 地点 或 日期。',
      'form.variablesHint': '变量从模板自动提取。',
      'form.label': '显示名',
      'form.example': '示例',
      'form.save': '保存',
      'form.cancel': '取消',
      'form.titlePlaceholder': '例如：查天气',
      'form.requiredTitle': '标题不能为空',
      'form.requiredTemplate': '模板不能为空',
      'form.noVariables': '模板里还没有变量占位符。',
      'ai.title': '让 Agent 生成卡片',
      'ai.hint': '写一句你平时会说的话，Agent 会把它抽成变量模板并调用 skillcard 工具保存。生成提示词会放进新会话的输入框，按回车即可。',
      'ai.skill': '关联技能（可选）',
      'ai.none': '不指定',
      'ai.submit': '生成卡片',
      'ai.busy': '正在打开会话…',
      'ai.failed': '生成失败：{message}',
      'ai.placeholder': '使用天气技能帮我查看深圳明天的天气',
      'skill.count': '该会话可用技能 {count} 个',
      'skill.countGlobal': '全局技能 {count} 个',
      'skill.loading': '正在读取技能目录…',
      'skill.globalOnly': '当前没有会话，只能读到全局技能；在对话里打开本面板会按该会话补全。',
      'skill.refresh': '刷新技能目录',
      'skill.none': '没有读到技能目录（技能服务未启用？）',
      'dock.title': '技能卡片',
      'dock.expand': '展开',
      'dock.collapse': '收起',
      'dock.run': '执行',
      'dock.pick': '选一张卡片',
      'dock.sent': '已发送',
      'dock.filled': '已填入新会话的输入框，按回车发送',
      'foot.open': '技能卡片',
      'foot.label': '技能卡片',
      'foot.noSession': '没有可用会话，执行后会开一个新会话',
      'foot.sending': '发送中…',
      'card.sendTo': '发送到「{title}」',
      'card.sendRecent': '发送到最近会话',
      'card.sentTo': '已发送到「{title}」',
      'card.sentRecent': '已发送到最近会话',
      'run.workspace': '工作区',
      'run.preset': '模式',
      'run.provider': '提供商',
      'run.model': '模型',
      'run.noModels': '无可用模型',
      'run.defaultPreset': '默认模式',
      'run.noWorkspace': '没有可用工作区',
      'run.running': '运行中… {seconds}s',
      'run.stop': '停止',
      'run.open': '打开会话',
      'run.clear': '收起',
      'run.done': '完成',
      'run.empty': '已完成，没有文本输出。',
      'run.input': 'Agent 在等你的确认或回答，去会话里继续。',
      'run.timeout': '等待超时，去会话里看后续。',
      'run.error': '执行失败：{message}',
      'card.openPopover': '在浮层里执行',
      'card.manageHint': '这里是管理界面：新建、编辑、删除、置顶。要跑卡片请点左下角 ⚡ 浮层，那里的「在浮层里执行」会自动带过来。',
      'panel.searchPlaceholder': '搜索标题、模板、分组…',
      'panel.searchEmpty': '没有匹配的卡片',
      'foot.searchPlaceholder': '搜索卡片…',
      'foot.pickCard': '使用的卡片',
      'foot.none': '未选择',
      'foot.noSkill': '无关联技能',
      'hist.title': '全部执行记录（{count}）',
      'hist.titleFor': '「{card}」的执行记录（{count}）',
      'hist.empty': '还没有执行记录。',
      'hist.emptyFor': '「{card}」还没有执行记录。',
      'hist.loading': '正在读取记录…',
      'hist.recordFailed': '结果已显示，但写入执行记录失败。',
      'hist.deleteSelected': '删除所选 {count} 条',
      'hist.delete': '删除这条记录',
      'hist.prompt': '提问',
      'hist.answer': '回答',
      'hist.status.done': '完成',
      'hist.status.error': '失败',
      'hist.status.input': '待确认',
      'hist.status.timeout': '超时',
      'hist.status.stopped': '已停止',
      'hist.status.running': '运行中',
      'hist.status.interrupted': '已中断',
      'form.skillHint': '关联技能会以 /技能名 注入执行（需小写短横线，如 weather）；留空则不注入。',
      'error.bridge': '无法连接插件后台：{message}',
      'error.crashed': '技能卡片界面出错了',
    }
    const en = {
      'panel.title': 'Skill cards',
      'panel.subtitle': '{count} cards · fill the blanks and send',
      'panel.new': 'New',
      'panel.ai': 'Generate with AI',
      'panel.refresh': 'Refresh',
      'panel.loading': 'Loading cards…',
      'panel.emptyTitle': 'No skill cards yet',
      'panel.emptyBody': 'Use Generate with AI to turn a recurring prompt into a fill-in card, or create one by hand.',
      'panel.emptySelect': 'Pick a card from the directory',
      'dir.title': 'Directory',
      'dir.all': 'All cards',
      'dir.uncategorized': 'Uncategorized',
      'dir.expand': 'Expand',
      'dir.collapse': 'Collapse',
      'card.edit': 'Edit',
      'card.delete': 'Delete',
      'card.use': 'Run',
      'card.copy': 'Copy prompt',
      'card.copied': 'Copied',
      'card.uses': 'Used {count} times',
      'card.skill': 'Skill {name}',
      'card.variables': 'Variables',
      'card.preview': 'Preview',
      'card.noVariables': 'This card has no variables; run it directly.',
      'card.missing': 'Missing: {names}',
      'form.title': 'Title',
      'form.category': 'Category',
      'form.skill': 'Skill',
      'form.description': 'Description',
      'form.template': 'Prompt template',
      'form.templateHint': 'Mark the parts that change with a variable placeholder, e.g. 地点.',
      'form.variablesHint': 'Variables are detected from the template.',
      'form.label': 'Label',
      'form.example': 'Example',
      'form.save': 'Save',
      'form.cancel': 'Cancel',
      'form.titlePlaceholder': 'e.g. Check the weather',
      'form.requiredTitle': 'A title is required',
      'form.requiredTemplate': 'A template is required',
      'form.noVariables': 'The template has no variable placeholders yet.',
      'ai.title': 'Let the agent build the card',
      'ai.hint': 'Write a sentence you would normally type; the agent turns it into a variable template and saves it with the skillcard tool. The instruction lands in a new session composer — press Enter to send.',
      'ai.skill': 'Start from a skill (optional)',
      'ai.none': 'None',
      'ai.submit': 'Generate card',
      'ai.busy': 'Opening a session…',
      'ai.failed': 'Generation failed: {message}',
      'ai.placeholder': 'Use the weather skill to check tomorrow\'s weather in Shenzhen',
      'skill.count': '{count} skills available in this session',
      'skill.countGlobal': '{count} global skills',
      'skill.loading': 'Loading the skill catalog…',
      'skill.globalOnly': 'No session is open, so only global skills are readable; open this panel from a conversation for that session\'s full catalog.',
      'skill.refresh': 'Refresh skills',
      'skill.none': 'No skill catalog was readable (is the skill service enabled?)',
      'dock.title': 'Skill cards',
      'dock.expand': 'Expand',
      'dock.collapse': 'Collapse',
      'dock.run': 'Run',
      'dock.pick': 'Pick a card',
      'dock.sent': 'Sent',
      'dock.filled': 'Filled into a new session\'s composer — press Enter to send',
      'foot.open': 'Skill cards',
      'foot.label': 'Skill cards',
      'foot.noSession': 'No session available; running opens a new one',
      'foot.sending': 'Sending…',
      'card.sendTo': 'Sends to "{title}"',
      'card.sendRecent': 'Sends to the most recent session',
      'card.sentTo': 'Sent to "{title}"',
      'card.sentRecent': 'Sent to the most recent session',
      'run.workspace': 'Workspace',
      'run.preset': 'Mode',
      'run.provider': 'Provider',
      'run.model': 'Model',
      'run.noModels': 'No models',
      'run.defaultPreset': 'Default mode',
      'run.noWorkspace': 'No workspace available',
      'run.running': 'Running… {seconds}s',
      'run.stop': 'Stop',
      'run.open': 'Open session',
      'run.clear': 'Dismiss',
      'run.done': 'Done',
      'run.empty': 'Finished without text output.',
      'run.input': 'The agent is waiting for your confirmation or answer — continue in the session.',
      'run.timeout': 'Timed out; open the session for the rest.',
      'run.error': 'Run failed: {message}',
      'card.openPopover': 'Run in the quick panel',
      'card.manageHint': 'Management view: create, edit, delete, pin. To run a card use the ⚡ popover at the sidebar foot — "Run in the quick panel" carries the card over.',
      'panel.searchPlaceholder': 'Search title, template, category…',
      'panel.searchEmpty': 'No matching cards',
      'foot.pickCard': 'Card',
      'foot.none': 'Nothing selected',
      'foot.noSkill': 'no skill',
      'foot.searchPlaceholder': 'Search cards…',
      'hist.title': 'All runs ({count})',
      'hist.titleFor': 'Runs for "{card}" ({count})',
      'hist.empty': 'No runs yet.',
      'hist.emptyFor': 'No runs for "{card}" yet.',
      'hist.loading': 'Loading runs…',
      'hist.recordFailed': 'The answer is shown, but saving it to the run history failed.',
      'hist.deleteSelected': 'Delete {count} selected',
      'hist.delete': 'Delete this run',
      'hist.prompt': 'Prompt',
      'hist.answer': 'Answer',
      'hist.status.done': 'done',
      'hist.status.error': 'failed',
      'hist.status.input': 'needs input',
      'hist.status.timeout': 'timed out',
      'hist.status.stopped': 'stopped',
      'hist.status.running': 'running',
      'hist.status.interrupted': 'interrupted',
      'form.skillHint': 'The skill is injected as /skill-name when run (lowercase kebab-case, e.g. weather); leave empty to skip.',
      'error.bridge': 'Cannot reach the plugin host: {message}',
      'error.crashed': 'The skill card view failed',
    }

    // --------------------------------------------------------------- helpers
    function variableNames(template) {
      const names = []
      const seen = new Set()
      for (const match of String(template ?? '').matchAll(VAR_RE)) {
        const name = String(match[1] ?? '').trim()
        if (name === '' || seen.has(name)) continue
        seen.add(name)
        names.push(name)
      }
      return names
    }

    function renderTemplate(template, values) {
      return String(template ?? '').replace(VAR_RE, (match, raw) => {
        const name = String(raw).trim()
        const value = values === undefined ? undefined : values[name]
        return value === undefined || value === '' ? match : String(value)
      })
    }

    function missingNames(template, values) {
      return variableNames(template).filter((name) => {
        const value = values === undefined ? undefined : values[name]
        return value === undefined || String(value).trim() === ''
      })
    }

    function emptyValues(card) {
      const values = {}
      for (const name of variableNames(card.template)) values[name] = ''
      return values
    }

    function messageOf(error) {
      if (error instanceof Error) return error.message
      return String(error ?? 'unknown error')
    }

    function uid() {
      const globalCrypto = typeof crypto === 'object' && crypto !== null ? crypto : undefined
      if (globalCrypto !== undefined && typeof globalCrypto.randomUUID === 'function') return globalCrypto.randomUUID()
      return 'sc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
    }

    function unwrap(result) {
      if (result !== null && typeof result === 'object' && 'ok' in result) {
        if (result.ok === false) throw new Error(result.error?.message ?? result.error?.code ?? 'request failed')
        return result.value
      }
      return result
    }

    /** Body portal for floating surfaces; falls back to inline rendering. */
    const portal = (() => {
      try {
        const reactDom = require('react-dom')
        return typeof reactDom?.createPortal === 'function' ? reactDom.createPortal.bind(reactDom) : undefined
      } catch {
        return undefined
      }
    })()

    function renderBodyPortal(children) {
      if (typeof portal !== 'function' || typeof document === 'undefined' || document === null) return children
      const body = document.body
      if (body === null || body === undefined) return children
      try {
        return portal(children, body)
      } catch {
        return children
      }
    }

    async function request(path, body) {
      const options =
        body === undefined
          ? { method: 'GET', headers: { accept: 'application/json' } }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify(body),
            }
      let response
      try {
        response = await window.fetch(API + path, options)
      } catch (error) {
        throw new Error('network error: ' + messageOf(error))
      }
      let data = null
      try {
        data = await response.json()
      } catch {
        data = null
      }
      if (!response.ok) {
        throw new Error(data === null ? `HTTP ${response.status}` : (data.message ?? data.error ?? `HTTP ${response.status}`))
      }
      if (data !== null && data.ok === false) throw new Error(data.message ?? 'request failed')
      return data === null ? null : data.value
    }

    // ----------------------------------------------------------------- store
    const DEFAULT_CONFIG = { defaultExpanded: true, showSidebarEntry: true }

    function createStore(remote) {
      let state = {
        status: 'idle',
        error: '',
        cards: [],
        config: { ...DEFAULT_CONFIG },
        selectedId: null,
        drafts: {},
        notice: '',
        runs: [],
        runsCardId: '',
        runsStatus: 'idle',
        popoverRequest: null,
      }
      const listeners = new Set()
      let inflight = null
      let noticeTimer = undefined

      const get = () => state
      const emit = () => {
        for (const listener of Array.from(listeners)) listener()
      }
      const set = (patch) => {
        state = { ...state, ...patch }
        emit()
      }

      function refresh() {
        if (inflight !== null) return inflight
        if (state.status !== 'ready') set({ status: 'loading', error: '' })
        inflight = request('/cards')
          .then((value) => {
            const cards = Array.isArray(value?.cards) ? value.cards : []
            const selected = cards.some((card) => card.id === state.selectedId) ? state.selectedId : null
            set({
              status: 'ready',
              error: '',
              cards,
              selectedId: selected,
              config: { ...DEFAULT_CONFIG, ...(value?.config ?? {}) },
            })
          })
          .catch((error) => {
            set({ status: 'error', error: messageOf(error) })
          })
          .finally(() => {
            inflight = null
          })
        return inflight
      }

      function notify(text) {
        set({ notice: text })
        if (noticeTimer !== undefined) window.clearTimeout(noticeTimer)
        noticeTimer = window.setTimeout(() => {
          noticeTimer = undefined
          set({ notice: '' })
        }, 2200)
      }

      function draftOf(id) {
        return state.drafts[id] ?? {}
      }

      /** Load execution history for one card ('' = the latest runs across cards). */
      async function refreshRuns(cardId) {
        const key = typeof cardId === 'string' ? cardId : ''
        set({ runsStatus: 'loading', runsCardId: key })
        try {
          const value = await request('/runs' + (key === '' ? '' : '?cardId=' + encodeURIComponent(key)))
          set({ runs: Array.isArray(value?.runs) ? value.runs : [], runsStatus: 'ready' })
        } catch {
          set({ runs: [], runsStatus: 'error' })
        }
      }

      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        get,
        refresh,
        notify,
        select(id) {
          set({ selectedId: id })
        },
        clearSelection() {
          set({ selectedId: null })
        },
        draftOf,
        setValue(cardId, name, value) {
          const current = state.drafts[cardId] ?? {}
          set({ drafts: { ...state.drafts, [cardId]: { ...current, [name]: value } } })
        },
        resetValues(cardId) {
          const card = state.cards.find((item) => item.id === cardId)
          if (card === undefined) return
          set({ drafts: { ...state.drafts, [cardId]: emptyValues(card) } })
        },
        async saveCard(input) {
          const value = await request('/save', { card: input })
          set({ cards: value.cards ?? state.cards })
          if (value.card !== undefined) {
            const drafts = { ...state.drafts }
            const merged = emptyValues(value.card)
            for (const name of Object.keys(merged)) merged[name] = state.drafts[value.card.id]?.[name] ?? ''
            drafts[value.card.id] = merged
            set({ selectedId: value.card.id, drafts })
          }
          return value.card
        },
        async removeCard(id) {
          const value = await request('/delete', { id })
          const cards = value.cards ?? state.cards
          const drafts = { ...state.drafts }
          delete drafts[id]
          set({ cards, drafts, selectedId: state.selectedId === id ? null : state.selectedId })
        },
        async markUsed(id) {
          try {
            await request('/use', { id })
          } catch {
            // usage counting is best-effort
          }
        },
        /** Ask the sidebar popover to open on one card (management → use hand-off). */
        requestPopover(cardId) {
          const seq = (state.popoverRequest?.seq ?? 0) + 1
          set({ selectedId: cardId, popoverRequest: { cardId, seq } })
        },
        async refreshRuns(cardId) {
          await refreshRuns(cardId)
        },
        async recordRun(entry) {
          try {
            await request('/runs/record', { run: entry })
            await refreshRuns(typeof entry?.cardId === 'string' ? entry.cardId : '')
            return true
          } catch {
            return false
          }
        },
        async deleteRuns(ids) {
          const wanted = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string')
          if (wanted.length === 0) return
          const value = await request('/runs/delete', { ids: wanted })
          set({ runs: state.runs.filter((run) => !wanted.includes(run.id)) })
          return value?.deleted ?? 0
        },
        async skills(sessionId) {
          // The Session's own composition is what the `/` menu lists; the bridge
          // route is the session-less fallback (a live agent's layer chain, or the
          // global layer when nothing is running).
          if (typeof sessionId === 'string' && sessionId !== '' && remote !== undefined) {
            try {
              const value = unwrap(await remote.skills.list({ sessionId }))
              const list = Array.isArray(value?.skills) ? value.skills : []
              if (list.length > 0) return { skills: list, scoped: true }
            } catch {
              // fall through to the host catalog
            }
          }
          const value = await request('/skills')
          return { skills: Array.isArray(value?.skills) ? value.skills : [], scoped: false }
        },
      }
    }

    /** Subscribe a component to the whole store snapshot (replaced on every change). */
    function useSnapshot(store) {
      const [snapshot, setSnapshot] = React.useState(() => store.get())
      React.useEffect(() => {
        setSnapshot(store.get())
        return store.subscribe(() => setSnapshot(store.get()))
      }, [store])
      return snapshot
    }

    // ------------------------------------------------------------------ runner
    /** Concatenate the text blocks of one assistant message surface. */
    function assistantText(message) {
      const blocks = message !== null && typeof message === 'object' && Array.isArray(message.content) ? message.content : []
      const parts = []
      for (const block of blocks) {
        if (block === null || typeof block !== 'object') continue
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
      }
      return parts.join('')
    }

    function mostRecentSessionId(sessions) {
      if (sessions === undefined || sessions === null) return undefined
      const rows = (sessions.ids ?? [])
        .map((id) => sessions.byId?.[id])
        .filter((row) => row !== undefined && row !== null && row.origin !== 'subagent')
      if (rows.length === 0) return undefined
      rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      return rows[0].sessionId
    }

    const RUN_DEADLINE_MS = 240000
    const RUN_POLL_MS = 20000

    /**
     * Runs one rendered card prompt in a fresh Session and reports the answer.
     *
     * The target is an Agent-preset + Workspace pair. Both default: the Workspace
     * that owns the most recently touched Session, and the deployment's default
     * preset. A fresh Session per run keeps unrelated cards from sharing context
     * and makes the wait unambiguous; the run is renamed after the card so it is
     * recognizable in the sidebar.
     */
    function useCardRunner(opts) {
      const remote = opts.remote
      const uiWorkspace = opts.uiWorkspace
      const workspacesSnapshot = typeof opts.useWorkspaces === 'function' ? opts.useWorkspaces((state) => state) : undefined
      const sessionsSnapshot = typeof opts.useSessions === 'function' ? opts.useSessions((state) => state) : undefined
      const workspaces = Array.isArray(workspacesSnapshot?.items) ? workspacesSnapshot.items : []

      const [presets, setPresets] = React.useState([])
      const [catalog, setCatalog] = React.useState(null)
      const [providerId, setProviderId] = React.useState('')
      const [modelId, setModelId] = React.useState('')
      const modelGroups = Array.isArray(catalog?.groups) ? catalog.groups : []
      const [workspaceId, setWorkspaceId] = React.useState('')
      const [presetId, setPresetId] = React.useState('')
      const [phase, setPhase] = React.useState('idle')
      const [answer, setAnswer] = React.useState('')
      const [failure, setFailure] = React.useState('')
      const [sessionId, setSessionId] = React.useState('')
      const [elapsed, setElapsed] = React.useState(0)
      const picked = React.useRef(false)
      const activeRun = React.useRef(null)

      React.useEffect(() => {
        if (remote === undefined || typeof remote.agentPresets?.list !== 'function') return undefined
        let alive = true
        remote.agentPresets
          .list()
          .then((value) => {
            if (!alive) return
            const roster = unwrap(value)
            const rows = (Array.isArray(roster?.presets) ? roster.presets : []).filter(
              (row) => row !== null && typeof row === 'object' && (row.broken === undefined || row.broken === ''),
            )
            setPresets(rows)
            // The standard preset is the default for card runs; fall back to the
            // deployment default when this profile does not ship it.
            const fallback = rows.find((row) => row.id === 'standard') ?? rows.find((row) => row.isDefault === true)
            if (fallback !== undefined) setPresetId((current) => (current === '' ? fallback.id : current))
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [remote])

      React.useEffect(() => {
        if (remote === undefined || typeof remote.session?.modelCatalog !== 'function') return undefined
        let alive = true
        remote.session
          .modelCatalog()
          .then((value) => {
            if (!alive) return
            const data = unwrap(value)
            setCatalog(data !== null && typeof data === 'object' ? data : null)
            const preferred = data?.default
            if (preferred === undefined || typeof preferred?.provider !== 'string') return
            setProviderId((current) => (current === '' ? preferred.provider : current))
            setModelId((current) => (current === '' ? preferred.model : current))
          })
          .catch(() => {})
        return () => {
          alive = false
        }
      }, [remote])

      React.useEffect(() => {
        if (picked.current || workspaces.length === 0) return
        if (workspaceId !== '' && workspaces.some((workspace) => workspace.workspaceId === workspaceId)) return
        const recent = mostRecentSessionId(sessionsSnapshot)
        const owner =
          recent === undefined ? undefined : workspaces.find((workspace) => (workspace.sessionIds ?? []).includes(recent))
        setWorkspaceId((owner ?? workspaces[0]).workspaceId)
      }, [workspaces, workspaceId, sessionsSnapshot])

      React.useEffect(() => {
        if (phase !== 'running') return undefined
        const started = Date.now()
        setElapsed(0)
        const timer = window.setInterval(() => {
          setElapsed(Math.round((Date.now() - started) / 1000))
        }, 1000)
        return () => window.clearInterval(timer)
      }, [phase])

      const stop = () => {
        if (sessionId === '' || typeof remote?.session?.cancel !== 'function') return
        try {
          remote.session.cancel({ sessionId })
        } catch {
          // the turn may already have settled
        }
        const active = activeRun.current
        if (active !== null && active.sessionId === sessionId) active.settle('stopped', '', active.answer(), sessionId)
        else setPhase('done')
      }

      const reset = () => {
        setPhase('idle')
        setAnswer('')
        setFailure('')
        setSessionId('')
      }

      /**
       * The prompt actually sent: a valid `skill` on the card becomes the
       * whitespace-bounded `/name` gesture the host scans for at `agent/pre-step`,
       * so the skill body is injected into the run.
       */
      const skillTokenOf = (card) => {
        const skill = String(card?.skill ?? '')
          .trim()
          .replace(/^\//, '')
          .toLowerCase()
        return SKILL_TOKEN_RE.test(skill) ? '/' + skill : ''
      }

      /**
       * @param card - the card being run (title, skill, id).
       * @param text - the rendered prompt.
       */
      const run = async (card, text) => {
        if (phase === 'running') return
        const skill = skillTokenOf(card)
        const sent = skill === '' ? text : skill + ' ' + text
        const meta = {
          cardId: typeof card?.id === 'string' ? card.id : '',
          cardTitle: typeof card?.title === 'string' ? card.title : '',
          skill: skill === '' ? '' : skill.slice(1),
          prompt: sent,
          startedAt: Date.now(),
        }
        const runId = 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
        const chunks = []
        const seen = new Set()
        let sessionIdValue = ''

        /**
         * Every terminal path goes through here so the run is recorded exactly once,
         * even when the popover is closed before the turn settles.
         */
        const settle = (nextPhase, failureMessage, answerText, id) => {
          setPhase(nextPhase)
          if (typeof failureMessage === 'string' && failureMessage !== '') setFailure(failureMessage)
          activeRun.current = null
          if (typeof opts.onFinish !== 'function') return
          try {
            opts.onFinish({
              id: runId,
              meta,
              phase: nextPhase,
              answer: typeof answerText === 'string' ? answerText : '',
              failure: typeof failureMessage === 'string' ? failureMessage : '',
              sessionId: typeof id === 'string' ? id : '',
            })
          } catch {
            // a broken listener must not break the run
          }
        }
        activeRun.current = { settle, answer: () => chunks.join('\n\n'), sessionId: '' }

        setPhase('running')
        setAnswer('')
        setFailure('')
        setSessionId('')
        // The history row appears the moment the run starts, not when it settles.
        if (typeof opts.onStart === 'function') {
          try {
            opts.onStart({ id: runId, meta })
          } catch {
            // a broken listener must not break the run
          }
        }
        let created
        try {
          created = unwrap(
            await remote.session.create({
              ...(workspaceId === '' ? {} : { workspaceId }),
              ...(presetId === '' ? {} : { agentPreset: presetId }),
            }),
          )
        } catch (error) {
          // No session could be created: leave the prompt in a new composer instead.
          activeRun.current = null
          uiWorkspace.startSession(undefined, { prompt: sent, whenDraftExists: 'append' })
          setPhase('draft')
          return
        }
        const id = created?.sessionId
        if (typeof id !== 'string' || id === '') {
          settle('error', 'session/create returned no session id', '', '')
          return
        }
        sessionIdValue = id
        activeRun.current = { settle, answer: () => chunks.join('\n\n'), sessionId: id }
        setSessionId(id)
        // Pin the provider/model on the fresh Session before its first turn.
        const chosenProvider = providerId
        const chosenModel = modelId
        if (chosenProvider !== '' && chosenModel !== '' && typeof remote.session.selectModel === 'function') {
          const group = modelGroups.find((entry) => entry.id === chosenProvider)
          const entry = Array.isArray(group?.models) ? group.models.find((item) => item.id === chosenModel) : undefined
          const effort = entry?.reasoning?.defaultEffort
          try {
            unwrap(
              await remote.session.selectModel({
                sessionId: id,
                provider: chosenProvider,
                model: chosenModel,
                ...(typeof effort === 'string' && effort !== '' ? { reasoningEffort: effort } : {}),
              }),
            )
          } catch (error) {
            // A refused pin is not fatal: the run continues on the Session default,
            // but the user is told which model was refused.
            if (typeof opts.onWarning === 'function') {
              try {
                opts.onWarning(messageOf(error))
              } catch {
                // ignore a broken listener
              }
            }
          }
        }
        try {
          if (typeof card?.title === 'string' && card.title !== '') {
            Promise.resolve(remote.session.rename({ sessionId: id, title: '卡片 · ' + card.title })).catch(() => {})
          }
          unwrap(
            await remote.session.prompt({
              requestId: uid(),
              sessionId: id,
              mode: 'queue',
              content: [{ type: 'text', text: sent }],
              ...(timeZoneName() === undefined ? {} : { clientTimeZone: timeZoneName() }),
            }),
          )
        } catch (error) {
          settle('error', messageOf(error), '', sessionIdValue)
          return
        }

        const deadline = Date.now() + RUN_DEADLINE_MS
        const admittedAt = Date.now()
        let retries = 0
        for (;;) {
          let value
          try {
            value = unwrap(
              await remote.session.wait({
                sessionId: id,
                timeoutMs: RUN_POLL_MS,
                maxMessages: 200,
                ...(seen.size === 0 ? {} : { afterSeq: Math.max(...seen) }),
              }),
            )
          } catch (error) {
            settle('error', messageOf(error), chunks.join('\n\n'), sessionIdValue)
            return
          }
          const records = Array.isArray(value?.output?.records) ? value.output.records : []
          for (const record of records) {
            const event = record?.event
            if (event === null || event === undefined) continue
            if (typeof event.seq === 'number') {
              if (seen.has(event.seq)) continue
              seen.add(event.seq)
            }
            if (event.type !== 'assistant/message') continue
            if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') continue
            const text = assistantText(event.data?.message).trim()
            if (text === '') continue
            chunks.push(text)
            setAnswer(chunks.join('\n\n'))
          }
          if (value?.reason === 'input-required') {
            settle('input', '', chunks.join('\n\n'), sessionIdValue)
            return
          }
          if (value?.reason !== 'timeout') {
            // A freshly admitted prompt can race the first poll: the Session looks
            // idle for a moment before the Turn opens. Retry briefly instead of
            // reporting an empty answer.
            if (chunks.length === 0 && retries < 5 && Date.now() - admittedAt < 10000) {
              retries += 1
              await new Promise((resolve) => window.setTimeout(resolve, 300))
              continue
            }
            settle('done', '', chunks.join('\n\n'), sessionIdValue)
            return
          }
          if (value?.state?.running !== true) {
            settle('done', '', chunks.join('\n\n'), sessionIdValue)
            return
          }
          if (Date.now() > deadline) {
            settle('timeout', '', chunks.join('\n\n'), sessionIdValue)
            return
          }
        }
      }
      return {
        workspaces,
        presets,
        workspaceId,
        presetId,
        providerId,
        modelId,
        modelGroups,
        phase,
        answer,
        failure,
        sessionId,
        elapsed,
        setWorkspace(id) {
          picked.current = true
          setWorkspaceId(id)
        },
        setPreset(id) {
          setPresetId(id)
        },
        setProvider(id) {
          setProviderId(id)
          const group = modelGroups.find((entry) => entry.id === id)
          const first = Array.isArray(group?.models) ? group.models[0] : undefined
          setModelId(first?.id ?? '')
        },
        setModel(id) {
          setModelId(id)
        },
        run,
        stop,
        reset,
      }
    }

    function timeZoneName() {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone
      } catch {
        return undefined
      }
    }

    /** Workspace, Agent preset, provider and model for one run; each carries a default. */
    function RunnerTarget(props) {
      const t = props.t
      const runner = props.runner
      const provider = runner.modelGroups.find((group) => group.id === runner.providerId)
      const models = Array.isArray(provider?.models) ? provider.models : []
      return h(
        'div',
        { className: 'sc-run-target' },
        h(
          'label',
          { className: 'sc-run-field' },
          h('span', null, t('run.workspace')),
          h(
            'select',
            {
              value: runner.workspaceId,
              onChange: (event) => runner.setWorkspace(event.target.value),
              'data-skillcard-workspace': '',
            },
            runner.workspaces.length === 0
              ? h('option', { value: '' }, t('run.noWorkspace'))
              : runner.workspaces.map((workspace) =>
                  h(
                    'option',
                    { key: workspace.workspaceId, value: workspace.workspaceId },
                    workspace.title === '' ? workspace.path : workspace.title,
                  ),
                ),
          ),
        ),
        h(
          'label',
          { className: 'sc-run-field' },
          h('span', null, t('run.preset')),
          h(
            'select',
            {
              value: runner.presetId,
              onChange: (event) => runner.setPreset(event.target.value),
              'data-skillcard-preset': '',
            },
            h('option', { value: '' }, t('run.defaultPreset')),
            runner.presets.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name ?? preset.id)),
          ),
        ),
        h(
          'label',
          { className: 'sc-run-field' },
          h('span', null, t('run.provider')),
          h(
            'select',
            {
              value: runner.providerId,
              onChange: (event) => runner.setProvider(event.target.value),
              'data-skillcard-provider': '',
            },
            runner.modelGroups.length === 0
              ? h('option', { value: '' }, t('run.noModels'))
              : runner.modelGroups.map((group) =>
                  h('option', { key: group.id, value: group.id }, group.name ?? group.id),
                ),
          ),
        ),
        h(
          'label',
          { className: 'sc-run-field' },
          h('span', null, t('run.model')),
          h(
            'select',
            {
              value: runner.modelId,
              onChange: (event) => runner.setModel(event.target.value),
              'data-skillcard-model': '',
            },
            models.length === 0
              ? h('option', { value: '' }, t('run.noModels'))
              : models.map((model) => h('option', { key: model.id, value: model.id }, model.name ?? model.id)),
          ),
        ),
      )
    }

    /** Live state of one run: progress, the answer, and the way to the Session. */
    function RunResult(props) {
      const t = props.t
      const runner = props.runner
      if (runner.phase === 'idle') return null
      const openSession = () => {
        if (runner.sessionId !== '') props.onOpenSession?.(runner.sessionId)
      }
      const note =
        runner.phase === 'running'
          ? t('run.running', { seconds: runner.elapsed })
          : runner.phase === 'input'
            ? t('run.input')
            : runner.phase === 'draft'
              ? t('dock.filled')
              : runner.phase === 'timeout'
                ? t('run.timeout')
                : runner.phase === 'error'
                  ? t('run.error', { message: runner.failure })
                  : t('run.done')
      return h(
        'div',
        { className: 'sc-run-result' },
        h(
          'div',
          { className: 'sc-run-head' },
          h('span', { className: 'sc-run-state' + (runner.phase === 'error' ? ' sc-run-state-error' : '') }, note),
          runner.phase === 'running'
            ? h('button', { type: 'button', className: 'sc-btn', onClick: runner.stop }, t('run.stop'))
            : runner.sessionId === ''
              ? null
              : h(
                  'div',
                  { className: 'sc-run-head-actions' },
                  h('button', { type: 'button', className: 'sc-btn', onClick: openSession }, t('run.open')),
                  h('button', { type: 'button', className: 'sc-btn', onClick: runner.reset }, t('run.clear')),
                ),
        ),
        runner.answer === ''
          ? runner.phase === 'done'
            ? h('div', { className: 'sc-hint' }, t('run.empty'))
            : null
          : h('pre', { className: 'sc-run-answer' }, runner.answer),
      )
    }
    // --------------------------------------------------------------- visuals
    function ErrorBoundary(props) {
      const [failed, setFailed] = React.useState(null)
      if (failed !== null) {
        return h(
          'div',
          { className: 'sc-crash', role: 'alert' },
          '⚠ ',
          props.label ?? 'dsh-skillcard',
          ': ',
          messageOf(failed),
        )
      }
      return h(BoundaryGuard, { onError: setFailed }, props.children)
    }

    class BoundaryGuard extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        if (typeof this.props.onError === 'function') this.props.onError(error)
      }

      render() {
        return this.state.failed ? null : this.props.children
      }
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' ? props.size : 16
      const stroke = 'currentColor'
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', 'aria-hidden': 'true', focusable: 'false' },
        h('rect', {
          x: 2.75,
          y: 4.25,
          width: 13.5,
          height: 16.5,
          rx: 2.5,
          stroke,
          strokeWidth: 1.4,
          opacity: props.active ? 0.55 : 0.35,
        }),
        h('rect', {
          x: 7.25,
          y: 3.25,
          width: 13.5,
          height: 16.5,
          rx: 2.5,
          stroke,
          strokeWidth: 1.4,
          fill: 'var(--dsw-specific-sidebar-fill, transparent)',
        }),
        h('path', {
          d: 'M10.5 8.5h6.5M10.5 12h6.5M10.5 15.5h4',
          stroke,
          strokeWidth: 1.4,
          strokeLinecap: 'round',
        }),
        h('path', { d: 'M15 13.5l1.6 2.9h-1.2l0.8 2.4-2.5-3.1h1.2z', fill: '#ffb020' }),
      )
    }

    function Chevron(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 12,
          height: 12,
          'aria-hidden': 'true',
          focusable: 'false',
          style: { transform: props.open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' },
        },
        h('path', { d: 'M6 3.5l4.5 4.5L6 12.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )
    }

    function TemplateText(props) {
      const template = String(props.template ?? '')
      const nodes = []
      let index = 0
      VAR_RE.lastIndex = 0
      let match
      while ((match = VAR_RE.exec(template)) !== null) {
        if (match.index > index) nodes.push(template.slice(index, match.index))
        nodes.push(h('span', { key: 'v' + match.index, className: 'sc-var' }, match[0]))
        index = match.index + match[0].length
      }
      if (index < template.length) nodes.push(template.slice(index))
      return h('pre', { className: 'sc-template' }, nodes)
    }

    // ------------------------------------------------------------ dashboards
    function CardEditor(props) {
      const { t, initial, skills } = props
      const [title, setTitle] = React.useState(initial.title ?? '')
      const [category, setCategory] = React.useState(initial.category ?? '')
      const [skill, setSkill] = React.useState(initial.skill ?? '')
      const [description, setDescription] = React.useState(initial.description ?? '')
      const [template, setTemplate] = React.useState(initial.template ?? '')
      const [meta, setMeta] = React.useState(() => {
        const map = {}
        for (const variable of initial.variables ?? []) map[variable.name] = variable
        return map
      })
      const [error, setError] = React.useState('')

      const names = variableNames(template)
      const skillNames = (skills ?? []).map((item) => item.name)
      if (skill !== '' && !skillNames.includes(skill)) skillNames.unshift(skill)

      const submit = () => {
        if (title.trim() === '') {
          setError(t('form.requiredTitle'))
          return
        }
        if (template.trim() === '') {
          setError(t('form.requiredTemplate'))
          return
        }
        setError('')
        props.onSave({
          id: initial.id,
          title,
          category,
          skill,
          description,
          template,
          variables: names.map((name) => ({
            name,
            label: meta[name]?.label ?? '',
            example: meta[name]?.example ?? '',
          })),
        })
      }

      return h(
        'div',
        { className: 'sc-editor' },
        h('label', { className: 'sc-field' }, h('span', null, t('form.title')), h('input', {
          value: title,
          placeholder: t('form.titlePlaceholder'),
          onChange: (event) => setTitle(event.target.value),
          'data-skillcard-field': 'title',
        })),
        h(
          'div',
          { className: 'sc-field-row' },
          h('label', { className: 'sc-field' }, h('span', null, t('form.category')), h('input', {
            value: category,
            onChange: (event) => setCategory(event.target.value),
          })),
          h('label', { className: 'sc-field' }, h('span', null, t('form.skill')), h(
            'select',
            { value: skill, onChange: (event) => setSkill(event.target.value) },
            h('option', { value: '' }, t('ai.none')),
            skillNames.map((name) => h('option', { key: name, value: name }, name)),
          ), h('small', { className: 'sc-hint' }, t('form.skillHint'))),
        ),
        h('label', { className: 'sc-field' }, h('span', null, t('form.description')), h('textarea', {
          rows: 2,
          value: description,
          onChange: (event) => setDescription(event.target.value),
        })),
        h(
          'label',
          { className: 'sc-field' },
          h('span', null, t('form.template')),
          h('textarea', {
            rows: 5,
            value: template,
            placeholder: '使用天气技能帮我查看${地点}在${日期}的天气',
            onChange: (event) => setTemplate(event.target.value),
            'data-skillcard-field': 'template',
          }),
          h('small', { className: 'sc-hint' }, t('form.templateHint')),
        ),
        h(
          'div',
          { className: 'sc-vars' },
          h('div', { className: 'sc-vars-head' }, t('card.variables'), h('span', { className: 'sc-hint' }, t('form.variablesHint'))),
          names.length === 0
            ? h('div', { className: 'sc-hint' }, t('form.noVariables'))
            : names.map((name) =>
                h(
                  'div',
                  { className: 'sc-var-row', key: name },
                  h('code', { className: 'sc-var' }, '${' + name + '}'),
                  h('input', {
                    value: meta[name]?.label ?? '',
                    placeholder: t('form.label'),
                    onChange: (event) =>
                      setMeta({ ...meta, [name]: { ...(meta[name] ?? {}), label: event.target.value } }),
                  }),
                  h('input', {
                    value: meta[name]?.example ?? '',
                    placeholder: t('form.example'),
                    onChange: (event) =>
                      setMeta({ ...meta, [name]: { ...(meta[name] ?? {}), example: event.target.value } }),
                  }),
                ),
              ),
        ),
        error === '' ? null : h('div', { className: 'sc-error' }, error),
        h(
          'div',
          { className: 'sc-editor-actions' },
          h('button', { type: 'button', className: 'sc-btn sc-btn-primary', onClick: submit }, t('form.save')),
          h('button', { type: 'button', className: 'sc-btn', onClick: props.onCancel }, t('form.cancel')),
        ),
      )
    }

    function CardDetail(props) {
      const { t, card, onUse, onEdit, onDelete, onCopy, copied } = props
      return h(
        'div',
        { className: 'sc-detail' },
        h(
          'div',
          { className: 'sc-detail-head' },
          h('h2', { className: 'sc-detail-title' }, card.title),
          h(
            'div',
            { className: 'sc-detail-actions' },
            h('button', { type: 'button', className: 'sc-btn', onClick: onEdit }, t('card.edit')),
            h('button', { type: 'button', className: 'sc-btn sc-btn-danger', onClick: onDelete }, t('card.delete')),
          ),
        ),
        h(
          'div',
          { className: 'sc-meta' },
          card.category === '' ? null : h('span', { className: 'sc-chip' }, card.category),
          card.skill === '' ? null : h('span', { className: 'sc-chip' }, t('card.skill', { name: card.skill })),
          card.uses > 0 ? h('span', { className: 'sc-chip sc-chip-quiet' }, t('card.uses', { count: card.uses })) : null,
        ),
        card.description === '' ? null : h('p', { className: 'sc-desc' }, card.description),
        h('div', { className: 'sc-preview-label' }, t('form.template')),
        h(TemplateText, { template: card.template }),
        h('div', { className: 'sc-hint' }, t('card.manageHint')),
        h(
          'div',
          { className: 'sc-detail-actions sc-detail-actions-bottom' },
          h('button', { type: 'button', className: 'sc-btn sc-btn-primary', onClick: onUse }, t('card.openPopover')),
          h('button', { type: 'button', className: 'sc-btn', onClick: onCopy }, copied ? t('card.copied') : t('card.copy')),
        ),
      )
    }
    function AiForm(props) {
      const { t, onClose, skills, skillsMeta, onRefreshSkills } = props
      const [text, setText] = React.useState('')
      const [skill, setSkill] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      const skillNames = (skills ?? []).map((item) => item.name)
      if (skill !== '' && !skillNames.includes(skill)) skillNames.unshift(skill)
      const meta = skillsMeta ?? { status: 'ready', scoped: true }
      const statusText =
        meta.status === 'loading'
          ? t('skill.loading')
          : skills.length === 0
            ? t('skill.none')
            : t(meta.scoped ? 'skill.count' : 'skill.countGlobal', { count: skills.length })

      const submit = async () => {
        if (text.trim() === '' || busy) return
        setBusy(true)
        setError('')
        try {
          await props.onGenerate({ text: text.trim(), skill })
          onClose()
        } catch (failure) {
          setError(t('ai.failed', { message: messageOf(failure) }))
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'sc-ai' },
        h('h2', { className: 'sc-detail-title' }, t('ai.title')),
        h('p', { className: 'sc-desc' }, t('ai.hint')),
        h('label', { className: 'sc-field' }, h('span', null, t('form.template')), h('textarea', {
          rows: 3,
          value: text,
          placeholder: t('ai.placeholder'),
          onChange: (event) => setText(event.target.value),
          'data-skillcard-field': 'ai-sample',
        })),
        h(
          'label',
          { className: 'sc-field' },
          h('span', null, t('ai.skill')),
          h(
            'select',
            { value: skill, onChange: (event) => setSkill(event.target.value) },
            h('option', { value: '' }, t('ai.none')),
            skillNames.map((name) => h('option', { key: name, value: name }, name)),
          ),
        ),
        h(
          'div',
          { className: 'sc-skill-meta' },
          h('span', { className: 'sc-hint' }, statusText),
          meta.status === 'loading'
            ? null
            : h(
                'button',
                { type: 'button', className: 'sc-btn sc-btn-quiet', onClick: onRefreshSkills },
                t('skill.refresh'),
              ),
          meta.status !== 'loading' && !meta.scoped && skills.length > 0
            ? h('div', { className: 'sc-hint' }, t('skill.globalOnly'))
            : null,
        ),
        error === '' ? null : h('div', { className: 'sc-error' }, error),
        h(
          'div',
          { className: 'sc-editor-actions' },
          h(
            'button',
            { type: 'button', className: 'sc-btn sc-btn-primary', disabled: busy || text.trim() === '', onClick: submit },
            busy ? t('ai.busy') : t('ai.submit'),
          ),
          h('button', { type: 'button', className: 'sc-btn', onClick: onClose }, t('form.cancel')),
        ),
      )
    }

    function SkillCardPage(props) {
      const store = props.store
      const t = props.t
      const snapshot = useSnapshot(store)
      const [mode, setMode] = React.useState('view')
      const [editing, setEditing] = React.useState(null)
      const [dirAll, setDirAll] = React.useState(true)
      const [copied, setCopied] = React.useState('')
      const [skills, setSkills] = React.useState([])
      const [skillsMeta, setSkillsMeta] = React.useState({ status: 'idle', scoped: false })
      const [busy, setBusy] = React.useState(false)
      const [filter, setFilter] = React.useState('')

      React.useEffect(() => {
        store.refresh()
      }, [store])

      // The directory's initial fold state comes from the row config, applied
      // once when the first bridge response lands.
      const appliedDefault = React.useRef(false)
      React.useEffect(() => {
        if (appliedDefault.current || snapshot.status !== 'ready') return
        appliedDefault.current = true
        const expanded = snapshot.config.defaultExpanded !== false
        setDirAll(expanded)
      }, [snapshot.status, snapshot.config.defaultExpanded])

      const sessions = props.useSessions !== undefined ? props.useSessions((state) => state) : undefined

      const cards = snapshot.cards
      const selected = cards.find((card) => card.id === snapshot.selectedId) ?? null
      const needle = filter.trim().toLowerCase()
      const visible =
        needle === ''
          ? cards
          : cards.filter((card) =>
              [card.title, card.template, card.category, card.description, card.skill]
                .join(' ')
                .toLowerCase()
                .includes(needle),
            )

      /** The most recently touched session: its composition is the skill catalog the user sees. */
      const recentSessionId = () => {
        if (sessions === undefined || sessions === null) return undefined
        const rows = (sessions.ids ?? [])
          .map((id) => sessions.byId?.[id])
          .filter((row) => row !== undefined && row !== null)
        if (rows.length === 0) return undefined
        rows.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
        return rows[0].sessionId
      }

      /**
       * Skill catalog: the most recently touched session is the best stand-in for
       * "the catalog the user sees" from a root-scoped panel.
       */
      const skillsLoadedFor = React.useRef(null)
      const loadSkills = (sessionId) => {
        const scoped = typeof sessionId === 'string' && sessionId !== ''
        setSkillsMeta({ status: 'loading', scoped })
        return store
          .skills(sessionId)
          .then((result) => {
            setSkills(result.skills)
            setSkillsMeta({ status: 'ready', scoped: result.scoped })
          })
          .catch(() => {
            setSkills([])
            setSkillsMeta({ status: 'error', scoped: false })
          })
      }
      const sessionIdForSkills = recentSessionId() ?? ''
      React.useEffect(() => {
        if (skillsLoadedFor.current === sessionIdForSkills) return
        skillsLoadedFor.current = sessionIdForSkills
        void loadSkills(sessionIdForSkills)
      }, [sessionIdForSkills])
      const refreshSkills = () => {
        void loadSkills(recentSessionId() ?? '')
      }
      const ensureSkills = () => {
        if (skillsMeta.status === 'idle' || skillsMeta.status === 'error') refreshSkills()
      }

      // This panel manages cards. Running happens in the sidebar popover.
      const openInPopover = () => {
        if (selected === null) return
        store.requestPopover(selected.id)
      }

      const copyPrompt = async () => {
        if (selected === null) return
        try {
          await navigator.clipboard.writeText(selected.template)
          setCopied(selected.id)
          window.setTimeout(() => setCopied(''), 1600)
        } catch {
          store.notify(t('error.bridge', { message: 'clipboard' }))
        }
      }

      const generate = async (request) => {
        const prompt = [
          '请把下面这句话做成一张技能卡片（skill card）。',
          '',
          '原句：' + request.text,
          request.skill === '' ? '' : '关联技能：' + request.skill,
          '',
          '要求：',
          '1. 只把每次都会变化的部分（地点、日期、对象、数量等）替换成 ${变量}，其余措辞逐字保留，让提示词稳定可复用。',
          '2. 给卡片一个不超过 20 字的标题，以及一句话说明。',
          '3. 每个变量给一个简短的中文显示名，必要时给示例值。',
          '4. 用 skillcard 工具的 create 动作保存，然后一句话告诉用户卡片名。',
        ]
          .filter((line) => line !== '')
          .join('\n')
        // `startSession` opens the new Session with this instruction already in the
        // composer: one Enter sends it, and the agent saves the card through the tool.
        props.uiWorkspace.startSession(undefined, { prompt, whenDraftExists: 'append' })
      }

      const save = async (input) => {
        setBusy(true)
        try {
          await store.saveCard(input)
          setEditing(null)
          setMode('view')
        } catch (error) {
          store.notify(messageOf(error))
        } finally {
          setBusy(false)
        }
      }

      const remove = async () => {
        if (selected === null) return
        setBusy(true)
        try {
          await store.removeCard(selected.id)
          setMode('view')
        } catch (error) {
          store.notify(messageOf(error))
        } finally {
          setBusy(false)
        }
      }

      const groups = []
      const byCategory = new Map()
      for (const card of visible) {
        const key = card.category === '' ? '' : card.category
        if (!byCategory.has(key)) byCategory.set(key, [])
        byCategory.get(key).push(card)
      }
      groups.push({
        key: 'all',
        label: t('dir.all'),
        open: dirAll,
        toggle: () => setDirAll(!dirAll),
        cards: null,
      })

      const cardRow = (card) =>
        h(
          'button',
          {
            type: 'button',
            key: card.id,
            className: 'sc-row' + (card.id === snapshot.selectedId ? ' sc-row-active' : ''),
            onClick: () => {
              store.select(card.id)
              setMode('view')
            },
            title: card.template,
          },
          h('span', { className: 'sc-row-dot', 'aria-hidden': 'true' }, '·'),
          h('span', { className: 'sc-row-label' }, card.title),
        )

      return h(
        'div',
        { className: 'sc-page' },
        h(
          'header',
          { className: 'sc-head' },
          h(
            'div',
            { className: 'sc-head-text' },
            h('h1', { className: 'sc-head-title' }, t('panel.title')),
            h('span', { className: 'sc-hint' }, t('panel.subtitle', { count: cards.length })),
          ),
          h(
            'div',
            { className: 'sc-head-actions' },
            h('button', { type: 'button', className: 'sc-btn', onClick: () => store.refresh() }, t('panel.refresh')),
            h(
              'button',
              {
                type: 'button',
                className: 'sc-btn',
                onClick: () => {
                  ensureSkills()
                  setEditing({ title: '', template: '', variables: [] })
                  setMode('create')
                },
              },
              t('panel.new'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'sc-btn sc-btn-primary',
                onClick: () => {
                  ensureSkills()
                  setMode(mode === 'ai' ? 'view' : 'ai')
                },
              },
              t('panel.ai'),
            ),
          ),
        ),
        snapshot.error === '' ? null : h('div', { className: 'sc-error sc-banner' }, t('error.bridge', { message: snapshot.error })),
        snapshot.notice === '' ? null : h('div', { className: 'sc-notice' }, snapshot.notice),
        h(
          'div',
          { className: 'sc-body' },
          h(
            'aside',
            { className: 'sc-dir' },
            h('div', { className: 'sc-dir-title' }, t('dir.title')),
            h('input', {
              className: 'sc-dir-search',
              type: 'search',
              value: filter,
              placeholder: t('panel.searchPlaceholder'),
              onChange: (event) => setFilter(event.target.value),
              'data-skillcard-filter': '',
            }),
            needle !== '' && visible.length === 0 ? h('div', { className: 'sc-hint sc-dir-empty' }, t('panel.searchEmpty')) : null,
            snapshot.status === 'loading' && cards.length === 0 ? h('div', { className: 'sc-hint' }, t('panel.loading')) : null,
            groups.map((group) =>
              h(
                'div',
                { key: group.key, className: 'sc-group' },
                h(
                  'button',
                  { type: 'button', className: 'sc-group-head', onClick: group.toggle, 'aria-expanded': group.open },
                  h(Chevron, { open: group.open }),
                  h('span', { className: 'sc-group-label' }, group.label),
                  h('span', { className: 'sc-group-count' }, String((group.cards ?? visible).length)),
                ),
                group.open
                  ? group.cards !== null
                    ? group.cards.map(cardRow)
                    : Array.from(byCategory.entries()).map(([category, rows]) =>
                        h(
                          'div',
                          { key: 'cat-' + category, className: 'sc-cat' },
                          h('div', { className: 'sc-cat-label' }, category === '' ? t('dir.uncategorized') : category),
                          rows.map(cardRow),
                        ),
                      )
                  : null,
              ),
            ),
          ),
          h(
            'section',
            { className: 'sc-main' },
            mode === 'ai'
              ? h(AiForm, {
                  t,
                  skills,
                  skillsMeta,
                  onRefreshSkills: refreshSkills,
                  onGenerate: generate,
                  onClose: () => setMode('view'),
                })
              : mode === 'create' || mode === 'edit'
                ? h(CardEditor, {
                    t,
                    initial: editing ?? {},
                    skills,
                    onSave: save,
                    onCancel: () => {
                      setMode('view')
                      setEditing(null)
                    },
                  })
                : selected === null
                  ? h(
                      'div',
                      { className: 'sc-empty' },
                      h('div', { className: 'sc-empty-title' }, cards.length === 0 ? t('panel.emptyTitle') : t('panel.emptySelect')),
                      cards.length === 0 ? h('div', { className: 'sc-hint' }, t('panel.emptyBody')) : null,
                    )
                  : h(CardDetail, {
                      t,
                      card: selected,
                      copied: copied === selected.id,
                      onUse: openInPopover,
                      onEdit: () => {
                        ensureSkills()
                        setEditing(selected)
                        setMode('edit')
                      },
                      onDelete: remove,
                      onCopy: copyPrompt,
                    }),
          ),
        ),
      )
    }

    /**
     * Card picker: a select-style trigger showing the current capability, with a
     * search field and a keyboard-navigable list underneath. This is the "which
     * capability do I run" control of the popover.
     */
    function CardPicker(props) {
      const { t, selected, matches, open, query, activeIndex } = props
      const list = matches.slice(0, 14)

      const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          props.setIdle(Math.min(activeIndex + 1, Math.max(list.length - 1, 0)))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          props.setIdle(Math.max(activeIndex - 1, 0))
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          const pick = list[activeIndex] ?? list[0]
          if (pick !== undefined) props.onPick(pick.id)
          return
        }
        if (event.key === 'Escape') {
          // Close the list only; the popover keeps its own Escape handling.
          event.stopPropagation()
          props.onToggle()
        }
      }

      return h(
        'div',
        { className: 'sc-picker' },
        h(
          'button',
          {
            type: 'button',
            className: 'sc-picker-trigger' + (open ? ' sc-picker-trigger-open' : ''),
            'aria-haspopup': 'listbox',
            'aria-expanded': open,
            onClick: props.onToggle,
            'data-skillcard-picker': '',
          },
          h('span', { className: 'sc-picker-caption' }, t('foot.pickCard')),
          h(
            'span',
            { className: 'sc-picker-value' },
            selected === null ? t('foot.none') : selected.title,
            selected !== null && selected.skill !== ''
              ? h('span', { className: 'sc-picker-skill' }, '/' + selected.skill)
              : null,
          ),
          h(Chevron, { open }),
        ),
        open
          ? h(
              'div',
              { className: 'sc-picker-panel' },
              h('input', {
                className: 'sc-picker-search',
                type: 'text',
                value: query,
                placeholder: t('foot.searchPlaceholder'),
                autoFocus: true,
                onChange: (event) => props.onQuery(event.target.value),
                onKeyDown,
                'data-skillcard-search': '',
              }),
              h(
                'div',
                { className: 'sc-picker-list', role: 'listbox' },
                list.length === 0
                  ? h('div', { className: 'sc-hint sc-picker-empty' }, t('panel.searchEmpty'))
                  : list.map((card, index) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          key: card.id,
                          role: 'option',
                          'aria-selected': card.id === (selected === null ? '' : selected.id),
                          className:
                            'sc-picker-row' +
                            (card.id === (selected === null ? '' : selected.id) ? ' sc-picker-row-active' : '') +
                            (index === activeIndex ? ' sc-picker-row-focus' : ''),
                          onClick: () => props.onPick(card.id),
                          onMouseEnter: () => props.setIdle(index),
                          title: card.template,
                          'data-skillcard-option': card.id,
                        },
                        h(
                          'span',
                          { className: 'sc-picker-row-main' },
                          card.title,
                        ),
                        h(
                          'span',
                          { className: 'sc-picker-row-meta' },
                          card.skill === '' ? t('foot.noSkill') : '/' + card.skill,
                          card.category === '' ? '' : ' · ' + card.category,
                        ),
                      ),
                    ),
              ),
            )
          : null,
      )
    }

    // -------------------------------------------------------- sidebar foot entry
    /**
     * The "use" surface: one button beside Settings and the remote target switch
     * that opens a popover with card search, the fill-in form, the run controls and
     * the execution history. Management (create/edit/delete/pin) stays in the
     * library panel; this popover never edits cards.
     */
    function SkillCardFooter(props) {
      const store = props.store
      const t = props.t
      const snapshot = useSnapshot(store)
      const [open, setOpen] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [pickerOpen, setPickerOpen] = React.useState(false)
      const [activeIndex, setActiveIndex] = React.useState(0)
      const [checked, setChecked] = React.useState([])
      const [expanded, setExpanded] = React.useState('')
      const runner = useCardRunner({
        remote: props.remote,
        uiWorkspace: props.uiWorkspace,
        useWorkspaces: props.useWorkspaces,
        useSessions: props.useSessions,
        // Recorded from the runner itself, so a run that settles after the popover
        // closes still lands in the history.
        // A run row exists from its first moment: written as 'running' on start and
        // rewritten in place when it settles.
        onWarning: (message) => store.notify(message),
        onStart: (started) => {
          void store.recordRun({
            id: started.id,
            cardId: started.meta.cardId,
            cardTitle: started.meta.cardTitle,
            skill: started.meta.skill,
            prompt: started.meta.prompt,
            answer: '',
            status: 'running',
            error: '',
            sessionId: '',
            startedAt: started.meta.startedAt,
            finishedAt: started.meta.startedAt,
          })
        },
        onFinish: (result) => {
          void store
            .recordRun({
              id: result.id,
              cardId: result.meta.cardId,
              cardTitle: result.meta.cardTitle,
              skill: result.meta.skill,
              prompt: result.meta.prompt,
              answer: result.answer,
              status: result.phase,
              error: result.failure,
              sessionId: result.sessionId,
              startedAt: result.meta.startedAt,
            })
            .then((saved) => {
              if (saved === true) return
              store.notify(t('hist.recordFailed'))
            })
        },
      })
      const wide = props.wide !== false

      React.useEffect(() => {
        store.refresh()
      }, [store])

      // The library panel hands a card over here ("在浮层里执行"). Guarded by the
      // request sequence so a re-render cannot re-run the open/close side effects.
      const handledRequest = React.useRef(0)
      React.useEffect(() => {
        const request = snapshot.popoverRequest
        if (request === null || request === undefined) return
        if (handledRequest.current === request.seq) return
        handledRequest.current = request.seq
        setOpen(true)
        setQuery('')
        setPickerOpen(false)
      }, [snapshot.popoverRequest])

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [open])

      // History belongs to the selected card: 执行记录 is per capability.
      React.useEffect(() => {
        if (!open) return
        void store.refreshRuns(snapshot.selectedId ?? '')
        setChecked([])
        setExpanded('')
      }, [open, snapshot.selectedId, store])


      if (snapshot.config.showSidebarEntry === false) return null

      const cards = snapshot.cards
      const needle = query.trim().toLowerCase()
      // Typing filters across title/template/category/skill.
      const matches =
        needle === ''
          ? cards
          : cards.filter((card) =>
              [card.title, card.template, card.category, card.description, card.skill]
                .join(' ')
                .toLowerCase()
                .includes(needle),
            )
      const selected = cards.find((card) => card.id === snapshot.selectedId) ?? null
      const values = selected === null ? {} : store.draftOf(selected.id)
      const names = selected === null ? [] : variableNames(selected.template)
      const missing = selected === null ? [] : missingNames(selected.template, values)
      const running = runner.phase === 'running'

      const button = h(
        'button',
        {
          type: 'button',
          className: 'sc-foot-btn' + (open ? ' sc-foot-btn-open' : ''),
          title: t('foot.open'),
          'aria-label': t('foot.open'),
          'aria-haspopup': 'dialog',
          'aria-expanded': open,
          onClick: () => {
            store.refresh()
            setOpen(!open)
          },
          'data-skillcard-foot': '',
        },
        h('span', { className: 'sc-foot-glyph', 'aria-hidden': 'true' }, '⚡'),
        wide
          ? h(
              'span',
              { className: 'sc-foot-label' },
              t('foot.label'),
              cards.length > 0 ? h('span', { className: 'sc-foot-count' }, String(cards.length)) : null,
            )
          : null,
      )

      if (!open) return button

      const run = () => {
        if (selected === null || missing.length > 0 || running) return
        const text = renderTemplate(selected.template, values).trim()
        if (text === '') return
        store.markUsed(selected.id)
        void runner.run(selected, text)
      }

      const deleteChecked = () => {
        if (checked.length === 0) return
        void store.deleteRuns(checked).then(() => setChecked([]))
      }

      const toggleChecked = (id) => {
        setChecked(checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id])
      }

      const panel = h(
        'div',
        {
          className: 'sc-pop-backdrop',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) setOpen(false)
          },
        },
        h(
          'section',
          { className: 'sc-pop', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('foot.label') },
          h(
            'div',
            { className: 'sc-pop-head' },
            h('strong', null, '⚡ ' + t('foot.label')),
            h(
              'button',
              { type: 'button', className: 'sc-pop-close', 'aria-label': t('dock.collapse'), onClick: () => setOpen(false) },
              '×',
            ),
          ),
          snapshot.notice === '' ? null : h('div', { className: 'sc-notice' }, snapshot.notice),
          cards.length === 0
            ? h('p', { className: 'sc-hint' }, t('panel.emptyBody'))
            : h(CardPicker, {
                t,
                cards,
                selected,
                matches,
                open: pickerOpen,
                query,
                activeIndex,
                onToggle: () => {
                  setPickerOpen(!pickerOpen)
                  setQuery('')
                  setActiveIndex(0)
                },
                onQuery: (value) => {
                  setQuery(value)
                  setActiveIndex(0)
                },
                onPick: (id) => {
                  store.select(id)
                  setPickerOpen(false)
                  setQuery('')
                },
                setIdle: () => setActiveIndex(0),
              }),
          selected === null
            ? cards.length === 0
              ? null
              : h('p', { className: 'sc-hint' }, t('dock.pick'))
            : h(
                'div',
                { className: 'sc-pop-form' },
                names.map((name) =>
                  h(
                    'label',
                    { className: 'sc-field sc-field-inline', key: name },
                    h('span', null, name),
                    h('input', {
                      value: values[name] ?? '',
                      placeholder: selected.variables.find((variable) => variable.name === name)?.example ?? '',
                      onChange: (event) => store.setValue(selected.id, name, event.target.value),
                      'data-skillcard-input': name,
                    }),
                  ),
                ),
                h('pre', { className: 'sc-pop-preview' }, renderTemplate(selected.template, values)),
                h(RunnerTarget, { t, runner }),
                h(
                  'div',
                  { className: 'sc-pop-actions' },
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'sc-btn sc-btn-primary',
                      disabled: missing.length > 0 || running,
                      title: missing.length > 0 ? t('card.missing', { names: missing.join('、') }) : undefined,
                      onClick: run,
                      'data-skillcard-run': '',
                    },
                    running ? t('run.running', { seconds: runner.elapsed }) : t('dock.run'),
                  ),
                ),
                h(RunResult, {
                  t,
                  runner,
                  onOpenSession: (id) => {
                    props.uiWorkspace.openSession(id)
                    setOpen(false)
                  },
                }),
              ),
          h(
            'div',
            { className: 'sc-hist' },
            h(
              'div',
              { className: 'sc-hist-head' },
              h(
                'span',
                { className: 'sc-hist-title' },
                selected === null
                  ? t('hist.title', { count: snapshot.runs.length })
                  : t('hist.titleFor', { card: selected.title, count: snapshot.runs.length }),
              ),
              checked.length === 0
                ? null
                : h(
                    'button',
                    { type: 'button', className: 'sc-btn sc-btn-danger', onClick: deleteChecked },
                    t('hist.deleteSelected', { count: checked.length }),
                  ),
            ),
            snapshot.runsStatus === 'loading' && snapshot.runs.length === 0
              ? h('div', { className: 'sc-hint' }, t('hist.loading'))
              : snapshot.runs.length === 0
                ? h(
                    'div',
                    { className: 'sc-hint' },
                    selected === null ? t('hist.empty') : t('hist.emptyFor', { card: selected.title }),
                  )
                : snapshot.runs.map((entry) =>
                    h(
                      'div',
                      {
                        key: entry.id,
                        className: 'sc-hist-row' + (expanded === entry.id ? ' sc-hist-row-open' : ''),
                        // The whole row toggles, so tapping the expanded body collapses it again.
                        onClick: () => setExpanded((current) => (current === entry.id ? '' : entry.id)),
                        role: 'button',
                        tabIndex: 0,
                        'aria-expanded': expanded === entry.id,
                        onKeyDown: (event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setExpanded((current) => (current === entry.id ? '' : entry.id))
                        },
                      },
                      h('input', {
                        type: 'checkbox',
                        checked: checked.includes(entry.id),
                        onChange: () => toggleChecked(entry.id),
                        onClick: (event) => event.stopPropagation(),
                        'aria-label': t('hist.delete'),
                      }),
                      h(
                        'div',
                        { className: 'sc-hist-main' },
                        h(
                          'span',
                          { className: 'sc-hist-meta' },
                          expanded === entry.id ? '▾ ' : '▸ ',
                          timeLabel(entry.finishedAt),
                          ' · ',
                          t('hist.status.' + (entry.status ?? 'done')),
                          selected === null && entry.cardTitle !== '' ? ' · ' + entry.cardTitle : '',
                        ),
                        h(
                          'span',
                          { className: 'sc-hist-text' },
                          (entry.answer === '' ? entry.error : entry.answer) || entry.prompt,
                        ),
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'sc-hist-del',
                          'aria-label': t('hist.delete'),
                          onClick: (event) => {
                            event.stopPropagation()
                            void store.deleteRuns([entry.id])
                          },
                        },
                        '×',
                      ),
                      expanded === entry.id
                        ? h(
                            'div',
                            { className: 'sc-hist-detail' },
                            h('div', { className: 'sc-hist-label' }, t('hist.prompt')),
                            h('pre', { className: 'sc-hist-pre' }, entry.prompt),
                            h('div', { className: 'sc-hist-label' }, t('hist.answer')),
                            h('pre', { className: 'sc-hist-pre' }, entry.answer === '' ? entry.error : entry.answer),
                          )
                        : null,
                    ),
                  ),
          ),
        ),
      )

      return h(React.Fragment, null, button, renderBodyPortal(panel))
    }

    /** Compact local time for one history row. */
    function timeLabel(value) {
      if (!Number.isFinite(value)) return ''
      try {
        return new Date(value).toLocaleString(undefined, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      } catch {
        return ''
      }
    }
    // ------------------------------------------------------------------- CSS
    const PAGE_CSS = `
.sc-page{display:flex;flex-direction:column;height:100%;min-height:0;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5;background:var(--dsw-alias-bg-base)}
.sc-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.sc-head-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.sc-head-title{margin:0;font-size:15px;font-weight:600}
.sc-head-actions{display:flex;gap:8px;flex-wrap:wrap}
.sc-body{display:flex;flex:1 1 auto;min-height:0}
.sc-dir{width:236px;flex:0 0 236px;border-right:1px solid var(--dsw-alias-border-l1);overflow:auto;padding:10px 8px 24px}
.sc-dir-title{padding:4px 8px 8px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.sc-group{margin-bottom:4px}
.sc-group-head{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;text-align:left}
.sc-group-head:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.sc-group-label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-group-count{font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-cat{margin:2px 0 6px}
.sc-cat-label{padding:2px 12px;font-size:11px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-row{display:flex;align-items:center;gap:6px;width:100%;padding:5px 8px 5px 18px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
.sc-row:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-row-active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary)}
.sc-row-dot{width:10px;flex:0 0 10px;color:var(--dsw-alias-state-idle-primary);font-size:11px;text-align:center}
.sc-row-active .sc-row-dot{color:var(--dsw-alias-brand-primary)}
.sc-row-label{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-main{flex:1 1 auto;min-width:0;overflow:auto;padding:18px 22px 40px}
.sc-detail{display:flex;flex-direction:column;gap:10px;max-width:820px}
.sc-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.sc-detail-title{margin:0;font-size:17px;font-weight:600}
.sc-detail-actions{display:flex;gap:6px;flex-wrap:wrap}
.sc-detail-actions-bottom{margin-top:6px}
.sc-meta{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.sc-chip{display:inline-flex;align-items:center;padding:1px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1)}
.sc-chip-quiet{background:transparent}
.sc-desc{margin:0;color:var(--dsw-alias-label-secondary)}
.sc-template,.sc-preview{margin:0;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word;overflow:auto;max-height:220px}
.sc-preview{max-height:160px;color:var(--dsw-alias-label-secondary)}
.sc-preview-label{font-size:11px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.sc-var{color:var(--dsw-alias-brand-primary);font-family:inherit;font-weight:600}
.sc-form{display:flex;flex-direction:column;gap:8px}
.sc-field{display:flex;flex-direction:column;gap:4px;min-width:0}
.sc-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}
.sc-field input,.sc-field textarea,.sc-field select{width:100%;box-sizing:border-box;padding:6px 9px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;resize:vertical}
.sc-field input:focus,.sc-field textarea:focus,.sc-field select:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.sc-field-row{display:flex;gap:10px}
.sc-field-row .sc-field{flex:1 1 0}
.sc-field-inline{flex-direction:row;align-items:center;gap:6px}
.sc-field-inline>span{flex:0 0 auto;min-width:52px}
.sc-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.sc-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;white-space:nowrap}
.sc-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-btn:disabled{opacity:.45;cursor:not-allowed}
.sc-btn-primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sc-btn-danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.sc-error{padding:7px 10px;border-radius:6px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);font-size:12.5px}
.sc-banner{margin:10px 18px 0}
.sc-notice{position:sticky;top:0;z-index:2;margin:8px 18px 0;padding:6px 10px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}
.sc-empty{display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding:30px 6px;color:var(--dsw-alias-label-secondary)}
.sc-empty-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sc-editor,.sc-ai{display:flex;flex-direction:column;gap:10px;max-width:760px}
.sc-editor-actions{display:flex;gap:8px;margin-top:4px}
.sc-vars{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:8px;border:1px dashed var(--dsw-alias-border-l1)}
.sc-vars-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.sc-var-row{display:flex;align-items:center;gap:8px}
.sc-var-row .sc-var{flex:0 0 auto;min-width:76px}
.sc-var-row input{flex:1 1 0;min-width:0;padding:4px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.sc-crash{padding:10px;color:var(--dsw-alias-state-error-primary);font-size:12px}
`

    const FOOT_CSS = `
.sc-foot-btn{min-height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;cursor:pointer;max-width:100%}
.sc-foot-btn:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-foot-btn-open{background:var(--dsw-alias-bg-layer-2)}
.sc-foot-glyph{font-size:15px;line-height:1}
.sc-foot-label{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-foot-count{padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.sc-pop-backdrop{position:fixed;inset:0;z-index:60;background:transparent}
.sc-pop{position:fixed;left:14px;bottom:64px;z-index:61;width:min(560px,calc(100vw - 28px));max-height:min(80vh,760px);overflow:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:16px 18px 18px;border-radius:14px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 16px 40px rgba(0,0,0,.32);font-size:13px;line-height:1.55;overscroll-behavior:contain}
.sc-pop-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sc-pop-close{width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer}
.sc-pop-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.sc-picker{display:flex;flex-direction:column}
.sc-picker-trigger{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:7px 11px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer;text-align:left}
.sc-picker-trigger:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-picker-trigger-open{border-color:var(--dsw-alias-brand-primary)}
.sc-picker-caption{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-picker-value{flex:1 1 auto;display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.sc-picker-skill{font-weight:400;font-size:11px;color:var(--dsw-alias-brand-primary)}
.sc-picker-panel{margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);display:flex;flex-direction:column;gap:6px}
.sc-picker-search{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.sc-picker-search:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.sc-picker-list{display:flex;flex-direction:column;gap:2px;max-height:min(44vh,340px);overflow:auto}
.sc-picker-row{display:flex;align-items:baseline;justify-content:space-between;gap:10px;width:100%;padding:7px 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;text-align:left;cursor:pointer}
.sc-picker-row:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-picker-row-active{color:var(--dsw-alias-brand-primary)}
.sc-picker-row-focus{background:var(--dsw-alias-bg-layer-2)}
.sc-picker-row-main{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sc-picker-row-meta{flex:0 0 auto;font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-picker-empty{padding:4px 8px}
.sc-pop-form{display:flex;flex-direction:column;gap:10px}
.sc-pop .sc-field input,.sc-pop .sc-field textarea,.sc-pop .sc-field select{background:var(--dsw-alias-bg-base)}
.sc-pop-form .sc-field-inline{display:flex;flex-direction:row;align-items:center;gap:6px}
.sc-pop-form .sc-field-inline>span{flex:0 0 auto;min-width:52px}
.sc-pop-preview{margin:0;padding:8px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;white-space:pre-wrap;word-break:break-word;max-height:120px;overflow:auto}
.sc-pop-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sc-pop .sc-notice{margin:0;padding:5px 9px}
.sc-run-block{display:flex;flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;border-top:1px solid var(--dsw-alias-border-l1);max-width:820px}
.sc-run-target{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.sc-run-field{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 calc(50% - 8px)}
.sc-run-field>span{font-size:11px;color:var(--dsw-alias-label-secondary)}
.sc-run-field select{width:100%;box-sizing:border-box;padding:4px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.sc-run-result{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}
.sc-run-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sc-run-head-actions{display:flex;gap:6px}
.sc-run-state{font-size:12px;color:var(--dsw-alias-label-secondary)}
.sc-run-state-error{color:var(--dsw-alias-state-error-primary)}
.sc-run-answer{margin:0;padding:0;max-height:min(38vh,340px);overflow:auto;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:var(--dsw-alias-label-primary)}
.sc-dir-search{width:100%;box-sizing:border-box;margin:0 0 8px;padding:4px 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.sc-dir-search:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.sc-dir-empty{padding:2px 8px 6px}
.sc-hist{display:flex;flex-direction:column;gap:6px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1)}
.sc-hist-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.sc-hist-title{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.sc-hist-row{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:6px;padding:4px 2px;border-radius:6px}
.sc-hist-row:hover{background:var(--dsw-alias-bg-layer-2)}
.sc-hist-row input[type=checkbox]{margin:2px 0 0}
.sc-hist-main{display:flex;flex-direction:column;gap:1px;min-width:0;padding:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.sc-hist-meta{font-size:10.5px;color:var(--dsw-alias-label-secondary)}
.sc-hist-text{font-size:12.5px;color:var(--dsw-alias-label-primary);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word}
.sc-hist-row-open .sc-hist-text{-webkit-line-clamp:unset;display:block}
.sc-hist-del{width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:14px;line-height:1;cursor:pointer}
.sc-hist-del:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary)}
.sc-hist-detail{grid-column:1 / -1;display:flex;flex-direction:column;gap:3px;padding:4px 0 6px}
.sc-hist-label{font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--dsw-alias-label-secondary)}
.sc-hist-pre{margin:0;padding:8px 10px;max-height:220px;overflow:auto;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary)}
`

    const STYLE_ID = 'dsh-skillcard'

    /** Insert the one stylesheet this package owns; removed with the Client run. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const selector = 'style[data-dsh-skillcard="' + STYLE_ID + '"]'
      const existing = document.querySelector(selector)
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.setAttribute('data-dsh-skillcard', STYLE_ID)
      tag.textContent = PAGE_CSS + FOOT_CSS
      document.head.append(tag)
      return () => {
        tag.remove()
      }
    }

    // ------------------------------------------------------------------ apply
    return {
      // Remote namespaces are separate inject keys: the `remote` service guard
      // refuses `remote.<namespace>` reads this fiber did not declare.
      inject: [
        'slots',
        'locale',
        'remote',
        'remote.session',
        'remote.agentPresets',
        'remote.skills',
        'uiWorkspace',
      ],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-skillcard: locale')
        ctx.effect(() => installStyles(), 'dsh-skillcard: styles')
        const t = ctx.locale.bind(NS)
        const store = createStore(ctx.remote)

        const pageInjected = {
          store,
          t,
          remote: ctx.remote,
          uiWorkspace: ctx.uiWorkspace,
        }
        const footInjected = { store, t, remote: ctx.remote, uiWorkspace: ctx.uiWorkspace }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 20,
              locale: NS,
              label: () => t('panel.title'),
            },
            PanelIcon,
          ),
        )

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => pageInjected,
            },
            function SkillCardPanel(props) {
              return h(ErrorBoundary, { label: 'dsh-skillcard' }, h(SkillCardPage, props))
            },
          ),
        )

        // Quick entry beside Settings and the remote target switch.
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.footer.action',
              id: 'skillcard-foot',
              order: -10,
              locale: NS,
              label: () => t('foot.label'),
              inject: () => footInjected,
            },
            function SkillCardFootEntry(props) {
              return h(ErrorBoundary, { label: 'dsh-skillcard' }, h(SkillCardFooter, props))
            },
          ),
        )

        void store.refresh()
      },
    }
  },
})
