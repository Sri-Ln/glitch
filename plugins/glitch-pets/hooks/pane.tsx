// The crew pane's drawing, from plain data. register.tsx hands it the elements and
// the two actions (open or close a group, show a member's transcript).
//
// Desktop: a lead row (the pet at 2×, a press target over it, its status, the crew's time on the
// right), rounded cost and token badges, then Running and Finished as accordion groups (each header
// a Button of short words, natural width, beside its colored bar as an Svg; Running's bar is the
// crew's steps done of those planned), each member a block that lights on hover. Every width comes
// from the pane's real bodyColumns: texts are cut with an ellipsis, chips drop by priority. Every
// block has a fixed height.
// Terminal: one header line, the lead's line, one aligned line per running member,
// and the finished members folded into one line a Button expands.
// A member shows its role (roleLabel) with its topic, and below what it is doing now (its
// latest tool call), or its whole topic once it has ended.
import type { RenderElement, RenderNode } from 'claude-code'

import { crewSteps, memberTask } from './behavior/crew'
import type { CrewRow } from './behavior/crew'
import { rungLabel } from './behavior/tiers'
import type { Role, Sprite } from './behavior/types'

export type CrewGroup = 'running' | 'finished'

export type CrewMember = {
  row: CrewRow
  /** The member's small picture (its crew theme's frame; hopping with a sparkle just after it finished); null draws none (and never on the terminal). */
  mini: Sprite | null
  cost: number
  /** Steps done of the planned total while running; null once it has ended. */
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
}

export type CrewActions = {
  toggle: (group: CrewGroup) => unknown
}

type Ctor = (p: never) => RenderNode
/** `Client` draws the press target over the lead (a blank region posting each press); null draws none. */
type El = { Box: Ctor; Text: Ctor; Button: Ctor; Svg: Ctor | null; Client: Ctor | null }

/** The lead's press target's element key (its module is ./lead-poke.tsx; register.tsx hears its posts). */
export const LEAD_POKE = { key: 'crew-lead-poke' } as const

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

/**
 * The desktop's cell in CSS px (its code font's advance and line height), for laying images
 * against the cell grid. An estimate: the surface does not say.
 */
export const DESKTOP_CELL = { width: 7, height: 18 } as const
const CELL_PX = DESKTOP_CELL.width

/** Fixed heights (cells) of the desktop's blocks, so a row's top is exact. */
/**
 * `header` is one line in a round border (2 rows, its live look). A member is its 4 lines and a row of
 * padding above and below (`memberPad`), with no gap between members: the padding spaces them.
 */
export const DESKTOP_ROWS = { lead: 3, totals: 1, header: 2, tally: 1, member: 4, memberPad: 1, steppedUp: 1, gap: 1 } as const
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
  const heights = i.rows.map((_, n) => R.member + 2 * R.memberPad + (i.steppedUp[n] ? R.steppedUp : 0))
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
    ids.forEach(n => {
      tops[n] = y
      order.push(n)
      y += heights[n] as number
    })
  }
  return { tops, heights, order }
}

const layoutOf = (v: Pick<CrewView, 'rows' | 'open'>) =>
  desktopLayout({ rows: v.rows.map(m => m.row.status), open: v.open, steppedUp: v.rows.map(m => !!m.row.steppedUpFrom) })

/** The lead's slot (cells): a member's padding, its sprite column and the gutter after it, so the lead lines up with the minis. */
const leadSlotOf = (miniColumns: number) => MEMBER_PAD + Math.max(1, miniColumns) + 1

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
const usd = (n: number) => `≈$${n.toFixed(2)}`
const shortModel = (m: string | null) =>
  m ? m.replace(/^claude-/, '').replace(/-(\d+)-(\d+).*$/, ' $1.$2').replace(/^\w/, c => c.toUpperCase()) : '—'
/** A member's role in a word ("Researcher"); "Helper" when nothing says which. */
const ROLE_LABEL: Record<Role, string> = { builder: 'Builder', researcher: 'Researcher', designer: 'Designer', tester: 'Tester', reviewer: 'Reviewer', other: 'Helper' }
export const roleLabel = (r: Pick<CrewRow, 'role'>): string => ROLE_LABEL[r.role]
/** The role chip's fill (white words on it), one per role: mid shades that read on light and dark. */
export const ROLE_COLOR: Record<Role, string> = { builder: '#b86e0f', researcher: '#2f6fd0', designer: '#a8448f', tester: '#0f8780', reviewer: '#6a55c8', other: '#5b6b82' }

