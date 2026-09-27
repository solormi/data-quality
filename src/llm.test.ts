import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LLM_CONFIG, createLLMClient } from './llm.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockFetchOnce(response: Response): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValueOnce(response)
}

describe('llm client', () => {
  it('returns content on successful call', async () => {
    const fetchMock = mockFetchOnce(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'hello world' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLLMClient({ ...DEFAULT_LLM_CONFIG, apiKey: 'test-key' })
    const result = await client.chat('sys', 'usr')

    expect(result.ok).toBe(true)
    expect(result.content).toBe('hello world')
    expect(result.error).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns error on timeout after 1 retry', async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      // Trigger AbortError by rejecting with AbortError
      return Promise.reject(new DOMException('Aborted', 'AbortError'))
    })
    vi.stubGlobal('fetch', fetchMock)

    const client = createLLMClient({
      ...DEFAULT_LLM_CONFIG,
      apiKey: 'test-key',
      timeoutMs: 50,
    })
    const result = await client.chat('sys', 'usr')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('timeout')
    // 2 attempts: original + 1 retry
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns error on HTTP 500 after 1 retry', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response('Server Error', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createLLMClient({ ...DEFAULT_LLM_CONFIG, apiKey: 'test-key' })
    const result = await client.chat('sys', 'usr')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('HTTP 502')
    // Last attempt's status should be in the error
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns error when response body is empty', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLLMClient({ ...DEFAULT_LLM_CONFIG, apiKey: 'test-key' })
    const result = await client.chat('sys', 'usr')

    expect(result.ok).toBe(false)
    expect(result.error).toContain('empty')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses correct endpoint and headers', async () => {
    const fetchMock = mockFetchOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const client = createLLMClient({
      baseUrl: 'https://example.com/v1/',
      apiKey: 'sk-test',
      model: 'gpt-4o',
      timeoutMs: 1000,
    })
    await client.chat('S', 'U')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"gpt-4o"'),
      })
    )
  })
})