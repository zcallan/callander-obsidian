# Contributing

Thanks for looking. This covers setting up, the checks a change has to pass, and how a release is cut. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the code fits together.

## Setting up

Node 24 (`.nvmrc`; 20.11 at least), then:

```bash
npm ci
npm run dev
```

`.npmrc` sets `legacy-peer-deps`: `eslint-plugin-obsidianmd` pins an exact `obsidian` peer, and this project tracks a newer one for current API typings. So peers npm would normally install are listed in `package.json` by hand; if you add a dev tool with peers, add those too.

To develop against a vault, put the absolute path of its plugin folder (for example `<vault>/.obsidian/plugins/callander`) in a `.vault-plugin-path` file at the repo root. It's gitignored. `npm run dev` then builds into that folder on every change; with the [Hot Reload](https://github.com/pjeby/hot-reload) plugin installed, Obsidian reloads Callander as you save. Use a scratch vault rather than the one your real notes are in.

`npm run build` does *not* reach the vault: it writes the release bundle to the repo root. If a bug report comes from a vault, check it actually has your code first (CLAUDE.md, "Builds").

## Checks

| Command | What it runs | When |
| --- | --- | --- |
| `npm run typecheck` | `tsc`, strict | Any time |
| `npm run lint` | ESLint over the plugin and the Node scripts, zero warnings allowed | Before committing |
| `npm test` | Tiers 1 and 2: pure logic and services against an in-memory vault, about a second | Freely |
| `npm run build` | Type-check, then the production bundle | Before committing a build or config change |
| `npm run test:e2e` | Tier 3: launches a real desktop Obsidian (macOS) against a throwaway vault | Before a release |
| `npm run preflight` | All of the above | The release gate |

CI runs lint, build and `npm test` on every push to `main` and every pull request, with `TZ=America/New_York`. It doesn't run e2e, which needs the desktop app.

## Writing a change

- **Keep behaviour changes and refactors in separate commits.** A refactor leaves every output the same; a fix changes one, with a test that failed before it. Several "obvious" helpers would quietly change output if written the obvious way, so extract with today's semantics first and improve in a commit of its own.
- **Persisted formats are contracts.** Frontmatter keys and their order, file names, section headings, settings keys, command ids and view types all live in people's vaults. Changing one needs a migration and a line in the changelog.
- **Rules go in `src/utils/`.** If a view is deciding something, lift the decision into a pure function with a test.
- **Check the shared primitives first** (ARCHITECTURE.md lists them) before writing a date, text or frontmatter helper.
- **Icons:** `setIcon` renders nothing for a name Obsidian doesn't ship, silently. Pick from the verified list in CLAUDE.md.

## Tests

`tests/README.md` explains the tiers. To add a module's tests:

1. Export the module from `tests/entry.ts`.
2. Add `tests/<name>.test.mjs` exporting `run()`, built on `createSuite` from `tests/harness.mjs`.

Then break it on purpose: invert the branch the test covers, or delete the line it depends on, and confirm *that* test fails before putting the code back. A test that passes when the code is wrong is worse than none, and this has caught assertions here that checked nothing at all.

For code that reads the clock, pass `now` in, or wrap the test in `atFixedDate` (`tests/fixed-date.mjs`). For day counts, test in a zone with daylight saving (the suite runs in New York; `tests/dates.test.mjs` also sets Sydney).

## Releasing

1. Update `CHANGELOG.md`.
2. `npm run preflight`, on a Mac with Obsidian installed.
3. `npm version <x.y.z>`: this bumps `package.json`, runs `version-bump.mjs` to update `manifest.json` and `versions.json`, commits, and tags. Tags have no `v` prefix (`.npmrc`), which is what the release workflow matches.
4. Push the commit and the tag. The release workflow re-runs CI, checks the tag matches all three version files, builds, attests the bundle and opens a draft GitHub release with `main.js`, `manifest.json` and `styles.css`.
5. Review the draft and publish it.

Touch, keyboard and scroll behaviour on iOS can't be automated (Obsidian for iOS doesn't run in the Simulator), so check those on a device before a release that changes them.