const ROLE_CHIP = { height: 16, font: 11, padX: 6, glyph: 6.6, radius: 4 } as const
/**
 * The role chip: a rounded rectangle in the role's color with its word in white, drawn as an image
 * (a Box has no rounded corners); the word is fitted to its width, so the chip never cuts it.
 */
export function roleChipSvg(r: Pick<CrewRow, 'role'>): Sprite {
  const word = roleLabel(r)
  const C = ROLE_CHIP
  const text = Math.ceil(cells(word) * C.glyph)
  const width = text + 2 * C.padX
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${C.height}" viewBox="0 0 ${width} ${C.height}">` +
    `<rect width="${width}" height="${C.height}" rx="${C.radius}" fill="${ROLE_COLOR[r.role]}"/>` +
    `<text x="${C.padX}" y="${C.height / 2}" dominant-baseline="central" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="${C.font}" font-weight="600" fill="#ffffff" textLength="${text}" lengthAdjust="spacingAndGlyphs">${word}</text>` +
    `</svg>`
  return { source, alt: word, width, height: C.height }
}
/** What a member is doing now while it runs, else its whole topic. */
export const doingOf = (r: CrewRow): string => (r.status === 'running' ? (r.doing ?? 'Starting…') : memberTask(r))
const tookOf = (r: CrewRow, now: number) => clock((r.endedAt ?? now) - r.startedAt)
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
/** A hover group name: 1 to 64 plain characters. */
const scopeOf = (id: string) => `crew-${id.replace(/[^\w-]/g, '_')}`.slice(0, 64)
/** "Haiku · low": the rung a stepped-up member failed on. */
const fromLabel = (r: CrewRow): string | null => (r.steppedUpFrom ? rungLabel({ model: r.steppedUpFrom.model, effort: r.steppedUpFrom.effort as never }) : null)

/** The pill's words: n/m steps while running, else Done or Failed. */
export function pillLabel(m: CrewMember): string {
  if (m.row.status === 'done') return 'Done'
  // Stopped (the engine's `killed`, or an interrupted run) is not a failure of its own.
  if (m.row.status === 'failed') return m.row.killed ? 'Stopped' : 'Failed'
  return m.steps ? `${m.steps.n}/${m.steps.of} steps` : `${m.row.tools} steps`
}

/** The pill's words in the fewest cells: "1/4", else as pillLabel. */
const shortPillLabel = (m: CrewMember): string => (m.row.status === 'running' ? (m.steps ? `${m.steps.n}/${m.steps.of}` : `${m.row.tools}`) : pillLabel(m))

const cells = (s: string) => Array.from(s).length

