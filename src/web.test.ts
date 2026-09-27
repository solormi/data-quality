import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LLMClient } from './llm.js'
import type { Violation } from './parser.js'
import { createApp } from './web.js'

let server: ReturnType<ReturnType<typeof createApp>['listen']>
let baseUrl: string

function makeMockClient(behavior: {
  ok?: boolean
  error?: string
  content?: string | null
}): LLMClient {
  return {
    chat: async () => {
      if (behavior.ok === false) {
        return { ok: false, content: null, error: behavior.error ?? 'unknown' }
      }
      return { ok: true, content: behavior.content ?? '```json\n[]\n```', error: null }
    },
  }
}

beforeEach(async () => {
  // Use port 0 to get a free random port
  const app = createApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const addr = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${addr.port}`
})

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  delete process.env['OPENAI_API_KEY']
})

describe('POST /api/review', () => {
  it('returns 200 + report on success (no violations)', async () => {
    const app = createApp(
      makeMockClient({ content: '```json\n[]\n```' })
    )
    await new Promise<void>((r) => {
      app.listen(0, async () => {
        const addr = app.listen(0).address() as AddressInfo
        const url = `http://127.0.0.1:${addr.port}`
        // use the first server
        r()
      })
    })
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', docs: '# spec' }),
    })

    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.error).toBeUndefined()
    expect(data.report).toContain('未发现违规')
    expect(data.violations).toEqual([])
    expect(data.droppedCount).toBe(0)
  })

  it('returns 200 + report on success (with violations)', async () => {
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
    const app = createApp(makeMockClient({ content: violationMd }))
    await new Promise<void>((resolve) => {
      server.close(() => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo
          baseUrl = `http://127.0.0.1:${addr.port}`
          resolve()
        })
      })
    })
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT * FROM orders', docs: '# spec' }),
    })

    expect(resp.status).toBe(200)
    const data = await resp.json()
    expect(data.report).toContain('共发现')
    expect(data.violations).toHaveLength(1)
    expect((data.violations as Violation[])[0]?.type).toBe('已知问题')
  })

  it('returns 400 when sql or docs missing', async () => {
    const app = createApp(makeMockClient({ content: '```json\n[]\n```' }))
    await new Promise<void>((resolve) => {
      server.close(() => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo
          baseUrl = `http://127.0.0.1:${addr.port}`
          resolve()
        })
      })
    })
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: '', docs: '# spec' }),
    })

    expect(resp.status).toBe(400)
    const data = await resp.json()
    expect(data.error).toContain('sql and docs required')
  })

  it('returns 500 when OPENAI_API_KEY not set', async () => {
    // No OPENAI_API_KEY set; mock client should not be called
    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', docs: '# spec' }),
    })

    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.error).toContain('OPENAI_API_KEY')
  })

  it('returns 500 when LLM call fails', async () => {
    const app = createApp(
      makeMockClient({ ok: false, error: 'timeout after 30000ms' })
    )
    await new Promise<void>((resolve) => {
      server.close(() => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo
          baseUrl = `http://127.0.0.1:${addr.port}`
          resolve()
        })
      })
    })
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', docs: '# spec' }),
    })

    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.error).toContain('LLM call failed')
  })

  it('returns 500 when LLM output unparseable', async () => {
    const app = createApp(makeMockClient({ content: 'just plain text' }))
    await new Promise<void>((resolve) => {
      server.close(() => {
        server = app.listen(0, () => {
          const addr = server.address() as AddressInfo
          baseUrl = `http://127.0.0.1:${addr.port}`
          resolve()
        })
      })
    })
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT 1', docs: '# spec' }),
    })

    expect(resp.status).toBe(500)
    const data = await resp.json()
    expect(data.error).toContain('parse failed')
    expect(data.raw).toBe('just plain text')
  })

  it('serves index.html at /', async () => {
    process.env['OPENAI_API_KEY'] = 'test-key'

    const resp = await fetch(`${baseUrl}/`)

    expect(resp.status).toBe(200)
    const html = await resp.text()
    expect(html).toContain('Report SQL Reviewer')
    expect(html).toContain('<textarea id="sql"')
  })
})