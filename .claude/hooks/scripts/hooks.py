#!/usr/bin/env python3
"""
Claude Code Hook Handler — Talenco BJ
Envoie une notification macOS à chaque événement clé.
"""
import sys
import json
import subprocess
import platform
import os

def notify(title, message):
    if platform.system() == "Darwin":
        script = f'display notification "{message}" with title "{title}"'
        subprocess.run(["osascript", "-e", script], capture_output=True)

def main():
    event = os.environ.get("CLAUDE_HOOK_EVENT", "")

    try:
        data = json.load(sys.stdin)
    except Exception:
        data = {}

    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input", {})

    if event == "Stop":
        notify("✅ Claude a terminé", "La tâche est complète — vérifiez le résultat.")

    elif event == "SessionStart":
        notify("🚀 Claude Code", "Session démarrée sur Talenco BJ")

    elif event == "PreCompact":
        notify("📦 Compaction", "Le contexte est compacté — continuité assurée.")

    elif event == "PreToolUse" and tool == "Bash":
        cmd = tool_input.get("command", "")
        if "git commit" in cmd:
            notify("📝 Commit git", "Un commit est en cours...")
        elif "vercel" in cmd and "prod" in cmd:
            notify("🚀 Déploiement", "Mise en production Vercel en cours...")

if __name__ == "__main__":
    main()
