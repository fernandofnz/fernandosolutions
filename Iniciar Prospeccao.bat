@echo off
chcp 65001 >nul
title Prospecção Fernando Solutions
cd /d "%~dp0"

set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Program Files\nodejs\node.exe"

echo.
echo  ==============================================
echo    Prospecção · Fernando Solutions
echo    Deixe esta janela aberta enquanto usa o site.
echo    Para desligar, feche esta janela.
echo  ==============================================
echo.

if not exist "node_modules" (
  echo Instalando dependencias pela primeira vez...
  call npm install
)

rem Abre o navegador alguns segundos depois, quando o servidor ja estiver pronto.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:3001"

"%NODE%" src\server.js

echo.
echo O servidor foi encerrado.
pause
