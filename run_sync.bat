@echo off
cd /d "%~dp0"
call npx tsx server.ts --sync > sync.log 2>&1
