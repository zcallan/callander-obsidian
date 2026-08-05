import WebSocket from "ws";
import { spawn } from "node:child_process";

const PORT = 9914;
const VAULT_UD = process.argv[2];

function send(ws, id, method, params = {}) {
  return new Promise((resolve, reject) => {
    const onMsg = (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== id) return;
      ws.off("message", onMsg);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const child = spawn(
  "/Applications/Obsidian.app/Contents/MacOS/Obsidian",
  [`--remote-debugging-port=${PORT}`, `--user-data-dir=${VAULT_UD}`],
  { stdio: "ignore" }
);
console.log("spawned pid", child.pid);

// Connect to the BROWSER-level endpoint as early as physically possible.
let browserWsUrl = null;
const t0 = Date.now();
while (!browserWsUrl && Date.now() - t0 < 15000) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    const json = await res.json();
    browserWsUrl = json.webSocketDebuggerUrl;
  } catch {
    await new Promise((r) => setTimeout(r, 20));
  }
}
console.log("browser CDP available at", Date.now() - t0, "ms");

const ws = new WebSocket(browserWsUrl);
await new Promise((res) => ws.once("open", res));
let id = 1;

// Find the page target and its windowId, then minimize immediately.
let windowId = null;
while (!windowId) {
  const { targetInfos } = await send(ws, id++, "Target.getTargets");
  const page = targetInfos.find((t) => t.type === "page");
  if (page) {
    try {
      const win = await send(ws, id++, "Browser.getWindowForTarget", {
        targetId: page.targetId,
      });
      windowId = win.windowId;
    } catch (e) {
      console.log("getWindowForTarget not ready yet:", e.message);
    }
  }
  if (!windowId) await new Promise((r) => setTimeout(r, 20));
}
console.log("windowId found at", Date.now() - t0, "ms");

await send(ws, id++, "Browser.setWindowBounds", {
  windowId,
  bounds: { windowState: "minimized" },
});
console.log("minimize command sent at", Date.now() - t0, "ms");

process.exit(0);
