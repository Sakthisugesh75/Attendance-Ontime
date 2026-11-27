@echo off
rem Starts Attendance Desk on http://localhost:6001
rem   run        build + start the fast production server (default)
rem   run dev    development mode (only while changing code)
rem Works from PowerShell (.\run), Command Prompt (run) or by double-clicking.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing packages...
  call npm.cmd install || goto :error
  call npx.cmd prisma generate || goto :error
)
if /i "%~1"=="dev" (
  call npm.cmd run dev
) else (
  call npm.cmd run prod
)
goto :eof
:error
echo.
echo Something went wrong. See the messages above.
pause
