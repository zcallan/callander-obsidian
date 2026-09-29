# Callander — working notes

An Obsidian plugin for keeping up with people: friends, events, plans, expenses. Everything lives in the user's vault as plain markdown with YAML frontmatter — the vault is the database, and there is no other store.

[ARCHITECTURE.md](ARCHITECTURE.md) is the overview of layers, data flow and shared helpers; [CONTRIBUTING.md](CONTRIBUTING.md) the dev loop, checks and release steps. This file holds the working rules.

## Commands

```bash
npm run dev        # esbuild watcher → writes into the vault (see "Builds" below)
npm run typecheck  # tsc, strict; no emit
npm test           # tiers 1+2, fake vault, ~1s — run these freely
npm run test:e2e   # tier 3, launches a real Obsidian — see "Testing"
npm run check:icons # every icon name in src/ against the installed Obsidian — see "Icons"
npm run preflight  # lint + build + test + icons + e2e — the release gate
npm run preview    # renders component fixtures in a browser against the real CSS
```

## Layout

| Path | What |
| --- | --- |
| `src/main.ts` | Plugin class: lifecycle, commands and views (as tables), navigation, migrations |
| `src/plugin/` | Plugin-level machinery split out of `main.ts`: startup steps, the markdown intercept, mobile keyboard tracking |
| `src/views/` | One `ItemView` per page |
| `src/modals/` | ~50 modals. Anything with editable fields extends `FormModal` |
| `src/services/` | Vault reads/writes (`*Operations`, plus `vaultFiles.ts`'s shared helpers) — the layer meant to touch files. `main.ts` still writes directly in places, and the contact page's saves and migrations live in `views/ContactPageView/persistence.ts`; move writes here rather than adding more |
| `src/utils/` | Pure logic: parsing, formatting, date maths. Where tests live heaviest. Check the shared primitives first (`dates.ts`, `flexdate.ts`, `text.ts`, `fm.ts`, `linkField.ts`, `fileName.ts`, `async.ts`; listed in ARCHITECTURE.md) before writing a helper |
| `src/ui/` | React layer: hooks, context, ported sections |
| `src/components/` | Imperative DOM builders shared between views |
| `src/styles/base.css` | The hand-written stylesheet. Root `styles.css` is **generated** |

Import via the `@/` alias, not relative paths.

Keep logic in `src/utils/` and rendering in the view. Most of the value in this codebase's tests comes from rules having been lifted out of views into pure functions — do that when a view starts making decisions.

---

## Views must react to the metadata cache, not just to vault writes

**Rule: anything that renders vault data subscribes to `metadataCache.on("changed")` as well as the vault events. Never one without the other.**

Every read path here — `getEvents()`, `getContacts()`, `getSomedays()` — goes through `app.metadataCache.getFileCache()`, never through file contents. But `vault.on("modify")` fires when *bytes* reach disk, which is strictly earlier than the reindex that makes those bytes visible to the cache. Measured in a real Obsidian, cancelling an event:

| event | at | `status` the cache returns |
| --- | --- | --- |
| `vault.on("modify")` fires | 2.4 ms | `open` ← **stale** |
| `await setStatus()` resolves | 2.5 ms | `open` ← **stale** |
| `metadataCache.on("changed")` fires | 3.8 ms | `cancelled` |

A refresh driven by the vault event alone therefore re-reads the *pre-write* frontmatter and faithfully redraws the row it was supposed to remove. The view then looks frozen until some unrelated later change happens to trigger another pass — the reported symptom was an event staying on the dashboard after being cancelled, until a tab switch or an app reload.

Note that `await`ing the write is not protection: `processFrontMatter` resolves before the cache catches up.

### How to wire it

- **Imperative views** — `registerVaultRefresh(this, this.plugin, () => void this.refresh())` from `@/utils/vaultRefresh`, in `onOpen`. Pass `{ scope }` to narrow beyond the base folder. It subscribes to modify/create/delete/rename *and* `changed`, and coalesces them onto a 50 ms timer so the modify-then-changed pair costs one rebuild rather than two.
- **React** — `useVaultVersion()` from `@/ui/useVaultData` already covers both, plus `settings-changed`. Derive data from the returned version; don't return vault data as the `useSyncExternalStore` snapshot, or React loops on the unstable reference.

### Don't

- **Don't paper over it with a delay.** A `setTimeout(() => refresh(), 100)` after a write is guessing at the reindex, and the guess gets worse as the vault grows.
- **Don't call `refresh()` from a modal's `onChange` and consider the job done.** That was the old pattern and it masked this bug for a long time — it fires at the stalest possible moment. The write is the signal; the subscription is what hears it. No page redraws after its own writes any more, and the modals' callbacks default to nothing. The exception is the contact page's writes to its own note, which it deliberately doesn't hear (`OwnWrites`), so it redraws after those.

### Why it hides from the tests

The stale window scales with vault size: ~1.4 ms in the 20-file e2e vault, far longer in a large synced one. **A behavioural test that writes and then checks the DOM passes with or without the fix** — `tests/e2e/05-live-refresh.e2e.mjs` documents itself as such.

The guard that actually bites fires a cache event with **no vault write at all**:

```js
window.app.metadataCache.trigger("changed", file, "", {});
```

A view that never subscribed to the cache cannot answer that, whatever the timing. The DOM sentinel trick in that file detects the response: append a node to the container, fire the event, and check the node is gone — `render()` empties the container, so survival means no refresh happened.

`tests/vault-refresh.test.mjs` covers the helper's contract directly and kills four mutations.

---

## React on top of Obsidian

Preact 10 through `preact/compat`, aliased as `react`/`react-dom` in tsconfig `paths` and esbuild `alias`, so write React imports as usual. `jsx: "react-jsx"` with `jsxImportSource: "preact"`. The migration is partial and deliberately incremental — most views are still imperative.

**Islands, created once.** A view's `render()` rebuilds imperative DOM on every vault event. React roots must *not* be rebuilt alongside it — create the host and `createRoot` once, keep them for the life of the view, and have `render()` re-append the same host. A root recreated per render unmounts and resubscribes a beat later, and anything arriving in that gap is lost. Unmount in `onClose`, deferred by a `setTimeout(…, 0)` so teardown never lands inside a render pass.

**An island's props read state when they run; they never capture it.** The JSX handed to `IslandSet.host` renders once, the first time, so a prop computed as a value — or a closure over a variable from that render — freezes the island on the first note it showed. On the contact page that means `() => ctx.model.ideas()`, never a `model` captured at render; handlers, by contrast, keep the model they were started on (ARCHITECTURE.md, "The contact page").

**StrictMode is off, on purpose.** Under `preact/compat` it's a plain Fragment, but real React's double-invokes effects, and effects here reach disk — a debounced autosave firing twice writes twice. Don't switch it on, or move to React, without auditing every write path.

**No router.** Obsidian's workspace *is* the router: `registerView(type)`, `leaf.setViewState({ type })`, `navigation = true` for back/forward. A React router fights leaf history and workspace serialisation.

**No state library.** Vault data belongs in the vault and is already reactive via `metadataCache`; UI state is per-view `useState`; settings broadcast through an Obsidian `Events` instance on the plugin (`plugin.events`), triggered from `saveSettings()`. Zustand/Redux/TanStack Query were all considered and rejected — they'd duplicate the cache and invite drift.

**`setIcon` is imperative.** Use the `<Icon>` wrapper in `src/ui/components/`; calling `setIcon` directly from JSX silently renders nothing.

**Skip the React Compiler.** It targets React, not Preact, and it's a Babel plugin: wiring Babel into esbuild would slow the rebuild loop the vault watcher depends on. These trees are small.

## Icons: `setIcon` fails silently

`setIcon(el, name)` with a name Obsidian doesn't ship renders **nothing** — no error, no warning, no console message. The button just comes out blank, and neither `tsc` nor lint will tell you. (The React `<Icon>` wrapper above calls into the same imperative `setIcon` and fails the same silent way.)

**Check with `npm run check:icons`.** It reads the tables Obsidian's `getIcon()` consults straight out of each installed app bundle (`obsidian-<version>.asar` beside Obsidian's settings), applies `getIcon()`'s lookup order, and checks every icon name in `src/`: direct `setIcon` calls, anything passed to a parameter named like `icon` or typed `IconName` (so the plugin's own helpers too), `icon` properties, `getIcon()` returns and `<Icon name>`. Anything that wouldn't render is listed with where it's written. To try a name before using it: `npm run check:icons -- receipt wallet`. `preflight` runs the check.

