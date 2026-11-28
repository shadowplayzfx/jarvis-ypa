import { useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { AppView, PCPublicStatus } from '../types/jarvis';

interface PCGuidePageProps {
  publicStatus: PCPublicStatus;
  onNavigateView: (view: AppView) => void;
}

function buildAgentPythonScript(pollUrl: string, reportUrl: string): string {
  return `import os
import subprocess
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone

import pyautogui
import requests

POLL_URL = "${pollUrl}"
REPORT_URL = "${reportUrl}"
AGENT_TOKEN = "PASTE_YOUR_AGENT_TOKEN_HERE"

APP_LAUNCH_MAP = {
    "chrome": ["cmd", "/c", "start", "", "chrome"],
    "msedge": ["cmd", "/c", "start", "", "msedge"],
    "firefox": ["cmd", "/c", "start", "", "firefox"],
    "notepad": ["notepad.exe"],
    "calc": ["calc.exe"],
    "code": ["cmd", "/c", "start", "", "code"],
    "spotify": ["cmd", "/c", "start", "", "spotify:"],
}

HEADERS = {"X-Agent-Token": AGENT_TOKEN}


def enforce_locks(locks):
    if not locks:
        return
    try:
        out = subprocess.check_output(
            ["tasklist", "/FO", "CSV", "/NH"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
        running = out.lower()
        now = datetime.now(timezone.utc)
        for lock in locks:
            proc = str(lock.get("process", "")).strip()
            ends_at_raw = lock.get("ends_at", "")
            if not proc:
                continue
            try:
                ends_at = datetime.fromisoformat(ends_at_raw.replace("Z", "+00:00"))
                if now >= ends_at:
                    continue
            except Exception:
                pass
            if proc.lower() in running:
                subprocess.run(
                    ["taskkill", "/F", "/IM", proc],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                print(f"[LOCK] Closed {lock.get('app', proc)} ({proc})")
    except Exception as exc:
        print(f"[LOCK ERROR] {exc}")


def run_safe_action(action, params):
    if action == "open_app":
        launch = str(params.get("launch_command") or params.get("name") or "").strip()
        key = launch.lower()
        cmd = APP_LAUNCH_MAP.get(key)
        if cmd:
            subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(["cmd", "/c", "start", "", launch], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"Opened {params.get('name', launch)}."

    if action == "close_app":
        proc = str(params.get("process_name") or params.get("name") or "").strip()
        if not proc.lower().endswith(".exe"):
            proc = f"{proc}.exe"
        subprocess.run(["taskkill", "/F", "/IM", proc], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"Closed {params.get('name', proc)}."

    if action == "open_url":
        url = str(params.get("url", "")).strip()
        if url.startswith("http://") or url.startswith("https://"):
            webbrowser.open(url)
            return f"Opened {url}."
        raise ValueError("Only http/https URLs are allowed.")

    if action == "search_web":
        q = urllib.parse.quote_plus(str(params.get("query", "")).strip())
        engine = str(params.get("engine", "google")).lower()
        urls = {
            "google": f"https://www.google.com/search?q={q}",
            "youtube": f"https://www.youtube.com/results?search_query={q}",
            "duckduckgo": f"https://duckduckgo.com/?q={q}",
            "bing": f"https://www.bing.com/search?q={q}",
            "github": f"https://github.com/search?q={q}",
        }
        webbrowser.open(urls.get(engine, urls["google"]))
        return f"Searched {engine} for '{params.get('query', '')}'."

    if action == "media_control":
        key_map = {"playpause": "playpause", "next": "nexttrack", "prev": "prevtrack"}
        k = key_map.get(str(params.get("key", "")).lower())
        if not k:
            raise ValueError("Unsupported media key.")
        pyautogui.press(k)
        return f"Sent media key: {k}."

    if action == "volume":
        direction = str(params.get("direction", "up")).lower()
        steps = max(1, min(20, int(params.get("steps", 2))))
        if direction == "mute":
            pyautogui.press("volumemute")
            return "Toggled mute."
        key = "volumeup" if direction == "up" else "volumedown"
        for _ in range(steps):
            pyautogui.press(key)
        return f"Adjusted volume {direction} ({steps} steps)."

    if action == "screenshot":
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        os.makedirs(desktop, exist_ok=True)
        fname = f"jarvis-shot-{int(time.time())}.png"
        fpath = os.path.join(desktop, fname)
        pyautogui.screenshot(fpath)
        return f"Saved screenshot to Desktop/{fname}."

    raise ValueError(f"Unsupported action: {action}")


def main():
    print("JARVIS Local PC Agent started. Press Ctrl+C to stop.")
    while True:
        try:
            resp = requests.get(POLL_URL, headers=HEADERS, timeout=10)
            if resp.status_code == 401:
                print("[ERROR 401] Invalid X-Agent-Token. Copy the token from Admin > Agent Setup.")
                time.sleep(5)
                continue
            if resp.status_code == 404:
                print("[ERROR 404] Wrong URL. Use your published app Poll URL.")
                time.sleep(5)
                continue
            resp.raise_for_status()
            data = resp.json()

            if data.get("kill_switch"):
                time.sleep(2)
                continue

            enforce_locks(data.get("locks", []))

            for cmd in data.get("commands", []):
                cmd_id = cmd.get("id")
                action = cmd.get("action")
                params = cmd.get("params", {})
                try:
                    msg = run_safe_action(action, params)
                    requests.post(
                        REPORT_URL,
                        headers=HEADERS,
                        json={"id": cmd_id, "status": "done", "message": msg},
                        timeout=10,
                    )
                    print(f"[DONE] {action}: {msg}")
                except Exception as act_err:
                    requests.post(
                        REPORT_URL,
                        headers=HEADERS,
                        json={"id": cmd_id, "status": "failed", "message": str(act_err)},
                        timeout=10,
                    )
                    print(f"[FAILED] {action}: {act_err}")
        except Exception as loop_err:
            print(f"[POLL ERROR] {loop_err}")

        time.sleep(2)


if __name__ == "__main__":
    main()
`;
}

function buildMarkdownGuide(pollUrl: string, reportUrl: string, script: string): string {
  return `# How to activate Jarvis PC Controls

## What you need
- A Windows PC
- Python 3.12 (or PowerShell)
- This JARVIS web app open in a browser

---

## Step-by-step setup

### Step 1: Log in as admin and turn PC Controls ON
1. Open the **PC Control** tab in JARVIS.
2. Enter your admin passcode to unlock Admin Mode.
3. Make sure **PC Controls: ON** is active (and Kill Switch is off).

### Step 2: Install the agent
1. Install Python 3.12 on Windows (make sure the \`py\` launcher is included).
2. Save the script below as \`jarvis_agent.py\` on your PC.
3. Open PowerShell or Command Prompt and install the required packages:
\`\`\`powershell
py -m pip install requests pyautogui
\`\`\`

### Step 3: Copy the Poll URL, Report URL, and token into the script
In **PC Control -> Agent Setup** (admin-only):
- **Poll URL**: \`${pollUrl}\`
- **Report URL**: \`${reportUrl}\`
- **Token**: Reveal & copy \`X-Agent-Token\` and paste it into \`AGENT_TOKEN\` inside \`jarvis_agent.py\`.

\`\`\`python
${script.trim()}
\`\`\`

### Step 4: Run the agent
Run the agent from the folder where you saved \`jarvis_agent.py\`, and keep the terminal window open:
\`\`\`powershell
py jarvis_agent.py
\`\`\`

### Step 5: Check that the badge says "PC Agent: Online"
Within 2–5 seconds, the status badge in JARVIS should switch to **PC Agent: Online**.

### Step 6: Give permission to apps in settings
Under **PC Control -> Permitted Apps Allowlist**, review the pre-filled apps (Chrome, Edge, Firefox, Notepad, Calculator, VS Code, Spotify) or add new ones—or say \`give permission for Discord\` in chat and confirm with the admin passcode.

### Step 7: Test it
Try saying or typing in JARVIS:
- \`open calculator\`
- \`lock Notepad for 1 minute\`

---

## Troubleshooting

| Problem | Cause & Fix |
| --- | --- |
| Badge stays Offline | Make sure \`py jarvis_agent.py\` is still running, you have internet access, and no firewall is blocking Python. |
| 401 error | Wrong token. Copy the exact \`X-Agent-Token\` from Admin > Agent Setup again. |
| 404 error | Wrong URL. Use your published app URL (not a stale localhost or expired preview link). |
| "python not recognized" | Windows often registers the \`py\` launcher instead of \`python\`. Use \`py -m pip install ...\` and \`py jarvis_agent.py\`. |
| App won't open | The app is not on the permitted allowlist yet. Grant permission in PC Control settings or chat. |
| Lock not working | Active locks are enforced on your PC every 2 seconds by \`jarvis_agent.py\`. Make sure the agent script is running. |

---

## Security tips
- **Never share the agent token** with anyone else—treat it like a password.
- **Use Regenerate** in Admin > Agent Setup immediately if you think the token leaked.
- **Keep your admin passcode private**, and use the red **KILL SWITCH** anytime you want to block all PC actions instantly.
`;
}

export function PCGuidePage({ publicStatus, onNavigateView }: PCGuidePageProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pollUrl = `${origin}/api/agent/poll`;
  const reportUrl = `${origin}/api/agent/report`;
  const agentScript = buildAgentPythonScript(pollUrl, reportUrl);

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const handleDownloadGuide = () => {
    const md = buildMarkdownGuide(pollUrl, reportUrl, agentScript);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jarvis-pc-controls-guide.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const checklist = [
    {
      label: 'PC Controls turned ON',
      done: publicStatus.pc_control_enabled && !publicStatus.kill_switch,
    },
    {
      label: 'PC Agent Online',
      done: publicStatus.agentOnline,
    },
    {
      label: 'At least one app permitted',
      done: publicStatus.allowedAppsCount > 0,
    },
  ];

  const CopySnippet = ({ id, code, label }: { id: string; code: string; label?: string }) => (
    <div className="mt-2 rounded-xl border border-white/[0.08] bg-black/60 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1.5 text-[11px] text-slate-400">
        <span className="font-mono">{label || 'Command'}</span>
        <button
          type="button"
          onClick={() => handleCopy(id, code)}
          className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors cursor-pointer"
        >
          {copiedId === id ? (
            <>
              <Check className="h-3.5 w-3.5 text-cyan-400" />
              <span className="text-cyan-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="jarvis-scroll overflow-x-auto p-3 font-mono text-xs text-cyan-100 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header + Download Guide */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div>
            <div className="flex items-center gap-2.5">
              <BookOpen className="h-5 w-5 text-cyan-400" />
              <h1 className="text-xl font-semibold text-white">
                How to activate Jarvis PC Controls
              </h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Follow these 7 steps to connect your Windows PC safely to JARVIS.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadGuide}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-cyan-400 px-4 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download guide (.md)</span>
            </button>
          </div>
        </div>

        {/* Live Setup Checklist */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Live Readiness Checklist</h2>
            <button
              type="button"
              onClick={() => onNavigateView('pc-control')}
              className="text-xs text-cyan-300 hover:text-cyan-200 cursor-pointer"
            >
              Open PC Control Settings →
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {checklist.map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs font-medium ${
                  item.done
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-white/[0.08] bg-black/40 text-slate-300'
                }`}
              >
                {item.done ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-slate-500 shrink-0" />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* What You Need */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <h2 className="text-sm font-semibold text-white mb-2">What you need</h2>
          <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-300">
            <li>A Windows PC</li>
            <li>Python 3.12 (or PowerShell)</li>
            <li>This JARVIS app open in a browser</li>
          </ul>
        </section>

        {/* Steps 1 to 7 */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45 space-y-5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Step-by-Step Activation</h2>
          </div>

          <div className="space-y-4 text-xs sm:text-sm text-slate-300">
            <div>
              <h3 className="font-semibold text-white">
                Step 1: Log in as admin with the passcode and turn PC Controls ON
              </h3>
              <p className="mt-1 text-slate-400">
                Open the <strong className="text-slate-200">PC Control</strong> tab, enter your admin
                passcode, and make sure <strong className="text-slate-200">PC Controls: ON</strong> is enabled.
              </p>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">Step 2: Install the agent</h3>
              <p className="mt-1 text-slate-400">
                Install Python 3.12 on Windows, save the script below as{' '}
                <code className="font-mono text-cyan-200">jarvis_agent.py</code>, and install the
                two required packages:
              </p>
              <CopySnippet
                id="pip-cmd"
                label="PowerShell / Command Prompt"
                code="py -m pip install requests pyautogui"
              />
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">
                Step 3: Copy the Poll URL, Report URL, and token from Agent setup into the script
              </h3>
              <p className="mt-1 text-slate-400">
                In <strong className="text-slate-200">PC Control → Agent Setup</strong> (admin-only),
                copy your secret <code className="font-mono text-cyan-200">X-Agent-Token</code> and
                paste it into <code className="font-mono text-cyan-200">AGENT_TOKEN</code> in{' '}
                <code className="font-mono text-cyan-200">jarvis_agent.py</code>. The Poll URL and
                Report URL for this app are already filled in below:
              </p>
              <CopySnippet id="poll-url" label="Poll URL (GET)" code={pollUrl} />
              <CopySnippet id="report-url" label="Report URL (POST)" code={reportUrl} />
              <div className="mt-2">
                <CopySnippet
                  id="agent-py"
                  label="jarvis_agent.py (save on your Windows PC)"
                  code={agentScript}
                />
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">
                Step 4: Run the agent and keep the window open
              </h3>
              <CopySnippet id="run-cmd" label="PowerShell / Command Prompt" code="py jarvis_agent.py" />
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">
                Step 5: Check that the badge says “PC Agent: Online”
              </h3>
              <p className="mt-1 text-slate-400">
                Look at the top bar or the checklist above—within a few seconds of starting the
                agent, it will switch to <strong className="text-emerald-300">PC Agent: Online</strong>.
              </p>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">
                Step 6: Give permission to apps in settings
              </h3>
              <p className="mt-1 text-slate-400">
                Chrome, Edge, Firefox, Notepad, Calculator, VS Code, and Spotify are pre-filled. You
                can add more in <strong className="text-slate-200">PC Control</strong> or say{' '}
                <code className="font-mono text-cyan-200">give permission for Discord</code> in chat.
              </p>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="font-semibold text-white">Step 7: Test your setup</h3>
              <p className="mt-1 text-slate-400">Try these two commands in the Assistant tab:</p>
              <CopySnippet id="test-1" label="Test 1 — Open allowed app" code="open calculator" />
              <CopySnippet
                id="test-2"
                label="Test 2 — App lock test"
                code="lock Notepad for 1 minute"
              />
            </div>
          </div>
        </section>

        {/* Troubleshooting Table */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <h2 className="text-sm font-semibold text-white mb-3">Troubleshooting</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Issue</th>
                  <th className="py-2.5 font-medium">How to fix it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-slate-300">
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    Badge stays Offline
                  </td>
                  <td className="py-2.5">
                    Keep the <code className="font-mono text-cyan-200">py jarvis_agent.py</code>{' '}
                    window open and check that your PC has internet access.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    401 error
                  </td>
                  <td className="py-2.5">
                    Wrong token. Reveal and copy the exact{' '}
                    <code className="font-mono text-cyan-200">X-Agent-Token</code> from Admin → Agent Setup.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    404 error
                  </td>
                  <td className="py-2.5">
                    Wrong URL. Make sure <code className="font-mono text-cyan-200">POLL_URL</code> and{' '}
                    <code className="font-mono text-cyan-200">REPORT_URL</code> match your published app URL.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    “python not recognized”
                  </td>
                  <td className="py-2.5">
                    Use the Windows Python launcher <code className="font-mono text-cyan-200">py</code>{' '}
                    instead (e.g. <code className="font-mono text-cyan-200">py jarvis_agent.py</code>).
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    App won’t open
                  </td>
                  <td className="py-2.5">
                    The app is not on the allowed list yet. Add it in PC Control settings or say{' '}
                    <code className="font-mono text-cyan-200">give permission for [App]</code> as admin.
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 font-medium text-white whitespace-nowrap">
                    Lock not working
                  </td>
                  <td className="py-2.5">
                    Locks close processes every 2 seconds only while the local PC agent is running.
                    Start <code className="font-mono text-cyan-200">py jarvis_agent.py</code> first.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Security Tips */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Security Tips</h2>
          </div>
          <ul className="list-disc pl-5 space-y-1.5 text-xs sm:text-sm text-slate-300">
            <li>
              <strong className="text-white">Never share the agent token:</strong> Anyone with your
              token can poll commands for your PC.
            </li>
            <li>
              <strong className="text-white">Use Regenerate if it leaks:</strong> Click{' '}
              <em>Regenerate token</em> in Agent Setup to invalidate the old token immediately.
            </li>
            <li>
              <strong className="text-white">Keep the passcode private:</strong> Only admins with the
              passcode can grant permissions, unlock apps early, or change settings.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
