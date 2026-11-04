// Cloud mode with OpenAI (official SDK, Responses API with function tools – newer models only allow
// tools together with reasoning there, not in Chat Completions). Stateless: store=false, the history
// incl. encrypted reasoning is sent back each turn. Tools, prompts and checks: agent.ts.
import OpenAI from 'openai'
import type { FunctionTool, Response, ResponseCreateParamsNonStreaming, ResponseFunctionToolCall, ResponseInputItem } from 'openai/resources/responses/responses'
import { systemPrompt, toolSpecs, ToolRunner, userPrompt, type CloudOptions, type CloudResult } from './agent.ts'
import type { GenerateInput } from './generate.ts'
import type { PageStore } from './pages.ts'

/** what the generator needs from the SDK – injectable for tests */
export type CreateResponse = (params: ResponseCreateParamsNonStreaming) => Promise<Response>

export function openaiClient(apiKey: string | undefined, fetchFn?: typeof fetch): CreateResponse {
  // dangerouslyAllowBrowser: the Obsidian plugin runs in Electron's renderer; the key is the user's own.
  const client = new OpenAI({ ...(apiKey ? { apiKey } : {}), fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return (params) => client.responses.create(params)
}

/** reasoning models take reasoning_effort; others reject it */
export const isReasoningModel = (model: string) => /^(o\d|gpt-5|gpt-6)/i.test(model) && !/chat-latest/.test(model)

/** Checks the key and lists usable chat models (free). */
export async function checkOpenAI(apiKey: string, fetchFn?: typeof fetch): Promise<string[]> {
  try {
    const client = new OpenAI({ apiKey, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 0 })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    // chat models that can use function tools in the Responses API (no audio/realtime/image/codex/pro-only/live)
    return ids.filter((id) => /^(gpt-|o\d)/.test(id) && !/audio|realtime|transcribe|tts|image|search|instruct|codex|live|-pro|^gpt-3|^gpt-4-|^gpt-4$|\d{4}-\d{2}-\d{2}/.test(id)).sort()
  } catch (e) {
    throw explainOpenAI(e)
  }
}

export function explainOpenAI(e: unknown): Error {
  if (e instanceof OpenAI.AuthenticationError) return new Error('OpenAI-Schlüssel ungültig – in den Einstellungen prüfen (platform.openai.com → API keys).')
  if (e instanceof OpenAI.PermissionDeniedError) return new Error('Kein Zugriff auf dieses Modell mit diesem Schlüssel.')
  if (e instanceof OpenAI.NotFoundError) return new Error('Modell nicht gefunden – in den Einstellungen „Prüfen“ zeigt die verfügbaren Modelle.')
  if (e instanceof OpenAI.RateLimitError) return new Error('OpenAI: zu viele Anfragen oder Guthaben aufgebraucht – Konto prüfen.')
  if (e instanceof OpenAI.APIConnectionError) return new Error('Keine Verbindung zu OpenAI – Internet prüfen.')
  if (e instanceof OpenAI.APIError) return new Error(`OpenAI-Fehler ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export async function generateNpcOpenAI(
  create: CreateResponse,
  pages: PageStore,
  input: GenerateInput,
  opts: CloudOptions,
  onStep?: (msg: string) => void
): Promise<CloudResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)
  const maxTurns = opts.maxTurns ?? 16
  const tools: FunctionTool[] = toolSpecs(pages, input.art).map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: true }))
  const reasoning = isReasoningModel(opts.model)
  const runner = new ToolRunner(pages, input, step)
  const history: ResponseInputItem[] = [{ role: 'user', content: userPrompt(input) }]
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let nudged = false

  for (let turn = 0; turn < maxTurns; turn++) {
    step(turn === 0 ? 'OpenAI liest die Beschreibung …' : `OpenAI arbeitet … (${runner.lookups} Nachschlagen)`)
    let res: Response
    try {
      res = await create({
        model: opts.model,
        instructions: systemPrompt(pages),
        input: history,
        tools,
        store: false,
        max_output_tokens: 16000,
        ...(reasoning ? { reasoning: { effort: opts.effort ?? 'medium' }, include: ['reasoning.encrypted_content'] } : {}),
      })
    } catch (e) {
      throw explainOpenAI(e)
    }
    const cached = res.usage?.input_tokens_details?.cached_tokens ?? 0
    tokens.input += (res.usage?.input_tokens ?? 0) - cached
    tokens.cacheRead += cached
    tokens.output += res.usage?.output_tokens ?? 0

    if (res.error) throw new Error(`OpenAI-Fehler: ${res.error.message}`)
    if (res.status === 'incomplete') {
      const why = res.incomplete_details?.reason
      throw new Error(why === 'content_filter' ? 'OpenAI hat die Antwort gefiltert. Beschreibung umformulieren und erneut versuchen.' : 'Die Antwort war zu lang. Bitte erneut versuchen.')
    }
    for (const item of res.output) {
      if (item.type === 'message') for (const c of item.content) if (c.type === 'refusal') throw new Error(`OpenAI hat abgelehnt: ${c.refusal}`)
    }
    history.push(...(res.output as ResponseInputItem[]))

    const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === 'function_call')
    if (!calls.length) {
      if (runner.last || nudged) break
      nudged = true
      history.push({ role: 'user', content: 'Bitte gib das Ergebnis jetzt mit nsc_abgeben bzw. kreatur_abgeben ab.' })
      continue
    }
    let done = false
    for (const call of calls) {
      let args: unknown
      try {
        args = JSON.parse(call.arguments || '{}')
      } catch {
        history.push({ type: 'function_call_output', call_id: call.call_id, output: 'Fehler: Argumente sind kein gültiges JSON.' })
        continue
      }
      const out = runner.run(call.name, args)
      history.push({ type: 'function_call_output', call_id: call.call_id, output: out.isError ? `FEHLER – ${out.content}` : out.content })
      done ||= out.done
    }
    if (done) break
  }
  return runner.result(t0, tokens, undefined)
}
