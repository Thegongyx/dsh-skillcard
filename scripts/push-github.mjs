import { readFileSync, statSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const repo = 'Thegongyx/dsh-skillcard'
const token = process.env.GH_TOKEN
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-skillcard' }
const api = (path, init) => fetch('https://api.github.com' + path, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })

const SKIP = new Set(['.git', 'node_modules', 'lib.tmp'])
const files = []
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue
    if (entry.name.endsWith('.tgz')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else files.push(relative('.', full).split(sep).join('/'))
  }
}
walk('.')

const ref = await (await api(`/repos/${repo}/git/refs/heads/main`)).json()
const parent = ref.object.sha
const base = await (await api(`/repos/${repo}/git/commits/${parent}`)).json()

const tree = []
for (const path of files) {
  const body = { content: readFileSync(path).toString('base64'), encoding: 'base64' }
  const res = await api(`/repos/${repo}/git/blobs`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
  const blob = await res.json()
  if (!res.ok) throw new Error('blob ' + path + ': ' + JSON.stringify(blob))
  tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
}
// sources that the build replaced
for (const gone of ['index.js', 'client.js']) tree.push({ path: gone, mode: '100644', type: 'blob', sha: null })

const treeRes = await api(`/repos/${repo}/git/trees`, {
  method: 'POST',
  body: JSON.stringify({ base_tree: base.tree.sha, tree }),
  headers: { 'content-type': 'application/json' },
})
const treeBody = await treeRes.json()
if (!treeRes.ok) throw new Error('tree: ' + JSON.stringify(treeBody))

const commitRes = await api(`/repos/${repo}/git/commits`, {
  method: 'POST',
  body: JSON.stringify({
    message: 'feat(ts): migrate to TypeScript with an esbuild pipeline (0.4.0)\n\nSources live in src/ and typecheck strictly; lib/ holds the built ESM host\nentry and the module-loader CJS client factory.',
    tree: treeBody.sha,
    parents: [parent],
    author: { name: 'Thegongyx', email: 'Thegongyx@users.noreply.github.com' },
  }),
  headers: { 'content-type': 'application/json' },
})
const commit = await commitRes.json()
if (!commitRes.ok) throw new Error('commit: ' + JSON.stringify(commit))

const patch = await api(`/repos/${repo}/git/refs/heads/main`, {
  method: 'PATCH',
  body: JSON.stringify({ sha: commit.sha, force: false }),
  headers: { 'content-type': 'application/json' },
})
console.log('files: ' + files.length + '  commit: ' + commit.sha.slice(0, 8) + '  ref -> ' + patch.status)