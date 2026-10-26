---
name: onhold-assistant
description: Install, upgrade, uninstall, replace compatible local models, or diagnose OnHold Assistant on macOS and Windows. Use for this assistant's local browser translation, X draft assistance and post-tag scoring services; not for publishing posts, X account analytics or unrelated applications.
---

Use this skill's bundled installer at `scripts/setup.mjs`. Do not invent a published npm package or repository URL. Requires Node.js 22.20+; Python, llama.cpp, Hy-MT2 and Laya are managed by the installer. Run `doctor` first when the installation location or platform is unknown.

| Requested operation | Command after locating this skill directory |
| --- | --- |
| Install | `node <skill-directory>/scripts/setup.mjs setup --no-open` |
| Upgrade | `node <skill-directory>/scripts/setup.mjs upgrade --no-open` |
| Uninstall, retain data | `node <skill-directory>/scripts/setup.mjs uninstall --no-open` |
| Start / stop / status | `node <skill-directory>/scripts/setup.mjs start` (or `stop`, `status`) |
| Replace model | Read [model replacement](references/models.md), then run `replace-model` with the verified local model and checksum/manifest. |

Pass `--home <directory>` consistently when the user has a custom installation. Locate its existing config before maintenance. Never point maintenance at an unrelated directory or kill a service that fails the installation's instance check. Operations are locked against concurrent maintenance.

Setup downloads and verifies pinned official assets (about 1.91 GB translation + 678 MB decision weights/tokenizer), reserves at least 8 GiB including managed Python/PyTorch, and starts loopback services on 18427/18428/18430. Mac uses Metal when available; Windows uses the CPU build. Do not claim Windows or clean-machine bootstrap was tested merely because the platform files exist.

The installer upgrades to its bundled version, not an unseen newest release. Obtain the user-selected new release or updated Skill before claiming an upgrade to a newer version; the source repository is https://github.com/OnHoldCC/x-assistant, but no npm registry release is configured yet.

Upgrades keep the browser extension's path, selected models and data. They checkpoint/back up SQLite and save previous code/config before replacement; a startup failure restores the old code/config and attempts to restart it. Explain an unsuccessful recovery and point to its log/backup, rather than repeatedly rerunning setup. Existing installations must use `upgrade`; `setup` reuses an installed version.

Uninstall stops only the owned service and removes managed code, runtime and models. It keeps `data/` and `backups/` by default, and never deletes external models supplied by path. Use `--purge-data` only when the user explicitly requests deleting stored originals, translations, tags, statistics and backups. Browser extension removal remains a separate browser action; never edit browser profile files or enterprise policy to automate it.

Browser first-time loading and subsequent unpacked-extension reload require the browser's normal UI flow. Follow the applicable browser confirmation rules. Keep operations in the background and use the extension popup for verification; do not open full-page previews unless requested. A running service is not proof the extension was loaded.

The browser stores settings and a migration identifier, not translation/tag caches. The gateway uses a bounded 7-day RAM cache, then indexed SQLite final records, then models on a miss. RAM eviction/restart never deletes SQLite results. Results include content/model/language versions; model replacement keeps old records without reusing them under a different model version. Original posts/pages and observed metrics are local; drafts do not automatically become stored posts. The old browser counters migrate once to SQLite. Legacy result files remain intact; old caches without original text cannot reconstruct their originals.

Verify `/health`, `/metrics`, one explicit short translation, a repeated cache hit and a post analysis when both models are installed. Confirm that no browser result-cache keys are written. Report exactly which platform and operations were tested. CPU/RSS include only the owned gateway and model processes. Show only this program’s CPU and memory usage; do not display GPU utilization. Do not publish posts, send messages, read credentials, change account settings, or silently switch to cloud APIs.

## Project license

The original assistant code uses the OnHold Assistant Source-Available License 1.0 bundled at `assets/installer/LICENSE`. Free redistribution and own commercial-account use are permitted; resale, paid bundles and paid access to the software need separate written authorization. Keep the license, attribution and official source notice when redistributing. Third-party licenses remain independent.
