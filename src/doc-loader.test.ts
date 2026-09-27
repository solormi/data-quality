import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDocsForPrompt, loadDocs } from './doc-loader.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doc-loader-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadDocs', () => {
  it('loads a single .md file', () => {
    writeFileSync(join(dir, 'spec.md'), '# Spec\n\n口径: WHERE date = ...')

    const docs = loadDocs(dir)

    expect(docs).toHaveLength(1)
    expect(docs[0]?.path).toBe('spec.md')
    expect(docs[0]?.content).toContain('口径')
  })

  it('loads multiple .md files recursively', () => {
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'a.md'), '# A')
    writeFileSync(join(dir, 'sub', 'b.md'), '# B')
    writeFileSync(join(dir, 'ignore.txt'), 'not markdown')

    const docs = loadDocs(dir)

    expect(docs).toHaveLength(2)
    const paths = docs.map((d) => d.path).sort()
    expect(paths).toEqual(['a.md', 'sub/b.md'])
  })

  it('throws when no .md files exist', () => {
    writeFileSync(join(dir, 'note.txt'), 'plain text')

    expect(() => loadDocs(dir)).toThrow(/no \.md files found/)
  })

  it('throws when path is not a directory', () => {
    const file = join(dir, 'a-file.md')
    writeFileSync(file, '# A')

    expect(() => loadDocs(file)).toThrow(/not a directory/)
  })
})

describe('formatDocsForPrompt', () => {
  it('prepends each doc with its bracketed path', () => {
    const docs = [
      { path: 'a.md', content: 'A content' },
      { path: 'b/c.md', content: 'B content' },
    ]

    const result = formatDocsForPrompt(docs)

    expect(result).toContain('[a.md]\nA content')
    expect(result).toContain('[b/c.md]\nB content')
    expect(result).toContain('---')
  })
})