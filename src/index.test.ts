import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { run } from './index.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'e2e-test-'))
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 500 })))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

function writeSql(content: string): string {
  const path = join(dir, 'query.sql')
  writeFileSync(path, content)
  return path
}

function writeDocs(content: string): string {
  const docsDir = join(dir, 'docs')
  mkdirSync(docsDir, { recursive: true })
  writeFileSync(join(docsDir, 'spec.md'), content)
  return docsDir
}

describe('CLI run() — end-to-end', () => {
  it('returns 0 when LLM reports no violations', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '未发现违规' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const sqlPath = writeSql('SELECT 1')
    const docsDir = writeDocs('# Spec')

    const exitCode = await run(
      {
        sql: sqlPath,
        docs: docsDir,
        apiKey: 'test-key',
        model: 'gpt-4o-mini',
        baseUrl: 'https://api.example.com/v1',
        timeoutMs: 1000,
      },
      // The run() function will create its own client from these args; we mock fetch globally
    )

    expect(exitCode).toBe(0)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('returns 1 when LLM reports violations', async () => {
    const violationMd = `\`\`\`json
[
  {
    "type": "已知问题",
    "line": 1,
    "col": 1,
    "confidence": 0.9,
    "reason": "missing status filter",
    "doc_ref": "spec.md"
  }
]
\`\`\``

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: violationMd } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const sqlPath = writeSql('SELECT * FROM orders')
    const docsDir = writeDocs('# Spec')

    const exitCode = await run({
      sql: sqlPath,
      docs: docsDir,
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example.com/v1',
      timeoutMs: 1000,
    })

    expect(exitCode).toBe(1)
  })

  it('returns 2 when LLM call fails', async () => {
    // fetch already returns 500 from beforeEach
    const sqlPath = writeSql('SELECT 1')
    const docsDir = writeDocs('# Spec')

    const exitCode = await run({
      sql: sqlPath,
      docs: docsDir,
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example.com/v1',
      timeoutMs: 1000,
    })

    expect(exitCode).toBe(2)
  })

  it('returns 2 when SQL file does not exist', async () => {
    const docsDir = writeDocs('# Spec')

    const exitCode = await run({
      sql: join(dir, 'missing.sql'),
      docs: docsDir,
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.example.com/v1',
      timeoutMs: 1000,
    })

    expect(exitCode).toBe(2)
  })
})