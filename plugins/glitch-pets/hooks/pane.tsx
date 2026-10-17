// The crew pane's drawing, from plain data. register.tsx hands it the elements and
// the two actions (open or close a group, show a member's transcript).
//
// Desktop: a lead row (the pet at 2×, its status, the crew's time on the right),
// cost and token chips, then Running and Finished as accordion groups, each member
// a block that lights on hover and opens its transcript when pressed. Every block has
// a fixed height, so a row's top is known exactly: the reward overlay (one Svg laid
// over the pane) lands on its receiver.
// Terminal: one header line, the lead's line, one aligned line per running member,
// and the finished members folded into one line a Button expands.
import type { RenderElement, RenderNode } from 'claude-code'

import type { CrewRow } from './behavior/crew'
import type { Box as PxBox } from './behavior/reward'
import { rungLabel } from './behavior/tiers'
import type { Sprite } from './behavior/types'

export type CrewGroup = 'running' | 'finished'

export type CrewMember = {
  row: CrewRow
  /** The member's small picture (its crew theme's frame); null draws none (and never on the terminal). */
  mini: Sprite | null
  /** The gift it keeps once its reward has played (or was skipped); null for none. */
  badge: Sprite | null
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
  /** Cells the desktop's sprite column takes: the crew theme's width at MINI_PIXEL. */
  miniColumns: number
  /** The reward moment's overlay while it plays (desktop), placed at (left, top) CSS px; the lead's own sprite steps aside meanwhile. */
  reward: { svg: string; width: number; height: number; left: number; top: number; alt: string } | null
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
/** The terminal's progress column never takes more than this. */
const PROGRESS_MAX = 40
/** A translucent grey, so the hover and chip fills read on light and dark. */
const HOVER_BG = '#80808024'
const CHIP_BG = '#80808018'

/** CSS px per pixel of a crew member's mini in the pane. */
export const MINI_PIXEL = 2
/** A pet's own columns in a mini (a theme may draw more beside it): where the gift lands. */
const PET_COLUMNS = 16

/**
 * The desktop's cell in CSS px (its code font's advance and line height), for laying images
 * against the cell grid. An estimate: the surface does not say.
 */
export const DESKTOP_CELL = { width: 7, height: 18 } as const
const CELL_PX = DESKTOP_CELL.width

/** Fixed heights (cells) of the desktop's blocks, so a row's top is exact: the reward overlay lands on it. */
export const DESKTOP_ROWS = { lead: 3, totals: 1, header: 2, tally: 1, member: 4, steppedUp: 1, gap: 1 } as const
/** A member block's left padding (cells): where its mini starts. */
const MEMBER_PAD = 1

export type DesktopLayoutInput = { rows: readonly CrewRow['status'][]; open: Record<CrewGroup, boolean>; steppedUp: readonly boolean[] }

/**
 * Where each member's block sits on the desktop, in cells from the pane's top (null while
 * its group is folded), and its fixed height. Indexes follow the input rows; `order` is the
 * drawn order (running first, then finished).
 */
export function desktopLayout(i: DesktopLayoutInput): { tops: (number | null)[]; heights: number[]; order: number[] } {
  const R = DESKTOP_ROWS
  const heights = i.rows.map((_, n) => R.member + (i.steppedUp[n] ? R.steppedUp : 0))
  const tops: (number | null)[] = i.rows.map(() => null)
  const order: number[] = []
  let y = R.lead + R.gap + R.totals
  for (const kind of ['running', 'finished'] as const) {
    const ids = i.rows.map((s, n) => ({ s, n })).filter(x => (x.s === 'running') === (kind === 'running')).map(x => x.n)
    if (!ids.length) continue
    y += R.gap + R.header
    if (kind === 'finished') y += R.gap + R.tally
    if (!i.open[kind]) continue
    y += R.gap
    ids.forEach((n, j) => {
      if (j > 0) y += R.gap
      tops[n] = y
      order.push(n)
      y += heights[n] as number
    })
  }
  return { tops, heights, order }
}

const layoutOf = (v: Pick<CrewView, 'rows' | 'open'>) =>
  desktopLayout({ rows: v.rows.map(m => m.row.status), open: v.open, steppedUp: v.rows.map(m => !!m.row.steppedUpFrom) })

/**
 * The lead's slot (cells): a member's padding, its sprite column and the gutter after it. The
 * lead sits at its right end, so its rod tip (pixel columns 14-15) is over the gutter and the
 * reward's line drops between the minis and the text.
 */
const leadSlotOf = (miniColumns: number) => MEMBER_PAD + Math.max(1, miniColumns) + 1

/**
 * Where the reward moment for row `rowId` is drawn on the desktop, in CSS px from the pane's
 * top-left (rewardOverlay's input): null when the row is not drawn (its group folded).
 */
export function rewardGeometry(
  v: Pick<CrewView, 'rows' | 'open' | 'lead' | 'miniColumns'>,
  rowId: string,
): { receiverIndex: number; rowTop: (i: number) => number; leadBox: PxBox; mini: { left: number; width: number; height: number } } | null {
  const at = v.rows.findIndex(m => m.row.id === rowId)
  const lead = v.lead.sprite
  if (at < 0 || !lead) return null
  const { tops, order } = layoutOf(v)
  const receiverIndex = order.indexOf(at)
  if (receiverIndex < 0) return null
  const mini = v.rows[at]?.mini
  return {
    receiverIndex,
    rowTop: i => ((tops[order[i] as number] ?? 0) as number) * DESKTOP_CELL.height,
    leadBox: { left: Math.max(0, leadSlotOf(v.miniColumns) * CELL_PX - lead.width), top: 0, width: lead.width, height: lead.height },
    mini: { left: MEMBER_PAD * CELL_PX, width: PET_COLUMNS * MINI_PIXEL, height: mini?.height ?? 13 * MINI_PIXEL },
  }
}

/**
 * The kept gift laid where the reward left it (overlapping the pet's right side, resting on the
 * mini's bottom), as one image the size of the sprite column, so nothing jumps when the moment ends.
 */
function placedBadge(badge: Sprite, columnPx: number, miniHeight: number): Sprite {
  const x = PET_COLUMNS * MINI_PIXEL - badge.width * 0.6
  const y = Math.max(0, miniHeight - badge.height)
  const inner = badge.source.replace('<svg ', `<svg x="${x}" y="${y}" `)
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${columnPx}" height="${miniHeight}" viewBox="0 0 ${columnPx} ${miniHeight}">${inner}</svg>`,
    alt: badge.alt,
    width: columnPx,
    height: miniHeight,
  }
}

