@echo off
title VoiceBridge Agent
cd /d "%~dp0\.."
echo Starting VoiceBridge Windows Agent...
python -m agent.main %*
pause

