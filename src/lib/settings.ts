// Coach settings: which local CLI agent answers, with which model and thinking level.
// Stored in localStorage and read on every coach request.

export type Agent = 'claude' | 'codex' | 'custom'

export type AgentConfig = { model: string; effort: string }

export type CoachSettings = {
  agent: Agent
  claude: AgentConfig
  codex: AgentConfig
  custom: AgentConfig & { command: string }
}

export const AGENT_LABEL: Record<Agent, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  custom: 'Custom',
}

export const CLAUDE_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1', 'claude-haiku-4-5']

/** Thinking levels each agent understands. An empty value means the agent's own default. */
export const EFFORTS: Record<Agent, string[]> = {
  claude: ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['low', 'medium', 'high', 'xhigh', 'max'],
  custom: ['low', 'medium', 'high'],
}

export const DEFAULT_SETTINGS: CoachSettings = {
  agent: 'claude',
  claude: { model: 'claude-sonnet-5-5', effort: 'medium' },
  codex: { model: '', effort: 'low' },
  custom: { model: '', effort: '', command: '' },
}

const KEY = 'chess-coach:settings'

export function loadSettings(): CoachSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SETTINGS
    const s = JSON.parse(raw) as Partial<CoachSettings>
    return {
      agent: s.agent ?? DEFAULT_SETTINGS.agent,
      claude: { ...DEFAULT_SETTINGS.claude, ...s.claude },
      codex: { ...DEFAULT_SETTINGS.codex, ...s.codex },
      custom: { ...DEFAULT_SETTINGS.custom, ...s.custom },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: CoachSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Not critical; settings fall back to defaults next time.
  }
}

/** The fields sent to /api/coach for the active agent. */
export function requestFields(s: CoachSettings) {
  const cfg = s[s.agent]
  return {
    agent: s.agent,
    model: cfg.model.trim() || undefined,
    effort: cfg.effort || undefined,
    command: s.agent === 'custom' ? s.custom.command : undefined,
  }
}

export function describeSettings(s: CoachSettings) {
  const cfg = s[s.agent]
  const model = cfg.model.trim() || 'default model'
  return `${AGENT_LABEL[s.agent]} · ${model}${cfg.effort ? ` · ${cfg.effort}` : ''}`
}
