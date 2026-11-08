/**
 * dsh-skillcard — host half.
 *
 * Owns the SkillCard library: parameterized prompt templates ("cards") the
 * Web UI fills in and sends to a conversation. The library is a JSON document
 * under `<DSH_HOME>/skillcard/cards.json`; this file is the only writer.
 *
 * Two callers share one implementation:
 *  - the client half reaches the operations over the Host web bridge
 *    (`/api/dsh-skillcard/*`), and
 *  - the agent reaches them through the `skillcard` tool.
 *
 * A card is `{ id, title, template, variables, description, category, skill,
 * uses, createdAt, updatedAt }`. `variables` is derived from the
 * template on every write, so the two can never disagree.
 */
import { promises as fsp } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import {
  canonicalTemplate,
  cleanText,
  templateVariables,
  type Card,
  type CardVariable,
  type PluginConfig,
  type RunRecord,
  type RunStatus,
} from './shared'

/** Web bridge prefix; the client half posts JSON here. */
const API_BASE = '/api/dsh-skillcard'
const STORE_VERSION = 1
const MAX_BODY_BYTES = 512 * 1024
const MAX_CARDS = 500
const MAX_TITLE = 120
const MAX_TEMPLATE = 8000
const MAX_DESCRIPTION = 2000
const MAX_SHORT = 40
const MAX_SKILL = 80



function dshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

function storePath(name: string): string {
  return join(dshHome(), 'skillcard', name)
}

function storeFile() {
  return storePath('cards.json')
}

function newId() {
  const stamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 8)
  return 'sc_' + stamp + random
}

/** One card, normalized; throws a user-facing message when required fields are missing. */
function normalizeCard(input: unknown, previous?: Card): Card {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const title = cleanText(source.title, MAX_TITLE)
  const template = canonicalTemplate(cleanText(source.template, MAX_TEMPLATE))
  if (title === '') throw new Error('card title is required')
  if (template === '') throw new Error('card template is required')

  const provided = new Map()
  if (Array.isArray(source.variables)) {
    for (const entry of source.variables) {
      if (entry === null || typeof entry !== 'object') continue
      const name = cleanText(entry.name, MAX_SHORT)
      if (name !== '') provided.set(name, entry)
    }
  }
  const carried = new Map()
  if (previous !== undefined && Array.isArray(previous.variables)) {
    for (const entry of previous.variables) {
      if (entry !== null && typeof entry === 'object' && typeof entry.name === 'string') carried.set(entry.name, entry)
    }
  }

  const variables = templateVariables(template).map((name) => {
    const meta = provided.get(name) ?? carried.get(name) ?? {}
    const label = cleanText(meta.label, MAX_SHORT)
    return {
      name,
      label: label === '' ? name : label,
      example: cleanText(meta.example, 200),
    }
  })

  const now = Date.now()
  return {
    id: previous !== undefined && previous.id !== undefined ? previous.id : newId(),
    title,
    description: cleanText(source.description, MAX_DESCRIPTION),
    template,
    variables,
    category: cleanText(source.category, MAX_SHORT),
    skill: cleanText(source.skill, MAX_SKILL),
    uses: previous !== undefined && Number.isFinite(previous.uses) ? previous.uses : 0,
    createdAt: previous !== undefined && Number.isFinite(previous.createdAt) ? previous.createdAt : now,
    updatedAt: now,
  }
}

function readConfig(config: unknown): PluginConfig {
  const source = (config !== null && typeof config === 'object' ? config : {}) as Record<string, unknown>
  return {
    defaultExpanded: source.defaultExpanded !== false,
    showSidebarEntry: source.showSidebarEntry !== false,
  }
}

/**
 * The card library. Every operation returns plain data or throws an Error whose
 * message is safe to show to the user.
 * @param deps - host services the library reads.
 */
