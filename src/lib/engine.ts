// Thin wrapper around a Stockfish web worker speaking UCI.
// Requests are queued so only one search runs at a time per engine.

export type Score = { type: 'cp' | 'mate'; value: number }

export type EngineLine = {
  score: Score // from the side to move's perspective
  pv: string[] // moves in UCI notation, e.g. "e2e4"
  depth: number
}

export type SearchResult = {
  bestMove: string | null
  lines: EngineLine[] // sorted by multipv rank
}

export type SearchOptions = {
  depth?: number
  movetime?: number
  multiPV?: number
  /** Raw UCI options to set before searching, e.g. { 'Skill Level': 5 } */
  setOptions?: Record<string, string | number | boolean>
}

const WORKER_URL = '/stockfish/stockfish-19-lite-single.js'

export class Engine {
  private worker: Worker
  private listeners = new Set<(line: string) => void>()
  private queue: Promise<unknown>
  private currentOptions: Record<string, string> = {}

  constructor() {
    this.worker = new Worker(WORKER_URL)
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data)
      for (const l of this.listeners) l(line)
    }
    this.queue = this.init()
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  private waitFor(predicate: (line: string) => boolean, onLine?: (line: string) => void) {
    return new Promise<string>((resolve) => {
      const listener = (line: string) => {
        onLine?.(line)
        if (predicate(line)) {
          this.listeners.delete(listener)
          resolve(line)
        }
      }
      this.listeners.add(listener)
    })
  }

  private async init() {
    const ok = this.waitFor((l) => l === 'uciok')
    this.send('uci')
    await ok
    await this.ready()
  }

  private async ready() {
    const ok = this.waitFor((l) => l === 'readyok')
    this.send('isready')
    await ok
  }

  private setOption(name: string, value: string | number | boolean) {
    const v = String(value)
    if (this.currentOptions[name] === v) return
    this.currentOptions[name] = v
    this.send(`setoption name ${name} value ${v}`)
  }

  search(fen: string, opts: SearchOptions = {}): Promise<SearchResult> {
    const run = async (): Promise<SearchResult> => {
      const multiPV = opts.multiPV ?? 1
      for (const [k, v] of Object.entries(opts.setOptions ?? {})) this.setOption(k, v)
      this.setOption('MultiPV', multiPV)
      await this.ready()

      const lines = new Map<number, EngineLine>()
      const parseInfo = (line: string) => {
        if (!line.startsWith('info') || !line.includes(' pv ')) return
        const t = line.split(' ')
        const depth = Number(t[t.indexOf('depth') + 1])
        const mpvIdx = t.indexOf('multipv')
        const rank = mpvIdx >= 0 ? Number(t[mpvIdx + 1]) : 1
        const sIdx = t.indexOf('score')
        if (sIdx < 0) return
        const score: Score = { type: t[sIdx + 1] as 'cp' | 'mate', value: Number(t[sIdx + 2]) }
        const pv = t.slice(t.indexOf('pv') + 1)
        lines.set(rank, { score, pv, depth })
      }

      const done = this.waitFor((l) => l.startsWith('bestmove'), parseInfo)
      this.send(`position fen ${fen}`)
      if (opts.movetime) this.send(`go movetime ${opts.movetime}`)
      else this.send(`go depth ${opts.depth ?? 12}`)
      const best = (await done).split(' ')[1]

      return {
        bestMove: best && best !== '(none)' ? best : null,
        lines: [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l),
      }
    }
    const result = this.queue.then(run, run)
    this.queue = result.catch(() => undefined)
    return result
  }

  /** Abort the running search; it resolves early with the best move found so far. */
  stop() {
    this.send('stop')
  }

  terminate() {
    this.worker.terminate()
  }
}
