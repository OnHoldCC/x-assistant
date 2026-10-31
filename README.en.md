# OnHold Assistant

[简体中文](README.md) | **English**

## Installation and deployment

**Recommended: [install with a Skill](#install-with-a-skill) and let your agent guide deployment.** Alternatively, use [manual Docker installation](#manual-docker-installation), [manual Windows installation](#windows), or [run from source](#run-from-source).

For an agent that supports Skills, install the [OnHold Skill](skills/onhold-assistant/SKILL.md) first. With Node.js 22.20+ and npm available, run this in a macOS / Linux terminal or Windows PowerShell:

```sh
npx skills add OnHoldCC/x-assistant --skill onhold-assistant --global
```

Select your agent when prompted, then start a new conversation in that agent and say: **“Use the onhold-assistant Skill to install OnHold Assistant.”** Without Node.js, you can instead [ask your agent to install the Skill](#option-1-ask-your-agent-to-install-the-skill).

The Skill checks Git / Docker, builds and starts the backend, then guides extension loading and X connection. **Installing the Skill alone does not deploy the application.** Once deployed, open **<http://127.0.0.1:18431/>**. Automated posts and replies also require [model setup](#configure-a-model).

See [manual Docker installation](#manual-docker-installation) below for Windows PowerShell commands, prerequisites, and the full procedure.

---

![OnHold Assistant icon](extension/assets/assistant-128.png)

A locally hosted X account management tool for account analytics, automation plans, content generation and publishing, with task results and model usage records.

The frontend uses Vue 3 / TypeScript, Soybean Admin, and Naive UI. The backend uses Rust / Axum / SQLite. A Chrome / Edge extension connects the app to your signed-in X account.

[![macOS / Windows checks](https://github.com/OnHoldCC/x-assistant/actions/workflows/verify.yml/badge.svg)](https://github.com/OnHoldCC/x-assistant/actions/workflows/verify.yml)

[Features](#features) · [Skill installation (recommended)](#install-with-a-skill) · [Manual Docker installation](#manual-docker-installation) · [Run from source](#run-from-source) · [Connect your browser](#connect-your-browser) · [Configure a model](#configure-a-model) · [Updates and maintenance](#updates-and-maintenance) · [Troubleshooting](#troubleshooting) · [License](#license)

## Features

- **Operations overview:** account metrics, successful and failed tasks by type, and token usage.
- **News posts:** collect candidates from news RSS feeds, Weibo, and Xiaohongshu hotlists; generate and publish on a schedule, retaining sources, skip reasons, and publication receipts.
- **Automated comments and replies:** read new For You posts or replies in notifications, generate responses, and filter ads, duplicates, and unusable content.
- **Content tools:** manual rewriting, draft generation, and scheduled publishing.
- **Relationship management:** relationship lists and configurable follow-back or unfollow tasks.
- **Task history:** collection, queueing, generation, and sending stages, including failures, duration, and model usage.

Create and enable a plan to start automation. Saved plans are paused by default; installing the app does not start posting.

## Prerequisites

Choose one installation method. All use the same browser connection procedure.

| Method | Requirements | Use case |
| --- | --- | --- |
| **Skill (recommended, agent guided)** | An agent with Skills, terminal, and network access; Node.js 22.20+ when using the CLI to install the Skill | Have the agent check dependencies and perform Docker installation, updates, and diagnosis |
| Docker (manual installation) | Git, Docker, Docker Compose v2 | Run deployment commands yourself; no host installation of Node.js, Rust, or Python required |
| Run from source | Git, Node.js, Rust, C/C++ build tools | Development, debugging, or managing the backend process yourself |

You also need:

- Chrome 120+ or a compatible desktop version of Edge, and a working X account. Load the extension in developer mode.
- Network access to GitHub, container registries, and dependency sources. The first build downloads dependencies and requires several GB of free disk space. Model calls and news collection also need network access.
- Model setup for AI features, as described below. The base installation does not download translation or scoring models.

This guide assumes the **backend, browser, and X session run on the same computer**. Mobile browsers cannot load this desktop extension. Remote server deployment is outside this default setup.

## Install with a Skill

**Recommended method.** Let your agent guide installation, verification, and maintenance. The application runs in Docker.

This repository includes [`onhold-assistant`](skills/onhold-assistant/SKILL.md) for agents with Skills, terminal, and network access. It checks dependencies, fetches source code, runs Docker deployment, guides browser connection, and handles later upgrades.

### Option 1: ask your agent to install the Skill

Send this complete request to your agent:

```text
Install the Skill at skills/onhold-assistant from https://github.com/OnHoldCC/x-assistant.
When installation finishes, tell me how to enable it.
```

The agent uses its own Skill installer; you do not need to run Node.js manually for this method. After installation, start a new conversation in that agent and send:

```text
Use the onhold-assistant Skill to install OnHold Assistant.
```

Your agent must be able to execute terminal commands locally. A chat-only tool cannot deploy the application on your computer.

### Option 2: use the Skills CLI

Install Node.js 22.20+ and npm first. This command works on macOS, Linux, and Windows PowerShell, and installs the Skill in user scope for use across projects:

```sh
npx skills add OnHoldCC/x-assistant --skill onhold-assistant --global
```

Select your agent when prompted, such as Codex, Claude Code, or Cursor. Omit `--global` for a project-only installation. See the [official Skills installation instructions](https://github.com/vercel-labs/skills#install-a-skill).

Check the user-level installation list:

```sh
npx skills ls -g
```

Confirm that `onhold-assistant` appears, then start a new conversation in the selected agent and send the installation request above. If the Skill is not detected, check the selected agent, installation scope, and current project; restart the agent if needed.

### Deploy and use the application

Installing the Skill adds instructions; **it does not start the backend, download models, or publish posts automatically**. When you ask the agent to install OnHold Assistant, it checks or guides setup of Git, Docker, and Compose, fetches source, builds and verifies the backend, and guides extension connection. You complete initial Docker system authorization, extension loading, X sign-in, and optional Codex device authentication yourself.

A completed application installation means the dashboard at `http://127.0.0.1:18431/` opens, the extension connects to the correct account, and an initial read-only collection succeeds. A successful Skill installation alone does not confirm application deployment.

For later tasks, send requests such as:

```text
Use the onhold-assistant Skill to upgrade the OnHold backend and browser extension.
Use the onhold-assistant Skill to check the OnHold backend and extension connection.
Use the onhold-assistant Skill to enable the Codex writing service and guide me through sign-in.
```

Skill updates and application updates are separate. Rerun the `skills add` command above to install the current repository version of the Skill; the backend and running extension still need the application upgrade procedure. Removing the Skill only removes the agent instructions; it does not uninstall the backend or delete account data.

<a id="docker-installation-recommended"></a>

## Manual Docker installation

On macOS / Windows, install and start Docker Desktop; use Linux containers on Windows. On Linux, use Docker Engine with Compose v2. Check that these commands succeed before continuing. Compose must support `up --wait`.

```sh
git --version
docker info
docker compose version
```

The deployment script builds images from this repository, starts the backend, checks its health, and exports the browser extension. The first build depends on your network and hardware. Application images are built locally; a prebuilt OnHold image is not required.

### macOS / Linux

Run each command in your terminal:

```bash
mkdir -p "$HOME/OnHold"
git clone https://github.com/OnHoldCC/x-assistant.git "$HOME/OnHold/source"
export ONHOLD_INSTALL_DIR="$HOME/OnHold"
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" install
```

### Windows

Run each command in PowerShell:

```powershell
$env:ONHOLD_INSTALL_DIR = Join-Path $env:USERPROFILE 'OnHold'
New-Item -ItemType Directory -Force $env:ONHOLD_INSTALL_DIR | Out-Null
git clone https://github.com/OnHoldCC/x-assistant.git (Join-Path $env:ONHOLD_INSTALL_DIR 'source')
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action install
```

If your execution policy blocks `.ps1` files, review the script, allow execution for this PowerShell session only, then run the final command again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### Installation result

After the script reports deployment complete, open this address in the Chrome / Edge profile where you will install the extension:

**<http://127.0.0.1:18431/>**

Default directories are listed below. On Windows, the root is `OnHold` under `%USERPROFILE%`.

```text
~/OnHold/
├── source/       # Git checkout and compose.yaml
├── extension/    # Load this directory in your browser
└── backups/      # Created when you run a backup
```

Account and task data are stored in Docker volumes, outside `source/`. Keep `ONHOLD_INSTALL_DIR` separate from the source checkout so exporting the extension does not replace the Git-tracked `source/extension/` directory.

The backend is now running. Continue with [browser connection](#connect-your-browser), then [configure a model](#configure-a-model) if you need AI posts or replies.

To have an agent perform these steps, use the [Skill installation method](#install-with-a-skill) above. The Skill instructions themselves are currently in Chinese.

## Run from source

Docker is not required for this method. Install:

- **Node.js 24**, matching the current frontend CI; the root package requires at least 22.20.0.
- **Rust 1.94.1 and Cargo**, matching the build image.
- Platform C/C++ build tools: Xcode Command Line Tools on macOS; Visual Studio Build Tools with Desktop development with C++ on Windows; a compiler toolchain such as `build-essential` on Debian / Ubuntu.

Run these commands in a terminal. They work in macOS / Linux shells and Windows PowerShell:

```sh
git clone https://github.com/OnHoldCC/x-assistant.git
cd x-assistant
npm --prefix app ci
npm run app:build
cargo run --release --locked --manifest-path backend/Cargo.toml -- --home ./data --assets ./app/dist --port 18431
```

When the backend prints its address, open **<http://127.0.0.1:18431/>**. It runs in the foreground; press `Ctrl+C` to stop it. Keep the process running while using the app.

- `app:build` generates both `app/dist/` and the extension's management UI. Finish building before loading the extension.
- Load **`extension/` inside the repository** for a source installation, rather than the directory exported by Docker.
- The commands above store data in the repository's `data/` directory, including `data/onhold-admin.sqlite3`. They explicitly set both the data and static asset directories; use absolute paths if launching from another working directory.
- `node bin/cli.mjs setup` is the legacy translation installer. It does not start the current Rust backend.

Continue with browser connection and model configuration below.

## Connect your browser

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge, and enable developer mode.
2. Click **Load unpacked** and select the directory containing `manifest.json`: `~/OnHold/extension` for Docker, or the repository's `extension/` directory for source installations. Use the corresponding Windows path on Windows.
3. Open <https://x.com/> and sign in using the **same browser profile**. Refresh an X page that was already open before the extension was installed.
4. In that browser, open <http://127.0.0.1:18431/> and follow the connection wizard. You can also use the connection indicator at the top right, open **账号与模型** (Account and model), and click **连接 X 助手插件** (Connect X Assistant extension). The app pairs the address and key automatically; you do not need to copy cookies manually.
5. Confirm the correct `@account` and connection state, run an account collection, and check the overview and task history.

The extension uses the `debugger` permission for CDP browser actions, so Chrome may display a debugging banner. **Publishing, comments, replies, and relationship actions require the browser to remain running, the extension to be online, and the X session to remain valid.** An active backend collection session alone does not confirm that browser writes are available.

## Configure a model

Viewing data and managing tasks do not require an AI model. News publishing, automated comments, notification replies, and the replicate action (**发同款**) currently use **Codex CLI**. The **自带 API Key** (Bring your own API key) option supports manual features such as rewriting and analysis; it does not replace Codex for those automation tasks.

### Docker: enable Codex and sign in

macOS / Linux:

```bash
export ONHOLD_INSTALL_DIR="$HOME/OnHold"
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" login
```

Windows PowerShell:

```powershell
$env:ONHOLD_INSTALL_DIR = Join-Path $env:USERPROFILE 'OnHold'
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action login
```

This builds and starts the optional `agent` service, then runs device authentication. Follow the terminal instructions to open the official sign-in link and enter the one-time code. If device authentication is disabled, enable it in your account's security settings or workspace permissions as described in the [official OpenAI authentication guide](https://learn.chatgpt.com/docs/auth), then retry.

**Codex inside Docker signs in separately from your host.** Being signed in on your computer does not sign in the container.

### Source: install Codex locally and sign in

Use the same OS user that runs the backend. These commands use the CLI version pinned in this repository's Docker build:

```sh
npm install -g @openai/codex@0.165.0
codex login
codex login status
```

See also the [official Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli). The backend's `PATH` must resolve `codex`. If it is not detected after installation, open a new terminal and restart the backend.

### Complete setup in the app

Open **账号与模型** (Account and model) at the top right, choose Codex CLI, and click **保存模型** (Save model) and **检查 CLI** (Check CLI). Leave the model name empty to use the CLI default. For an API provider, enter the endpoint, API format, key, and model name.

Model requests use your account quota or API balance. Failed or skipped tasks may still consume tokens. Generation and X publication are separate stages; use task results and publication receipts to confirm that a post was sent.

The current reading and publishing workflow does not depend on local translation or scoring models. Docker retains an optional `translation` profile for compatibility. Enabling it downloads about 1.91 GB of Hy-MT2 weights; it is not needed for a first installation. See the [Docker notes](docs/DOCKER.md) (Chinese).

## Enable automation

1. Create a plan in **自动化任务配置** (Automation configuration), choosing an account and task type: news publishing, For You comments, or notification replies.
2. Set the language, interval, per-round limit, and daily limit. News plans also require a source and topic.
3. Save the paused plan, review its configuration, then click **启用** (Enable). Start with small limits and check the first collection, generation, and send results.
4. Inspect details in **任务记录** (Task history), and lifetime successes, failures, and token usage in **运营概览** (Operations overview).

For notification follow-back, choose **自动回关** (Automatic follow-back), set the scope to **通知中的新关注者** (New followers in notifications), configure the interval and limits, then save and enable the plan. The app reads follow notifications and checks each profile to confirm the person still follows you and has not already been followed back. This requires no model or tokens. It runs as a separate plan from notification replies.

News plans support one-minute intervals. Actual timing also depends on execution duration, queueing, and daily limits. Browser actions for the same account run serially. Empty candidate pools, source failures, or unsuccessful verification produce a recorded skip reason; a post is not guaranteed every round.

## Updates and maintenance

### Docker operations

Set the installation root when opening a new terminal. On macOS / Linux:

```bash
export ONHOLD_INSTALL_DIR="$HOME/OnHold"
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" status
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" verify
```

On Windows PowerShell:

```powershell
$env:ONHOLD_INSTALL_DIR = Join-Path $env:USERPROFILE 'OnHold'
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action status
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action verify
```

Replace the final action with one of these values:

| Action | Behavior |
| --- | --- |
| `status` | Show container status |
| `verify` | Check the backend and enabled translation services |
| `start` | Rebuild current source, start and verify services, and export the extension |
| `stop` | Stop services while retaining data and models |
| `backup` | **Stop services first**, back up private state to `backups/`, and leave services stopped |
| `login` | Enable Codex and start device authentication |

`verify` does not confirm model authentication or successful publishing. Use **检查 CLI** (Check CLI) in the app as well. To view backend logs, run this from the `source/` directory:

```sh
docker compose --project-name onhold logs --tail=100 -f web
```

Press `Ctrl+C` to stop following logs; containers continue running. Replace `web` with `agent` for Codex service logs.

### Update code and the extension

Pause automation and wait for active sends to finish. Use the **old version's script to back up**, pull code, then start the new version. These commands assume the default directories and your current branch. Preserve and resolve local modifications before updating.

macOS / Linux:

```bash
export ONHOLD_INSTALL_DIR="$HOME/OnHold"
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" backup
git -C "$ONHOLD_INSTALL_DIR/source" pull --ff-only
bash "$ONHOLD_INSTALL_DIR/source/docker/deploy.sh" start
```

Windows PowerShell:

```powershell
$env:ONHOLD_INSTALL_DIR = Join-Path $env:USERPROFILE 'OnHold'
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action backup
git -C (Join-Path $env:ONHOLD_INSTALL_DIR 'source') pull --ff-only
& (Join-Path $env:ONHOLD_INSTALL_DIR 'source/docker/deploy.ps1') -Action start
```

Continue only after each step succeeds. `git pull` alone does not update running containers; `start` rebuilds them and exports the new extension to its fixed directory. The `upgrade` action backs up and rebuilds the current checkout; **it does not pull Git updates**.

After updating, open <http://127.0.0.1:18431/#/connect?upgrade=1> in your original Chrome / Edge profile and follow the connection update instructions. If the running extension does not support automatic reloading, reload it from the extensions page. For changes to X page scripts, save unsent drafts, refresh X, and confirm the actual connected version and account.

For a source installation, stop the backend and back up the entire `data/` directory, including any SQLite WAL files. Pull the code, rerun `npm --prefix app ci`, `npm run app:build`, and the backend launch command, then reload the extension.

### Data storage

The Docker Compose project name is fixed at `onhold`:

| Volume | Contents |
| --- | --- |
| `onhold_state` | Accounts, tasks, settings, caches, and optional Codex authentication |
| `onhold_secrets` | Internal service keys |
| `onhold_models` | Optional translation weights; created when enabled |

`backup` archives private state, excluding model weights and the separate `secrets` volume. Backups contain account sessions and model authentication, so store them privately. For restoration or migration, consult the [maintenance and recovery notes](skills/onhold-assistant/references/docker.md) (Chinese). Do not overwrite an existing database or copy only the main SQLite file while it is being written.

`stop` and ordinary `docker compose down` retain volumes. **Do not use `down -v` or delete volumes to troubleshoot routine issues**: this deletes account data, task history, or authentication. The default installation does not migrate legacy desktop data automatically.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Docker engine is not ready | Start Docker Desktop and wait until `docker info` succeeds. On Linux, confirm your user can access Docker. |
| Download or build failure | Identify the failing image, npm package, or crates source in the log. Check network access and disk space, then retry; build caches are retained. |
| Port `18431` is in use | Check for an existing source, desktop, or Docker backend. Identify its owner before stopping it. Use one installation method at a time on the default port. |
| Blank page or missing assets | For source installations, finish `npm run app:build` and check `--assets`. For Docker, inspect `web` logs and health checks. |
| Extension not detected or connection keeps waiting | Verify the loaded directory contains `manifest.json`, and that the dashboard and X use the same browser profile. Reload the extension, refresh X, and reconnect. |
| Model service disabled or signed out | Run `login` for Docker, or `codex login` for a source installation. Save model settings and check the CLI in the app. |
| X reply input is not ready | Confirm the browser is online and X has not signed out or opened a verification prompt. Wait for the page to load and inspect task details before retrying. |
| Task skipped without publishing | Expand task logs for empty candidates, duplicates, unavailable sources, or verification failures. Token consumption does not confirm publication. |
| Another device cannot reach the local address | `127.0.0.1` refers to the device opening it. This default setup is for local use and does not provide a public internet deployment configuration. |

The health endpoint, <http://127.0.0.1:18431/health>, reports the service version, build commit, and bundled extension version. When reporting a problem, include your OS, installation method, versions, and redacted failure-stage logs. Do not submit cookies, pairing keys, API keys, or Codex credentials.

## Development and project layout

```text
app/                         Vue frontend and Tauri desktop shell
backend/                     Rust / Axum / SQLite backend
extension/                   Chrome / Edge extension
compose.yaml                 Docker Compose services
docker/                      Image builds and deployment scripts
skills/onhold-assistant/     Agent installation and maintenance Skill
lib/, bin/                   Legacy translation installer and compatibility tools
docs/                        Design, deployment, and operations documentation
test/                        Node tests and browser fixtures
```

After setting up a source development environment, run:

```sh
npm test
cargo test --locked --manifest-path backend/Cargo.toml
npm run app:build
```

`npm run ui:dev` starts the frontend development server. The component reference is at `http://127.0.0.1:1420/ui.html`. Use the Rust-served page on port `18431` for the full application. Vite alone does not start the backend or complete pairing.

The Tauri 2 desktop version has additional platform dependencies and offline asset requirements; see [desktop builds](docs/DESKTOP.md). Legacy offline packages are covered in [offline distribution](docs/OFFLINE-RELEASE.md). These Chinese reference documents describe workflows outside the recommended installation process. Android / iOS installation packages have not been delivered.

## Further documentation

The following detailed references are currently in Chinese:

- [Docker deployment](docs/DOCKER.md) and [maintenance, updates, and recovery](skills/onhold-assistant/references/docker.md)
- [Automation and operations definitions](docs/OPERATIONS-0.9.md) and [news sources and verification](docs/NEWS-SOURCES.md)
- [Backend collection and session storage](docs/BACKEND-CAPTURE.md) and [account metrics](docs/X-OPERATIONS-METRICS.md)
- [UI design reference](docs/ONHOLD-UI.md) and [release notes](docs/RELEASE-0.9.5.md)

## License

The project uses the [OnHold Assistant Source-Available License 1.0](LICENSE). It permits free use, study, modification, and free redistribution, including operating your own commercial accounts. Reselling the software, distributing it for a fee, or charging third parties for its functionality requires separate written authorization. Redistribution and modified versions must retain the license, attribution, and official source notices.

**This is a custom source-available license, not an OSI-approved open-source license.** Third-party code, fonts, runtimes, and models retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.txt). This English summary is provided for convenience; refer to the Chinese LICENSE file for its terms.

## Author

**OnHoldCC** · [X · @OnHoldCC](https://x.com/OnHoldCC) · [Telegram · @On_Hold_CC](https://t.me/On_Hold_CC)
