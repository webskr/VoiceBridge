@echo off
title VoiceBridge PC Direct Voice Dictation
cd /d "%~dp0\.."
echo =======================================================
echo   VoiceBridge PC Voice Dictation (Continuous Hinglish)
echo =======================================================
echo   Shortcut: Press [Ctrl + Alt + V] anywhere in Windows!
echo   Works in: Notepad, Word, Chrome, VS Code, Antigravity
echo =======================================================
python bin\pc_dictation.py
pause

