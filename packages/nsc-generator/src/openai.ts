// Cloud mode with OpenAI (official SDK, Chat Completions with function calling). Tools, prompts
// and checks are shared with the Claude mode: agent.ts.
import OpenAI from 'openai'
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions/completions'
import { systemPrompt, toolSpecs, ToolRunner, userPrompt, type CloudOptions, type CloudResult } from './agent.ts'
import type { GenerateInput } from './generate.ts'
import type { PageStore } from './pages.ts'

/** what the generator needs from the SDK – injectable for tests */
export type CreateCompletion = (params: ChatCompletionCreateParamsNonStreaming) => Promise<ChatCompletion>

export function openaiClient(apiKey: string | undefined, fetchFn?: typeof fetch): CreateCompletion {
  // dangerouslyAllowBrowser: the Obsidian plugin runs in Electron's renderer; the key is the user's own.
  const client = new OpenAI({ ...(apiKey ? { apiKey } : {}), fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return (params) => client.chat.completions.create(params)
}

/** reasoning models take reasoning_effort; others reject it */
export const isReasoningModel = (model: string) => /^(o\d|gpt-5)/i.test(model)

/** Checks the key and lists usable chat models (free). */
export async function checkOpenAI(apiKey: string, fetchFn?: typeof fetch): Promise<string[]> {
  try {
    const client = new OpenAI({ apiKey, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 0 })
    const ids: string[] = []
    for await (const m of client.models.list()) ids.push(m.id)
    return ids.filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id) && !/audio|realtime|transcribe|tts|image|search|instruct/.test(id)).sort()
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
  create: CreateCompletion,
  pages: PageStore,
  input: GenerateInput,
  opts: CloudOptions,
  onStep?: (msg: string) => void
): Promise<CloudResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)
  const maxTurns = opts.maxTurns ?? 16
  const tools: ChatCompletionTool[] = toolSpecs(pages).map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters, strict: true } }))
  const runner = new ToolRunner(pages, input, step)
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt(pages) },
    { role: 'user', content: userPrompt(input) },
  ]
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let nudged = false

  for (let turn = 0; turn < maxTurns; turn++) {
    step(turn === 0 ? 'OpenAI liest die Beschreibung …' : `OpenAI arbeitet … (${runner.lookups} Nachschlagen)`)
    let res: ChatCompletion
    try {
      res = await create({
        model: opts.model,
        messages,
        tools,
        parallel_tool_calls: true,
        max_completion_tokens: 16000,
        ...(isReasoningModel(opts.model) ? { reasoning_effort: opts.effort ?? 'medium' } : {}),
      })
    } catch (e) {
      throw explainOpenAI(e)
    }
    const cached = res.usage?.prompt_tokens_details?.cached_tokens ?? 0
    tokens.input += (res.usage?.prompt_tokens ?? 0) - cached
    tokens.cacheRead += cached
    tokens.output += res.usage?.completion_tokens ?? 0

    const choice = res.choices[0]
    if (!choice) throw new Error('OpenAI hat keine Antwort geliefert.')
    if (choice.finish_reason === 'content_filter') throw new Error('OpenAI hat die Antwort gefiltert. Beschreibung umformulieren und erneut versuchen.')
    if (choice.finish_reason === 'length') throw new Error('Die Antwort war zu lang. Bitte erneut versuchen.')
    const msg = choice.message
    if (msg.refusal) throw new Error(`OpenAI hat abgelehnt: ${msg.refusal}`)
    messages.push({ role: 'assistant', content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) })

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === 'function')
    if (!calls.length) {
      if (runner.last || nudged) break
      nudged = true
      messages.push({ role: 'user', content: 'Bitte gib den NSC jetzt mit nsc_abgeben ab.' })
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
