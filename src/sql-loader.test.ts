import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadSql } from './sql-loader.js'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sql-loader-test-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadSql', () => {
  it('reads a SQL file and prefixes each line with line number', () => {
    const file = join(dir, 'query.sql')
    writeFileSync(file, "SELECT id\nFROM orders\nWHERE status = 'PAID'")

    const result = loadSql(file)

    expect(result).toBe("1: SELECT id\n2: FROM orders\n3: WHERE status = 'PAID'")
  })

  it('handles empty file', () => {
    const file = join(dir, 'empty.sql')
    writeFileSync(file, '')

    const result = loadSql(file)

    expect(result).toBe('1: ')
  })

  it('throws when file does not exist', () => {
    expect(() => loadSql(join(dir, 'missing.sql'))).toThrow()
  })
})