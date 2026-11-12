// Cloud mode with DeepSeek: OpenAI-compatible Chat Completions (DeepSeek has no Responses API), via the
// official openai SDK with DeepSeek's base URL. Stateless: the whole history goes along each turn.
// In thinking mode the assistant message carries reasoning_content, which must be sent back while the
// model is still calling tools – pushing the message unchanged does that. Tools, prompts, checks: agent.ts.
import OpenAI from 'openai'
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { systemPrompt, toolSpecs, ToolRunner, userPrompt, type CloudOptions, type CloudResult } from './agent.ts'
import type { GenerateInput } from './generate.ts'
import type { PageStore } from './pages.ts'

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

/** fallback list when "Prüfen" was not run yet; the real list comes from GET /models */
export const DEEPSEEK_MODELS = ['deepseek-chat', 'deepseek-reasoner']

/** what the generator needs from the SDK – injectable for tests */
export type CreateChat = (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>

/** apiKey undefined → DEEPSEEK_API_KEY from the environment (CLI tools) */
export function deepseekClient(apiKey: string | undefined, fetchFn?: typeof fetch): CreateChat {
  const key = apiKey ?? (typeof process !== 'undefined' ? process.env.DEEPSEEK_API_KEY : undefined)
  // dangerouslyAllowBrowser: the Obsidian plugin runs in Electron's renderer; the key is the user's own.
  const client = new OpenAI({ apiKey: key ?? '', baseURL: DEEPSEEK_BASE_URL, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return (params) => client.chat.completions.create(params)
}

/** Checks the key and lists the models (free). */
export async function checkDeepSeek(apiKey: string, fetchFn?: typeof fetch): Promise<string[]> {
  try {
    const client = new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 0 })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids.sort()
  } catch (e) {
    throw explainDeepSeek(e)
  }
}

export function explainDeepSeek(e: unknown): Error {
  if (e instanceof OpenAI.AuthenticationError) return new Error('DeepSeek-Schlüssel ungültig – in den Einstellungen prüfen (platform.deepseek.com → API keys).')
  if (e instanceof OpenAI.PermissionDeniedError) return new Error('Kein Zugriff auf dieses Modell mit diesem Schlüssel.')
  if (e instanceof OpenAI.NotFoundError) return new Error('Modell nicht gefunden – in den Einstellungen „Prüfen“ zeigt die verfügbaren Modelle.')
  if (e instanceof OpenAI.RateLimitError) return new Error('DeepSeek: zu viele Anfragen – kurz warten und erneut versuchen.')
  if (e instanceof OpenAI.APIConnectionError) return new Error('Keine Verbindung zu DeepSeek – Internet prüfen.')
  // 402 = Guthaben aufgebraucht
  if (e instanceof OpenAI.APIError && e.status === 402) return new Error('DeepSeek: Guthaben aufgebraucht – Konto aufladen.')
  if (e instanceof OpenAI.APIError) return new Error(`DeepSeek-Fehler ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export async function generateNpcDeepSeek(
  create: CreateChat,
  pages: PageStore,
  input: GenerateInput,
  opts: CloudOptions,
  onStep?: (msg: string) => void
): Promise<CloudResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)
  const maxTurns = opts.maxTurns ?? 16
  // no `strict`: DeepSeek only accepts it on its beta endpoint and with a reduced schema subset;
  // malformed arguments are caught by the ToolRunner and reported back to the model
  const tools: ChatCompletionTool[] = toolSpecs(pages, input.art).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
  const runner = new ToolRunner(pages, input, step)
  // system prompt first and unchanged every turn → DeepSeek's automatic prefix cache hits
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(pages) },
    { role: 'user', content: userPrompt(input) },
  ]
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let nudged = false

  for (let turn = 0; turn < maxTurns; turn++) {
    step(turn === 0 ? 'DeepSeek liest die Beschreibung …' : `DeepSeek arbeitet … (${runner.lookups} Nachschlagen)`)
    let res: ChatCompletion
    try {
      res = await create({ model: opts.model, messages, tools, max_tokens: 8000 })
    } catch (e) {
      throw explainDeepSeek(e)
    }
    const usage = res.usage as (ChatCompletion['usage'] & { prompt_cache_hit_tokens?: number }) | undefined
    const hit = usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0
    tokens.input += (usage?.prompt_tokens ?? 0) - hit
    tokens.cacheRead += hit
    tokens.output += usage?.completion_tokens ?? 0

    const choice = res.choices[0]
    if (!choice) throw new Error('DeepSeek hat keine Antwort geliefert. Bitte erneut versuchen.')
    if (choice.finish_reason === 'length') throw new Error('Die Antwort war zu lang. Bitte erneut versuchen.')
    if (choice.finish_reason === 'content_filter') throw new Error('DeepSeek hat die Antwort gefiltert. Beschreibung umformulieren und erneut versuchen.')
    const msg = choice.message
    // unchanged, incl. reasoning_content (thinking mode needs it back during tool calls)
    messages.push(msg as ChatCompletionMessageParam)

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function')
    if (!calls.length) {
      if (runner.last || nudged) break
      nudged = true
      messages.push({ role: 'user', content: 'Bitte gib das Ergebnis jetzt mit nsc_abgeben bzw. kreatur_abgeben ab.' })
      continue
    }
    let done = false
    for (const call of calls) {
      let args: unknown
      try {
        args = JSON.parse(call.function.arguments || '{}')
      } catch {
        messages.push({ role: 'tool', tool_call_id: call.id, content: 'Fehler: Argumente sind kein gültiges JSON.' })
        continue
      }
      const out = runner.run(call.function.name, args)
      messages.push({ role: 'tool', tool_call_id: call.id, content: out.isError ? `FEHLER – ${out.content}` : out.content })
      done ||= out.done
    }
    if (done) break
  }
  return runner.result(t0, tokens, undefined)
}
