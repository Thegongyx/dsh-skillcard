/** Types for the browser half: the remote slice it touches, the store, and slot props. */
import type { Card, PluginConfig, RunRecord, RunStatus } from './shared'

/* ------------------------------------------------------------------ remotes */

export interface RemoteFailure {
  message?: string
  code?: string
}

export interface RemoteResult<T> {
  ok: boolean
  value?: T
  error?: RemoteFailure
}

export interface SkillEntryLike {
  name: string
  description: string
  whenToUse?: string
  source?: string
}

export interface WorkspaceViewLike {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly string[]
}

export interface PresetLike {
  id: string
  name?: string
  isDefault?: boolean
  broken?: string
}

export interface ModelLike {
  id: string
  name: string
  description?: string
  reasoning?: { efforts?: ReadonlyArray<{ id: string }>; defaultEffort?: string }
}

export interface ModelGroupLike {
  id: string
  name: string
  models: readonly ModelLike[]
}

export interface ModelCatalogLike {
  default?: { provider: string; model: string; reasoningEffort?: string }
  groups?: readonly ModelGroupLike[]
}

export interface WaitValue {
  reason?: 'idle' | 'input-required' | 'timeout' | string
  state?: { running?: boolean; cursor?: number }
  output?: { records?: ReadonlyArray<{ event?: { type?: string; seq?: number; surfaceOp?: string; data?: { message?: { content?: ReadonlyArray<{ type?: string; text?: string }> } } } }> }
}

export interface SessionRemote {
  create(request: Record<string, unknown>): Promise<RemoteResult<{ sessionId?: string }>>
  prompt(request: Record<string, unknown>): Promise<RemoteResult<unknown>>
  wait(request: Record<string, unknown>): Promise<RemoteResult<WaitValue>>
  cancel(request: Record<string, unknown>): unknown
  rename(request: Record<string, unknown>): Promise<RemoteResult<unknown>>
  selectModel(request: Record<string, unknown>): Promise<RemoteResult<unknown>>
  modelCatalog(): Promise<RemoteResult<ModelCatalogLike>>
}

export interface RemoteApi {
  session?: SessionRemote
  skills?: { list(request: { sessionId: string }): Promise<RemoteResult<{ skills?: SkillEntryLike[] }>> }
  agentPresets?: { list(): Promise<RemoteResult<{ presets?: PresetLike[] }>> }
}

export interface UiWorkspaceApi {
  openSession(target: unknown): void
  startSession(workspaceId?: string, options?: Record<string, unknown>): void
}

/* -------------------------------------------------------------------- store */

export interface StoreSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  cards: Card[]
  config: PluginConfig
  selectedId: string | null
  drafts: Record<string, Record<string, string>>
  notice: string
  runs: RunRecord[]
  runsCardId: string
  runsStatus: 'idle' | 'loading' | 'ready' | 'error'
  popoverRequest: { cardId: string; seq: number } | null
}

/** What the store hands the host bridge for one history row. */
export interface RunEntryInput {
  id?: string
  cardId: string
  cardTitle: string
  skill: string
  prompt: string
  answer: string
  status: RunStatus
  error: string
  sessionId: string
  startedAt: number
  finishedAt?: number
}

/** The card fields the editor submits. */
export interface CardInput {
  id?: string
  title: string
  category: string
  skill: string
  description: string
  template: string
  variables: Array<{ name: string; label: string; example: string }>
}

export interface Store {
  subscribe(listener: () => void): () => void
  get(): StoreSnapshot
  refresh(): Promise<unknown>
  notify(text: string): void
  select(id: string): void
  clearSelection(): void
  requestPopover(cardId: string): void
  refreshRuns(cardId?: string): Promise<void>
  recordRun(entry: RunEntryInput): Promise<boolean>
  deleteRuns(ids: string[]): Promise<number>
  draftOf(id: string): Record<string, string>
  setValue(cardId: string, name: string, value: string): void
  resetValues(cardId: string): void
  saveCard(input: CardInput): Promise<Card | undefined>
  removeCard(id: string): Promise<void>
  markUsed(id: string): Promise<void>
  skills(sessionId?: string): Promise<{ skills: SkillEntryLike[]; scoped: boolean }>
}

/* ------------------------------------------------------------------- runner */

