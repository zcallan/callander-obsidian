# Architecture

How Callander is put together, for anyone reading or changing the code. [CONTRIBUTING.md](CONTRIBUTING.md) covers the dev loop and the checks; [CLAUDE.md](CLAUDE.md) holds the working rules in more detail, including the ones learned the hard way.

## The vault is the database

Every person, event, plan, someday and diary entry is a markdown note with YAML frontmatter, in folders under a base folder (`Friends/` by default). There is no other store: no cache on disk, no database, no network. [docs/DATA.md](docs/DATA.md) documents the note formats for people who edit them by hand.

Two consequences shape everything else:

- **Formats are contracts.** Frontmatter keys, their order, file-naming rules and section headings are persisted in people's vaults and read back by older versions syncing in. A change to any of them is a behaviour change, never a refactor.
- **Migrations are detection-based.** They run on every load (and when the metadata cache settles) and convert whatever old shape they find, so a note syncing in from a device on an older version is caught later. Each must be idempotent.

## Layers

```
main.ts ── plugin/            lifecycle, commands and views, the markdown intercept, startup steps
   │
views/ ─── ui/                one ItemView per page; React (Preact) islands inside some of them
   │        │
modals/ ◄───┘                 FormModal for anything with fields, ConfirmModal for yes/no
   │
components/                   imperative DOM builders shared between views and modals
   │
services/                     the only layer meant to read and write files (*Operations, vaultFiles)
   │
utils/                        pure logic: parsing, formatting, dates, money, sort and filter rules
   │
types/ ── constants/          shapes and data tables
```

Each layer is meant to import only from the ones below it. `tools/code-review/layers.mjs` measures this and lists the exceptions: nothing in `utils/` or `types/` imports a service any more, and the few that remain elsewhere (a component opening a modal, for one) are listed in its output.

- **`main.ts`** is the plugin class: it builds the services, registers commands and views from tables, and runs the startup steps in `plugin/startup.ts`, each isolated so one failure can't disable the rest. Its public methods (`activate*`, `openContactPage`, `seedStarterVault`, the `*Operations` fields) are what views, modals, the e2e suite and users' scripts call.
- **`services/`** are typed against `ServiceHost` (`services/host.ts`), not the plugin class, so the tests' fake plugin can build them. `vaultFiles.ts` holds the shared file plumbing: `ensureFolder`, `markdownFilesIn`, `uniqueNotePath` and `createNote`.
- **`utils/`** is where the rules live, and where the tests live heaviest. When a view starts making a decision — which rows show, in what order, what a label says — the decision moves here as a pure function with a test, and the view calls it.

## Reading data: the metadata cache

Every read goes through `app.metadataCache.getFileCache()`, never through file contents. The cache updates *after* the vault's `modify` event, so a view that refreshed on `modify` alone would redraw the data it had just replaced. Every page therefore subscribes to both, through `registerPageRefresh` (`utils/vaultRefresh.ts`), which also hears settings changes and coalesces the pair onto one redraw. React islands use `useVaultVersion()` for the same reason. CLAUDE.md explains the timing, and why a test that writes and then checks the DOM can't catch a view that gets this wrong.

So no page redraws itself after a write, or hands a modal a refresh callback: the subscription hears the write. The one exception is the contact page's writes to its own note, which it deliberately doesn't hear (see "The contact page" below), so it redraws after those itself. `tests/e2e/05-live-refresh.e2e.mjs` checks that every page answers a cache event with no write behind it, which is what all of this rests on.

## Views and React islands

Most pages are imperative: `render()` empties the container and rebuilds it. The dashboard reads everything it has to wait for first (`views/DashboardView/snapshot.ts`) and then draws without awaiting, so two refreshes can't interleave. Where a section is written in React (Preact through `preact/compat`), it lives in an island: an `IslandSet` (`ui/islands.tsx`) creates each root once for the life of the view and hands back the same host node on every render, so re-rendering the page never remounts React. There is no router (Obsidian's workspace is one) and no state library (the vault is the state; UI state is per-view).

