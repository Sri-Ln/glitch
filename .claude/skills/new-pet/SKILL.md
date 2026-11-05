---
name: new-pet
description: Use when someone wants to add, design or contribute a new pixel pet (persona, critter, character) to Glitch's glitch-pets plugin, in a fork of this repo.
---

# Adding a pet to Glitch

A pet is one hand-drawn persona file plus its name in a handful of lists. The contributor owns the look and the personality; you draw it to the house rules, wire it in, and stop at a commit they can open a PR from.

**Read [reference.md](reference.md) before drawing anything.** It has the persona shape, the mood-by-mood drawing rules, the shared overlay colors and every file to touch.

## Steps

1. **Ask before drawing.** Have the contributor describe the pet: what creature it is, its name, its personality, its signature move (what it does when idle), and any colors they want. Ask one question at a time; fill gaps with a proposal they can correct. Check the id and name don't clash with an existing pet.
2. **Branch.** `git switch -c feat/pet-<id>`.
3. **Draw** `plugins/glitch-pets/hooks/personas/<id>.ts`, modelled on `screenhead.ts`, following reference.md exactly. Write the voice lines in the pet's own voice.
4. **Wire it in**: every file in reference.md's "Files to touch" list, all of them. Update every pet count, in digits and in words (`6` → `7`, "six" → "seven"); don't refactor the lists or tests.
5. **Test**: `claude plugin test plugins/glitch-pets`, then `claude plugin validate .`. Fix until both pass.
6. **Show the art and wait.** Run the gallery (reference.md) and open it in the contributor's default browser yourself (Windows `start "" <path>`, macOS `open <path>`, Linux `xdg-open <path>`); also give them the path in case it didn't open. Tell them to check every mood on both the dark and the light background, and the pet in both crew looks (busy-hands and hats), including whether any hat color blends into the pet. Apply their changes, re-test, show again. Do not commit until they say the art is right.
7. **Pets image**: render the roster (reference.md) and save it as `docs/images/pets.png`.
8. **Commit**: `feat(glitch-pets): <Name>, the <kind>`.
9. **Hand over** the PR checklist below. Don't push or open the PR; it's their fork.

## PR checklist (give this to the contributor)

- [ ] `claude plugin test plugins/glitch-pets` and `claude plugin validate .` pass
- [ ] Every mood checked in the gallery on dark and light, hats included
- [ ] `docs/images/pets.png` shows the new pet
- [ ] Version bumped in both `plugin.json` and `marketplace.json`
- [ ] PR body: the pet's name, kind, temperament, signature move, and a screenshot of its gallery row

## Common mistakes

| Mistake | Fix |
|---|---|
| Drawing `working` as "typing at a desk" | Raw `working` is the **signature move**, played at idle. The laptop pose is generated from `idle[0]`. |
| A dark outline that vanishes on the dark band | Check the dark background in the gallery; lighten the outline. |
| Committing art nobody but you has looked at | Step 6 is a gate, not a courtesy. |
| Missing a list (dropdown, type file, gallery, tests, docs) | Go down "Files to touch" line by line. |
| A hat or overlay that blends into the pet (blue hats on a navy pet) | Point it out at the art review; adjust the pet's shade, not the shared colors. |
| Shared overlay letter already used for the pet's own color | Give the overlay another free letter, same color (Bud's clip is `j`). |
