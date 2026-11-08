/**
 * Ambient contracts this plugin compiles against.
 *
 * These are deliberately hand-written and deliberately small: the dsh packages
 * that own the real types are released as release candidates and change shape
 * between them, so pinning them as devDependencies would break `tsc` on an
 * upgrade for reasons that have nothing to do with this plugin. Everything
 * declared here is what the plugin actually touches at runtime.
 */

/* ------------------------------------------------------------------ host side */

/** Json value accepted by the host bridge. */
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

interface HostLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

interface ToolOutputDefinition {
  schema: Record<string, unknown>
  render(args: unknown, value: JsonValue): Array<{ type: 'text'; text: string }>
}

interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: ToolOutputDefinition
  execute(args: Record<string, unknown>, exec?: unknown): Promise<JsonValue>
}

interface ToolsService {
  register(definition: ToolDefinition, options?: Record<string, unknown>): () => void
}

interface WebRoute {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
}

interface WebServerService {
  register(route: WebRoute): () => void
}

interface SkillSummaryLike {
  name: string
  description: string
  whenToUse?: string
  source?: string
}

interface SkillsService {
  list(options?: { cwd?: string; scope?: unknown }): Promise<SkillSummaryLike[]>
}

interface WorkingDirectoryService {
  defaultDirectory?: string
}

interface AgentLike {
  id: string
}

interface AgentsService {
  roots(): AgentLike[]
}

/** The slice of the Cordis host context this plugin uses. */
interface HostContext {
  get<T = unknown>(name: string): T | undefined
  inject(services: string[], callback: (ctx: HostContext) => void): void
  effect(callback: () => (() => void) | void, label?: string): void
  logger?: HostLogger
}

/* ---------------------------------------------------------------- client side */

interface ModuleLoaderHost {
  load(registration: { id: string; factory: (require: (id: string) => unknown) => unknown }): void
}

interface Window {
  __ModuleLoader__: ModuleLoaderHost
}
