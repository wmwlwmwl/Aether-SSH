param (
    [string]$Version
)

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "       Aether SSH 自动化发版封装工具" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Read-Host "请输入将要封装的版本号 (例如 V1.0.1)"
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    Write-Host "[错误] 版本号不能为空！" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] 正在配置 Go 环境变量..." -ForegroundColor Yellow
$env:PATH = "C:\Users\Angus\Desktop\Antigravity\SSH\Source_Codes\Aether-Source\go\bin;" + $env:PATH

Write-Host "[2/3] 正在使用 Wails 进行产品级打包编译..." -ForegroundColor Yellow
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location -Path $scriptPath
wails build -clean -upx

$exePath = Join-Path -Path $scriptPath -ChildPath "build\bin\Aether.exe"
if (-Not (Test-Path -Path $exePath)) {
    Write-Host "[错误] 打包失败，未找到 Aether.exe 输出。" -ForegroundColor Red
    exit 1
}

Write-Host "[3/3] 正在移动打包文件到发布归档库..." -ForegroundColor Yellow
$outputDir = "C:\Users\Angus\Desktop\Antigravity\SSH\exe"
if (-Not (Test-Path -Path $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$destPath = Join-Path -Path $outputDir -ChildPath "Aether_$Version.exe"
Copy-Item -Path $exePath -Destination $destPath -Force

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  ✅ 封装成功!" -ForegroundColor Green
Write-Host "  文件已保存至: $destPath" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
