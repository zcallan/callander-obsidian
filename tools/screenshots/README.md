# Screenshots

Regenerates `examples/example-vault` and every screenshot in
`examples/screenshots`, against a real Obsidian running a throwaway vault.

```bash
npm run build          # the vault gets the built bundle, so build first
npm run seed           # rewrite examples/example-vault, anchored to today
npm run screenshots    # capture all 30 shots
```

Shoot a subset while iterating:

```bash
npm run screenshots -- plan
```

Writing docs about the screenshots? `DUMP_TEXT` writes what each shot
actually had on screen, as text — much faster than squinting at 30 PNGs, and
it can't drift from what was captured:

```bash
DUMP_TEXT=/tmp/shots.txt npm run screenshots
```

Captures are taken at 2x off a Retina display and downscaled to half that
(1077px wide) on the way out, which is what keeps the set around 6MB rather
than 20MB.

## Why the vault is regenerated

Callander's UI is almost entirely relative dates — "in 2 days", "8 days ago",
"Next Wednesday". A vault with hardcoded dates only photographs correctly on
the day it was written; the previous example vault was pinned to a single
afternoon and had drifted into showing an empty dashboard.

So `cast.mjs` and `cast-plans.mjs` store **offsets in days from today**, and
`make-seed.mjs` re-derives real dates on every run. Reseed before a pass and
every countdown reads correctly again.

Everything in the cast is invented. Nothing is taken from a real vault.

## Requirements

- **Screen Recording permission** for whatever runs this. Capture goes
  through `screencapture(1)` so the shots get native rounded corners, traffic
  lights and the drop shadow. Without the permission it fails with
  `could not create image from display`.
- The window must be frontmost for each shot, so **the run takes focus**.
  Start it and leave the machine alone.

## Files

| | |
|---|---|
| `cast.mjs` | People, groups and events |
| `cast-plans.mjs` | Plans, somedays, diary, loose expenses |
| `make-seed.mjs` | Cast → `examples/example-vault` |
| `shots.mjs` | The shot list, and helpers for driving the app |
| `shoot.mjs` | Launches Obsidian, runs the shot list, captures |
| `windowid.swift` | Resolves a PID to a CGWindowID for `screencapture -l` |

## Adding a shot

Add an entry to `SHOTS` in `shots.mjs`. `setup` runs **inside** Obsidian's
renderer, so it can't close over anything in the file — it receives
`{ paths }` and nothing else. Return a string to skip the shot with that
reason; that's how a shot for a feature not in the build bows out instead of
failing the run.

The helpers cover most cases: `command(id)` fires a plugin command,
`openNote(key)` opens a seeded note and lets the plugin route it,
`view(type)` opens a view directly, `clickButton(label)` clicks by visible
text, and `steps(...)` chains them.

## Things that will bite you

Each was a silent wrong screenshot before it was fixed, so they're all
guarded in `shoot.mjs` now — but if you change the capture flow, re-check:

- **The window must be focused before setup, not just before the shutter.**
  Chromium throttles `requestAnimationFrame` in an unfocused window and
  Obsidian renders modals on a frame, so a modal opened in the background
  isn't in the DOM yet.
- **Suggesters only close on Escape.** They have no close button, so one left
  open appears in every later capture.
- **Leaves keep their scroll position**, so a shot that doesn't set a scroll
  inherits the last one's. The scroll is always set, even to 0.
- **A key window draws a bigger shadow** than an inactive one — 224px per
  axis at 2x rather than 136px. That's what the 965x796 window size is
  calibrated against, to land on 2154x1816.
- **Friend chips are ordered by file mtime**, so the seed stages mtimes
  deliberately rather than letting the copy decide.

Every shot reports the view, scroll offset and modal title it actually
captured, and flags a scroll that didn't move or a missing modal. Read that
output — it's the difference between a broken shot and a silent one.
