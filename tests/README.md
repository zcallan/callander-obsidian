# Tests

```bash
npm test                 # tiers 1 + 2 — fast, no Obsidian (~1s)
npm test quotes          # only files whose name contains "quotes"
npm run test:e2e         # tier 3 — drives a real Obsidian (~25s)
npm run test:e2e seeding # one e2e file
npm run preflight        # lint + build + test + e2e — the release gate
```

No test framework, no watch mode, no config. `npm test` bundles `src/` with a fake `obsidian` module and runs plain Node.

## Isolation

**Tests never touch a real vault.** There are two layers of guarantee:

- The fake vault (`stubs/obsidian.mjs`) is entirely in memory — it has no filesystem access at all, so there is nothing for it to reach.
- The only files read from disk are the checked-in fixtures in `fixtures/notes/`, and they are read-only.

## Layout

| File | What it is |
| --- | --- |
| `run.mjs` | Discovers `*.test.mjs`, rebuilds the bundle, aggregates results |
| `build.mjs` | esbuild step: `src/` → `.build/callander.mjs`, `obsidian` aliased to the stub |
| `entry.mjs` | Bundle entry — re-exports the source under test *and* the stub |
| `entry.ts` | The source modules being exported (type-checked by `tsc`) |
| `stubs/obsidian.mjs` | Fake `obsidian`: in-memory Vault, MetadataCache, FileManager |
| `vault.mjs` | `createTestVault()` — a throwaway vault wired to real services |
| `harness.mjs` | `createSuite()` — `eq` / `ok` / `throws` |
| `fixtures/notes/` | Real `.md` files covering the awkward shapes |

A test file exports `run()` and returns `suite.result()`.

Both the stub and the code under test come from **one** bundle on purpose: the services do `file instanceof TFile`, and a separately-imported copy of the stub would make every one of those checks silently fail.

## The two tiers

**Pure logic** — `calc`, `quotes-markdown`, `ideas-markdown`, `plan-costs`. Parsers, serializers and money maths. Fast and total.

**Service layer** — `contact-operations`, `note-surgery`. The real `ContactOperations` against the in-memory vault, plus byte-level file surgery over fixtures. This is where "did it actually persist?" is checked, and historically where the worst bugs lived: a value looking right on screen while never reaching the file.

## Adding a module

1. Export it from `entry.ts`.
2. Add `tests/<name>.test.mjs` exporting `run()`.

## Tier 3 — real Obsidian (`tests/e2e/`)

`npm run test:e2e` launches the actual desktop app against a throwaway vault with the built plugin installed, and drives it over the Chrome DevTools Protocol.

**Requires `npm run build` first** — it installs the built bundle, not the source. `preflight` handles that ordering for you.

| File | What it is |
| --- | --- |
| `launch.mjs` | Creates the temp vault, installs the plugin, boots Obsidian, returns a CDP session |
| `cdp.mjs` | Minimal CDP client — `evaluate()` runs a function *inside* the app |
| `run.mjs` | Launches once, runs every `*.e2e.mjs` against that instance |

Isolation again comes from two flags: `--user-data-dir` points at a fresh config so the real install's vault list is invisible, and the vault itself is a `mkdtemp` directory removed on exit. The test instance has never been told a real vault exists.

**A trust prompt flashes up and is clicked automatically.** A vault Obsidian has never seen opens in Restricted Mode with community plugins off, and nothing is persisted until that's answered — so there's no config to pre-seed and `acceptTrustPrompt()` clicks the button instead, ~600ms after it appears. No input is needed; the flash is expected.

Files are numbered because the suite shares one vault: `02-seeding` needs a pristine vault, so it must run before anything that creates the base folder.

Tests run assertions *inside* the app via `cdp.evaluate`, against the real `app.vault`, the real metadata cache and the real plugin instance. That deliberately avoids pixel-clicking, which would be far more brittle while testing less.

## What this cannot catch

- **UI wiring** — modals, click handlers, rendering are barely touched. Tier 3 reaches the plugin's API, not its buttons.
- **Metadata-cache races, in tiers 1–2.** The real cache is filled by an async indexing pass; the fake updates synchronously. This is exactly why `02-seeding` exists — removing the `waitForMetadata` call in `seedStarterVault` makes it fail, and makes nothing else fail.
- **Anything iOS.** Obsidian for iOS is a closed-source App Store app and cannot be installed on the iOS Simulator — no amount of Xcode setup changes that. Touch, keyboard and scroll behaviour stay a manual check on a real device before release.
