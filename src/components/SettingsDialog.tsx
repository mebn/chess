import { useEffect, useState } from 'react'
import { useHotkeys } from '../hooks/useHotkeys'
import { Key } from './Key'
import Markdown from 'react-markdown'
import { streamCoach } from '../lib/coach'
import { AGENT_LABEL, CLAUDE_MODELS, EFFORTS, type Agent, type CoachSettings } from '../lib/settings'

type AgentInfo = {
  claude: { installed: boolean; defaultModel: string }
  codex: { installed: boolean; models: string[] }
}

type Props = {
  dark: boolean
  onToggleDark: () => void
  settings: CoachSettings
  onSave: (s: CoachSettings) => void
  onClose: () => void
}

const AGENTS: Agent[] = ['claude', 'codex', 'custom']
const TEST_PROMPT = 'Reply with one short sentence: why is 1. e4 a good first move?'

export function SettingsDialog({ dark, onToggleDark, settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<CoachSettings>(settings)
  const [info, setInfo] = useState<AgentInfo | null>(null)
  const [test, setTest] = useState<{ status: 'idle' | 'running' | 'done' | 'error'; text: string }>({ status: 'idle', text: '' })

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [])

  const agent = draft.agent
  const cfg = draft[agent]
  const update = (patch: Partial<CoachSettings['custom']>) => {
    setDraft((d) => ({ ...d, [agent]: { ...d[agent], ...patch } }))
    setTest({ status: 'idle', text: '' })
  }

  const modelSuggestions = agent === 'claude' ? CLAUDE_MODELS : agent === 'codex' ? info?.codex.models ?? [] : []
  const notInstalled = agent !== 'custom' && info && !info[agent].installed

  const runTest = () => {
    setTest({ status: 'running', text: '' })
    streamCoach(TEST_PROMPT, (text) => setTest({ status: 'running', text }), undefined, draft)
      .then((text) => setTest({ status: text.includes('_The coach is unavailable') ? 'error' : 'done', text }))
      .catch((e) => setTest({ status: 'error', text: String(e.message ?? e) }))
  }

  useHotkeys({ escape: onClose, d: onToggleDark, t: test.status === 'running' ? undefined : runTest })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <h3 className="section-title">Appearance</h3>
        <button className="setting-row" role="switch" aria-checked={dark} onClick={onToggleDark}>
          <span>Dark mode<Key k="D" /></span>
          <span className={`switch ${dark ? 'on' : ''}`} aria-hidden />
        </button>

        <h3 className="section-title">Coach</h3>
        <p className="muted small">The coach runs a CLI agent on this machine using its own login.</p>

        <div className="field">
          <span className="field-label">Agent</span>
          <div className="segmented">
            {AGENTS.map((a) => (
              <button
                key={a}
                className={agent === a ? 'on' : ''}
                onClick={() => {
                  setDraft((d) => ({ ...d, agent: a }))
                  setTest({ status: 'idle', text: '' })
                }}
              >
                {AGENT_LABEL[a]}
              </button>
            ))}
          </div>
          {notInstalled && <span className="field-hint warn">`{agent}` was not found on your PATH.</span>}
        </div>

        {agent === 'custom' && (
          <label className="field">
            <span className="field-label">Command</span>
            <textarea
              rows={2}
              value={draft.custom.command}
              onChange={(e) => update({ command: e.target.value })}
              placeholder="e.g. gemini -m {model}   or   ollama run llama3"
              spellCheck={false}
            />
            <span className="field-hint">
              Runs in your shell. The prompt is sent on stdin and everything printed to stdout is shown as the answer.
              Use <code>{'{model}'}</code> and <code>{'{effort}'}</code> to insert the values below.
            </span>
          </label>
        )}

        <label className="field">
          <span className="field-label">Model</span>
          <input
            list="model-suggestions"
            value={cfg.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder={agent === 'claude' ? info?.claude.defaultModel ?? 'claude-sonnet-5-5' : 'Default model'}
            spellCheck={false}
          />
          <datalist id="model-suggestions">
            {modelSuggestions.map((m) => <option key={m} value={m} />)}
          </datalist>
          <span className="field-hint">Leave empty to use the agent's default.</span>
        </label>

        <label className="field">
          <span className="field-label">Thinking level</span>
          <select value={cfg.effort} onChange={(e) => update({ effort: e.target.value })}>
            <option value="">Default</option>
            {EFFORTS[agent].map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <span className="field-hint">Higher levels give deeper explanations but answer more slowly.</span>
        </label>

        {test.status !== 'idle' && (
          <div className={`test-result ${test.status}`}>
            {test.text ? <Markdown>{test.text}</Markdown> : <div className="typing"><span /><span /><span /></div>}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn subtle" onClick={runTest} disabled={test.status === 'running'}>
            {test.status === 'running' ? 'Testing…' : 'Test'}<Key k="T" />
          </button>
          <span className="spacer" />
          <button className="btn subtle" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(draft)}>Save</button>
        </div>
      </div>
    </div>
  )
}
