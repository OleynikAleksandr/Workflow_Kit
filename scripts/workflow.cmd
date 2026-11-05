@echo off
rem Managed by Harness Workflow Kit. Do not edit.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0workflow.ps1" %*
exit /b %ERRORLEVEL%
