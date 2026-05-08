@echo off
setlocal EnableExtensions

set "ORIGIN_REMOTE=origin"
set "MIRROR_REMOTE=gitee"

if "%~1"=="" goto :usage

set "COMMIT_MSG=%~1"
set "TAG_NAME=%~2"

where git >nul 2>nul
if errorlevel 1 goto :git_missing

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 goto :not_repo

git remote get-url %ORIGIN_REMOTE% >nul 2>nul
if errorlevel 1 goto :origin_missing

git remote get-url %MIRROR_REMOTE% >nul 2>nul
if errorlevel 1 goto :mirror_missing

for /f "delims=" %%i in ('git rev-parse --abbrev-ref HEAD') do set "CURRENT_BRANCH=%%i"
if not defined CURRENT_BRANCH goto :branch_missing

echo [1/6] Current branch: %CURRENT_BRANCH%
echo [2/6] Staging all changes...
git add -A
if errorlevel 1 goto :add_failed

git diff --cached --quiet
if errorlevel 1 goto :do_commit
echo [3/6] No staged changes detected. Skip commit.
goto :after_commit

:do_commit
echo [3/6] Creating commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto :commit_failed

:after_commit

if not defined TAG_NAME goto :skip_tag
git rev-parse "%TAG_NAME%" >nul 2>nul
if errorlevel 1 goto :create_tag
echo [4/6] Tag %TAG_NAME% already exists. Skip creation.
goto :after_tag

:create_tag
echo [4/6] Creating tag %TAG_NAME% ...
git tag -a "%TAG_NAME%" -m "release %TAG_NAME%"
if errorlevel 1 goto :tag_failed
goto :after_tag

:skip_tag
echo [4/6] No tag provided. Skip tag creation.

:after_tag
echo [5/6] Pushing branch to GitHub ^(%ORIGIN_REMOTE%^)...
git push %ORIGIN_REMOTE% %CURRENT_BRANCH%
if errorlevel 1 goto :push_origin_failed

echo [6/6] Pushing branch to Gitee ^(%MIRROR_REMOTE%^)...
git push %MIRROR_REMOTE% %CURRENT_BRANCH%
if errorlevel 1 goto :push_mirror_failed

if not defined TAG_NAME goto :success

echo [extra] Pushing tag %TAG_NAME% to GitHub...
git push %ORIGIN_REMOTE% %TAG_NAME%
if errorlevel 1 goto :push_tag_origin_failed

echo [extra] Pushing tag %TAG_NAME% to Gitee...
git push %MIRROR_REMOTE% %TAG_NAME%
if errorlevel 1 goto :push_tag_mirror_failed

:success
echo.
echo Done: pushed successfully to both GitHub and Gitee.
exit /b 0

:usage
echo.
echo Usage: %~nx0 "commit message" [tag]
echo Example1: %~nx0 "feat: update homepage and room logic"
echo Example2: %~nx0 "release: publish new version" v1.0.1
echo.
exit /b 1

:git_missing
echo [ERROR] Git was not found. Please install and configure Git first.
exit /b 1

:not_repo
echo [ERROR] Current directory is not a Git repository.
exit /b 1

:origin_missing
echo [ERROR] GitHub remote "%ORIGIN_REMOTE%" was not found.
exit /b 1

:mirror_missing
echo [ERROR] Gitee remote "%MIRROR_REMOTE%" was not found.
exit /b 1

:branch_missing
echo [ERROR] Failed to get current branch name.
exit /b 1

:add_failed
echo [ERROR] git add failed.
exit /b 1

:commit_failed
echo [ERROR] git commit failed.
exit /b 1

:tag_failed
echo [ERROR] Tag creation failed.
exit /b 1

:push_origin_failed
echo [ERROR] Push to GitHub failed.
exit /b 1

:push_mirror_failed
echo [ERROR] Push to Gitee failed.
exit /b 1

:push_tag_origin_failed
echo [ERROR] Tag push to GitHub failed.
exit /b 1

:push_tag_mirror_failed
echo [ERROR] Tag push to Gitee failed.
exit /b 1
