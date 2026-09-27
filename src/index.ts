#!/usr/bin/env node
// Load .env file into process.env (does NOT override existing shell env vars)
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { formatDocsForPrompt, loadDocs } from './doc-loader.js'
import { DEFAULT_LLM_CONFIG, createLLMClient, type LLMClient } from './llm.js'
import { parseReviewOutput, type Violation } from './parser.js'
import { loadSql } from './sql-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROMPT_PATH = join(__dirname, '..', 'prompts', 'review.md')

interface CliArgs {
  sql: string
  docs: string
  apiKey: string
  model: string
  timeoutMs: number
  baseUrl: string
}

const USAGE = `Usage: report-sql-review --sql <path> --docs <dir> [--api-key <key>] [--model <name>] [--base-url <url>] [--timeout-ms <n>]`

function parseCliArgs(argv: string[]): CliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      sql: { type: 'string' },
      docs: { type: 'string' },
      'api-key': { type: 'string', default: process.env['OPENAI_API_KEY'] ?? '' },
      model: { type: 'string', default: process.env['OPENAI_MODEL'] ?? DEFAULT_LLM_CONFIG.model },
      'base-url': { type: 'string', default: process.env['OPENAI_BASE_URL'] ?? DEFAULT_LLM_CONFIG.baseUrl },
      'timeout-ms': {
        type: 'string',
        default: process.env['OPENAI_TIMEOUT_MS'] ?? String(DEFAULT_LLM_CONFIG.timeoutMs),
      },
    },
    allowPositionals: false,
  })

  const sql = values.sql
  const docs = values.docs
  if (!sql || !docs) {
    throw new Error(USAGE)
  }

  return {
    sql,
    docs,
    apiKey: values['api-key'] ?? '',
    model: values.model ?? DEFAULT_LLM_CONFIG.model,
    baseUrl: values['base-url'] ?? DEFAULT_LLM_CONFIG.baseUrl,
    timeoutMs: Number(values['timeout-ms']) || DEFAULT_LLM_CONFIG.timeoutMs,
  }
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
  const lines: string[] = []
  lines.push('# Report SQL 审查报告')
  lines.push('')

  if (violations.length === 0) {
    lines.push('✅ 未发现违规')
    lines.push('')
    if (droppedCount > 0) {
      lines.push(`_(另有 ${droppedCount} 条因字段不合规被丢弃)_`)
    }
    return lines.join('\n')
  }

  // Group by type
  const byType: Record<string, Violation[]> = {}
  for (const v of violations) {
    const arr = byType[v.type] ?? []
    arr.push(v)
    byType[v.type] = arr
  }

  lines.push(`共发现 **${violations.length}** 条违规`, '')
  for (const [type, items] of Object.entries(byType)) {
    lines.push(`## ${type} (${items.length})`)
    lines.push('')
    items.forEach((v, i) => lines.push(formatViolation(v, i)))
  }

  if (droppedCount > 0) {
    lines.push('---')
    lines.push('')
    lines.push(`_另有 ${droppedCount} 条违规因字段不合规被丢弃_`)
  }

  return lines.join('\n')
}

function buildPrompt(systemTemplate: string, sql: string, docsFormatted: string): {
  system: string
  user: string
} {
  return {
    system: systemTemplate,
    user: `<SQL>\n${sql}\n</SQL>\n\n<DOCS>\n${docsFormatted}\n</DOCS>`,
  }
}

async function run(args: CliArgs, client: LLMClient = createLLMClient({
  baseUrl: args.baseUrl,
  apiKey: args.apiKey,
  model: args.model,
  timeoutMs: args.timeoutMs,
})): Promise<number> {
  // 1. Load SQL
  let sql: string
  try {
    sql = loadSql(args.sql)
  } catch (err) {
    console.error(`Error: failed to load SQL at ${args.sql}: ${(err as Error).message}`)
    return 2
  }

  // 2. Load docs
  let docs
  try {
    docs = loadDocs(args.docs)
  } catch (err) {
    console.error(`Error: failed to load docs from ${args.docs}: ${(err as Error).message}`)
    return 2
  }

  // 3. Load prompt template
  const systemPrompt = readFileSync(PROMPT_PATH, 'utf-8')
  const { system, user } = buildPrompt(systemPrompt, sql, formatDocsForPrompt(docs))

  // 4. Call LLM
  const result = await client.chat(system, user)
  if (!result.ok || !result.content) {
    console.error(`Error: LLM call failed: ${result.error ?? 'unknown'}`)
    return 2
  }

  // 5. Parse output
  const parsed = parseReviewOutput(result.content)
  if (parsed.parseError) {
    console.error(`Error: failed to parse LLM output: ${parsed.parseError}`)
    console.error('--- raw LLM output ---')
    console.error(result.content)
    return 2
  }

  // 6. Output report
  console.log(formatReport(parsed.violations, parsed.droppedCount))
  return parsed.violations.length === 0 ? 0 : 1
}

async function main(): Promise<void> {
  let args: CliArgs
  try {
    args = parseCliArgs(process.argv.slice(2))
  } catch (err) {
    console.error((err as Error).message)
    process.exit(2)
  }

  if (!args.apiKey) {
    console.error('Error: API key not provided. Use --api-key or set OPENAI_API_KEY env var.')
    process.exit(2)
  }

  const exitCode = await run(args)
  process.exit(exitCode)
}

export { run }

// Only invoke main() when this file is run directly (not when imported by tests)
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main().catch((err) => {
    console.error('Unhandled error:', err)
    process.exit(2)
  })
}