What doesn't work, and why this section used to call working icons unconfirmed:

- **`getIconIds()` in the developer console.** Obsidian hands the `obsidian` module only to plugin code, through a private `require`, so neither `getIconIds` nor `require("obsidian")` exists in the console. Its answer would mislead anyway: it lists Lucide icons as `lucide-<name>`, while `getIcon()` also takes bare names, Obsidian's own icons, and an alias table (`trash` is Lucide's `trash-2`, `pencil` is `edit-3`, `document` is `file`).
- **Grepping the bundle for `"name"`.** The Lucide table quotes a key only where it has to, so `lightbulb:` has no quotes and a search for `"lightbulb"` finds nothing.

The check covers the versions installed on this machine (1.12.7 and 1.13.7 at the time of writing), not every version back to `minAppVersion`. Obsidian's Lucide grows, so a very new icon can still come out blank on an older install; when a name already in use fits, prefer it. `npm run check:icons -- --list` prints them all, with where each is used. By purpose:

| Purpose | Names in use |
| --- | --- |
| Add / edit | `plus` `pencil` `pencil-line` `copy` |
| Remove / dismiss | `trash-2` `x` `circle-slash` |
| Confirm / undo | `check` `checkmark` `check-circle` `rotate-ccw` |
| View / filter | `eye` `eye-off` `filter` `chevron-down` |
| People | `user` `users` `user-plus` `heart` `heart-handshake` |
| Content | `document` `quote` `lightbulb` `sparkles` `laugh` `link` `book-open` |
| Time / travel | `alarm-clock` `milestone` `plane` `map` `bed` `backpack` `calendar-clock` `calendar-days` `calendar-plus` |
| Money | `dollar-sign` (`receipt`, `wallet`, `coins`, `credit-card` and `banknote` also render) |
| Misc | `dices` `settings-2` |

