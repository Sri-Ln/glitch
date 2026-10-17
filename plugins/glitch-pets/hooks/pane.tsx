// The crew pane's drawing, from plain data. register.tsx hands it the elements and
// the two actions (open or close a group, show a member's transcript).
//
// Desktop: a lead row (the pet at 2×, its status, the crew's time on the right),
// cost and token chips, then Running and Finished as accordion groups, each member
// a block that lights on hover and opens its transcript when pressed.
// Terminal: one header line, the lead's line, one aligned line per running member,
// and the finished members folded into one line a Button expands.
import type { RenderElement, RenderNode } from 'claude-code'

import type { CrewRow } from './behavior/crew'
import type { Sprite } from './behavior/types'

export type CrewGroup = 'running' | 'finished'

export type CrewMember = {
  row: CrewRow
  /** The member's small picture; null draws none (and never on the terminal). */
  mini: Sprite | null
  cost: number
  /** Steps done of the expected total while running; null without a yardstick. */
  steps: { n: number; of: number } | null
}

export type CrewView = {
  /** `status` is the lead's line, worded by the caller. */
  lead: { name: string; status: string; sprite: Sprite | null }
  rows: CrewMember[]
  header: { cost: number; tokens: number; elapsedMs: number }
  isTerminal: boolean
  /** The engine's clock (ms), for a running member's elapsed time. */
  now: number
  /** Cells across the pane's body, for sizing the bars. */
  bodyColumns: number
  /** Which groups are open (on the terminal only `finished` folds). */
  open: Record<CrewGroup, boolean>
}

export type CrewActions = {
  toggle: (group: CrewGroup) => unknown
  view: (agentId: string) => unknown
}

type Ctor = (p: never) => RenderNode
type El = { Box: Ctor; Text: Ctor; Button: Ctor; Svg: Ctor | null }

/**
 * Fill colors of the progress pill and the group bars: mid shades that read on light
 * and dark (an image cannot follow the theme), over a translucent track. The pill's
 * words are theme text beside it, never drawn into the image.
 */
export const PILL_COLOR = { running: '#2f7cf6', done: '#1f9d55', failed: '#d64040' } as const
const TRACK = '#808080'
const PILL_HEIGHT = 8
/** Under this many body cells the terminal rows drop the tokens, the effort and the bar glyphs; */
export const NARROW_COLUMNS = 70
/** under this many, the model too (the desktop-sized dock, about 40 cells). */
export const TIGHT_COLUMNS = 56
/** A translucent grey, so the hover and chip fills read on light and dark. */
const HOVER_BG = '#80808024'
const CHIP_BG = '#80808018'
/** Rough CSS px per cell on the desktop, for sizing images to the body. */
const CELL_PX = 7

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const usd = (n: number) => `≈$${n.toFixed(2)}`
const shortModel = (m: string | null) =>
  m ? m.replace(/^claude-/, '').replace(/-(\d+)-(\d+).*$/, ' $1.$2').replace(/^\w/, c => c.toUpperCase()) : '—'
const nameOf = (r: CrewRow) => r.name ?? r.role
const tookOf = (r: CrewRow, now: number) => clock((r.endedAt ?? now) - r.startedAt)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
/** A hover group name: 1 to 64 plain characters. */
const scopeOf = (id: string) => `crew-${id.replace(/[^\w-]/g, '_')}`.slice(0, 64)

/** The pill's words: n/m steps while running, else Done or Failed. */
export function pillLabel(m: CrewMember): string {
  if (m.row.status === 'done') return 'Done'
  if (m.row.status === 'failed') return 'Failed'
  return m.steps ? `${m.steps.n}/${m.steps.of} steps` : `${m.row.tools} steps`
}

const fractionOf = (m: CrewMember): number =>
  m.row.status !== 'running' ? 1 : m.steps ? clamp(m.steps.n / m.steps.of, 0, 1) : 0.5

