$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$installerArgs = @($args)
$appHome = Join-Path $(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { $HOME }) 'OnHoldAssistant'
for ($i = 0; $i -lt $installerArgs.Count; $i++) {
    if ($installerArgs[$i] -eq '--home') {
        if ($i + 1 -ge $installerArgs.Count -or -not $installerArgs[$i + 1]) { throw '--home requires a directory' }
        $appHome = $installerArgs[$i + 1]
    }
}
$appHome = [IO.Path]::GetFullPath($appHome)
if ($appHome.TrimEnd('\','/') -eq [IO.Path]::GetPathRoot($appHome).TrimEnd('\','/') -or $appHome.TrimEnd('\','/') -eq $HOME.TrimEnd('\','/')) { throw 'Unsafe install directory' }
if ((Test-Path $appHome) -and ((Get-Item $appHome -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Install directory must not be a symlink or junction' }
$nodeRoot = Join-Path $appHome 'agent-node'
function Test-CompatibleNode($binary) {
    try { & $binary -e "const [m,n]=process.versions.node.split('.').map(Number);process.exit(m>22||m===22&&n>=20?0:1)" 2>$null; return $LASTEXITCODE -eq 0 } catch { return $false }
}
$nodeBinary = $null
$systemNode = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($systemNode -and (Test-CompatibleNode $systemNode.Source)) { $nodeBinary = $systemNode.Source }
if (-not $nodeBinary) {
    $architecture = [Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
    switch ($architecture) {
        'arm64' { $checksum = 'a0c807319fede24c4a0d8f84564c82a619bd313b16b10c007c383c2609e99171' }
        'x64' { $checksum = 'd2046d28c2c3dcd211ac5145c0bf30e2047ef9dfb306693c8c6e2eccd8b95fa5' }
        default { throw 'Unsupported Windows architecture' }
    }
    $release = "node-v24.22.1-win-$architecture"
    $nodeBinary = Join-Path $nodeRoot "$release/node.exe"
    if (Test-Path $nodeRoot) {
        $existing = Get-Item $nodeRoot -Force
        if (($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not (Test-Path "$nodeRoot/.onhold-node") -or (Get-Content "$nodeRoot/.onhold-node" -Raw).Trim() -ne 'onhold-assistant-node-v1' -or -not (Test-CompatibleNode $nodeBinary)) { throw 'Existing Node directory is not usable; files preserved' }
    } else {
        New-Item -ItemType Directory -Force $appHome | Out-Null
        $nodeLock = Join-Path $appHome '.node-bootstrap.lock'
        if (Test-Path $nodeLock) { throw 'Another Node bootstrap is running; files preserved' }
        New-Item -ItemType Directory $nodeLock | Out-Null
        $stage = Join-Path $appHome ('.node-stage-' + [Guid]::NewGuid())
        try {
            New-Item -ItemType Directory $stage | Out-Null
            Write-Host 'Downloading verified private Node.js 24.22.1...'
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/v24.22.1/$release.zip" -OutFile "$stage/node.zip"
            if ((Get-FileHash "$stage/node.zip" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum) { throw 'Node download checksum mismatch; not executed' }
            Expand-Archive -LiteralPath "$stage/node.zip" -DestinationPath $stage
            if (-not (Test-CompatibleNode (Join-Path $stage "$release/node.exe"))) { throw 'Downloaded Node cannot run' }
            Remove-Item "$stage/node.zip"
            Set-Content "$stage/.onhold-node" 'onhold-assistant-node-v1'
            if (Test-Path $nodeRoot) { throw 'Node destination changed; files preserved' }
            Move-Item $stage $nodeRoot
        } finally {
            if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
            Remove-Item $nodeLock -Force
        }
    }
}
& $nodeBinary (Join-Path $PSScriptRoot 'setup.mjs') @installerArgs
$result = $LASTEXITCODE
if ($result -eq 0 -and $installerArgs.Count -gt 0 -and $installerArgs[0] -eq 'uninstall' -and (Test-Path "$nodeRoot/.onhold-node")) {
    $existing = Get-Item $nodeRoot -Force
    if (-not ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) -and (Get-Content "$nodeRoot/.onhold-node" -Raw).Trim() -eq 'onhold-assistant-node-v1') { Remove-Item $nodeRoot -Recurse -Force }
}
exit $result