`trash` in older code is the alias of `trash-2`; both render.

## Modals stay Obsidian's

Roughly 50 selectors in `base.css` hang off `.modal` / `.modal-container`, including the mobile keyboard handling (`--callander-keyboard-inset` and the `callander-kb-open` body class set from `visualViewport`). A hand-rolled React overlay inherits none of it, and also loses Escape, backdrop dismissal, focus trapping and safe areas. Modals also open from commands and the ribbon, outside any React tree.

If a modal's *contents* want React, `createRoot(modal.contentEl)` — keep the `Modal` shell.

**Extend `FormModal`, not `Modal`, for anything with fields.** It suppresses backdrop-click dismissal once the user has edited something, so a stray click can't discard in-progress input. Escape and the ✕ still close normally.

## Styling

- `src/styles/base.css` is global and holds the Obsidian-shell integration. `src/main.ts` imports it first, so esbuild bundles it ahead of the compiled `.module.css` into the one `styles.css` Obsidian loads; that file is generated and gitignored.
- **New component styles go in a co-located `.module.css`.** esbuild's native `local-css` loader handles them with no extra dependency. Global CSS caused repeated specificity collisions in this codebase; scoping makes that class of bug structurally impossible.
- Production uses `minifyWhitespace` + `minifySyntax` but **not** `minifyIdentifiers`, which would mangle CSS-module class names into short strings that can collide with other plugins and themes in the shared DOM.
- `:nth-child` counts children that are `display: none`. Split the list or render conditionally rather than hiding rows, or banding breaks.
- Long unbroken strings need `min-width: 0` on the flex child plus `overflow-wrap: anywhere`.

