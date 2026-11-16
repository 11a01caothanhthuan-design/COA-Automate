@echo off
cd /d "%~dp0"
REM Chay moi 15 phut khi dang dang nhap (dong bo OneDrive/SharePoint)
schtasks /Create /TN "COA Dashboard Build" /SC MINUTE /MO 15 /RL LIMITED /F ^
  /TR "wscript.exe \"%~dp0run_hidden.vbs\""
schtasks /Run /TN "COA Dashboard Build"
echo Da tao Task Scheduler tu dong cap nhat dashboard moi 15 phut tai: %~dp0
pause
