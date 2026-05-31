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
if (-Not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$destPath = Join-Path -Path $outputDir -ChildPath "Aether_Setup_$Version.exe"
Copy-Item -Path $exePath -Destination $destPath -Force

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  SUCCESS!" -ForegroundColor Green
Write-Host "  File saved to: $destPath" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