## Vault writes

- Frontmatter: `app.fileManager.processFrontMatter(file, fm => …)`. Never hand-serialise YAML. A new note goes through `createNote` in `@/services/vaultFiles`, which writes its frontmatter the same way, keys in the order given.
- Renames go through `fileManager.renameFile` so links update.
- Deletes go through `fileManager.trashFile` — respects the user's trash setting and stays recoverable. Never `vault.delete`.
- Writes resolve **before** the metadata cache reflects them (see above).
- Migrations run on load and must be idempotent — they re-run on every start, and on files syncing in from a device on an older version.

## Testing

`tests/README.md` documents the three tiers and how to add a module. In short: tier 1 pure logic, tier 2 services against an in-memory vault, tier 3 a real Obsidian driven over CDP.

**Run `npm test` freely. Don't run `npm run test:e2e` proactively** — it launches a real Obsidian window and is disruptive. Reserve it for a release, or when explicitly asked.

**A test that passes when the code is wrong is worse than no test.** After writing one, invert the branch it covers and confirm *that specific test* fails, then restore. This has repeatedly exposed assertions that discriminated nothing — including, in this codebase, a helper whose entire body turned out to be unreachable.

E2E gotchas, each learned the hard way:

- `requestAnimationFrame` does not tick while the window is occluded, which an unattended run usually is. Use timers to wait.
- Never leave a modal open — it blocks every later file in the suite.
- The suite shares one Obsidian and one vault across files, so tests clean up after themselves and filenames are numbered to force ordering.
- A killed run can orphan an Obsidian holding the debug port. When clearing those, match on the e2e vault name so a real Obsidian is never touched.

## Builds: `npm run build` does not reach the vault

Only `npm run dev` writes into the vault plugin folder, via the gitignored `.vault-plugin-path`. Production builds output to the repo root as the release artifact — and `npm run preflight` builds in production mode, `npm test` builds its own Node bundle, and `npm run test:e2e` installs whatever production build is already there. None of them touch the vault.

So a whole session of green runs can coexist with a vault that has received nothing since the watcher last ran. **Before diagnosing any bug reported from the real vault, confirm the vault actually has the code:**

```bash
shasum "$(cat .vault-plugin-path)/main.js" main.js
```

Differing hashes are expected (dev vs production build), so also grep the vault bundle for a string only the new code contains. The watcher is a plain `node esbuild.config.mjs` with nothing supervising it; it dies silently and nothing errors.

The dev build stamps a real timestamp into its startup notice on **every** rebuild, via a sentinel swapped after the write — esbuild's `define` values are evaluated once at `context()` creation, so in watch mode a baked timestamp freezes at whenever the watcher started.

### Two ways the watcher used to go stale without saying so

Both were hit in one day, and neither logged anything. Both are handled now, but the watcher still has nothing supervising it, so the check at the end stays worth running.

1. **Switching branches didn't reload the watcher's config.** `npm run dev` now runs under `node --watch`, which restarts it whenever `esbuild.config.mjs` changes, a checkout included. A watcher started some other way (a bare `node esbuild.config.mjs`) still needs restarting by hand.
2. **`base.css` was watched through its inode.** A separate `fs.watch` on the file ended silently the first time an editor or a checkout replaced it, and CSS stopped reaching the vault while JS kept updating. `base.css` is now imported by `src/main.ts`, so it's part of esbuild's graph and its own watcher rebuilds on a CSS-only edit, by path. Symptom, if it ever recurs: your rule is in the repo's `base.css` but the vault's generated `styles.css` lacks it. (The root `styles.css` is itself generated, so editing it directly does nothing on the next build.)

So after editing `base.css`, confirm it actually arrived:

```bash
diff <(tail -5 styles.css) <(tail -5 "$(cat .vault-plugin-path)/styles.css")
```

A production `styles.css` is minified along with `main.js`, so it has no comments; read `src/styles/base.css` for those.