export type RunnerPhase = 'idle' | 'running' | 'draft' | 'done' | 'error' | 'input' | 'timeout' | 'stopped'

export interface RunMeta {
  cardId: string
  cardTitle: string
  skill: string
  prompt: string
  startedAt: number
}

export interface RunFinished {
  id: string
  meta: RunMeta
  phase: RunnerPhase
  answer: string
  failure: string
  sessionId: string
}

export interface RunnerOptions {
  remote: RemoteApi | undefined
  uiWorkspace: UiWorkspaceApi | undefined
  useWorkspaces?: (selector: (state: WorkspaceSnapshotLike) => unknown) => unknown
  useSessions?: (selector: (state: SessionsSnapshotLike) => unknown) => unknown
  onStart?: (started: { id: string; meta: RunMeta }) => void
  onFinish?: (result: RunFinished) => void
  onWarning?: (message: string) => void
}

export interface Runner {
  workspaces: WorkspaceViewLike[]
  presets: PresetLike[]
  modelGroups: readonly ModelGroupLike[]
  workspaceId: string
  presetId: string
  providerId: string
  modelId: string
  phase: RunnerPhase
  answer: string
  failure: string
  sessionId: string
  elapsed: number
  setWorkspace(id: string): void
  setPreset(id: string): void
  setProvider(id: string): void
  setModel(id: string): void
  run(card: Card | null, text: string): Promise<void>
  stop(): void
  reset(): void
}

export interface ClientContext {
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  slots: {
    inject(name: string, callback: () => unknown): void
    register(options: Record<string, unknown>, component: (props: never) => unknown): () => void
  }
  effect(callback: () => unknown, label?: string): void
  remote?: RemoteApi
  uiWorkspace?: UiWorkspaceApi
}

export interface WorkspaceSnapshotLike {
  items?: readonly WorkspaceViewLike[]
}

export interface SessionSummaryLike {
  sessionId: string
  updatedAt?: number
  origin?: string
  projectionValues?: { title?: string }
}

export interface SessionsSnapshotLike {
  ids?: readonly string[]
  byId?: Record<string, SessionSummaryLike | undefined>
  phase?: string
}

/* ------------------------------------------------------------------- props */

export interface Translate {
  (key: string, params?: Record<string, string | number>): string
}

/** Props the slot owner passes to every registrant. */
export interface StandardProps {
  useWorkspaces?: (selector: (state: WorkspaceSnapshotLike) => unknown) => unknown
  useSessions?: (selector: (state: SessionsSnapshotLike) => unknown) => unknown
}

export interface InjectedStore {
  store: Store
  t: Translate
}

export interface PageProps extends InjectedStore, StandardProps {
  remote?: RemoteApi
  uiWorkspace?: UiWorkspaceApi
}

export interface FooterProps extends PageProps {
  wide?: boolean
}

export interface RunResultProps {
  t: Translate
  runner: Runner
  onOpenSession?: (sessionId: string) => void
}

export interface RunTargetProps {
  t: Translate
  runner: Runner
}

export interface BoundaryProps {
  label?: string
  children?: React.ReactNode
}

export interface PanelIconProps {
  size?: number
  active?: boolean
}

export interface ChevronProps {
  open?: boolean
}

export interface TemplateTextProps {
  template: string
}

export interface CardEditorProps {
  t: Translate
  initial: Partial<Card> & { id?: string }
  skills: SkillEntryLike[]
  onSave: (input: CardInput) => void
  onCancel: () => void
}

export interface CardDetailProps {
  t: Translate
  card: Card
  copied: boolean
  onUse: () => void
  onEdit: () => void
  onDelete: () => void
  onCopy: () => void
}

export interface AiFormProps {
  t: Translate
  skills: SkillEntryLike[]
  skillsMeta: { status: string; scoped: boolean }
  onRefreshSkills: () => void
  onGenerate: (request: { text: string; skill: string }) => Promise<void>
  onClose: () => void
}

export interface CardPickerProps {
  t: Translate
  cards: Card[]
  matches: Card[]
  selected: Card | null
  open: boolean
  query: string
  activeIndex: number
  onToggle: () => void
  onQuery: (value: string) => void
  onPick: (id: string) => void
  setIdle: (index: number) => void
}
