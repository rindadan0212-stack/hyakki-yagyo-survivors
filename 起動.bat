@echo off
chcp 65001 > nul
cd /d "%~dp0"
where python > nul 2>&1
if %errorlevel%==0 (
  start "" http://127.0.0.1:8765/
  python serve.py
) else (
  start "" "%~dp0index.html"
)
