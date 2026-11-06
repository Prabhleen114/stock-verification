@echo off
cd /d "%~dp0"
call npx tsx server.ts --url=https://jindeal.com/shop/ --pages=50 > sync.log 2>&1
