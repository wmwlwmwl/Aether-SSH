@echo off
title AetherSSH GitHub Sync Tool
setlocal enabledelayedexpansion

echo ===================================================
echo             AetherSSH Git Push Tool
echo ===================================================
echo.

echo [1/4] Checking git status...
echo ---------------------------------------------------
git status -s
echo ---------------------------------------------------
echo.

set "commit_msg="
set /p commit_msg="Enter commit message (Press Enter for default): "

if "!commit_msg!"=="" (
    set "commit_msg=update: auto-sync and improvements"
)

echo.
echo [2/4] Adding files to staging (git add .)...
git add .

echo.
echo [3/4] Committing changes (git commit)...
git -c core.quotepath=false commit -m "!commit_msg!"

echo.
echo [4/4] Pushing to GitHub (git push)...
git push

echo.
echo ===================================================
echo DONE! Code successfully pushed to GitHub!
echo ===================================================
echo.
pause
