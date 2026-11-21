@echo off
rem Refresh the version of every JS/CSS link so the browser never uses an old cached copy.
cd /d "%~dp0"
python no_cache.py
pause
