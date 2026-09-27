import { describe, expect, it } from 'vitest'
import { parseReviewOutput } from './parser.js'

describe('parseReviewOutput', () => {
  it('extracts valid JSON violations from markdown', () => {
    const md = `审查结果如下:

\`\`\`json
[
  {
    "type": "字段语义",
    "line": 3,
    "col": 10,
    "confidence": 0.95,
    "reason": "amount 字段语义是折扣前金额,与 select 输出不一致",
    "doc_ref": "docs/reports/bill-summary/spec.md"
  }
]
\`\`\`
`
    const result = parseReviewOutput(md)
    expect(result.parseError).toBeNull()
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.type).toBe('字段语义')
    expect(result.violations[0]?.line).toBe(3)
    expect(result.violations[0]?.confidence).toBe(0.95)
    expect(result.droppedCount).toBe(0)
  })

  it('handles 未发现违规 without JSON block', () => {
    const result = parseReviewOutput('经过审查,未发现违规。')
    expect(result.parseError).toBeNull()
    expect(result.violations).toHaveLength(0)
    expect(result.droppedCount).toBe(0)
  })

  it('returns error when there is no JSON block and no 未发现违规', () => {
    const result = parseReviewOutput('some plain text without any code block')
    expect(result.parseError).toContain('no JSON code block')
    expect(result.violations).toHaveLength(0)
  })

  it('returns error on malformed JSON', () => {
    const md = '```json\n[invalid json]\n```'
    const result = parseReviewOutput(md)
    expect(result.parseError).toContain('JSON parse failed')
    expect(result.violations).toHaveLength(0)
  })

  it('returns error when JSON is not an array', () => {
    const md = '```json\n{ "type": "字段语义" }\n```'
    const result = parseReviewOutput(md)
    expect(result.parseError).toContain('not an array')
    expect(result.violations).toHaveLength(0)
  })

  it('drops entries with missing fields, keeps valid ones', () => {
    const md = `\`\`\`json
[
  { "type": "字段语义", "line": 1, "col": 1, "confidence": 0.9, "reason": "valid entry", "doc_ref": "ok.md" },
  { "type": "字段语义", "line": 2 }
]
\`\`\``
    const result = parseReviewOutput(md)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.doc_ref).toBe('ok.md')
    expect(result.droppedCount).toBe(1)
  })

  it('drops entries with invalid type', () => {
    const md = `\`\`\`json
[
  { "type": "INVALID", "line": 1, "col": 1, "confidence": 0.9, "reason": "r", "doc_ref": "d" }
]
\`\`\``
    const result = parseReviewOutput(md)
    expect(result.violations).toHaveLength(0)
    expect(result.droppedCount).toBe(1)
  })

  it('drops entries with out-of-range confidence', () => {
    const md = `\`\`\`json
[
  { "type": "字段语义", "line": 1, "col": 1, "confidence": 1.5, "reason": "r", "doc_ref": "d" }
]
\`\`\``
    const result = parseReviewOutput(md)
    expect(result.violations).toHaveLength(0)
  })

  it('drops entries with non-positive line numbers', () => {
    const md = `\`\`\`json
[
  { "type": "字段语义", "line": 0, "col": 1, "confidence": 0.9, "reason": "r", "doc_ref": "d" },
  { "type": "字段语义", "line": -1, "col": 1, "confidence": 0.9, "reason": "r", "doc_ref": "d" }
]
\`\`\``
    const result = parseReviewOutput(md)
    expect(result.violations).toHaveLength(0)
    expect(result.droppedCount).toBe(2)
  })

  it('drops entries with empty or too-long reason', () => {
    const md = `\`\`\`json
[
  { "type": "字段语义", "line": 1, "col": 1, "confidence": 0.9, "reason": "", "doc_ref": "d" },
  { "type": "字段语义", "line": 1, "col": 1, "confidence": 0.9, "reason": "${'x'.repeat(201)}", "doc_ref": "d" }
]
\`\`\``
    const result = parseReviewOutput(md)
    expect(result.violations).toHaveLength(0)
    expect(result.droppedCount).toBe(2)
  })
})