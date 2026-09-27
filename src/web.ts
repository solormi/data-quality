import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LLM_CONFIG, createLLMClient, type LLMClient } from './llm.js'
import { parseReviewOutput, type Violation } from './parser.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PROMPT_PATH = join(ROOT, 'prompts', 'review.md')
const WEB_DIR = join(ROOT, 'web')

interface ReviewRequest {
  sql: string
  docs: string
}

interface ReviewResponse {
  report?: string
  violations?: Violation[]
  droppedCount?: number
  error?: string
  raw?: string
}

function formatViolation(v: Violation, index: number): string {
  return [
    `### ${index + 1}. [${v.type}] (行 ${v.line}, 列 ${v.col})`,
    ``,
    `- **置信度**: ${v.confidence}`,
    `- **依据**: ${v.doc_ref}`,
    `- **说明**: ${v.reason}`,
    ``,
  ].join('\n')
}

function formatReport(violations: Violation[], droppedCount: number): string {
  const lines: string[] = ['# Report SQL 审查报告', '']

  if (violations.length === 0) {
    lines.push('✅ 未发现违规', '')
    if (droppedCount > 0) {
      lines.push(`_(另有 ${droppedCount} 条因字段不合规被丢弃)_`)
    }
    return lines.join('\n')
  }

  const byType: Record<string, Violation[]> = {}
  for (const v of violations) {
    const arr = byType[v.type] ?? []
    arr.push(v)
    byType[v.type] = arr
  }

  lines.push(`共发现 **${violations.length}** 条违规`, '')
  for (const [type, items] of Object.entries(byType)) {
    lines.push(`## ${type} (${items.length})`, '')
    items.forEach((v, i) => lines.push(formatViolation(v, i)))
  }
  if (droppedCount > 0) {
    lines.push('---', '', `_另有 ${droppedCount} 条违规因字段不合规被丢弃_`)
  }
  return lines.join('\n')
}

function buildSystem(): string {
  return readFileSync(PROMPT_PATH, 'utf-8')
}

function buildUser(sql: string, docs: string): string {
  const sqlWithLines = sql
    .split('\n')
    .map((line, idx) => `${idx + 1}: ${line}`)
    .join('\n')
  return `<SQL>\n${sqlWithLines}\n</SQL>\n\n<DOCS>\n[inline]\n${docs}\n</DOCS>`
}

export function createApp(client: LLMClient = createLLMClient({
  baseUrl: process.env['OPENAI_BASE_URL'] ?? DEFAULT_LLM_CONFIG.baseUrl,
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
  model: process.env['OPENAI_MODEL'] ?? DEFAULT_LLM_CONFIG.model,
  timeoutMs: Number(process.env['OPENAI_TIMEOUT_MS']) || DEFAULT_LLM_CONFIG.timeoutMs,
})): express.Express {
  const app = express()
  app.use(express.json({ limit: '5mb' }))
  app.use(express.static(WEB_DIR))

  app.post('/api/review', async (req: Request, res: Response) => {
    const body = req.body as ReviewRequest
    const sql = body.sql?.trim() ?? ''
    const docs = body.docs?.trim() ?? ''

    if (!sql || !docs) {
      res.status(400).json({ error: 'sql and docs required' } satisfies ReviewResponse)
      return
    }

    if (!process.env['OPENAI_API_KEY']) {
      res.status(500).json({ error: 'OPENAI_API_KEY not set' } satisfies ReviewResponse)
      return
    }

    try {
      const result = await client.chat(buildSystem(), buildUser(sql, docs))
      if (!result.ok || !result.content) {
        res
          .status(500)
          .json({ error: `LLM call failed: ${result.error ?? 'unknown'}` } satisfies ReviewResponse)
        return
      }

      const parsed = parseReviewOutput(result.content)
      if (parsed.parseError) {
        res.status(500).json({
          error: `parse failed: ${parsed.parseError}`,
          raw: result.content,
        } satisfies ReviewResponse)
        return
      }

      res.json({
        report: formatReport(parsed.violations, parsed.droppedCount),
        violations: parsed.violations,
        droppedCount: parsed.droppedCount,
      } satisfies ReviewResponse)
    } catch (err) {
      res
        .status(500)
        .json({ error: err instanceof Error ? err.message : String(err) } satisfies ReviewResponse)
    }
  })

  return app
}

// Auto-start when run directly
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const port = Number(process.env['PORT']) || 3000
  const app = createApp()
  app.listen(port, () => {
    console.log(`Report SQL Reviewer listening on http://localhost:${port}`)
    console.log(`Open the URL above in your browser.`)
  })
}