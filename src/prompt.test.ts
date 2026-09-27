import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const promptPath = join(__dirname, '..', 'prompts', 'review.md')

describe('prompts/review.md', () => {
  const content = readFileSync(promptPath, 'utf-8')

  it('exists and is non-empty', () => {
    expect(content.length).toBeGreaterThan(0)
  })

  it('declares the 4 violation types', () => {
    expect(content).toContain('字段语义')
    expect(content).toContain('口径')
    expect(content).toContain('已知问题')
    expect(content).toContain('性能合规')
  })

  it('declares all required JSON output fields', () => {
    expect(content).toContain('"type"')
    expect(content).toContain('"line"')
    expect(content).toContain('"col"')
    expect(content).toContain('"confidence"')
    expect(content).toContain('"reason"')
    expect(content).toContain('"doc_ref"')
  })

  it('includes hallucination guard', () => {
    expect(content).toContain('幻觉')
    expect(content).toContain('doc_ref')
  })

  it('includes uncertainty handling', () => {
    expect(content).toContain('未发现违规')
    expect(content).toContain('不要猜测')
  })
})