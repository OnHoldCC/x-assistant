param([ValidateSet('install','start','upgrade','backup','translation','agent','status','doctor','stop','verify','login')][string]$Action='install')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot)
$env:ONHOLD_SOURCE_COMMIT='unknown'
if (Get-Command git -ErrorAction SilentlyContinue) {
  $commit=& git rev-parse HEAD 2>$null
  if ($LASTEXITCODE -eq 0) {
    $env:ONHOLD_SOURCE_COMMIT=$commit
    if (& git status --porcelain --untracked-files=no) { $env:ONHOLD_SOURCE_COMMIT+='-dirty' }
  }
}
$installDirectory=if ($env:ONHOLD_INSTALL_DIR) { $env:ONHOLD_INSTALL_DIR } else { "$PWD" }
function Compose {
  & docker compose --project-name onhold --project-directory $PWD @args
  if ($LASTEXITCODE -ne 0) { throw "Docker Compose 失败，退出码 $LASTEXITCODE" }
}
if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw '未安装 Docker，请由安装 Skill 安装官方 Docker Desktop。' }
& docker info *> $null
if ($LASTEXITCODE -ne 0) { throw 'Docker 引擎未就绪，请启动 Docker；首次使用由用户完成官方授权。' }
Compose version
if ($Action -in 'status','doctor') { Compose --profile '*' ps -a; exit }
if ($Action -eq 'stop') { Compose --profile '*' stop; Write-Host '[已停止] 数据和已下载模型保留'; exit }
$lines=if (Test-Path .env) { @(Get-Content .env) } else { @() }
$profiles=@(($lines | Where-Object { $_ -match '^COMPOSE_PROFILES=' } | Select-Object -Last 1) -replace '^COMPOSE_PROFILES=','' -split ',' | Where-Object { $_ })
if ($env:COMPOSE_PROFILES) { $profiles=@($env:COMPOSE_PROFILES -split ',' | Where-Object { $_ }) }
if ($Action -in 'translation','agent','login') {
  $selected=if ($Action -eq 'login') { 'agent' } else { $Action }
  if ($profiles -notcontains $selected) {
    $profiles+=@($selected)
    @($lines | Where-Object { $_ -notmatch '^COMPOSE_PROFILES=' }) + @('COMPOSE_PROFILES='+($profiles -join ',')) | Set-Content -Encoding ascii .env
  }
}
$profiles=@($profiles | Where-Object { $_ -ne 'scoring' })
$env:COMPOSE_PROFILES=$profiles -join ','
$mode=if ($profiles -contains 'translation') { 'translation' } else { '' }
$port=if ($env:ONHOLD_HTTP_PORT) { [int]$env:ONHOLD_HTTP_PORT } else { 18431 }
if ($Action -eq 'verify') {
  Compose exec -T web onhold-backend --health-check --port $port
  if ($mode) { Compose exec -T gateway node docker/verify.mjs $mode }
  exit
}
foreach ($service in @('web','gateway')) {
  if ($service -eq 'gateway' -and !$mode) { continue }
  $checkPort=if ($service -eq 'web') { $port } else { 18427 }
  $running=& docker compose --project-name onhold --project-directory $PWD ps --status running -q $service
  if ($LASTEXITCODE -ne 0) { throw '无法检查当前项目状态。' }
  if (!$running) {
    $socket=[Net.Sockets.TcpClient]::new()
    try { $task=$socket.ConnectAsync('127.0.0.1',$checkPort); $busy=$task.Wait(1000) -and $socket.Connected } catch { $busy=$false } finally { $socket.Dispose() }
    if ($busy) { throw "端口 $checkPort 被其他程序占用，请关闭旧 OnHold 服务后继续。" }
  }
}
if ($Action -in 'upgrade','backup') {
  Compose --profile '*' stop
  New-Item -ItemType Directory -Force (Join-Path $installDirectory 'backups') | Out-Null
  Compose run --rm --no-deps -T web tar -C /data -czf /data/upgrade-backup.tgz --exclude=./upgrade-backup.tgz .
  Compose cp web:/data/upgrade-backup.tgz (Join-Path $installDirectory "backups/state-$(Get-Date -Format 'yyyyMMddTHHmmss').tgz")
  Compose run --rm --no-deps -T web rm /data/upgrade-backup.tgz
  if ($Action -eq 'backup') { exit }
}
Write-Host '[1/6 环境检查] Docker 和 Compose 已就绪'
Write-Host '[2/6 构建后台] 最终镜像只包含网页和 Rust'
Compose --progress plain build web
Compose up -d --wait --wait-timeout 120 web
if ($mode) {
  Write-Host '[3/6 可选模型环境] 仅构建已选择的服务'
  Compose --progress plain build gateway
  Write-Host '[4/6 权重下载与校验] 以下为真实下载进度'
  Compose up --no-deps --abort-on-container-exit --exit-code-from translation-init translation-init
} else { Write-Host '[3–4/6] 未启用翻译，跳过环境与权重下载' }
if ($profiles -contains 'agent') { Compose --progress plain build agent }
Write-Host '[5/6 启动] 等待已选服务健康检查'
Compose up -d --remove-orphans --wait --wait-timeout 360
Write-Host '[6/6 验证] 后台及已启用模型'
Compose exec -T web onhold-backend --health-check --port $port
if ($mode) { Compose exec -T gateway node docker/verify.mjs $mode }
$next=Join-Path $installDirectory ('.extension-next.'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $next | Out-Null
Compose cp web:/opt/onhold/extension/. "$next/"
$extension=Join-Path $installDirectory 'extension'
if (Test-Path $extension) { Move-Item $extension "$extension.previous-$(Get-Date -Format 'yyyyMMddTHHmmss')" }
Move-Item $next $extension
Write-Host "[部署完成] http://127.0.0.1:$port/  插件目录 $extension"
if ($Action -eq 'login') { Compose exec agent codex login --device-auth }
Write-Host '[下一步] 初装：安装插件 → 连接；升级：打开后台 /#/connect?upgrade=1 自动重载并验证插件。'
