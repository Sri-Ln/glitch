# Pet reference

All paths are from the repo root. The full contract is `plugins/glitch-pets/hooks/behavior/types.ts` (the `Persona` type) and `behavior/contract.ts` (what makes a pet broken).

## The persona file

`plugins/glitch-pets/hooks/personas/<id>.ts` imports only `import type { Frame, Persona } from '../behavior/types'`, defines its own small helpers (`patch`, `at`, `put`, `up`, `down`, `shift`, `pad`: copy them from `screenhead.ts` or `dot.ts`), and `export default`s one `Persona`:

| Field | Rule |
|---|---|
| `id` | lowercase, matches the file name and the `PET_IDS` entry |
| `name` | shown in the UI; different from every other pet's |
| `kind` | a word or two: `penguin`, `screen bot`. Used in "Bud the dog" |
| `temperament` | one sentence, the pet's personality |
| `palette` | single **letter** keys → `#rrggbb`. Digits and punctuation are reserved (`4 6 7` are the laptop's) |
| `moods` | all 13: idle, working, happy, tired, sleepy, worried, oops, cheering, leading, reviewing, crying, investigating, pleased |
| `hatAnchor` | `{x, y}`: top-center pixel of the head, where a crew hat's brim sits. **y ≤ 8** |
| `laptopPaw` | a palette key used for the paws on the laptop |
| `voice` | 3–5 lines each for happy, worried, oops, cheering, sleepy, crying, crewDone. Never the word "helper" |
| `leadStatus` | optional, but write one in the pet's voice: crew-pane wording; see `fork.ts` and `blob.ts`. Placeholders `{n} {who} {d} {f}`; a `[one, many]` pair for number agreement |

## Frames

A frame is exactly **13 rows × 16 chars**. `.` is transparent; every other char must be a palette key. Draw shorter art padded with empty rows **on top** so the feet sit on the bottom row. The pet is shown at 1.5 CSS px per pixel (24×20 px), so shapes must read at that size.

## What each mood is for, and how to draw it

**The trap:** at load the pet is composed onto a laptop (`behavior/laptop.ts`).
- Raw **`working`** becomes the **idle** animation: it is the pet's **signature move**, not "working". 4–8 frames, at least 3 different. It is shown at half its fps (min 2).
- Composed working and tired are generated: rows 0–6 of raw **`idle.frames[0]`** sit behind a laptop drawn on rows 7–12. So the head must read well in rows 0–6 of `idle[0]`.
- Raw `idle` beyond frame 0 and raw `tired` are checked but not shown. Draw them anyway (blink; working[0..3] with half-closed eyes).

| Mood | Frames · fps | Drawing |
|---|---|---|
| idle | 2 · 1 | base, then a blink |
| working | 4–8 · ~6 | the signature move |
| happy | 4 · 6 | base raised one row, then base, alternating; smiling eyes or mouth |
| tired | 4 · 3 | first 4 working frames, eyes half shut (if those frames hide the eyes, use the base frame instead) |
| sleepy | 3 · 1 | eyes shut, body one row lower; `Z` climbs (14,3) → (14,2)+(15,1) → (13,1)+(15,0) |
| worried | 4 · 4 | eyes nearer each other (leave room for this when placing the base eyes); sweat drop `D` at the head's top right, bobbing a pixel |
| oops | 3 · 6 | `x` eyes; frame shifted left, right, centered |
| cheering | 6 · 8 | happy frames plus confetti `C Y L` changing in the top three rows |
| leading | 4 · 4 | clipboard (`B` board, `b` clip) at the right, rows 7–10, tilting one row |
| reviewing | 4 · 4 | magnifier (`M` lens, `m` handle) before one eye, moving a pixel left and right |
| crying | 6 · 6 | eyes shut, tear streams (`U` light, `T` dark ripples) running down; pet stays still |
| investigating | 4 · 3 | a puzzled look: a `?`, a squint, a scan (see `screenhead.ts`) |
| pleased | **exactly 6 · 5** | a flourish when a crew member finishes. No hop (that's happy's); frames 1–5 must differ from every happy frame; at least 3 different |

### Shared overlay colors

Use these letters and colors so every pet's overlays match. If a letter is already the pet's own color, use another free letter with the same color (Bud's clip is `j`).

`Z #9aa4d8` · `D #5ab0ff` · `C #ff4f8b` · `Y #ffd23f` · `L #39ff88` · `B #e8e2d0` · `b #7a6a4a` · `M #c9d4ff` · `m #5a5f80` · `T #2f7dff` · `U #9fd0ff`

`Y` and `C` also color the sparkle on a finished crew member.

### Contrast

The band is dark in dark mode and light in light mode. A very dark outline (navy `#232a3d`, for one) disappears on dark, and a near-white body with no outline disappears on light. Check both in the gallery.

## Files to touch

1. `plugins/glitch-pets/hooks/personas/<id>.ts`: the new pet.
2. `plugins/glitch-pets/hooks/personas/index.ts`: an import, and an entry in `PERSONAS`.
3. `plugins/glitch-pets/hooks/behavior/types.ts`: add the id to `PET_IDS`.
4. `plugins/glitch-pets/types/index.d.ts`: add the id to the `PetId` union.
5. `plugins/glitch-pets/.claude-plugin/plugin.json`: add the id to `userConfig.pet.options` before `"off"`; update the pet count in `description`; bump `version` (a new pet is a minor bump: 0.5.3 → 0.6.0).
6. `.claude-plugin/marketplace.json`: the same glitch-pets `version`.
7. `plugins/glitch-pets/scripts/gallery.mjs`: add the id to `IDS`.
8. `plugins/glitch-pets/hooks/personas/personas.test.ts`: the import, the `FILES` map, and the list in the "helper" test.
9. `plugins/glitch-pets/hooks/crew-themes/themes.test.ts`: the hard-coded pet count.
10. `docs/pets.md`: a row in the pet table (Pet | Kind | Temperament | Signature move) and the id in the `pet` setting's list.
11. `README.md`: the pet count and names in "The pets", and the image's alt text.
12. `docs/images/pets.png`: the roster image (below).

Then search for the old count, to catch anything new: `git grep -n -i -w six -- README.md docs plugins/glitch-pets` (and the digit, in tests).

## Gallery (art review)

Needs Node 22.15 or later.

```
node plugins/glitch-pets/scripts/gallery.mjs
```

It writes `.superpowers/gallery/pets.html` (gitignored). Open it in a browser; a browser tool that blocks `file://` can load it from `npx http-server .superpowers/gallery` instead. The page has every pet × mood animated, a dark/light switch, and every crew look × role. Add `--focus pleased,crying` to put chosen moods on top at 3×.

## Roster image

```
node .claude/skills/new-pet/roster.mjs
```

It writes `.superpowers/gallery/roster.html`: every pet's first happy frame with its name, in one strip. Screenshot the strip (the element `#strip`) at 2× (device scale 2, or `document.body.style.zoom = 2` when the tool can't set it) and save it as `docs/images/pets.png`. Serve the folder over http as above if `file://` is blocked. If you can't take screenshots, ask the contributor to.
