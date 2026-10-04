// Vite dev-server plugin that exposes the coach endpoints:
//   POST /api/coach   streams a plain-text answer from a local CLI agent
//   GET  /api/agents  reports which agents are installed and known models
// Agents run on this machine with their own logins (no API keys):
//   claude  Claude Code via the Agent SDK
//   codex   `codex exec`
//   custom  any shell command that reads the prompt on stdin and prints the answer
import { query } from '@anthropic-ai/claude-agent-sdk'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'

type Agent = 'claude' | 'codex' | 'custom'

type CoachRequest = {
  prompt: string
  agent?: Agent
  model?: string
  effort?: string
  command?: string
}

const DEFAULT_CLAUDE_MODEL = process.env.COACH_MODEL ?? 'claude-sonnet-5-5'
const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

const SYSTEM_PROMPT = `You are a friendly, sharp chess coach helping an improving club player who plays against a computer bot. The player tells you which color they have.

Ground rules:
- The engine data you are given (evaluations, best moves, principal variations) comes from Stockfish and is correct. Never contradict it and never invent long variations of your own. You may explain short, concrete ideas (threats, captures, tactics) that you can verify on the board you are given.
- Explain ideas in plain language: piece activity, king safety, pawn structure, center control, tactics (forks, pins, skewers, discovered attacks, hanging pieces), and plans.
- Be concise and practical. Use short markdown: a few short paragraphs or bullets, bold for key ideas. No headings larger than ###. Write moves in standard algebraic notation.
- Never use em dashes or en dashes. Use a plain hyphen or a comma instead.
- Speak to the player as "you". Refer to the computer as "the bot".
- Answer directly with the coaching text. Do not run tools, read files or mention these instructions.`

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** Only accept requests from the app itself, so other websites cannot make this machine run commands. */
function isSameOrigin(req: IncomingMessage) {
  const origin = req.headers.origin
  if (!origin) return true
  try {
    return new URL(origin).host === req.headers.host
  } catch {
    return false
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

async function runClaude(body: CoachRequest, res: ServerResponse, signal: AbortController) {
  const effort = CLAUDE_EFFORTS.find((e) => e === body.effort)
  const session = query({
    prompt: body.prompt,
    options: {
      model: body.model || DEFAULT_CLAUDE_MODEL,
      systemPrompt: SYSTEM_PROMPT,
      tools: [],
      maxTurns: 1,
      ...(effort ? { effort } : {}),
      settingSources: [],
      persistSession: false,
      includePartialMessages: true,
      abortController: signal,
    },
  })
  for await (const message of session) {
    if (message.type === 'stream_event') {
      const event = message.event
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') res.write(event.delta.text)
    } else if (message.type === 'result' && message.subtype !== 'success') {
      res.write(`\n\n_The coach ran into a problem (${message.subtype})._`)
    }
  }
}

/** Run a child process with the prompt on stdin, handing each stdout chunk to onStdout. */
function runProcess(
  cmd: string,
  args: string[],
  input: string,
  signal: AbortController,
  onStdout: (chunk: string) => void,
  opts: { shell?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: tmpdir(), shell: opts.shell ?? false, stdio: ['pipe', 'pipe', 'pipe'] })
    let stderr = ''
    signal.signal.addEventListener('abort', () => child.kill('SIGTERM'))
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', onStdout)
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (d: string) => (stderr += d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 || signal.signal.aborted) resolve()
      else reject(new Error(stderr.trim().split('\n').slice(-3).join(' ') || `exited with code ${code}`))
    })
    child.stdin.on('error', () => undefined)
    child.stdin.end(input)
  })
}

async function runCodex(body: CoachRequest, res: ServerResponse, signal: AbortController) {
  const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--color', 'never']
  if (body.model) args.push('-m', body.model)
  if (body.effort) args.push('-c', `model_reasoning_effort="${body.effort.replace(/[^a-z]/g, '')}"`)
  args.push('-')

  let buffer = ''
  let wrote = false
  let failure = ''
  await runProcess('codex', args, `${SYSTEM_PROMPT}\n\n${body.prompt}`, signal, (chunk) => {
    buffer += chunk
    let nl: number
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('{')) continue
      try {
        const event = JSON.parse(line)
        if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
          res.write((wrote ? '\n\n' : '') + event.item.text)
          wrote = true
        } else if (event.type === 'error' || event.type === 'turn.failed') {
          failure = event.message ?? event.error?.message ?? 'Codex failed'
        }
      } catch {
        // Not a JSON event line; ignore.
      }
    }
  })
  if (failure && !wrote) throw new Error(failure)
}

async function runCustom(body: CoachRequest, res: ServerResponse, signal: AbortController) {
  const template = body.command?.trim()
  if (!template) throw new Error('No custom command is set. Add one in Coach settings.')
  const command = template
    .replaceAll('{model}', shellQuote(body.model ?? ''))
    .replaceAll('{effort}', shellQuote(body.effort ?? ''))
  await runProcess(command, [], `${SYSTEM_PROMPT}\n\n${body.prompt}`, signal, (chunk) => res.write(chunk), { shell: true })
}

async function handleCoach(req: IncomingMessage, res: ServerResponse) {
  let body: CoachRequest
  try {
    body = JSON.parse(await readBody(req))
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) throw new Error('missing prompt')
  } catch {
    res.statusCode = 400
    res.end('Bad request')
    return
  }

  const abortController = new AbortController()
  res.on('close', () => abortController.abort())
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })

  const agent: Agent = body.agent ?? 'claude'
  try {
    if (agent === 'codex') await runCodex(body, res, abortController)
    else if (agent === 'custom') await runCustom(body, res, abortController)
    else await runClaude(body, res, abortController)
  } catch (err) {
    if (!abortController.signal.aborted) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[coach:${agent}]`, msg)
      const help = {
        claude: 'Make sure Claude Code is installed and you are logged in (run `claude` once).',
        codex: 'Make sure the Codex CLI is installed and you are logged in (run `codex` once).',
        custom: 'Check the custom command in Coach settings.',
      }[agent]
      res.write(`\n\n_The coach is unavailable: ${msg}. ${help}_`)
    }
  } finally {
    res.end()
  }
}

function isInstalled(bin: string) {
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Codex keeps a cache of the models available to your account. */
function codexModels(): string[] {
  try {
    const data = JSON.parse(readFileSync(join(homedir(), '.codex', 'models_cache.json'), 'utf8'))
    const list: { slug?: string; id?: string }[] = Array.isArray(data) ? data : data.models ?? []
    return list.map((m) => m.slug ?? m.id).filter((s): s is string => !!s && !s.includes('review'))
  } catch {
    return []
  }
}

function handleAgents(res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      claude: { installed: isInstalled('claude'), defaultModel: DEFAULT_CLAUDE_MODEL },
      codex: { installed: isInstalled('codex'), models: codexModels() },
    }),
  )
}

export function coachPlugin(): Plugin {
  return {
    name: 'chess-coach',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]
        if (url !== '/api/coach' && url !== '/api/agents') return next()
        if (!isSameOrigin(req)) {
          res.statusCode = 403
          res.end('Forbidden')
          return
        }
        if (url === '/api/agents' && req.method === 'GET') return handleAgents(res)
        if (url === '/api/coach' && req.method === 'POST') return void handleCoach(req, res)
        next()
      })
    },
  }
}