### The contact page

`views/ContactPageView/` is the person, plan and group page, split by job:

| File | What |
| --- | --- |
| `index.tsx` | The view's lifetime: what it listens to, loading a note, choosing a layout |
| `model.ts` | `ContactPageModel`: one note as the page read it, with its readers and list edits |
| `persistence.ts` | Loading, saving, and the note's one-time moves out of frontmatter |
| `context.ts` | `PageContext`, which is all that sections and handlers see of the view |
| `sections/` | Drawing: the header, each layout, About, Notes, the timeline |
| `actions/` | What each button does, grouped by what it edits |

A model is bound to the note it was read from, and every write goes through one, so a save still running when you move to another note lands in the note it was made for. Reading the same note again refreshes its model in place, keeping anything the page changed and hasn't saved. A save writes only what changed since the last read (`frontmatterPatch`), so it can't undo someone else's edit to another key. The page reloads when its note changes on disk, except after its own writes, which `OwnWrites` (`utils/ownWrites.ts`) recognises exactly rather than by timing; a change that arrives while you're typing waits until you stop.

Handlers take the model they were started on and keep it across awaits. Render code and island props read `ctx.model` when they run, because an island outlives every render and every note.

Modals stay Obsidian's `Modal`, because the stylesheet's mobile keyboard handling, Escape, focus trapping and backdrop behaviour all hang off it. `FormModal` adds protection against a stray backdrop click discarding edits, and the shared Enter-to-submit and initial-focus rules.

## Shared primitives

Before writing a helper, check these; most small date and text operations already have one.

| Module | What's in it |
| --- | --- |
| `utils/dates.ts` | `pad2`, `isoDay`, `isoDateOf`, `hhmm`, `startOfLocalDay`, `wholeDaysBetween` (the only DST-safe day count), `monthStep`, `isoDaysBetween`, `localDateOfIso` |
| `utils/flexdate.ts` | The `FlexDate` model (year, month, day, any of them unknown), `parseFlexDate`, `isExactFlexDate`, `shortMonthName` |
| `utils/text.ts` | `formatCount`, `pluralize`, `capitalize`, `truncate` |
| `utils/fm.ts` | Reading untyped frontmatter: `fieldOf`, `toText`, `textIfSet`, `fieldText`, `asArray`, `isRecord` |
| `utils/linkField.ts` | Wikilink fields: `parseLinkField`, `linkTarget`, `linkLabel`, `linkpathOf` |
| `utils/fileName.ts` | `safeFileName`, `eventSlug` — the naming rules, which are persisted |
| `utils/async.ts` | `runLogged` for background work, `runAction` for a click whose failure should be shown |

## Styling

`src/styles/base.css` is the one global stylesheet and holds the fit with Obsidian's shell. New component styles go in a co-located `.module.css`, which esbuild scopes. The generated root `styles.css` is base plus the compiled modules. Two tests guard the global sheet: every class it styles must still be produced by `src/`, nothing may be `!important`, sit on `:root` or use an unprefixed `@keyframes`, no declaration may be overridden by a later rule with the same selector, and no new rule may restyle modals beyond Callander's own (today's exceptions are listed in the test, to be removed as they're scoped).

## Builds

`npm run dev` is esbuild in watch mode and writes into a vault's plugin folder (from the gitignored `.vault-plugin-path`), for hot reload. `npm run build` type-checks and writes the production bundle to the repo root, which is what a release ships; it never touches a vault. Production builds are deterministic, so a byte-identical bundle is a usable check that a config change didn't change behaviour.

## Tests

Three tiers, documented in [tests/README.md](tests/README.md): pure logic, services against an in-memory vault, and a real desktop Obsidian driven over the Chrome DevTools Protocol. Tiers 1 and 2 run in about a second on every change and in CI; tier 3 is for releases.
