import type { HttpFn } from '../../core/src/sync-client.ts'

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatOptions {
  /** JSON schema the answer must follow (structured output) */
  schema?: object
  temperature?: number
}

/** Provider-neutral interface; local Ollama now, cloud providers later. */
export interface LlmClient {
  readonly label: string
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>
}

export class LlmError extends Error {}

/** Ollama (local): POST /api/chat with "format" = JSON schema. */
export class OllamaClient implements LlmClient {
  readonly label: string
  private url: string
  private model: string
  private http: HttpFn
  private numCtx: number
  constructor(opts: { url?: string; model: string; http: HttpFn; numCtx?: number }) {
    this.url = (opts.url ?? 'http://127.0.0.1:11434').replace(/\/+$/, '')
    this.model = opts.model
    this.http = opts.http
    this.numCtx = opts.numCtx ?? 24576 // room for name lists + 3 correction rounds; ≈13 GB VRAM with qwen3:14b
    this.label = `Ollama ${opts.model}`
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    let res
    const request = () =>
      this.http({
        method: 'POST',
        url: `${this.url}/api/chat`,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: false,
          think: false,
          ...(opts.schema ? { format: opts.schema } : {}),
          options: { temperature: opts.temperature ?? 0.4, num_ctx: this.numCtx },
        }),
      })
    try {
      res = await request()
    } catch {
      // one retry: a dropped connection (e.g. while the model is swapped in VRAM) is usually transient
      try {
        await new Promise((r) => setTimeout(r, 2000))
        res = await request()
      } catch (e) {
        throw new LlmError(`Lokales LLM nicht erreichbar (${(e as Error).message}). Läuft es? → npm run llm -- start`)
      }
    }
    if (res.status === 404) throw new LlmError(`Modell „${this.model}“ ist nicht geladen → npm run llm -- pull ${this.model}`)
    if (res.status >= 400) throw new LlmError(`LLM-Fehler HTTP ${res.status}: ${res.text.slice(0, 200)}`)
    const data = JSON.parse(res.text)
    return String(data.message?.content ?? '')
  }

  /** Models available locally. */
  async models(): Promise<string[]> {
    const res = await this.http({ method: 'GET', url: `${this.url}/api/tags`, headers: {} })
    if (res.status >= 400) throw new LlmError(`HTTP ${res.status}`)
    return (JSON.parse(res.text).models ?? []).map((m: { name: string }) => m.name)
  }
}
