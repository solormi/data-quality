import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..')

/**
 * Guardrail: scan source files for patterns that look like hardcoded secrets.
 * If any pattern matches, this test fails — preventing accidental commits.
 *
 * Patterns detected:
 *   - OpenAI-style keys: `sk-` followed by 20+ alphanumeric chars (but NOT inside README/code where `sk-...` is a deliberate placeholder)
 *   - Hardcoded `Bearer` tokens (non-empty value)
 *   - `OPENAI_API_KEY=sk-...` style assignments
 */
const PATTERNS: { name: string; regex: RegExp; allowFiles?: string[] }[] = [
  {
    // OpenAI-style: sk- followed by 20+ chars (not `sk-...` placeholder)
    name: 'OpenAI-style key (sk-[20+])',
    regex: /\bsk-[a-zA-Z0-9]{20,}/,
    allowFiles: ['src/llm.test.ts'], // contains test-only `sk-test` / `sk-...` placeholders that are short
  },
  {
    // `OPENAI_API_KEY=` followed by 10+ alphanumeric chars (real key value, not placeholder)
    name: 'OPENAI_API_KEY assignment with real value',
    regex: /OPENAI_API_KEY\s*=\s*[a-zA-Z0-9_\-]{10,}/,
    // These files legitimately mention OPENAI_API_KEY as a name, not a value:
    allowFiles: ['.env.example', 'src/secret-scan.test.ts'],
  },
  {
    // `Bearer` followed by 20+ chars (non-empty, non-template token)
    name: 'Bearer token (non-test)',
    regex: /Bearer\s+[a-zA-Z0-9_\-]{20,}/,
    allowFiles: ['src/llm.ts', 'src/llm.test.ts'], // llm.ts has `Bearer ${config.apiKey}` template literal — empty by default
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('secret scan', () => {
  const files = walk(ROOT).filter((f) => /\.(ts|js|md|json|yaml|yml|env)$/.test(f))

  it.each(PATTERNS)('no file matches pattern: %s', ({ name, regex, allowFiles }) => {
    const offenders: { file: string; line: number; match: string }[] = []

    for (const file of files) {
      const rel = file.replace(ROOT + '/', '')
      if (allowFiles?.includes(rel)) continue

      const content = readFileSync(file, 'utf-8')
      const lines = content.split('\n')
      lines.forEach((line, idx) => {
        const match = line.match(regex)
        if (match) {
          offenders.push({ file: rel, line: idx + 1, match: match[0] })
        }
      })
    }

    if (offenders.length > 0) {
      const report = offenders.map((o) => `  ${o.file}:${o.line} → "${o.match}"`).join('\n')
      throw new Error(`Found hardcoded secrets matching "${name}":\n${report}`)
    }

    expect(offenders).toHaveLength(0)
  })

  it('.env (not .env.example) is gitignored', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf-8')
    expect(gitignore).toMatch(/^\.env$/m)
    expect(gitignore).toMatch(/^\.env\.\*$/m)
  })

  it('.env.example exists and contains no real key', () => {
    const content = readFileSync(join(ROOT, '.env.example'), 'utf-8')
    // No real key — only the variable name with empty value
    expect(content).not.toMatch(/\bsk-[a-zA-Z0-9]{20,}/)
    expect(content).not.toMatch(/OPENAI_API_KEY\s*=\s*[a-zA-Z0-9_\-]{10,}/)
    expect(content).toContain('OPENAI_API_KEY=')
  })
})