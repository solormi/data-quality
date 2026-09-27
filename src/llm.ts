/**
 * Configuration for an LLM client.
 *
 * SECURITY: `apiKey` MUST be sourced from the environment (e.g. `process.env.OPENAI_API_KEY`)
 * or passed via the CLI as `--api-key`. NEVER hardcode a real key in source — even though
 * `DEFAULT_LLM_CONFIG.apiKey` is the empty string, do not modify it to embed a real value.
 *
 * Use `src/secret-scan.test.ts` as a guardrail: any committed source file matching
 * hardcoded-key patterns will fail the test suite.
 */
export interface LLMConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface LLMResult {
  ok: boolean
  content: string | null
  error: string | null
}

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseUrl: 'https://api.openai.com/v1',
  // Empty by design — pass apiKey from env or CLI. Never override this with a real key.
  apiKey: '',
  model: 'gpt-4o-mini',
  timeoutMs: 5000,
}

export interface LLMClient {
  chat(system: string, user: string): Promise<LLMResult>
}

export function createLLMClient(config: LLMConfig): LLMClient {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`

  async function callOnce(system: string, user: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs)
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
  }

  return {
    async chat(system: string, user: string): Promise<LLMResult> {
      let lastError = 'unknown'

      // Retry once on failure (per task 2.1 spec)
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await callOnce(system, user)

          if (!response.ok) {
            const body = await response.text()
            lastError = `HTTP ${response.status}: ${body.slice(0, 200)}`
            continue
          }

          const data = (await response.json()) as {
            choices?: { message?: { content?: string } }[]
          }
          const content = data.choices?.[0]?.message?.content
          if (!content) {
            lastError = 'empty response from LLM'
            continue
          }
          return { ok: true, content, error: null }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            lastError = `timeout after ${config.timeoutMs}ms`
          } else {
            lastError = err instanceof Error ? err.message : String(err)
          }
          // continue to retry
        }
      }

      return { ok: false, content: null, error: lastError }
    },
  }
}