/** The overlay at whole cells: its px offset rounded down, the remainder drawn inside a wider image. */
function onCellGrid(r: NonNullable<CrewView['reward']>): { svg: string; width: number; height: number; left: number; top: number; alt: string } {
  const left = Math.floor(r.left / CELL_PX)
  const top = Math.floor(r.top / DESKTOP_CELL.height)
  const dx = r.left - left * CELL_PX
  const dy = r.top - top * DESKTOP_CELL.height
  if (dx === 0 && dy === 0) return { ...r, left, top }
  const width = r.width + dx
  const height = r.height + dy
  const inner = r.svg.replace('<svg ', `<svg x="${dx}" y="${dy}" `)
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`, width, height, left, top, alt: r.alt }
}

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
/** A hover group name: 1 to 64 plain characters. */
const scopeOf = (id: string) => `crew-${id.replace(/[^\w-]/g, '_')}`.slice(0, 64)
/** "Haiku · low": the rung a stepped-up member failed on. */
const fromLabel = (r: CrewRow): string | null => (r.steppedUpFrom ? rungLabel({ model: r.steppedUpFrom.model, effort: r.steppedUpFrom.effort as never }) : null)

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
  // The alt is a prop, never markup: the words as they are.
  return { source, alt: label, width, height: PILL_HEIGHT }
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
const FAMILY = /(haiku|sonnet|opus|fable)/i
const SHORT_EFFORT: Record<string, string> = { medium: 'med' }
/** The desktop chip's words, short enough for a 40-cell dock: "Sonnet med", "Opus xhigh". */
export const chipModel = (r: CrewRow): string => {
  const fam = r.model ? FAMILY.exec(r.model)?.[1] : undefined
  const name = fam ? fam.charAt(0).toUpperCase() + fam.slice(1).toLowerCase() : shortModel(r.model)
  return `${name}${r.effort ? ` ${SHORT_EFFORT[r.effort] ?? r.effort}` : ''}`
}
/** The lead row's time column (cells): "12:34" over "so far". */
const LEAD_TIME_CELLS = 6

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
  const progW = Math.min(PROGRESS_MAX, Math.max(4, ...shown.map(m => progress(m).length)))
  function progress(m: CrewMember): string {
    if (m.row.status !== 'running') return m.row.status === 'done' ? 'done' : 'failed'
    if (!m.steps) return `${m.row.tools} steps`
    if (narrow) return `${m.steps.n}/${m.steps.of}`
    const f = Math.round(fractionOf(m) * 8)
    return `${'█'.repeat(f)}${'░'.repeat(8 - f)} ${m.steps.n}/${m.steps.of}`
  }
  const line = (m: CrewMember) => {
    const from = fromLabel(m.row)
    return (
      <B key={`crew-line:${m.row.id}`} flexDirection="row" columnGap={1}>
        <B width={1} flexShrink={0}>
          <T color={statusColor(m.row)}>{glyph(m.row)}</T>
        </B>
        <B width={nameW} flexShrink={0} overflow="hidden">
          <Btn key={`crew-open:${m.row.id}`} plain label={nameOf(m.row)} onPress={() => act.view(m.row.id)} />
        </B>
        <B flexGrow={1} flexShrink={1} minWidth={0}>
          {/* A retry says, compactly, the rung it stepped up from. */}
          <T wrap="truncate-end">
            {from ? <T dimColor>{`↑ ${from} · `}</T> : null}
            {m.row.description}
          </T>
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
        <B width={progW} flexShrink={0} overflow="hidden">
          <T color={statusColor(m.row)} wrap="truncate-end">{progress(m)}</T>
        </B>
      </B>
    )
  }
  // A tight body counts with the row glyphs, so the cost and the time still fit.
  const counts = tight
    ? `Crew ● ${running.length} ✓ ${done}${failed ? ` ✗ ${failed}` : ''}`
    : `Crew · ${running.length} running · ${done} done${failed ? ` · ${failed} failed` : ''}`
  const head = `${counts} · ${usd(v.header.cost)}${narrow ? '' : ` · ${k(v.header.tokens)} tok`} · ${clock(v.header.elapsedMs)}`
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
          {/* The glyph and the Button keep their room; the words truncate. */}
          <B flexShrink={0}>
            <T color={failed ? 'error' : 'success'}>{failed ? '✗' : '✓'}</T>
          </B>
          <B flexShrink={1} minWidth={0}>
            <T dimColor wrap="truncate-end">{`${finished.length} finished · ${done} completed · ${failed} failed`}</T>
          </B>
          <B flexShrink={0}>
            <Btn key="crew-finished" label={v.open.finished ? 'Hide' : 'Show'} onPress={() => act.toggle('finished')} />
          </B>
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
  const R = DESKTOP_ROWS
  const running = v.rows.filter(m => m.row.status === 'running')
  const finished = v.rows.filter(m => m.row.status !== 'running')
  const total = v.rows.length
  const done = finished.filter(m => m.row.status === 'done').length
  const failed = finished.length - done
  const layout = layoutOf(v)
  const heightOf = (m: CrewMember) => layout.heights[v.rows.indexOf(m)] ?? R.member
  // With the pet off there are no minis and no sprite column.
  const miniCols = Math.max(0, v.miniColumns)
  const spriteCells = miniCols > 0 ? miniCols + 1 : 0
  // Images sized to the body: the pill beside the sprite column, the bar beside a header.
  const pillPx = clamp((v.bodyColumns - 12 - spriteCells) * CELL_PX, 80, 260)
  const barPx = clamp((v.bodyColumns - 18) * CELL_PX, 40, 220)
  const img = (s: Sprite) => (S ? <S source={s.source} alt={s.alt} width={s.width} height={s.height} /> : null)
  const chip = (text: string, dim = false, key?: string) => (
    <B key={key} backgroundColor={CHIP_BG} paddingX={1} flexShrink={0}>
      <T dimColor={dim} wrap="truncate-end">{text}</T>
    </B>
  )

  // The details column's cells: what is left beside the padding, the sprite column and its gap.
  const detailCells = v.bodyColumns - 2 * MEMBER_PAD - spriteCells
  const member = (m: CrewMember) => {
    const id = m.row.id
    const scope = scopeOf(id)
    const rung = fromLabel(m.row)
    const from = rung ? (`↑ stepped up from ${rung}`.length <= detailCells ? `↑ stepped up from ${rung}` : `↑ from ${rung}`) : null
    return (
      <B key={`crew-member:${id}`} flexDirection="row" columnGap={1} paddingX={MEMBER_PAD} height={heightOf(m)} overflow="hidden" hover={{ backgroundColor: HOVER_BG, scope }}>
        {/* The sprite column and the details column are two Boxes, so the details keep their width. */}
        {miniCols > 0 ? (
          <B key={`crew-mini:${id}`} flexShrink={0} width={miniCols}>
            {m.mini ? img(m.mini) : null}
            {m.badge && m.mini ? (
              <B key={`crew-badge:${id}`} position="absolute" top={0} left={0}>
                {img(placedBadge(m.badge, miniCols * CELL_PX, m.mini.height))}
              </B>
            ) : null}
          </B>
        ) : null}
        <B flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <B flexDirection="row" justifyContent="space-between" columnGap={1} height={1}>
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
          {from ? (
            <T dimColor wrap="truncate-end">
              {from}
            </T>
          ) : null}
          <B flexDirection="row" columnGap={1} alignItems="center" height={1}>
            {img(pillSvg(m, pillPx))}
            <B key={`crew-pill-label:${id}`} flexShrink={0}>
              <T color={statusColor(m.row)} bold>
                {pillLabel(m)}
              </T>
            </B>
          </B>
          <B key={`crew-chips:${id}`} flexDirection="row" flexWrap="nowrap" columnGap={1} overflow="hidden" height={1}>
            {/* Short words, so the three fit a 40-cell dock: "Sonnet med", "≈$0.06", "18k". */}
            {chip(chipModel(m.row))}
            {chip(usd(m.cost), true)}
            {chip(k(m.row.tokens), true, `crew-chip-tok:${id}`)}
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
      <B key={`crew-acc-wrap:${kind}`} flexDirection="column" rowGap={R.gap}>
        <B key={`crew-acc-box:${kind}`} flexDirection="row" alignItems="center" columnGap={1} paddingX={1} height={R.header} borderStyle="round" borderDimColor hover={{ backgroundColor: HOVER_BG }}>
          {/* A static dot: a pulse would need an interactive Svg. */}
          {kind === 'running' ? (
            <B key="crew-live" flexShrink={0}>
              <T color="suggestion">●</T>
            </B>
          ) : null}
          {/* One toggle per header (the label and the count); the chevron ends the line and shows its state. */}
          <Btn key={`crew-acc:${kind}`} plain onPress={() => act.toggle(kind)}>
            <T color={kind === 'running' ? 'suggestion' : undefined} dimColor={kind === 'finished'} bold>
              {kind === 'running' ? 'RUNNING' : 'FINISHED'}
            </T>
            <T bold>{` ${items.length}`}</T>
          </Btn>
          <B flexGrow={1} flexShrink={1} minWidth={0}>
            {img(bar)}
          </B>
          <B key={`crew-acc-chev:${kind}`} flexShrink={0}>
            <T dimColor>{open ? '▾' : '▸'}</T>
          </B>
        </B>
        {kind === 'finished' ? (
          <B key="crew-tally" flexDirection="row" columnGap={1} paddingX={1} height={R.tally}>
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
          <B key={`crew-members:${kind}`} flexDirection="column" rowGap={R.gap}>
            {items.map(member)}
          </B>
        ) : null}
      </B>
    )
  }

  // While the reward plays its overlay draws the lead; the lead's slot keeps its room.
  const lead = v.lead.sprite
  const leadSlot = lead ? leadSlotOf(miniCols) : 0
  const leadWords = Math.max(1, v.bodyColumns - (lead ? leadSlot + 1 : 0) - 1 - LEAD_TIME_CELLS)
  // The overlay is placed in whole cells; a left that is not one is made up inside its image.
  const reward = v.reward ? onCellGrid(v.reward) : null
  return (
    <B flexDirection="column" rowGap={R.gap}>
      <B key="crew-lead" flexDirection="row" alignItems="flex-start" columnGap={1} height={R.lead}>
        {lead ? (
          <B key="crew-lead-sprite" flexShrink={0} width={leadSlot} flexDirection="row" justifyContent="flex-end">
            {v.reward ? null : img(lead)}
          </B>
        ) : null}
        {/* The words have their own width and truncate, so they never run into the time. */}
        <B key="crew-lead-words" flexDirection="column" width={leadWords} flexShrink={0} overflow="hidden">
          <T bold wrap="truncate-end">{v.lead.name}</T>
          <T dimColor wrap="truncate-end">{v.lead.status}</T>
        </B>
        <B key="crew-lead-time" flexDirection="column" alignItems="flex-end" width={LEAD_TIME_CELLS} flexShrink={0}>
          <T bold>{clock(v.header.elapsedMs)}</T>
          <T dimColor>{running.length ? 'so far' : 'total'}</T>
        </B>
      </B>
      <B key="crew-totals" flexDirection="row" columnGap={1} flexWrap="nowrap" height={R.totals}>
        {chip(usd(v.header.cost))}
        {chip(`${k(v.header.tokens)} tok`)}
      </B>
      {running.length ? group('running', running) : null}
      {finished.length ? group('finished', finished) : null}
      {reward && S ? (
        <B key="crew-reward" position="absolute" top={reward.top} left={reward.left}>
          <S source={reward.svg} alt={reward.alt} width={reward.width} height={reward.height} />
        </B>
      ) : null}
    </B>
  )
}
