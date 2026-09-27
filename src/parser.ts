export type ViolationType = '字段语义' | '口径' | '已知问题' | '性能合规'

export const VALID_VIOLATION_TYPES: ViolationType[] = [
  '字段语义',
  '口径',
  '已知问题',
  '性能合规',
]

export interface Violation {
  type: ViolationType
  line: number
  col: number
  confidence: number
  reason: string
  doc_ref: string
}

export interface ParseResult {
  violations: Violation[]
  parseError: string | null
  droppedCount: number
}

function isViolationType(v: unknown): v is ViolationType {
  return typeof v === 'string' && (VALID_VIOLATION_TYPES as string[]).includes(v)
}

function isViolation(v: unknown): v is Violation {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>

  if (!isViolationType(o.type)) return false
  if (typeof o.line !== 'number' || !Number.isInteger(o.line) || o.line < 1) return false
  if (typeof o.col !== 'number' || !Number.isInteger(o.col) || o.col < 1) return false
  if (typeof o.confidence !== 'number' || o.confidence < 0 || o.confidence > 1) return false
  if (typeof o.reason !== 'string' || o.reason.length === 0 || o.reason.length > 200) return false
  if (typeof o.doc_ref !== 'string' || o.doc_ref.length === 0) return false

  return true
}

/**
 * Extract the first ```json ... ``` block from markdown.
 * Returns null if no block is present.
 */
function extractJsonBlock(markdown: string): string | null {
  const match = markdown.match(/```json\s*([\s\S]*?)\s*```/)
  return match?.[1] ?? null
}

/**
 * Parse LLM markdown output into structured violations.
 *
 * Strategy:
 * 1. If markdown contains "未发现违规" and no JSON block → empty result, no error
 * 2. Extract first ```json ... ``` block
 * 3. JSON.parse → must be array
 * 4. Filter entries via isViolation; drop invalid ones silently
 * 5. Return violations + droppedCount + parseError
 */
export function parseReviewOutput(markdown: string): ParseResult {
  const jsonBlock = extractJsonBlock(markdown)

  if (!jsonBlock) {
    if (markdown.includes('未发现违规')) {
      return { violations: [], parseError: null, droppedCount: 0 }
    }
    return { violations: [], parseError: 'no JSON code block found', droppedCount: 0 }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonBlock)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { violations: [], parseError: `JSON parse failed: ${msg}`, droppedCount: 0 }
  }

  if (!Array.isArray(parsed)) {
    return { violations: [], parseError: 'JSON is not an array', droppedCount: 0 }
  }

  const valid: Violation[] = []
  let dropped = 0
  for (const entry of parsed) {
    if (isViolation(entry)) {
      valid.push(entry)
    } else {
      dropped++
    }
  }

  return { violations: valid, parseError: null, droppedCount: dropped }
}