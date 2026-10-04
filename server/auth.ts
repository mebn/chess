// Password protection for the backend. The password lives in .env as APP_PASSWORD.
//   POST /api/login    {password} -> sets a signed, HttpOnly session cookie
//   GET  /api/session  200 when the cookie is valid (or no password is configured), else 401
//   POST /api/logout   clears the cookie
// Every other /api/* route requires a valid session.
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

try {
  process.loadEnvFile('.env')
} catch {
  // No .env file; rely on the real environment.
}

const COOKIE = 'chess_session'
const SESSION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_FAILURES = 5
const LOCKOUT_MS = 15 * 60 * 1000

const password = () => process.env.APP_PASSWORD ?? ''
const key = () => createHmac('sha256', 'chess-coach-session').update(process.env.SESSION_SECRET || password()).digest()
const sign = (data: string) => createHmac('sha256', key()).update(data).digest('base64url')

function safeEqual(a: string, b: string) {
  const ha = createHmac('sha256', 'cmp').update(a).digest()
  const hb = createHmac('sha256', 'cmp').update(b).digest()
  return timingSafeEqual(ha, hb)
}

/** With no APP_PASSWORD set (local development) protection is off. */
export const authEnabled = () => password().length > 0

function sessionToken() {
  const expires = String(Date.now() + SESSION_MS)
  return `${expires}.${sign(expires)}`
}

function readCookie(req: IncomingMessage, name: string) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}

export function isAuthed(req: IncomingMessage) {
  if (!authEnabled()) return true
  const [expires, mac] = readCookie(req, COOKIE).split('.')
  if (!expires || !mac || !safeEqual(mac, sign(expires))) return false
  return Number(expires) > Date.now()
}

const failures = new Map<string, { count: number; until: number }>()

function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAgeSec: number) {
  const secure = (req.socket as { encrypted?: boolean }).encrypted || req.headers['x-forwarded-proto'] === 'https'
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`,
  )
}

async function readJson(req: IncomingMessage): Promise<{ password?: unknown }> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > 4096) throw new Error('too large')
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** Handles the auth routes. Returns true when the request was answered here. */
export async function handleAuth(req: IncomingMessage, res: ServerResponse, url: string): Promise<boolean> {
  if (url === '/api/session' && req.method === 'GET') {
    res.statusCode = isAuthed(req) ? 200 : 401
    res.end()
    return true
  }
  if (url === '/api/logout' && req.method === 'POST') {
    setCookie(req, res, '', 0)
    res.end()
    return true
  }
  if (url === '/api/login' && req.method === 'POST') {
    const ip = req.socket.remoteAddress ?? 'unknown'
    const state = failures.get(ip)
    if (state && state.count >= MAX_FAILURES && state.until > Date.now()) {
      res.statusCode = 429
      res.end('Too many attempts. Try again later.')
      return true
    }
    let given = ''
    try {
      const body = await readJson(req)
      if (typeof body.password === 'string') given = body.password
    } catch {
      res.statusCode = 400
      res.end('Bad request')
      return true
    }
    if (authEnabled() && safeEqual(given, password())) {
      failures.delete(ip)
      setCookie(req, res, sessionToken(), SESSION_MS / 1000)
      res.end()
    } else {
      failures.set(ip, { count: (state && state.until > Date.now() ? state.count : 0) + 1, until: Date.now() + LOCKOUT_MS })
      res.statusCode = 401
      res.end('Wrong password')
    }
    return true
  }
  return false
}
