import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("installer sync detects drift without writing, copies nested assets and removes obsolete bundles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onhold-installer-sync-"));
  try {
    fs.mkdirSync(path.join(root, "scripts"));
    fs.copyFileSync(
      new URL("../scripts/sync-installer.mjs", import.meta.url),
      path.join(root, "scripts/sync-installer.mjs"),
    );
    for (const directory of ["bin", "lib", "extension/admin-ui/assets"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
      fs.writeFileSync(path.join(root, directory, "current.js"), "current");
    }
    for (const file of ["package.json", "LICENSE", "THIRD_PARTY_NOTICES.txt"])
      fs.writeFileSync(path.join(root, file), "fixture");
    const run = (...args) =>
      spawnSync(
        process.execPath,
        [path.join(root, "scripts/sync-installer.mjs"), ...args],
        { encoding: "utf8" },
      );
    const target = path.join(root, "skills/onhold-assistant/assets/installer");
    assert.equal(run("--check").status, 1);
    assert.equal(fs.existsSync(target), false);
    assert.equal(run().status, 0);
    assert.equal(run("--check").status, 0);
    fs.writeFileSync(
      path.join(target, "extension/admin-ui/assets/old.js"),
      "obsolete",
    );
    fs.writeFileSync(path.join(root, "lib/current.js"), "updated");
    assert.equal(run("--check").status, 1);
    assert.equal(run().status, 0);
    assert.equal(
      fs.existsSync(path.join(target, "extension/admin-ui/assets/old.js")),
      false,
    );
    assert.equal(
      fs.readFileSync(path.join(target, "lib/current.js"), "utf8"),
      "updated",
    );
    assert.equal(run("--check").status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
