// The crew pane's drawing, from plain data. register.tsx hands it the elements.
import type { RenderElement, RenderNode } from 'claude-code'

import type { CrewRow } from './behavior/crew'
import type { MoodId, Sprite } from './behavior/types'

export type CrewView = {
  lead: { name: string; mood: MoodId; sprite: Sprite | null }
  rows: { row: CrewRow; mini: Sprite | null; cost: number; progress: number }[]
  header: { cost: number; tokens: number; elapsedMs: number }
  isTerminal: boolean
  /** The engine's clock (ms), for a running helper's elapsed time. */
  now: number
}

type El = { Box: (p: never) => RenderNode; Text: (p: never) => RenderNode; Svg: ((p: never) => RenderNode) | null }

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const usd = (n: number) => `≈$${n.toFixed(2)}`
const shortModel = (m: string | null) =>
  m ? m.replace(/^claude-/, '').replace(/-(\d+)-(\d+).*$/, ' $1.$2').replace(/^\w/, c => c.toUpperCase()) : '—'
const bar = (p: number) => '▰'.repeat(Math.round(p * 4)) + '▱'.repeat(4 - Math.round(p * 4))

export function crewTree(v: CrewView, el: El): RenderElement {
  const B = el.Box as unknown as (p: Record<string, unknown>) => RenderElement
  const T = el.Text as unknown as (p: Record<string, unknown>) => RenderElement
  // No pet is drawn in the terminal.
  const S = (v.isTerminal ? null : el.Svg) as unknown as ((p: Record<string, unknown>) => RenderNode) | null
  const running = v.rows.filter(r => r.row.status === 'running')
  const finished = v.rows.filter(r => r.row.status !== 'running')
  const line = (r: CrewView['rows'][number]) => {
    const mark = r.row.status === 'done' ? ' ✓' : r.row.status === 'failed' ? ' ✗' : ''
    const who = v.isTerminal ? `${r.row.role} · ` : ''
    const took = clock((r.row.endedAt ?? v.now) - r.row.startedAt)
    return (
      <B key={r.row.id} flexDirection="row" columnGap={1}>
        {S && r.mini ? <S source={r.mini.source} alt={r.mini.alt} width={r.mini.width} height={r.mini.height} /> : null}
        <B flexDirection="column" flexGrow={1}>
          <T bold>{`${r.row.description}${mark}`}</T>
          <T dimColor>{`${who}${r.row.tier} · ${shortModel(r.row.model)} · ${r.row.effort ?? '—'}   ${k(r.row.tokens)} tok ${usd(r.cost)} ${took}${r.row.status === 'running' ? `  ${bar(r.progress)}` : ''}`}</T>
        </B>
      </B>
    )
  }
  const done = finished.filter(r => r.row.status === 'done').length
  return (
    <B flexDirection="column" rowGap={1}>
      <T dimColor>{`${usd(v.header.cost)} · ${k(v.header.tokens)} tok · ${clock(v.header.elapsedMs)}`}</T>
      <B key="lead" flexDirection="row" columnGap={1}>
        {S && v.lead.sprite ? <S source={v.lead.sprite.source} alt={v.lead.sprite.alt} width={v.lead.sprite.width} height={v.lead.sprite.height} /> : null}
        <T bold>{`${v.lead.name} · lead · ${v.lead.mood}`}</T>
      </B>
      {running.length ? <T>{`Running · ${running.length}`}</T> : null}
      {running.map(line)}
      {finished.length ? <T>{`Finished · ${finished.length}`}</T> : null}
      {running.length === 0 && finished.length > 3 ? <T dimColor>{`${done} done, ${finished.length - done} failed`}</T> : finished.map(line)}
    </B>
  )
}