function createLibrary(deps: { skills?: () => Promise<SkillSummaryLike[]>; onCardRemoved?: (cardId: string) => Promise<number> } = {}) {
  const resolveSkills = typeof deps?.skills === 'function' ? deps.skills : async () => []
  let queue = Promise.resolve()

  /** Serialize every mutation and read-after-write through one chain. */
  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task)
    queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  /**
   * Always read the file. The document is small, and a cached copy would let a
   * second plugin instance (a restart leaves two briefly) write back a list it
   * read before the other one saved.
   */
  async function load(): Promise<{ cards: Card[] }> {
    const file = storeFile()
    let raw
    try {
      raw = await fsp.readFile(file, 'utf8')
    } catch (error) {
      if ((error as { code?: string } | undefined)?.code === 'ENOENT') return { cards: [] }
      throw new Error(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Keep the unreadable file instead of silently overwriting user data.
      const backup = `${file}.corrupt-${Date.now()}`
      await fsp.rename(file, backup).catch(() => undefined)
      throw new Error(`cards.json was not valid JSON; it was moved to ${backup}`)
    }
    const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : []
    const cards = []
    for (const entry of rawCards) {
      try {
        cards.push(normalizeCard(entry, isCard(entry) ? entry : undefined))
      } catch {
        // Skip entries the current schema cannot admit instead of failing the read.
      }
    }
    return { cards }
  }

  async function save(cards: Card[]): Promise<Card[]> {
    const file = storeFile()
    await fsp.mkdir(dirname(file), { recursive: true })
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`
    const body = JSON.stringify({ version: STORE_VERSION, cards }, null, 2)
    await fsp.writeFile(temp, body, 'utf8')
    await fsp.rename(temp, file)
    return cards
  }

  function isCard(value: unknown): value is Card {
    if (value === null || typeof value !== 'object') return false
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' && id !== ''
  }
  return {
    async list() {
      const state = await load()
      return [...state.cards].sort(compareCards)
    },

    async get(id: string): Promise<Card | undefined> {
      const state = await load()
      return state.cards.find((card) => card.id === id)
    },

    upsert(input: unknown): Promise<Card> {
      const id = cleanText((input as { id?: unknown } | undefined)?.id, MAX_SHORT)
      return serialize(async () => {
        const state = await load()
        const index = id === '' ? -1 : state.cards.findIndex((card) => card.id === id)
        if (id !== '' && index === -1) throw new Error(`no skill card with id "${id}"`)
        const card = normalizeCard(input, index === -1 ? undefined : state.cards[index])
        const cards = [...state.cards]
        if (index === -1) {
          if (cards.length >= MAX_CARDS) throw new Error(`the library is limited to ${MAX_CARDS} cards`)
          cards.push(card)
        } else {
          cards[index] = card
        }
        await save(cards)
        return card
      })
    },

    remove(id: string): Promise<number> {
      return serialize(async () => {
        const state = await load()
        const key = cleanText(id, MAX_SHORT)
        const cards = state.cards.filter((card) => card.id !== key)
        if (cards.length === state.cards.length) throw new Error(`no skill card with id "${key}"`)
        await save(cards)
        if (typeof deps?.onCardRemoved === 'function') await deps.onCardRemoved(key)
        return cards.length
      })
    },

    markUsed(id: string): Promise<Card | undefined> {
      return serialize(async () => {
        const state = await load()
        const key = cleanText(id, MAX_SHORT)
        const index = state.cards.findIndex((card) => card.id === key)
        if (index === -1) return undefined
        const card = { ...state.cards[index], uses: (state.cards[index].uses ?? 0) + 1 }
        const cards = [...state.cards]
        cards[index] = card
        await save(cards)
        return card
      })
    },

    skills: resolveSkills,
  }
}

const RUNS_FILE = 'runs.json'
const MAX_RUNS = 300
const MAX_ANSWER = 20000
const RUN_STATUSES = new Set(['running', 'done', 'error', 'input', 'timeout', 'stopped', 'interrupted'])
/** A 'running' record older than this is reported as interrupted. */
const RUN_STALE_MS = 15 * 60 * 1000

/** One recorded execution of a card. */
function normalizeRun(input: unknown): RunRecord {
  const source = (input !== null && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const prompt = cleanText(source.prompt, MAX_TEMPLATE * 2)
  if (prompt === '') throw new Error('run prompt is required')
  const now = Date.now()
  return {
    id:
      cleanText(source.id, 64) ||
      'run_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
    cardId: cleanText(source.cardId, MAX_SHORT),
    cardTitle: cleanText(source.cardTitle, MAX_TITLE),
    skill: cleanText(source.skill, MAX_SKILL),
    prompt,
    answer: cleanText(source.answer, MAX_ANSWER),
    status: (RUN_STATUSES.has(String(source.status)) ? String(source.status) : 'done') as RunStatus,
    error: cleanText(source.error, 500),
    sessionId: cleanText(source.sessionId, 80),
    startedAt: Number.isFinite(source.startedAt) ? Number(source.startedAt) : now,
    finishedAt: Number.isFinite(source.finishedAt) ? Number(source.finishedAt) : now,
  }
}

/**
 * Execution history. One append-mostly JSON document next to the cards, so the
 * record survives a browser reset and is readable from another device.
 */
function createRunLog() {
  let queue = Promise.resolve()

  function serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = queue.then(task, task)
    queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  async function load(): Promise<{ runs: RunRecord[] }> {
    const file = storePath(RUNS_FILE)
    let raw
    try {
      raw = await fsp.readFile(file, 'utf8')
    } catch (error) {
      if ((error as { code?: string } | undefined)?.code === 'ENOENT') return { runs: [] }
      throw new Error(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      const backup = `${file}.corrupt-${Date.now()}`
      await fsp.rename(file, backup).catch(() => undefined)
      throw new Error(`runs.json was not valid JSON; it was moved to ${backup}`)
    }
    const runs = Array.isArray(parsed?.runs) ? parsed.runs : []
    const records = (runs as unknown[]).filter(
      (run): run is RunRecord => run !== null && typeof run === 'object' && typeof (run as { id?: unknown }).id === 'string',
    )
    return { runs: records }
  }

  async function save(runs: RunRecord[]): Promise<RunRecord[]> {
    const file = storePath(RUNS_FILE)
    await fsp.mkdir(dirname(file), { recursive: true })
    const temp = `${file}.tmp-${process.pid}-${Date.now()}`
    await fsp.writeFile(temp, JSON.stringify({ version: 1, runs }, null, 2), 'utf8')
    await fsp.rename(temp, file)
    return runs
  }

  return {
    async list(options: { cardId?: string } = {}): Promise<RunRecord[]> {
      const { runs } = await load()
      const cardId = typeof options.cardId === 'string' ? options.cardId : ''
      const filtered = cardId === '' ? runs : runs.filter((run) => run.cardId === cardId)
      const now = Date.now()
      return filtered
        .slice()
        .sort((left, right) => (right.finishedAt ?? 0) - (left.finishedAt ?? 0))
        .slice(0, 100)
        .map((run) =>
          run.status === 'running' && now - (run.startedAt ?? 0) > RUN_STALE_MS ? { ...run, status: 'interrupted' } : run,
        )
    },

    record(input: unknown): Promise<RunRecord> {
      return serialize(async () => {
        const run = normalizeRun(input)
        const { runs } = await load()
        const existing = runs.find((entry) => entry.id === run.id)
        // A run is written once when it starts ('running') and again when it settles,
        // so a second write with the same id replaces that row instead of duplicating.
        const next =
          existing === undefined
            ? [run, ...runs].slice(0, MAX_RUNS)
            : runs.map((entry) =>
                entry.id === run.id ? { ...run, startedAt: existing.startedAt ?? run.startedAt } : entry,
              )
        await save(next)
        return run
      })
    },

    remove(ids: unknown): Promise<number> {
      return serialize(async () => {
        const wanted = new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string'))
        if (wanted.size === 0) return 0
        const { runs } = await load()
        const kept = runs.filter((run) => !wanted.has(run.id))
        if (kept.length !== runs.length) await save(kept)
        return runs.length - kept.length
      })
    },

    removeByCard(cardId: string): Promise<number> {
      return serialize(async () => {
        const key = cleanText(cardId, MAX_SHORT)
        const { runs } = await load()
        const kept = runs.filter((run) => run.cardId !== key)
        if (kept.length === runs.length) return 0
        await save(kept)
        return runs.length - kept.length
      })
    },
  }
}

/** Most recently updated first. */
function compareCards(left: Card, right: Card): number {
  return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
}

function describeCards(cards: Card[]): string {
  if (cards.length === 0) return 'The skill card library is empty.'
  const lines = cards.map((card) => {
    const variables = card.variables.map((variable) => '${' + variable.name + '}').join(' ')
    const marks = [card.category === '' ? '' : `category=${card.category}`]
      .filter((part) => part !== '')
      .join(', ')
    return `- ${card.id} | ${card.title}${marks === '' ? '' : ` (${marks})`} | template: ${card.template}${
      variables === '' ? '' : ` | variables: ${variables}`
    }`
  })
  return `Skill cards (${cards.length}):\n${lines.join('\n')}`
}

function describeCard(card: Card): string {
  const variables = card.variables
    .map((variable) => `${variable.name}${variable.label === variable.name ? '' : ` (${variable.label})`}${
      variable.example === '' ? '' : ` e.g. ${variable.example}`
    }`)
    .join('; ')
  return [
    `id: ${card.id}`,
    `title: ${card.title}`,
    card.description === '' ? undefined : `description: ${card.description}`,
    `template: ${card.template}`,
    variables === '' ? 'variables: none' : `variables: ${variables}`,
    card.category === '' ? undefined : `category: ${card.category}`,
    card.skill === '' ? undefined : `skill: ${card.skill}`,
    `uses: ${card.uses}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
}

const TOOL_DESCRIPTION = [
  'Read and write the user\'s SkillCard library: parameterized prompt templates ("skill cards") that the user fills in and sends from the Web UI.',
  'A card is a prompt whose per-use values are `${placeholders}`, for example "使用天气技能帮我查看${地点}在${日期}的天气". The user fills 地点/日期 and sends the rendered prompt, so the wording stays stable.',
  'Actions: list (all cards), get (one card by id), create (new card), update (change a card by id), delete (remove a card by id).',
  'When the user asks to turn a sentence, or a task they repeat, into a skill card: keep the phrasing that should stay the same verbatim, replace only the parts that change each time with ${name} placeholders, give every placeholder a short label, pick a short title, and save it with create. Prefer one card per recurring task and do not invent extra cards.',
].join('\n')

function toolDefinition(library: ReturnType<typeof createLibrary>): ToolDefinition {
  return {
    name: 'skillcard',
    description: TOOL_DESCRIPTION,
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'get', 'create', 'update', 'delete'],
          description: 'Operation to perform.',
        },
        id: {
          type: 'string',
          description: 'Card id. Required for get, update and delete.',
        },
        title: {
          type: 'string',
          description: 'Short card title shown in the sidebar and under the composer.',
        },
        template: {
          type: 'string',
          description: 'The prompt template. Per-use values are written as ${name}.',
        },
        description: {
          type: 'string',
          description: 'One sentence about when to use this card.',
        },
        category: {
          type: 'string',
          description: 'Optional group name, for example 天气 or 写作.',
        },
        skill: {
          type: 'string',
          description: 'Optional skill name this card drives, for example weather.',
        },
        variables: {
          type: 'array',
          description: 'Optional labels and examples for the placeholders; names must match the template.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'Placeholder name without the ${ } wrapper.' },
              label: { type: 'string', description: 'Field label shown in the fill-in form.' },
              example: { type: 'string', description: 'Example value used as the input placeholder.' },
            },
          },
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['text'],
        properties: { text: { type: 'string' } },
      },
      render(_args: unknown, value: JsonValue) {
        const text = value !== null && typeof value === 'object' && !Array.isArray(value) ? String((value as { text?: unknown }).text ?? '') : ''
        return [{ type: 'text', text }]
      },
    },
    async execute(args: Record<string, unknown>) {
      const input = args !== null && typeof args === 'object' ? args : {}
      const action = typeof input.action === 'string' ? input.action : ''
      if (action === 'list') return { text: describeCards(await library.list()) }
      if (action === 'get') {
        const card = await library.get(cleanText(input.id, MAX_SHORT))
        if (card === undefined) throw new Error(`no skill card with id "${cleanText(input.id, MAX_SHORT)}"`)
        return { text: describeCard(card) }
      }
      if (action === 'create' || action === 'update') {
        const card = await library.upsert({
          id: action === 'update' ? input.id : undefined,
          title: input.title,
          template: input.template,
          description: input.description,
          category: input.category,
          skill: input.skill,
          variables: input.variables,
        })
        const verb = action === 'create' ? 'Created' : 'Updated'
        return { text: `${verb} skill card "${card.title}" (id ${card.id}).\n${describeCard(card)}` }
      }
      if (action === 'delete') {
        await library.remove(String(input.id ?? ''))
        return { text: `Deleted skill card ${cleanText(input.id, MAX_SHORT)}.` }
      }
      throw new Error(`unknown skillcard action "${action}": expected list, get, create, update or delete`)
    },
  }
}

function writeJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(payload)
}

async function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

/**
 * Same-origin gate for the bridge. The UI is same-origin, so a cross-site
 * caller (a confused deputy) is refused before any work happens.
 */
function sameOriginAllowed(req: import('node:http').IncomingMessage): boolean {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== host) return false
    } catch {
      return false
    }
  }
  return true
}

function buildRoutes(library: ReturnType<typeof createLibrary>, config: PluginConfig, runLog: ReturnType<typeof createRunLog>): WebRoute[] {
  /** Method check, origin gate, JSON envelope, and error reporting for one route row. */
  const route = (path: string, method: 'GET' | 'POST', handler: (req: import('node:http').IncomingMessage) => Promise<unknown>): WebRoute => ({
    kind: 'exact',
    path: `${API_BASE}${path}`,
    async handler(req, res) {
      if (!sameOriginAllowed(req)) {
        writeJson(res, 403, { ok: false, code: 'forbidden', message: 'request must come from the web app origin' })
        return
      }
      const allowed = method === 'GET' ? ['GET', 'HEAD'] : ['POST']
      if (!allowed.includes(req.method ?? '')) {
        writeJson(res, 405, { ok: false, code: 'method', message: `${method} only` })
        return
      }
      try {
        writeJson(res, 200, { ok: true, value: await handler(req) })
      } catch (error) {
        writeJson(res, 200, {
          ok: false,
          code: 'failed',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    },
  })

  return [
    route('/cards', 'GET', async () => ({ cards: await library.list(), config })),
    route('/save', 'POST', async (req) => {
      const body = await readJsonBody(req)
      if (body === undefined) throw new Error('request body must be JSON')
      const payload = body as Record<string, unknown>
      const card = await library.upsert(payload.card ?? payload)
      return { card, cards: await library.list() }
    }),
    route('/delete', 'POST', async (req) => {
      const body = await readJsonBody(req)
      if (body === undefined) throw new Error('request body must be JSON')
      await library.remove(String((body as Record<string, unknown>).id ?? ''))
      return { cards: await library.list() }
    }),
    route('/use', 'POST', async (req) => {
      const body = await readJsonBody(req)
      if (body === undefined) throw new Error('request body must be JSON')
      return { card: await library.markUsed(String((body as Record<string, unknown>).id ?? '')) }
    }),
    route('/skills', 'GET', async () => ({ skills: await library.skills() })),
    route('/runs', 'GET', async (req) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      const cardId = url.searchParams.get('cardId') ?? ''
      return { runs: await runLog.list(cardId === '' ? {} : { cardId }) }
    }),
    route('/runs/record', 'POST', async (req) => {
      const body = await readJsonBody(req)
      if (body === undefined) throw new Error('request body must be JSON')
      const payload = body as Record<string, unknown>
      return { run: await runLog.record(payload.run ?? payload) }
    }),
    route('/runs/delete', 'POST', async (req) => {
      const body = await readJsonBody(req)
      if (body === undefined) throw new Error('request body must be JSON')
      const payload = body as Record<string, unknown>
      const ids = Array.isArray(payload.ids) ? payload.ids : [payload.id]
      return { deleted: await runLog.remove(ids) }
    }),
  ]
}

/**
 * Host half: bind the library to the web bridge and the agent tool.
 * @param ctx - Host context.
 * @param config - this row's config from the profile patch.
 */
export function apply(ctx: HostContext, config: unknown): void {
  const resolved = readConfig(config)
  const runLog = createRunLog()
  const library = createLibrary({
    onCardRemoved: (cardId) => runLog.removeByCard(cardId),
    skills: async () => {
      const skills = ctx.get<SkillsService>('skills')
      if (skills === undefined || typeof skills.list !== 'function') return []
      const workingDirectory = ctx.get<WorkingDirectoryService>('workingDirectory')
      const cwd = typeof workingDirectory?.defaultDirectory === 'string' ? workingDirectory.defaultDirectory : undefined
      const lookup = cwd === undefined ? {} : { cwd }
      // A live Agent's layer chain is the catalog its Session sees (preset layers
      // included); the global layer alone only holds bundled skills.
      const agents = ctx.get<AgentsService>('agents')
      let agent
      if (typeof agents?.roots === 'function') agent = agents.roots()[0]
      let list
      if (agent !== undefined) {
        try {
          list = await skills.list({ ...lookup, scope: agent })
        } catch {
          list = undefined
        }
      }
      if (list === undefined) list = await skills.list(lookup)
      return list.map((skill) => ({
        name: skill.name,
        description: skill.description,
        whenToUse: skill.whenToUse ?? '',
        source: skill.source ?? '',
      }))
    },
  })

  ctx.inject(['webServer'], (sctx) => {
    sctx.effect(() => {
      const webServer = sctx.get<WebServerService>('webServer')
      if (webServer === undefined) return
      const disposers = buildRoutes(library, resolved, runLog).map((route) => webServer.register(route))
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-skillcard: web bridge')
  })

  ctx.inject(['tools'], (sctx) => {
    sctx.effect(() => {
      const tools = sctx.get<ToolsService>('tools')
      return tools === undefined ? undefined : tools.register(toolDefinition(library))
    }, 'dsh-skillcard: skillcard tool')
  })
}
