# Callander — working notes

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

- **Imperative views** — `registerVaultRefresh(this, this.plugin, () => void this.refresh())` from `@/utils/vaultRefresh`, in `onOpen`. Pass `{ scope }` to narrow beyond the base folder (Events and Somedays do). It subscribes to modify/create/delete/rename *and* `changed`, and coalesces them onto a 50 ms timer so the modify-then-changed pair costs one rebuild rather than two.
- **React** — `useVaultVersion()` from `@/ui/useVaultData` already covers both, plus `settings-changed`. Derive data from the returned version; don't return vault data as the `useSyncExternalStore` snapshot, or React loops on the unstable reference.

### Don't

- **Don't paper over it with a delay.** A `setTimeout(() => refresh(), 100)` after a write is guessing at the reindex, and the guess gets worse as the vault grows. `FriendTrackerView` carried one of these for exactly this reason.
- **Don't call `refresh()` from a modal's `onChange` and consider the job done.** That was the old pattern and it masked this bug for a long time — it fires at the stalest possible moment. The write is the signal; the subscription is what hears it.

### Why it hides from the tests

The stale window scales with vault size: ~1.4 ms in the 20-file e2e vault, far longer in a large synced one. **A behavioural test that writes and then checks the DOM passes with or without the fix** — `tests/e2e/05-live-refresh.e2e.mjs` documents itself as such.

The guard that actually bites fires a cache event with **no vault write at all**:

```js
window.app.metadataCache.trigger("changed", file, "", {});
```

A view that never subscribed to the cache cannot answer that, whatever the timing. The DOM sentinel trick in that file detects the response: append a node to the container, fire the event, and check the node is gone — `render()` empties the container, so survival means no refresh happened.

`tests/vault-refresh.test.mjs` covers the helper's contract directly and kills four mutations (dropped cache listener, no coalescing, no teardown, lost path boundary).

## Builds: `npm run build` does not reach the vault

Only `npm run dev` writes into the vault plugin folder, via the gitignored `.vault-plugin-path`. Production builds output to the repo root as the release artifact — and `npm test`, `npm run test:e2e` and `npm run preflight` all build in production mode.

So a whole session of green runs can coexist with a vault that has received nothing since the watcher last ran. **Before diagnosing any bug reported from the real vault, confirm the vault actually has the code:**

```bash
shasum "$(cat .vault-plugin-path)/main.js" main.js
```

Differing hashes are expected (dev vs production build), so also grep the vault bundle for a string only the new code contains. The watcher is a plain `node esbuild.config.mjs` with nothing supervising it; it dies silently and nothing errors.