/** The progress pill's bar: a translucent rounded track and a fill in the status color. */
export function pillSvg(m: CrewMember, width: number): Sprite {
  const label = pillLabel(m)
  const color = PILL_COLOR[m.row.status]
  const r = PILL_HEIGHT / 2
  const fill = Math.round(fractionOf(m) * width)
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_HEIGHT}" viewBox="0 0 ${width} ${PILL_HEIGHT}">` +
    `<rect width="${width}" height="${PILL_HEIGHT}" rx="${r}" fill="${TRACK}" fill-opacity="0.25"/>` +
    (fill > 0 ? `<rect width="${Math.max(PILL_HEIGHT, fill)}" height="${PILL_HEIGHT}" rx="${r}" fill="${color}" fill-opacity="0.85"/>` : '') +
    `</svg>`
  return { source, alt: esc(label), width, height: PILL_HEIGHT }
}

/** A group header's thin bar: running members in blue, or completed green then failed red. */
function groupBarSvg(parts: { share: number; color: string }[], width: number, alt: string): Sprite {
  let x = 0
  const fills = parts.map(p => {
    const w = Math.round(clamp(p.share, 0, 1) * width)
    const s = w > 0 ? `<rect x="${x}" width="${w}" height="4" fill="${p.color}"/>` : ''
    x += w
    return s
  })
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="4" viewBox="0 0 ${width} 4"><rect width="${width}" height="4" rx="2" fill="${TRACK}" fill-opacity="0.25"/>${fills.join('')}</svg>`,
    alt,
    width,
    height: 4,
  }
}

const statusColor = (r: CrewRow) => (r.status === 'done' ? 'success' : r.status === 'failed' ? 'error' : 'suggestion')
const glyph = (r: CrewRow) => (r.status === 'done' ? '✓' : r.status === 'failed' ? '✗' : '●')
const modelEffort = (r: CrewRow, sep: string) => `${shortModel(r.model)}${r.effort ? `${sep}${r.effort}` : ''}`

export function crewTree(v: CrewView, el: El, act: CrewActions): RenderElement {
  return v.isTerminal ? terminalTree(v, el, act) : desktopTree(v, el, act)
}

type Make = (p: Record<string, unknown>) => RenderElement

function terminalTree(v: CrewView, el: El, act: CrewActions): RenderElement {
  const B = el.Box as unknown as Make
  const T = el.Text as unknown as Make
  const Btn = el.Button as unknown as Make
  const running = v.rows.filter(m => m.row.status === 'running')
  const finished = v.rows.filter(m => m.row.status !== 'running')
  const done = finished.filter(m => m.row.status === 'done').length
  const failed = finished.length - done
  const shown = [...running, ...(v.open.finished ? finished : [])]
  // A narrow body (a desktop-sized dock) keeps the status, name, task, model, cost,
  // time and the step count; the token column and the bar glyphs go.
  const narrow = v.bodyColumns < NARROW_COLUMNS
  const tight = v.bodyColumns < TIGHT_COLUMNS
  const nameW = Math.min(tight ? 10 : narrow ? 12 : 16, Math.max(4, ...shown.map(m => nameOf(m.row).length)))
  const modelW = Math.min(narrow ? 10 : 18, Math.max(4, ...shown.map(m => (narrow ? shortModel(m.row.model) : modelEffort(m.row, ' ')).length)))
  const tokW = Math.max(3, ...shown.map(m => k(m.row.tokens).length))
  const costW = Math.max(5, ...shown.map(m => usd(m.cost).length))
  const progW = Math.max(4, ...shown.map(m => progress(m).length))
  function progress(m: CrewMember): string {
    if (m.row.status !== 'running') return m.row.status === 'done' ? 'done' : 'failed'
    if (!m.steps) return `${m.row.tools} steps`
    if (narrow) return `${m.steps.n}/${m.steps.of}`
    const f = Math.round(fractionOf(m) * 8)
    return `${'█'.repeat(f)}${'░'.repeat(8 - f)} ${m.steps.n}/${m.steps.of}`
  }
  const line = (m: CrewMember) => (
    <B key={`crew-line:${m.row.id}`} flexDirection="row" columnGap={1}>
      <B width={1} flexShrink={0}>
        <T color={statusColor(m.row)}>{glyph(m.row)}</T>
      </B>
      <B width={nameW} flexShrink={0} overflow="hidden">
        <Btn key={`crew-open:${m.row.id}`} plain label={nameOf(m.row)} onPress={() => act.view(m.row.id)} />
      </B>
      <B flexGrow={1} flexShrink={1} minWidth={0}>
        <T wrap="truncate-end">{m.row.description}</T>
      </B>
      {tight ? null : (
        <B width={modelW} flexShrink={0} flexDirection="row" columnGap={1} overflow="hidden">
          <T wrap="truncate-end">{shortModel(m.row.model)}</T>
          {m.row.effort && !narrow ? <T dimColor>{m.row.effort}</T> : null}
        </B>
      )}
      {narrow ? null : (
        <B key={`crew-tok:${m.row.id}`} width={tokW} flexShrink={0} justifyContent="flex-end">
          <T>{k(m.row.tokens)}</T>
        </B>
      )}
      <B width={costW} flexShrink={0} justifyContent="flex-end">
        <T>{usd(m.cost)}</T>
      </B>
      <B width={5} flexShrink={0} justifyContent="flex-end">
        <T dimColor>{tookOf(m.row, v.now)}</T>
      </B>
      <B width={progW} flexShrink={0}>
        <T color={statusColor(m.row)}>{progress(m)}</T>
      </B>
    </B>
  )
  const head = `Crew · ${running.length} running · ${done} done${failed ? ` · ${failed} failed` : ''} · ${usd(v.header.cost)}${narrow ? '' : ` · ${k(v.header.tokens)} tok`} · ${clock(v.header.elapsedMs)}`
  return (
    <B flexDirection="column">
      <B key="crew-head">
        <T bold wrap="truncate-end">{head}</T>
      </B>
      <B key="crew-lead">
        <T dimColor wrap="truncate-end">{`${v.lead.name} · ${v.lead.status}`}</T>
      </B>
      {running.map(line)}
      {finished.length ? (
        <B key="crew-fold" flexDirection="row" columnGap={1}>
          <T color={failed ? 'error' : 'success'}>{failed ? '✗' : '✓'}</T>
          <T dimColor>{`${finished.length} finished · ${done} completed · ${failed} failed`}</T>
          <Btn key="crew-finished" label={v.open.finished ? 'Hide' : 'Show'} onPress={() => act.toggle('finished')} />
        </B>
      ) : null}
      {v.open.finished ? finished.map(line) : null}
    </B>
  )
}

function desktopTree(v: CrewView, el: El, act: CrewActions): RenderElement {
  const B = el.Box as unknown as Make
  const T = el.Text as unknown as Make
  const Btn = el.Button as unknown as Make
  const S = el.Svg as unknown as Make | null
  const running = v.rows.filter(m => m.row.status === 'running')
  const finished = v.rows.filter(m => m.row.status !== 'running')
  const total = v.rows.length
  const done = finished.filter(m => m.row.status === 'done').length
  const failed = finished.length - done
  // Images sized to the body: the pill beside a 24 px sprite, the bar beside a header.
  const pillPx = clamp((v.bodyColumns - 20) * CELL_PX, 80, 260)
  const barPx = clamp((v.bodyColumns - 18) * CELL_PX, 40, 220)
  const img = (s: Sprite) => (S ? <S source={s.source} alt={s.alt} width={s.width} height={s.height} /> : null)
  const chip = (text: string, dim = false) => (
    <B backgroundColor={CHIP_BG} paddingX={1} flexShrink={0}>
      <T dimColor={dim} wrap="truncate-end">{text}</T>
    </B>
  )

  const member = (m: CrewMember) => {
    const id = m.row.id
    const scope = scopeOf(id)
    return (
      <B key={`crew-member:${id}`} flexDirection="row" columnGap={1} paddingX={1} hover={{ backgroundColor: HOVER_BG, scope }}>
        {/* The sprite column and the details column are two Boxes, so the details keep their width. */}
        <B flexShrink={0} width={4}>
          {m.mini ? img(m.mini) : null}
        </B>
        <B flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <B flexDirection="row" justifyContent="space-between" columnGap={1}>
            <B flexDirection="row" flexShrink={1} minWidth={0} alignItems="center">
              {m.row.status === 'running' ? null : <T color={statusColor(m.row)} bold>{`${glyph(m.row)} `}</T>}
              <Btn key={`crew-open:${id}`} plain label={nameOf(m.row)} onPress={() => act.view(id)} />
              <B key={`crew-hint-box:${id}`} display="none" hover={{ display: 'flex', scope }} marginLeft={1}>
                <Btn key={`crew-hint:${id}`} plain label="Open ↗" onPress={() => act.view(id)} />
              </B>
            </B>
            <T dimColor>{tookOf(m.row, v.now)}</T>
          </B>
          <T wrap="truncate-end">{m.row.description}</T>
          <B flexDirection="row" columnGap={1} alignItems="center">
            {img(pillSvg(m, pillPx))}
            <B key={`crew-pill-label:${id}`} flexShrink={0}>
              <T color={statusColor(m.row)} bold>
                {pillLabel(m)}
              </T>
            </B>
          </B>
          <B key={`crew-chips:${id}`} flexDirection="row" flexWrap="nowrap" columnGap={1} overflow="hidden">
            {chip(modelEffort(m.row, ' · '))}
            {chip(`${k(m.row.tokens)} tok`, true)}
            {chip(usd(m.cost), true)}
          </B>
        </B>
      </B>
    )
  }

  const group = (kind: CrewGroup, items: CrewMember[]) => {
    const open = v.open[kind]
    const bar =
      kind === 'running'
        ? groupBarSvg([{ share: items.length / Math.max(1, total), color: PILL_COLOR.running }], barPx, `${items.length} of ${total} at work`)
        : groupBarSvg(
            [
              { share: done / Math.max(1, total), color: PILL_COLOR.done },
              { share: failed / Math.max(1, total), color: PILL_COLOR.failed },
            ],
            barPx,
            `${done} completed, ${failed} failed of ${total}`,
          )
    return (
      <B key={`crew-acc-wrap:${kind}`} flexDirection="column" rowGap={1}>
        <B key={`crew-acc-box:${kind}`} flexDirection="row" alignItems="center" columnGap={1} paddingX={1} borderStyle="round" borderDimColor hover={{ backgroundColor: HOVER_BG }}>
          {/* A static dot: a pulse would need an interactive Svg. */}
          {kind === 'running' ? (
            <B key="crew-live" flexShrink={0}>
              <T color="suggestion">●</T>
            </B>
          ) : null}
          <Btn key={`crew-acc:${kind}`} plain onPress={() => act.toggle(kind)}>
            <T color={kind === 'running' ? 'suggestion' : undefined} dimColor={kind === 'finished'} bold>
              {kind === 'running' ? 'RUNNING' : 'FINISHED'}
            </T>
            <T bold>{` ${items.length}`}</T>
          </Btn>
          <B flexGrow={1} flexShrink={1} minWidth={0}>
            {img(bar)}
          </B>
          <Btn key={`crew-acc-chev:${kind}`} plain dimColor label={open ? '▾' : '▸'} onPress={() => act.toggle(kind)} />
        </B>
        {kind === 'finished' ? (
          <B key="crew-tally" flexDirection="row" columnGap={1} paddingX={1}>
            <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
              <T>{`${total} tasks`}</T>
            </B>
            <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
              <T color="success">{`${done} completed`}</T>
            </B>
            <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
              <T color={failed ? 'error' : undefined} dimColor={!failed}>{`${failed} failed`}</T>
            </B>
          </B>
        ) : null}
        {open ? (
          <B key={`crew-members:${kind}`} flexDirection="column" rowGap={1}>
            {items.map(member)}
          </B>
        ) : null}
      </B>
    )
  }

  return (
    <B flexDirection="column" rowGap={1}>
      <B key="crew-lead" flexDirection="row" justifyContent="space-between" alignItems="center" columnGap={1}>
        <B flexDirection="row" columnGap={1} alignItems="center" flexShrink={1} minWidth={0}>
          {v.lead.sprite ? <B flexShrink={0}>{img(v.lead.sprite)}</B> : null}
          <B flexDirection="column" flexShrink={1} minWidth={0}>
            <T bold>{v.lead.name}</T>
            <T dimColor>{v.lead.status}</T>
          </B>
        </B>
        <B flexDirection="column" alignItems="flex-end" flexShrink={0}>
          <T bold>{clock(v.header.elapsedMs)}</T>
          <T dimColor>{running.length ? 'so far' : 'total'}</T>
        </B>
      </B>
      <B key="crew-totals" flexDirection="row" columnGap={1} flexWrap="nowrap">
        {chip(usd(v.header.cost))}
        {chip(`${k(v.header.tokens)} tok`)}
      </B>
      {running.length ? group('running', running) : null}
      {finished.length ? group('finished', finished) : null}
    </B>
  )
}
