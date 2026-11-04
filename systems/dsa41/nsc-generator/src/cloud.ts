// Cloud mode with Claude (Anthropic SDK). Tools, prompts and checks: agent.ts.
import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessage, BetaMessageParam, BetaTool, BetaToolResultBlockParam, BetaToolUseBlock, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { systemPrompt, toolSpecs, ToolRunner, userPrompt, type CloudOptions, type CloudResult } from './agent.ts'
import type { GenerateInput } from './generate.ts'
import type { PageStore } from './pages.ts'

export * from './agent.ts'

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (beste Qualität)', input: 4, output: 20, cacheRead: 0.2 },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (gut, günstiger)', input: 2, output: 10, cacheRead: 0.2 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (schnell, sehr günstig)', input: 0.1, output: 0.5, cacheRead: 0.01 },
] as const

/** what the generator needs from the SDK – injectable for tests */
export type CreateMessage = (params: MessageCreateParamsNonStreaming) => Promise<BetaMessage>

/** apiKey undefined → the SDK's usual chain (ANTHROPIC_API_KEY, `ant auth login` profile) – for the CLI tools */
export function claudeClient(apiKey: string | undefined, fetchFn?: typeof fetch): CreateMessage {
  // dangerouslyAllowBrowser: the Obsidian plugin runs in Electron's renderer; the key is the user's own.
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}), fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return (params) => client.beta.messages.create(params)
}

/** Checks key and model without generating anything (the models endpoint is free). */
export async function checkClaude(apiKey: string, model: string, fetchFn?: typeof fetch): Promise<string> {
  try {
    const client = new Anthropic({ apiKey, fetch: fetchFn, dangerouslyAllowBrowser: true, maxRetries: 0 })
    const m = await client.models.retrieve(model)
    return `verbunden, Modell ${m.display_name ?? model} verfügbar`
  } catch (e) {
    throw explain(e)
  }
}

/** API errors in plain German */
export function explain(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError) return new Error('API-Schlüssel ungültig – in den Einstellungen prüfen (console.anthropic.com → API Keys).')
  if (e instanceof Anthropic.PermissionDeniedError) return new Error('Kein Zugriff auf dieses Modell mit diesem Schlüssel.')
  if (e instanceof Anthropic.NotFoundError) return new Error('Modell nicht gefunden – Modellname in den Einstellungen prüfen.')
  if (e instanceof Anthropic.RateLimitError) return new Error('Zu viele Anfragen oder Guthaben/Limit erreicht – kurz warten oder Konto prüfen.')
  if (e instanceof Anthropic.APIConnectionError) return new Error('Keine Verbindung zu Anthropic – Internet prüfen.')
  if (e instanceof Anthropic.APIError) return new Error(`Anthropic-Fehler ${e.status ?? ''}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

export async function generateNpcClaude(
  create: CreateMessage,
  pages: PageStore,
  input: GenerateInput,
  opts: CloudOptions,
  onStep?: (msg: string) => void
): Promise<CloudResult> {
  const t0 = Date.now()
  const step = (m: string) => onStep?.(m)
  const maxTurns = opts.maxTurns ?? 16
  const tools: BetaTool[] = toolSpecs(pages, input.art).map((t) => ({ name: t.name, description: t.description, strict: true, input_schema: t.parameters as BetaTool['input_schema'] }))
  const system = systemPrompt(pages)
  const fallback = /opus|sonnet/.test(opts.model)
  const runner = new ToolRunner(pages, input, step)
  const messages: BetaMessageParam[] = [{ role: 'user', content: userPrompt(input) }]
  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  let nudged = false

  for (let turn = 0; turn < maxTurns; turn++) {
    step(turn === 0 ? 'Claude liest die Beschreibung …' : `Claude arbeitet … (${runner.lookups} Nachschlagen)`)
    let res: BetaMessage
    try {
      res = await create({
        model: opts.model,
        max_tokens: 16000,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
        cache_control: { type: 'ephemeral' }, // caches the growing conversation between turns
        thinking: { type: 'adaptive' },
        output_config: { effort: opts.effort ?? 'medium' },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
    } catch (e) {
      throw explain(e)
    }
    tokens.input += res.usage.input_tokens
    tokens.output += res.usage.output_tokens
    tokens.cacheRead += res.usage.cache_read_input_tokens ?? 0
    tokens.cacheWrite += res.usage.cache_creation_input_tokens ?? 0

    if (res.stop_reason === 'refusal') throw new Error('Claude hat die Anfrage abgelehnt. Beschreibung umformulieren und erneut versuchen.')
    if (res.stop_reason === 'max_tokens') throw new Error('Claudes Antwort war zu lang (max_tokens). Bitte erneut versuchen.')
    messages.push({ role: 'assistant', content: res.content })
    if (res.stop_reason === 'pause_turn') continue

    const calls = res.content.filter((b): b is BetaToolUseBlock => b.type === 'tool_use')
    if (!calls.length) {
      if (runner.last || nudged) break
      nudged = true
      messages.push({ role: 'user', content: 'Bitte gib das Ergebnis jetzt mit nsc_abgeben bzw. kreatur_abgeben ab.' })
      continue
    }
    const results: BetaToolResultBlockParam[] = []
    let done = false
    for (const call of calls) {
      const out = runner.run(call.name, call.input)
      results.push({ type: 'tool_result', tool_use_id: call.id, content: out.content, ...(out.isError ? { is_error: true } : {}) })
      done ||= out.done
    }
    messages.push({ role: 'user', content: results })
    if (done) break
  }
  const price = CLAUDE_MODELS.find((m) => m.id === opts.model)
  const dollars = price ? (tokens.input * price.input + tokens.cacheWrite * price.input * 1.25 + tokens.cacheRead * price.cacheRead + tokens.output * price.output) / 1e6 : undefined
  return runner.result(t0, tokens, dollars)
}
