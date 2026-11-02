@echo off
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 server.py
  goto :eof
)
where python >nul 2>&1
if %errorlevel%==0 (
  python server.py
  goto :eof
)
echo Python 3 is required but was not found. Install Python 3 and try again.
exit /b 1
