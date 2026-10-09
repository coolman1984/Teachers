@echo off
rem Hessa - the seller makes activation and password-reset codes here (tools\seller.py). Needs Python.
python "%~dp0seller.py" %*
pause