/** `s` in at most `n` cells: cut with an ellipsis, never wrapped. */
export function fit(s: string, n: number): string {
  const chars = Array.from(s)
  if (n <= 0) return ''
  return chars.length <= n ? s : `${chars.slice(0, Math.max(0, n - 1)).join('')}…`
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

/** A group header's bar: the translucent track and each share's fill in its status color, side by side. */
export function groupBarSvg(shares: readonly { share: number; color: string }[], width: number, alt: string): Sprite {
  const w = Math.max(1, Math.round(width))
  const r = PILL_HEIGHT / 2
  let x = 0
  let fills = ''
  for (const p of shares) {
    const n = Math.min(w - x, Math.round(clamp(p.share, 0, 1) * w))
    if (n > 0) fills += `<rect x="${x}" width="${n}" height="${PILL_HEIGHT}" fill="${p.color}" fill-opacity="0.85"/>`
    x += n
  }
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${PILL_HEIGHT}" viewBox="0 0 ${w} ${PILL_HEIGHT}">` +
    `<clipPath id="bar"><rect width="${w}" height="${PILL_HEIGHT}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#bar)"><rect width="${w}" height="${PILL_HEIGHT}" fill="${TRACK}" fill-opacity="0.25"/>${fills}</g></svg>`
  return { source, alt, width: w, height: PILL_HEIGHT }
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
/** Under this many body cells the lead's time moves to the totals line, so its words keep room. */
const LEAD_TIME_MIN_COLUMNS = 34
/** A progress pill's bar is drawn only with at least this many cells beside its words. */
const PILL_MIN_CELLS = 4
const PILL_MAX_PX = 260
/** Cells left free beside a Button's words (desktop): a native button's chrome or a wide glyph. */
const BUTTON_SLACK = 2
/** Cells left free at a desktop line's end: its font is proportional, so bold words run wider than their count. */
const LINE_SLACK = 2
/** A group bar is drawn only with at least this many cells beside the header's words. */
const BAR_MIN_CELLS = 4

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
  const nameW = Math.min(tight ? 10 : narrow ? 12 : 16, Math.max(4, ...shown.map(m => roleLabel(m.row).length)))
  const modelW = Math.min(narrow ? 10 : 18, Math.max(4, ...shown.map(m => (narrow ? shortModel(m.row.model) : modelEffort(m.row, ' ')).length)))
  const tokW = Math.max(3, ...shown.map(m => k(m.row.tokens).length))
  const costW = Math.max(5, ...shown.map(m => usd(m.cost).length))
  const progW = Math.min(PROGRESS_MAX, Math.max(4, ...shown.map(m => progress(m).length)))
  function progress(m: CrewMember): string {
    if (m.row.status !== 'running') return m.row.status === 'done' ? 'done' : m.row.killed ? 'stopped' : 'failed'
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
          <T color={ROLE_COLOR[m.row.role]} bold wrap="truncate-end">
            {roleLabel(m.row)}
          </T>
        </B>
        <B flexGrow={1} flexShrink={1} minWidth={0}>
          {/* A retry says, compactly, the rung it stepped up from. */}
          <T wrap="truncate-end">
            {from ? <T dimColor>{`↑ ${from} · `}</T> : null}
            {memberTask(m.row)}
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
  const Client = el.Client as unknown as Make | null
  const R = DESKTOP_ROWS
  const cols = Math.max(1, Math.floor(v.bodyColumns))
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
  const img = (s: Sprite) => (S ? <S source={s.source} alt={s.alt} width={s.width} height={s.height} /> : null)
  // Every text is one line: cut to its cells with an ellipsis, and truncating if the surface measures otherwise.
  const line = (text: string, p: Record<string, unknown> = {}) => (
    <T wrap="truncate-end" {...p}>
      {text}
    </T>
  )
  // A badge: a native Button is a small rounded pill with even padding (the HUD's crew pill look); a press does nothing.
  const chip = (text: string, dim = false, key?: string) => (
    <B key={key} flexShrink={0}>
      <Btn key={key ? `${key}:badge` : undefined} label={text} dimColor={dim || undefined} onPress={() => undefined} />
    </B>
  )
  /** Badges in priority order, as many as fit `room` cells (each its words and a button's chrome, a gap between); the first is cut to fit. */
  const chipsFit = (items: { text: string; dim?: boolean; key?: string }[], room: number) => {
    const out: RenderElement[] = []
    // A native button's chrome: the HUD crew pill's live-checked 2 cells.
    const edge = 2
    let used = 0
    for (const c of items) {
      const gap = out.length ? 1 : 0
      const text = out.length ? c.text : fit(c.text, room - edge)
      const w = cells(text) + edge + gap
      if (!text || used + w > room) break
      used += w
      out.push(chip(text, c.dim, c.key))
    }
    return out
  }

  // The details column's cells: what is left beside the padding, the sprite column and its gap.
  const detailCells = Math.max(1, cols - 2 * MEMBER_PAD - spriteCells)
  const member = (m: CrewMember) => {
    const id = m.row.id
    const scope = scopeOf(id)
    const rung = fromLabel(m.row)
    const from = rung ? (`↑ stepped up from ${rung}`.length <= detailCells ? `↑ stepped up from ${rung}` : `↑ from ${rung}`) : null
    // The title line: the role chip, the topic cut short while it runs, and the time at the right edge.
    // Once it has ended its whole topic is the line below, so the title shows none (never twice).
    const took = tookOf(m.row, v.now)
    const lineCells = Math.max(1, detailCells - LINE_SLACK)
    const titleRoom = Math.max(1, lineCells - cells(took) - 1)
    const chipSprite = roleChipSvg(m.row)
    const chipCells = Math.ceil(chipSprite.width / CELL_PX)
    const topicRoom = titleRoom - chipCells - 1
    const topic = m.row.status === 'running' && topicRoom >= 4 ? fit(memberTask(m.row), topicRoom) : ''
    // The pill: its bar takes what its words leave; a narrow column drops to the short words, then the bar.
    let label = pillLabel(m)
    let pillCells = lineCells - cells(label) - 1
    if (pillCells < PILL_MIN_CELLS) {
      label = shortPillLabel(m)
      pillCells = lineCells - cells(label) - 1
    }
    const withPill = pillCells >= PILL_MIN_CELLS
    label = fit(label, lineCells)
    const chips = chipsFit(
      [
        { text: chipModel(m.row), key: `crew-chip-model:${id}` },
        { text: usd(m.cost), dim: true, key: `crew-chip-cost:${id}` },
        { text: k(m.row.tokens), dim: true, key: `crew-chip-tok:${id}` },
      ],
      lineCells,
    )
    return (
      <B key={`crew-member:${id}`} flexDirection="row" columnGap={1} paddingX={MEMBER_PAD} paddingY={R.memberPad} height={heightOf(m)} overflow="hidden" hover={{ backgroundColor: HOVER_BG, scope }}>
        {/* The sprite column and the details column are two Boxes, so the details keep their width. */}
        {miniCols > 0 ? (
          <B key={`crew-mini:${id}`} flexShrink={0} width={miniCols}>
            {m.mini ? img(m.mini) : null}
          </B>
        ) : null}
        <B flexDirection="column" width={detailCells} flexShrink={0} overflow="hidden">
          <B key={`crew-title:${id}`} flexDirection="row" justifyContent="space-between" columnGap={1} height={1} width={detailCells}>
            <B key={`crew-name:${id}`} flexDirection="row" alignItems="center" columnGap={1} flexShrink={1} minWidth={0} overflow="hidden">
              <B key={`crew-role:${id}`} flexShrink={0} width={chipCells} alignItems="center">
                {S ? img(chipSprite) : line(chipSprite.alt, { color: ROLE_COLOR[m.row.role], bold: true })}
              </B>
              {topic ? <B flexShrink={1} minWidth={0}>{line(topic, { dimColor: true })}</B> : null}
            </B>
            <B key={`crew-time:${id}`} flexShrink={0}>
              {line(took, { dimColor: true })}
            </B>
          </B>
          {/* While it runs, what it is doing now (its latest tool call); once ended, its whole topic. */}
          <B key={`crew-task:${id}`} height={1}>
            {line(fit(doingOf(m.row), lineCells), m.row.status === 'running' ? { italic: true } : {})}
          </B>
          {from ? <B height={1}>{line(fit(from, lineCells), { dimColor: true })}</B> : null}
          <B flexDirection="row" columnGap={1} alignItems="center" height={1} width={lineCells}>
            {/* The bar gives way first (it shrinks and clips), so the words beside it are never cut. */}
            {withPill ? (
              <B key={`crew-pill:${id}`} width={pillCells} flexShrink={1} minWidth={0} overflow="hidden">
                {img(pillSvg(m, Math.min(PILL_MAX_PX, pillCells * CELL_PX - 2)))}
              </B>
            ) : null}
            <B key={`crew-pill-label:${id}`} flexShrink={0}>
              {line(label, { color: statusColor(m.row), bold: true })}
            </B>
          </B>
          <B key={`crew-chips:${id}`} flexDirection="row" flexWrap="nowrap" columnGap={1} overflow="hidden" height={1}>
            {/* By priority as the column narrows: the model, then ≈cost, then tokens. */}
            {chips}
          </B>
        </B>
      </B>
    )
  }

  // A header's line inside its border and padding.
  const headerCells = Math.max(1, cols - 4)
  const group = (kind: CrewGroup, items: CrewMember[]) => {
    const open = v.open[kind]
    const chev = open ? '▾' : '▸'
    // Short words at their natural width, never cut (a native button cuts a label it has no room
    // for): the long form, else "RUN n" / "FIN n" in a very narrow pane, the live dot going last.
    const count = `${items.length} ${chev}`
    const forms = kind === 'running' ? [`● RUNNING ${count}`, `● RUN ${count}`, `RUN ${count}`] : [`FINISHED ${count}`, `FIN ${count}`]
    const label = forms.find(f => cells(f) + BUTTON_SLACK <= headerCells) ?? (forms[forms.length - 1] as string)
    // Running's bar is the whole crew's steps: done of planned, the ended members' all done.
    const steps = kind === 'running' ? crewSteps(v.rows.map(m => m.row)) : null
    const stepsText = steps ? `${steps.n}/${steps.of}` : ''
    // The colored bar beside the Button (an Svg, not pressable) takes the room the words leave.
    const barCells = headerCells - cells(label) - BUTTON_SLACK - 1 - (steps ? cells(stepsText) + 1 + LINE_SLACK : 0)
    const shares =
      steps
        ? [{ share: steps.n / Math.max(1, steps.of), color: PILL_COLOR.running }]
        : [
            { share: done / Math.max(1, total), color: PILL_COLOR.done },
            { share: failed / Math.max(1, total), color: PILL_COLOR.failed },
          ]
    return (
      <B key={`crew-acc-wrap:${kind}`} flexDirection="column" rowGap={R.gap}>
        <B key={`crew-acc-box:${kind}`} flexDirection="row" alignItems="center" columnGap={1} paddingX={1} height={R.header} borderStyle="round" borderDimColor>
          {/* The toggle: one Button holding only its short words, at their natural width; only it lights on hover. */}
          <B key={`crew-acc-press:${kind}`} flexShrink={0} hover={{ backgroundColor: HOVER_BG }}>
            <Btn key={`crew-acc:${kind}`} plain onPress={() => act.toggle(kind)}>
              <T bold>{label}</T>
            </Btn>
          </B>
          {barCells >= BAR_MIN_CELLS && S ? (
            <B key={`crew-acc-bar:${kind}`} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              {img(groupBarSvg(shares, barCells * CELL_PX - 2, steps ? `${steps.n} of ${steps.of} steps` : `${done} completed, ${failed} failed of ${total}`))}
            </B>
          ) : null}
          {steps ? (
            <B key="crew-acc-steps" flexShrink={0}>
              {line(stepsText, { color: 'suggestion', bold: true })}
            </B>
          ) : null}
        </B>
        {kind === 'finished' ? tally() : null}
        {open ? (
          <B key={`crew-members:${kind}`} flexDirection="column">
            {items.map(member)}
          </B>
        ) : null}
      </B>
    )
  }

  // Three equal cells; the words shorten as the cells narrow.
  const tally = () => {
    const cell = Math.max(1, Math.floor((cols - 2 - 2) / 3))
    const forms = [
      [`${total} tasks`, `${done} completed`, `${failed} failed`],
      [`${total} tasks`, `${done} done`, `${failed} failed`],
      [`${total}`, `✓ ${done}`, `✗ ${failed}`],
    ]
    const words = (forms.find(f => f.every(w => cells(w) <= cell)) ?? (forms[2] as string[])).map(w => fit(w, cell))
    return (
      <B key="crew-tally" flexDirection="row" columnGap={1} paddingX={1} height={R.tally}>
        <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
          {line(words[0] as string)}
        </B>
        <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
          {line(words[1] as string, { color: 'success' })}
        </B>
        <B flexGrow={1} width={0} justifyContent="center" backgroundColor={CHIP_BG}>
          {line(words[2] as string, { color: failed ? 'error' : undefined, dimColor: !failed })}
        </B>
      </B>
    )
  }

  const lead = v.lead.sprite
  const leadSlot = lead ? leadSlotOf(miniCols) : 0
  // A narrow pane gives the time column's cells to the words.
  const timeCells = cols >= LEAD_TIME_MIN_COLUMNS ? LEAD_TIME_CELLS : 0
  const leadWords = Math.max(1, cols - (lead ? leadSlot + 1 : 0) - (timeCells ? timeCells + 1 : 0))
  return (
    <B flexDirection="column" rowGap={R.gap}>
      <B key="crew-lead" flexDirection="row" alignItems="flex-start" columnGap={1} height={R.lead}>
        {lead ? (
          <B key="crew-lead-sprite" flexShrink={0} width={leadSlot} flexDirection="row" justifyContent="flex-end">
            <B key="crew-lead-pet" flexShrink={0}>
              {img(lead)}
              {/* A click on the lead plays its happy hop, as a click on the HUD's pet does. */}
              {Client ? (
                <B key="crew-lead-target" position="absolute" top={0} left={0}>
                  <Client key="crew-lead-poke" module="./lead-poke.tsx" width={Math.max(1, Math.ceil(lead.width / CELL_PX))} height={R.lead} />
                </B>
              ) : null}
            </B>
          </B>
        ) : null}
        {/* The words have their own width and truncate, so they never run into the time. */}
        <B key="crew-lead-words" flexDirection="column" width={leadWords} flexShrink={0} overflow="hidden">
          {line(fit(v.lead.name, leadWords), { bold: true })}
          {line(fit(v.lead.status, leadWords), { dimColor: true })}
        </B>
        {timeCells ? (
          <B key="crew-lead-time" flexDirection="column" alignItems="flex-end" width={timeCells} flexShrink={0}>
            {line(clock(v.header.elapsedMs), { bold: true })}
            {line(running.length ? 'so far' : 'total', { dimColor: true })}
          </B>
        ) : null}
      </B>
      <B key="crew-totals" flexDirection="row" columnGap={1} flexWrap="nowrap" overflow="hidden" height={R.totals}>
        {chipsFit([{ text: usd(v.header.cost), key: 'crew-total-cost' }, { text: `${k(v.header.tokens)} tok`, key: 'crew-total-tok' }, ...(timeCells ? [] : [{ text: clock(v.header.elapsedMs), dim: true }])], cols - LINE_SLACK)}
      </B>
      {running.length ? group('running', running) : null}
      {finished.length ? group('finished', finished) : null}
    </B>
  )
}
