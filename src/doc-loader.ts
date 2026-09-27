import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export interface Doc {
  /** Path relative to the docs root, using forward slashes */
  path: string
  content: string
}

/**
 * Recursively read all .md files under `dir`.
 * Throws if no .md files are found (per spec: "docs 为空报错").
 *
 * @throws if `dir` does not exist, is not a directory, or contains no .md files
 */
export function loadDocs(dir: string): Doc[] {
  const stat = statSync(dir)
  if (!stat.isDirectory()) {
    throw new Error(`${dir} is not a directory`)
  }

  const docs: Doc[] = []
  walk(dir, dir, docs)

  if (docs.length === 0) {
    throw new Error(`no .md files found under ${dir}`)
  }

  return docs
}

function walk(root: string, current: string, out: Doc[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      walk(root, full, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const relPath = relative(root, full).split(sep).join('/')
      out.push({ path: relPath, content: readFileSync(full, 'utf-8') })
    }
  }
}

/**
 * Format docs as a markdown block for inclusion in the LLM user prompt.
 */
export function formatDocsForPrompt(docs: Doc[]): string {
  return docs.map((d) => `[${d.path}]\n${d.content}`).join('\n\n---\n\n')
}