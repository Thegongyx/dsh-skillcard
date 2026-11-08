/** Domain types and the pure template helpers both halves share. */

/** One `${name}` placeholder on a card. */
export interface CardVariable {
  name: string
  label: string
  example: string
}

/** A saved skill card. */
export interface Card {
  id: string
  title: string
  description: string
  template: string
  variables: CardVariable[]
  category: string
  skill: string
  uses: number
  createdAt: number
  updatedAt: number
}

export type RunStatus = 'running' | 'done' | 'error' | 'input' | 'timeout' | 'stopped' | 'interrupted'

/** One recorded execution of a card. */
export interface RunRecord {
  id: string
  cardId: string
  cardTitle: string
  skill: string
  prompt: string
  answer: string
  status: RunStatus
  error: string
  sessionId: string
  startedAt: number
  finishedAt: number
}

/** Row config from the profile patch. */
export interface PluginConfig {
  defaultExpanded: boolean
  showSidebarEntry: boolean
}

/** `${name}` and `{{name}}` both name a variable; the canonical form is `${name}`. */
export const VAR_PATTERN = /\$\{([^{}\n]+)\}|\{\{([^{}\n]+)\}\}/g
/** Canonical-only pattern, used when walking a stored template. */
export const VAR_CANONICAL = /\$\{([^{}\n]+)\}/g
/** The grammar the host's `/name` skill-gesture scan accepts. */
export const SKILL_TOKEN_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Normalize `{{name}}` spellings to the canonical `${name}` form. */
export function canonicalTemplate(value: string): string {
  return String(value ?? '').replace(/\{\{([^{}\n]+)\}\}/g, (_match, name: string) => '${' + name.trim() + '}')
}

/** Variable names in first-appearance order, duplicates removed. */
export function templateVariables(template: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const match of String(template ?? '').matchAll(VAR_PATTERN)) {
    const name = String(match[1] ?? match[2] ?? '').trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** Fill a template; unresolved placeholders stay visible. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return String(template ?? '').replace(VAR_CANONICAL, (match, raw: string) => {
    const name = raw.trim()
    const value = values[name]
    return value === undefined || value === '' ? match : value
  })
}

/** Names whose value is still blank. */
export function missingNames(template: string, values: Record<string, string>): string[] {
  return templateVariables(template).filter((name) => {
    const value = values[name]
    return value === undefined || String(value).trim() === ''
  })
}

/** A blank value map for one card. */
export function emptyValues(card: Pick<Card, 'template'>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const name of templateVariables(card.template)) values[name] = ''
  return values
}

/** Normalize one line of user text. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n?/g, '\n').trim().slice(0, max)
}
