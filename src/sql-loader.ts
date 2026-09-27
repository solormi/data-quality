import { readFileSync } from 'node:fs'

/**
 * Read a SQL file and prefix each line with "N: ".
 *
 * Example output:
 *   1: SELECT id, amount
 *   2: FROM orders
 *   3: WHERE status = 'PAID'
 *
 * @throws if the file does not exist or cannot be read
 */
export function loadSql(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  return content
    .split('\n')
    .map((line, idx) => `${idx + 1}: ${line}`)
    .join('\n')
}