param (
    [string]$Version
)

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "       Aether SSH Automated Setup Builder" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Read-Host "Enter release version (e.g. V1.0.1)"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    Write-Host "[ERROR] Version cannot be empty!" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Configuring Go and NSIS environment..." -ForegroundColor Yellow
$env:PATH = "C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\go\bin;C:\Users\Angus\Desktop\Antigravity\SSH\Packaging_Tools\nsis\nsis-3.08;" + $env:PATH

Write-Host "[2/3] Building setup installer using Wails..." -ForegroundColor Yellow
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $scriptPath
wails build -clean -upx -nsis

$exePath = Get-ChildItem -Path (Join-Path -Path $scriptPath -ChildPath "build\bin") -Filter "*installer.exe" | Select-Object -First 1 | Select-Object -ExpandProperty FullName

if ([string]::IsNullOrEmpty($exePath) -or -Not (Test-Path -Path $exePath)) {
    Write-Host "[ERROR] Build failed, setup installer not found." -ForegroundColor Red
    exit 1
}

Write-Host "[3/3] Archiving setup installer..." -ForegroundColor Yellow
$outputDir = "C:\Users\Angus\Desktop\Antigravity\SSH\exe"
$portableOutputDir = "C:\Users\Angus\Desktop\Antigravity\SSH\Portable"

if (-Not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}
if (-Not (Test-Path -Path $portableOutputDir)) {
    New-Item -ItemType Directory -Force -Path $portableOutputDir | Out-Null
}

$destPath = Join-Path -Path $outputDir -ChildPath "Aether_Setup_$Version.exe"
Copy-Item -Path $exePath -Destination $destPath -Force

$portableSource = Join-Path -Path $scriptPath -ChildPath "build\bin\Aether.exe"
$portableDest = Join-Path -Path $portableOutputDir -ChildPath "Aether_Portable_$Version.exe"
if (Test-Path -Path $portableSource) {
    Copy-Item -Path $portableSource -Destination $portableDest -Force
    Write-Host "  Portable version saved to: $portableDest" -ForegroundColor Green
}

# ── [4/4] 自动生成版本更新总结 (Changelog) ───────────────────
Write-Host "[4/4] Generating release changelog..." -ForegroundColor Yellow
$changeLogPath = "C:\Users\Angus\Desktop\Antigravity\SSH\CHANGELOG.md"
$gitLogs = git log -n 15 --oneline --pretty=format:"* %s (%h)" 2>$null

$changelogContent = @"
# AetherSSH 发布日志 - $Version
更新时间: $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))

## 🛠 最近代码变更记录 (Git Commits)
$gitLogs

"@

if (Test-Path $changeLogPath) {
    $existing = Get-Content $changeLogPath -Raw
    $newContent = $changelogContent + "`n`n" + $existing
    Set-Content -Path $changeLogPath -Value $newContent -Force
} else {
    Set-Content -Path $changeLogPath -Value $changelogContent -Force
}
Write-Host "Changelog successfully updated at: $changeLogPath" -ForegroundColor Green

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "  File saved to: $destPath" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
