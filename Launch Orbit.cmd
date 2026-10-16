@echo off
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
if exist "release\Orbit\Orbit.exe" (
  start "" "release\Orbit\Orbit.exe"
) else (
  call npm start
)
