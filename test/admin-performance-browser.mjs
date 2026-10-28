import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = "http://127.0.0.1:21441";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "21441",
    "--strictPort",
  ],
  {
    cwd: new URL("../app/", import.meta.url),
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let browser;
try {
  for (let i = 0; ; i++) {
    if (server.exitCode !== null) throw Error("preview exited");
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (i > 100) throw Error("preview unavailable");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: "chromium" });
  const page = await browser.newPage();
  const assets = [],
    errors = [];
  page.on("request", (request) => {
    if (request.url().includes("/assets/")) assets.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    localStorage.setItem("onhold-setup-complete", "1");
    window.isTauri = true;
    window.dashboardCalls = 0;
    window.releaseDashboard = null;
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command !== "admin") return {};
        if (args.operation === "pairing") return { mobile: false };
        if (args.operation === "dashboard") {
          window.dashboardCalls++;
          await new Promise((resolve) => (window.releaseDashboard = resolve));
          return {
            accounts: [],
            account: null,
            posts: [],
            metrics: {},
            series: [],
            days: 7,
            analytics: null,
          };
        }
        return [];
      },
    };
  });
  await page.goto(base + "/#posts");
  await page
    .getByRole("searchbox", { name: "搜索帖子", exact: true })
    .waitFor();
  await page.waitForFunction(() => window.dashboardCalls === 1);
  assert.ok(
    assets.some((url) => /\/PostsPage-/.test(url)),
    "content review loads its own page chunk",
  );
  assert.ok(
    !assets.some((url) =>
      /\/(OverviewPage|chart-area-interactive|charts)-/.test(url),
    ),
    "content review does not load analytics charts",
  );
  await page.clock.runFor(30_000);
  assert.equal(
    await page.evaluate(() => window.dashboardCalls),
    1,
    "slow dashboard requests do not overlap automatic polling",
  );
  await page.evaluate(() => window.releaseDashboard());
  await page.clock.runFor(10_001);
  await page.waitForFunction(() => window.dashboardCalls === 2);
  assert.equal(await page.evaluate(() => window.dashboardCalls), 2);
  await page.evaluate(() => window.releaseDashboard());
  assert.deepEqual(errors, []);
  console.log(
    "Passed: feature chunks load on demand; a 30-second request blocks subsequent automatic polls until completion.",
  );
} finally {
  if (browser) await browser.close();
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await exited;
  }
}
