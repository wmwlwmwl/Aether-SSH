@echo off
chcp 65001 >nul
title AetherSSH GitHub 同步工具
setlocal enabledelayedexpansion

echo ===================================================
echo             AetherSSH Git 自动推送工具
echo ===================================================
echo.

echo [1/4] 正在检查 Git 仓库状态...
echo ---------------------------------------------------
git status -s
echo ---------------------------------------------------
echo.

set "commit_msg="
set /p commit_msg="请输入提交说明 (直接按回车使用默认说明): "

if "!commit_msg!"=="" (
    set "commit_msg=update: 自动同步与代码优化"
)

echo.
echo [2/4] 正在添加文件到暂存区 (git add .)...
git add .

echo.
echo [3/4] 正在提交更改 (git commit)...
git -c core.quotepath=false commit -m "!commit_msg!"

echo.
echo [4/4] 正在推送到 GitHub (git push)...
git push

echo.
echo ===================================================
echo 完成！代码已成功同步至 GitHub！
echo ===================================================
echo.
pause
