import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  ALLOWED_ACTIONS,
  buildAppTemplate,
  changeAdminPasscode,
  checkAdminPasscode,
  createAppLock,
  createPCCommand,
  decidePCCommand,
  findActiveLockForApp,
  findAllowedApp,
  formatRemainingDuration,
  getActiveAppLocks,
  getPasscodeLockoutStatus,
  getPCCommandById,
  getPCCommandsByIds,
  getPublicAdminSettings,
  getPublicSafeStatus,
  getSettingsInternal,
  grantAllowedApp,
  isAgentOnline,
  listAppLocks,
  listPCCommands,
  loginAdminWithPasscode,
  pollApprovedCommandsForAgent,
  recordDirectDeniedOrAuditCommand,
  regenerateAgentToken,
  reportCommandExecution,
  revokeAdminBearer,
  revokeAllowedApp,
  unlockAppWithPasscode,
  updatePCSettings,
  validateActionParams,
  verifyAdminBearer,
  verifyAgentHeader,
  type AllowedAppEntry,
  type PCAction,
  type PCApprovalMode,
} from './server/pcControlStore.ts';

import {
  getResearchJob,
  startResearchJob,
  type ResearchJob,
} from './server/researchEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ProviderId = 'groq' | 'opentyphoon' | 'openrouter' | 'gemini';
type ProviderPreference = 'auto' | ProviderId;

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ProviderSpec {
  id: ProviderId;
  name: string;
  model: string;
  envVar: string;
  getKey: () => string;
}

const PROVIDER_ORDER: ProviderSpec[] = [
  {
    id: 'groq',
    name: 'Groq',
    model: 'llama-3.3-70b-versatile',
    envVar: 'GROQ_API_KEY',
    getKey: () => (process.env.GROQ_API_KEY || '').trim(),
  },
  {
    id: 'opentyphoon',
    name: 'OpenTyphoon',
    model: 'typhoon-v2.5-30b-a3b-instruct',
    envVar: 'OPENTYPHOON_API_KEY',
    getKey: () => (process.env.OPENTYPHOON_API_KEY || '').trim(),
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'google/gemini-2.5-flash',
    envVar: 'OPENROUTER_API_KEY',
    getKey: () => (process.env.OPENROUTER_API_KEY || '').trim(),
  },
  {
    id: 'gemini',
    name: 'Gemini',
    model: 'gemini-4-hydrogen',
    envVar: 'GEMINI_API_KEY',
    getKey: () => (process.env.GEMINI_API_KEY || '').trim(),
  },
];

const JARVIS_SYSTEM_PROMPT = `You are JARVIS, a thoughtful, warm, capable, and genuinely human-like personal assistant.

You help the user work smoothly across tasks:
- Writing and refining emails, messages, briefs, and plans
- Summarizing documents, notes, and complex concepts
- Brainstorming practical angles, strategies, and code solutions
- Task planning, prioritization, and daily scheduling

Personality & voice rules:
1. Sound like a warm, sharp colleague—conversational, attentive, clear, never stiff or robotic.
2. Skip robotic filler ("Certainly! As an AI...", "How may I assist you today?"). Speak naturally.
3. Keep replies concise and pleasant to hear aloud (2–4 natural sentences unless drafting code, an email, or a detailed breakdown).
4. Use session context naturally.`;

const JARVIS_MULTI_PLANNER_PROMPT = `You are the multi-task intent planner for JARVIS.
Given ONLY the user's latest message, decompose it into one or more structured tasks so JARVIS can multitask naturally.

Return ONLY valid JSON with no markdown fences and no extra commentary:
{
  "steps": [
    {
      "kind": "pc_action" | "permission_action" | "research" | "chat",
      "action": string,
      "params": object,
      "query": string,
      "prompt": string
    }
  ],
  "spoken_intro": string
}

Supported PC actions (ONLY these 9 — never allow raw shell, cmd, powershell, or bash):
- open_app: {"name": string}
- close_app: {"name": string}
- open_url: {"url": string}
- search_web: {"query": string, "engine": "google"|"youtube"|"duckduckgo"|"bing"|"github"}
- media_control: {"key": "playpause"|"next"|"prev"}
- volume: {"direction": "up"|"down"|"mute", "steps": number}
- screenshot: {}
- lock_app: {"app": string, "duration_minutes": number | null, "duration_seconds": number | null, "until_time": string | null}
- unlock_app: {"app": string}

Supported permission_action values:
- grant_app_permission: {"app": string}
- revoke_app_permission: {"app": string}

When to use "research":
- Use kind="research" with {"query": "..."} when the user explicitly asks JARVIS to research, investigate, look up latest/current facts, compare real-world products/technologies, check recent news/updates, or find sources on its own (e.g., "research solid-state batteries", "look up the best standing desks in 2026 and compare them", "investigate how WebGPU works").
- Do NOT use "research" for quick local PC searches like "search YouTube for jazz" (use pc_action search_web instead).
- Do NOT use "research" for simple greetings, creative writing, drafting emails, or basic conversational Q&A (use kind="chat").

Examples of multitasking (multiple steps in one message):
- "Open Chrome and play my music" -> two pc_action steps: open_app(Chrome) + media_control(playpause).
- "Open VS Code and research React 19 compiler best practices" -> pc_action(open_app VS Code) + research(React 19 compiler best practices).
- "Mute volume, lock Chrome for 30 minutes, and write a quick standup update" -> pc_action(volume mute) + pc_action(lock_app Chrome 30m) + chat("write a quick standup update").
- If it is purely a normal conversation or coding question, return {"steps":[{"kind":"chat","prompt":"..."}],"spoken_intro":""}.`;

function isUsableKey(key: string): boolean {
  if (!key) return false;
  if (key === 'MY_GEMINI_API_KEY' || key.startsWith('MY_')) return false;
  return true;
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatTurn[],
  extraHeaders: Record<string, string> = {}
): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    // Non-JSON upstream error
  }

  if (!response.ok) {
    const errObj = parsed.error as Record<string, unknown> | undefined;
    const msg =
      (typeof errObj?.message === 'string' && errObj.message) ||
      `Provider returned HTTP ${response.status}`;
    throw new Error(msg);
  }

  const choices = parsed.choices as Array<{ message?: { content?: string } }> | undefined;
  const content = choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Provider returned an empty response.');
  }
  return content;
}

async function callGemini(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatTurn[]
): Promise<string> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  const text = response.text?.trim();
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }
  return text;
}

async function generateWithProvider(
  spec: ProviderSpec,
  systemPrompt: string,
  messages: ChatTurn[]
): Promise<string> {
  const apiKey = spec.getKey();
  if (!isUsableKey(apiKey)) {
    throw new Error(`${spec.envVar} is not configured.`);
  }

  switch (spec.id) {
    case 'groq':
      return callOpenAICompatible(
        'https://api.groq.com/openai/v1/chat/completions',
        apiKey,
        spec.model,
        systemPrompt,
        messages
      );
    case 'opentyphoon':
      return callOpenAICompatible(
        'https://api.opentyphoon.ai/v1/chat/completions',
        apiKey,
        spec.model,
        systemPrompt,
        messages
      );
    case 'openrouter':
      return callOpenAICompatible(
        'https://openrouter.ai/api/v1/chat/completions',
        apiKey,
        spec.model,
        systemPrompt,
        messages,
        {
          'HTTP-Referer': process.env.APP_URL || 'https://jarvis-assistant.local',
          'X-Title': 'JARVIS Virtual Assistant',
        }
      );
    case 'gemini':
      return callGemini(apiKey, spec.model, systemPrompt, messages);
  }
}

async function runWithProviderChain(
  preference: ProviderPreference,
  systemPrompt: string,
  messages: ChatTurn[]
): Promise<
  | { ok: true; text: string; provider: ProviderSpec; fallbackUsed: boolean }
  | { ok: false; statusCode: number; error: string; missingSecret?: string; missingSecrets?: string[] }
> {
  if (preference !== 'auto') {
    const target = PROVIDER_ORDER.find((p) => p.id === preference);
    if (!target) {
      return { ok: false, statusCode: 400, error: 'Unsupported model provider requested.' };
    }
    if (!isUsableKey(target.getKey())) {
      return {
        ok: false,
        statusCode: 400,
        error: `${target.name} is not configured yet. Please add ${target.envVar} in Settings > Secrets, or switch to Auto.`,
        missingSecret: target.envVar,
      };
    }

    try {
      const text = await generateWithProvider(target, systemPrompt, messages);
      return { ok: true, text, provider: target, fallbackUsed: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upstream provider request failed.';
      return { ok: false, statusCode: 502, error: `${target.name} error: ${message}` };
    }
  }

  const configured = PROVIDER_ORDER.filter((p) => isUsableKey(p.getKey()));
  if (configured.length === 0) {
    return {
      ok: false,
      statusCode: 503,
      error:
        'No AI provider keys are configured yet. Please add GROQ_API_KEY, OPENTYPHOON_API_KEY, OPENROUTER_API_KEY, or GEMINI_API_KEY in Settings > Secrets.',
      missingSecrets: PROVIDER_ORDER.map((p) => p.envVar),
    };
  }

  const errors: string[] = [];
  for (let i = 0; i < configured.length; i++) {
    const spec = configured[i];
    try {
      const text = await generateWithProvider(spec, systemPrompt, messages);
      return { ok: true, text, provider: spec, fallbackUsed: i > 0 };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Request failed';
      errors.push(`${spec.name}: ${reason}`);
    }
  }

  return {
    ok: false,
    statusCode: 502,
    error: `All configured AI providers failed (${errors.join(' | ')}).`,
  };
}

interface PlannedStep {
  kind: 'pc_action' | 'permission_action' | 'research' | 'chat';
  action: string;
  params: Record<string, unknown>;
  query: string;
  prompt: string;
}

function tryParseMultiPlan(raw: string): {
  steps: PlannedStep[];
  spoken_intro: string;
} | null {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    if (!Array.isArray(parsed.steps)) return null;

    const steps: PlannedStep[] = [];
    for (const s of parsed.steps.slice(0, 6)) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      const kind = rec.kind;
      if (
        kind !== 'pc_action' &&
        kind !== 'permission_action' &&
        kind !== 'research' &&
        kind !== 'chat'
      ) {
        continue;
      }
      steps.push({
        kind,
        action: typeof rec.action === 'string' ? rec.action.trim() : '',
        params:
          rec.params && typeof rec.params === 'object' && !Array.isArray(rec.params)
            ? (rec.params as Record<string, unknown>)
            : {},
        query: typeof rec.query === 'string' ? rec.query.trim() : '',
        prompt: typeof rec.prompt === 'string' ? rec.prompt.trim() : '',
      });
    }

    return {
      steps,
      spoken_intro: typeof parsed.spoken_intro === 'string' ? parsed.spoken_intro.trim() : '',
    };
  } catch {
    return null;
  }
}

function resolveLockEndsAt(
  userText: string,
  params: Record<string, unknown>,
  tzOffsetMinutes: number
): string | null {
  const nowMs = Date.now();
  const maxMs = 7 * 24 * 3600_000;
  const minMs = 10_000;

  const secVal = Number(params.duration_seconds);
  const minVal = Number(params.duration_minutes);
  const hrVal = Number(params.duration_hours);

  let deltaMs = 0;
  if (Number.isFinite(hrVal) && hrVal > 0) deltaMs += hrVal * 3600_000;
  if (Number.isFinite(minVal) && minVal > 0) deltaMs += minVal * 60_000;
  if (Number.isFinite(secVal) && secVal > 0) deltaMs += secVal * 1000;

  if (deltaMs > 0) {
    const clamped = Math.max(minMs, Math.min(maxMs, deltaMs));
    return new Date(nowMs + clamped).toISOString();
  }

  // Regex fallback for relative durations ("for 30 minutes", "for 1 hour", "for 45 seconds")
  const relHour = userText.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/i);
  const relMin = userText.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?)\b/i);
  const relSec = userText.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?)\b/i);
  if (relHour || relMin || relSec) {
    const ms =
      (relHour ? parseFloat(relHour[1]) * 3600_000 : 0) +
      (relMin ? parseFloat(relMin[1]) * 60_000 : 0) +
      (relSec ? parseFloat(relSec[1]) * 1000 : 0);
    if (ms > 0) {
      return new Date(nowMs + Math.max(minMs, Math.min(maxMs, ms))).toISOString();
    }
  }

  // Clock time ("until 6 pm", "until 18:30", "until midnight", "until noon")
  const untilRaw =
    typeof params.until_time === 'string' && params.until_time.trim()
      ? params.until_time.trim()
      : (userText.match(/(?:until|till|to)\s+([^\.,!?]+)$/i)?.[1] || '').trim();

  if (untilRaw) {
    const lower = untilRaw.toLowerCase();
    let targetHour: number | null = null;
    let targetMinute = 0;

    if (lower.includes('midnight')) {
      targetHour = 0;
      targetMinute = 0;
    } else if (lower.includes('noon')) {
      targetHour = 12;
      targetMinute = 0;
    } else {
      const m = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
      if (m) {
        let h = parseInt(m[1], 10);
        const min = m[2] ? parseInt(m[2], 10) : 0;
        const meridiem = m[3]?.toLowerCase();
        if (min >= 0 && min < 60 && h >= 0 && h <= 23) {
          if (meridiem === 'pm' && h < 12) h += 12;
          if (meridiem === 'am' && h === 12) h = 0;
          targetHour = h;
          targetMinute = min;
        }
      }
    }

    if (targetHour !== null) {
      const offsetMs = (Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0) * 60_000;
      const localWallMs = nowMs - offsetMs;
      const targetLocal = new Date(localWallMs);
      targetLocal.setUTCHours(targetHour, targetMinute, 0, 0);
      if (targetLocal.getTime() <= localWallMs + 5000) {
        targetLocal.setUTCDate(targetLocal.getUTCDate() + 1);
      }
      const targetUtcMs = targetLocal.getTime() + offsetMs;
      const diff = targetUtcMs - nowMs;
      if (diff >= minMs && diff <= maxMs) {
        return new Date(targetUtcMs).toISOString();
      }
    }
  }

  return null;
}

function validateMessages(raw: unknown): ChatTurn[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) {
    return null;
  }

  const sanitized: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const role = (item as Record<string, unknown>).role;
    const content = (item as Record<string, unknown>).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return null;
    }
    const trimmed = content.trim();
    if (!trimmed || trimmed.length > 16000) {
      return null;
    }
    sanitized.push({ role, content: trimmed });
  }

  if (sanitized[sanitized.length - 1]?.role !== 'user') {
    return null;
  }
  return sanitized;
}

function looksLikeShellCommand(text: string): boolean {
  return /\b(?:powershell|cmd\.exe|bash|sh\s+-c|rm\s+-rf|del\s+\/|format\s+c:|regedit|net\s+user|invoke-expression|iex\s*\()\b/i.test(
    text
  );
}

// Simple per-IP sliding-window rate limiter for agent endpoints
const agentRateBuckets = new Map<string, { count: number; resetAt: number }>();
function agentRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = agentRateBuckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    agentRateBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
    next();
    return;
  }

  if (bucket.count >= 120) {
    res.status(429).json({ error: 'Rate limit exceeded for agent requests.' });
    return;
  }

  bucket.count += 1;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!verifyAdminBearer(req.headers.authorization)) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

function requireAgentToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('X-Agent-Token');
  if (!verifyAgentHeader(token)) {
    res.status(401).json({ error: 'Unauthorized agent token.' });
    return;
  }
  next();
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // --- Providers ---
  app.get('/api/providers', (_req: Request, res: Response) => {
    const providers = PROVIDER_ORDER.map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model,
      envVar: p.envVar,
      available: isUsableKey(p.getKey()),
    }));
    res.json({ providers });
  });

  // --- Admin Auth (Salted SHA-256 + 5-attempt / 5-minute lockout) ---
  app.get('/api/admin/status', (req: Request, res: Response) => {
    res.json({
      authenticated: verifyAdminBearer(req.headers.authorization),
      lockout: getPasscodeLockoutStatus(),
    });
  });

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }

    const result = loginAdminWithPasscode(passcode);
    if (!result.ok) {
      res.status(result.locked ? 429 : 401).json({
        error: result.error,
        locked: result.locked,
        remainingSeconds: result.remainingSeconds,
        lockedUntil: result.lockedUntil,
      });
      return;
    }

    res.json({ token: result.token, authenticated: true });
  });

  app.post('/api/admin/change-passcode', requireAdmin, (req: Request, res: Response) => {
    const currentPasscode =
      typeof req.body?.currentPasscode === 'string' ? req.body.currentPasscode : '';
    const newPasscode =
      typeof req.body?.newPasscode === 'string' ? req.body.newPasscode : '';

    if (!currentPasscode || !newPasscode) {
      res.status(400).json({ error: 'Current passcode and new passcode are required.' });
      return;
    }

    const result = changeAdminPasscode(currentPasscode, newPasscode);
    if (!result.ok) {
      res.status(result.statusCode).json({
        error: result.error,
        locked: result.locked,
        remainingSeconds: result.remainingSeconds,
      });
      return;
    }

    res.json({ ok: true, message: 'Admin passcode updated.' });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    revokeAdminBearer(req.headers.authorization);
    res.json({ ok: true });
  });

  // --- Safe Non-Secret Public Status & History ---
  app.get('/api/pc/public-status', (_req: Request, res: Response) => {
    res.json(getPublicSafeStatus());
  });

  app.get('/api/pc/history', (_req: Request, res: Response) => {
    res.json({
      commands: listPCCommands(),
      locks: listAppLocks(),
      publicStatus: getPublicSafeStatus(),
    });
  });

  app.get('/api/pc/commands/status', (req: Request, res: Response) => {
    const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 64)
      .slice(0, 30);
    if (ids.length === 0) {
      res.json({ commands: [] });
      return;
    }
    res.json({ commands: getPCCommandsByIds(ids) });
  });

  // --- Autonomous Research Endpoints ---
  app.post('/api/research', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 500) {
      res.status(400).json({ error: 'Please provide a research topic (up to 500 characters).' });
      return;
    }

    const rawPref = body?.provider;
    const validPrefs: ProviderPreference[] = ['auto', 'groq', 'opentyphoon', 'openrouter', 'gemini'];
    const preference: ProviderPreference =
      typeof rawPref === 'string' && validPrefs.includes(rawPref as ProviderPreference)
        ? (rawPref as ProviderPreference)
        : 'auto';

    const job = startResearchJob(query, async (sys, usr) => {
      const result = await runWithProviderChain(preference, sys, [{ role: 'user', content: usr }]);
      if (!result.ok) return { ok: false, error: result.error };
      return {
        ok: true,
        text: result.text,
        providerName: result.provider.name,
        modelUsed: result.provider.model,
      };
    });

    res.json({ job });
  });

  app.get('/api/research/:id', (req: Request, res: Response) => {
    const job = getResearchJob(String(req.params.id));
    if (!job) {
      res.status(404).json({ error: 'Research task not found.' });
      return;
    }
    res.json({ job });
  });

  // --- Chat, Multi-Task Planner & Autonomous Research ---
  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const messages = validateMessages(body?.messages);
    if (!messages) {
      res.status(400).json({
        error: 'Invalid conversation payload. Please provide a non-empty user message.',
      });
      return;
    }

    const rawPref = body?.provider;
    const validPrefs: ProviderPreference[] = ['auto', 'groq', 'opentyphoon', 'openrouter', 'gemini'];
    const preference: ProviderPreference =
      typeof rawPref === 'string' && validPrefs.includes(rawPref as ProviderPreference)
        ? (rawPref as ProviderPreference)
        : 'auto';

    // Safety: Only direct typed/spoken messages can trigger PC actions, NEVER pasted/file/web text
    const isAdmin = verifyAdminBearer(req.headers.authorization);
    const inputSource = body?.inputSource;
    const latestUserMessage = messages[messages.length - 1].content;
    const isDirectUserInput =
      (inputSource === 'voice' || inputSource === 'typed') &&
      latestUserMessage.length <= 500 &&
      !latestUserMessage.includes('\n');

    const tzOffsetMinutes =
      typeof body?.clientTzOffsetMinutes === 'number' &&
      Number.isFinite(body.clientTzOffsetMinutes)
        ? body.clientTzOffsetMinutes
        : 0;

    if (isDirectUserInput && looksLikeShellCommand(latestUserMessage)) {
      const denied = recordDirectDeniedOrAuditCommand({
        command_text: latestUserMessage,
        action: 'open_app',
        params: {},
        status: 'denied',
        result_message: 'Blocked raw shell or terminal command request.',
        requested_by: isAdmin ? 'admin' : 'user',
      });
      res.json({
        type: 'pc_command',
        reply:
          'I cannot run raw shell or terminal commands for safety. I can only run permitted actions like opening allowed apps, locking apps, media playback, volume, screenshots, or web searches.',
        command: denied,
        commands: [denied],
      });
      return;
    }

    const plannerResult = await runWithProviderChain(preference, JARVIS_MULTI_PLANNER_PROMPT, [
      { role: 'user', content: latestUserMessage },
    ]);

    if (!plannerResult.ok) {
      res.status(plannerResult.statusCode).json({
        error: plannerResult.error,
        missingSecret: plannerResult.missingSecret,
        missingSecrets: plannerResult.missingSecrets,
      });
      return;
    }

    const plan = tryParseMultiPlan(plannerResult.text);
    const steps = plan?.steps || [];
    const hasActionOrResearch = steps.some(
      (s) => s.kind === 'pc_action' || s.kind === 'permission_action' || s.kind === 'research'
    );

    if (!hasActionOrResearch) {
      const chatResult = await runWithProviderChain(preference, JARVIS_SYSTEM_PROMPT, messages);
      if (!chatResult.ok) {
        res.status(chatResult.statusCode).json({
          error: chatResult.error,
          missingSecret: chatResult.missingSecret,
          missingSecrets: chatResult.missingSecrets,
        });
        return;
      }

      res.json({
        type: 'chat',
        reply: chatResult.text,
        providerUsed: chatResult.provider.id,
        providerName: chatResult.provider.name,
        modelUsed: chatResult.provider.model,
        fallbackUsed: chatResult.fallbackUsed,
      });
      return;
    }

    // Execute planned steps concurrently / cleanly
    const pcSettings = getSettingsInternal();
    const agentOnlineNow = isAgentOnline(pcSettings.agent_last_seen);
    const createdCommands: ReturnType<typeof createPCCommand>[] = [];
    const stepReplies: string[] = [];
    let pendingAction: Record<string, unknown> | undefined;
    let researchJob: ResearchJob | undefined;
    let updatedLocksSnapshot: ReturnType<typeof getActiveAppLocks> | undefined;
    let blockedNonDirectPC = false;

    for (const step of steps) {
      if (step.kind === 'permission_action') {
        if (!isDirectUserInput) {
          blockedNonDirectPC = true;
          continue;
        }
        const rawAction = step.action;
        const appName =
          typeof step.params.app === 'string'
            ? step.params.app.trim()
            : typeof step.params.name === 'string'
            ? step.params.name.trim()
            : '';

        if (!appName) {
          stepReplies.push('Let me know which app you want to change permissions for.');
          continue;
        }

        if (rawAction === 'grant_app_permission') {
          const tpl = buildAppTemplate(appName);
          pendingAction = {
            type: 'grant_app',
            appName: tpl.displayName,
            aliases: tpl.aliases,
            launchCommand: tpl.launchCommand,
            processName: tpl.processName,
          };
          stepReplies.push(`Enter the admin passcode below to grant permission for ${tpl.displayName}.`);
        } else if (rawAction === 'revoke_app_permission') {
          const existing = findAllowedApp(appName);
          if (!existing) {
            stepReplies.push(`${appName} isn't on the permitted apps list.`);
          } else {
            pendingAction = {
              type: 'revoke_app',
              appName: existing.displayName,
            };
            stepReplies.push(
              `Enter the admin passcode below to revoke permission for ${existing.displayName}.`
            );
          }
        }
        continue;
      }

      if (step.kind === 'pc_action') {
        if (!isDirectUserInput) {
          blockedNonDirectPC = true;
          continue;
        }

        const action = step.action as PCAction;
        if (!ALLOWED_ACTIONS.includes(action)) {
          const denied = recordDirectDeniedOrAuditCommand({
            command_text: latestUserMessage,
            action: 'open_app',
            params: { requestedAction: step.action },
            status: 'denied',
            result_message: `Blocked unsupported action "${step.action}".`,
            requested_by: isAdmin ? 'admin' : 'user',
          });
          createdCommands.push(denied);
          stepReplies.push(
            `I skipped "${step.action}" because only safe permitted PC actions are allowed.`
          );
          continue;
        }

        const safeParams = validateActionParams(action, step.params);
        if (!safeParams) {
          stepReplies.push(`I need a clearer target for ${action.replace('_', ' ')}.`);
          continue;
        }

        if (pcSettings.kill_switch || !pcSettings.pc_control_enabled) {
          const denied = recordDirectDeniedOrAuditCommand({
            command_text: latestUserMessage,
            action,
            params: safeParams,
            status: 'denied',
            result_message: pcSettings.kill_switch
              ? 'Blocked by Kill Switch.'
              : 'PC Controls are turned off.',
            requested_by: isAdmin ? 'admin' : 'user',
          });
          createdCommands.push(denied);
          stepReplies.push(
            pcSettings.kill_switch
              ? 'The Kill Switch is active, so PC actions are paused right now.'
              : 'PC Controls are turned off—enable them in PC Control settings first.'
          );
          continue;
        }

        if (action === 'open_app') {
          const requestedName = String(safeParams.name || '');
          const activeLock = findActiveLockForApp(requestedName);
          if (activeLock) {
            const remaining = formatRemainingDuration(activeLock.ends_at);
            const denied = recordDirectDeniedOrAuditCommand({
              command_text: latestUserMessage,
              action: 'open_app',
              params: { name: activeLock.app, locked: true },
              status: 'denied',
              result_message: `Blocked: ${activeLock.app} is locked (${remaining} remaining).`,
              requested_by: isAdmin ? 'admin' : 'user',
            });
            createdCommands.push(denied);
            updatedLocksSnapshot = getActiveAppLocks();
            stepReplies.push(
              `I can't open ${activeLock.app} right now—it's locked with ${remaining} remaining.`
            );
            continue;
          }

          const allowedApp = findAllowedApp(requestedName);
          if (!allowedApp) {
            const denied = recordDirectDeniedOrAuditCommand({
              command_text: latestUserMessage,
              action: 'open_app',
              params: { name: requestedName },
              status: 'denied',
              result_message: `Refused: "${requestedName}" is not on the permitted apps list.`,
              requested_by: isAdmin ? 'admin' : 'user',
            });
            createdCommands.push(denied);
            stepReplies.push(
              `I can't open ${requestedName} because it isn't on the permitted apps list yet—an admin needs to grant permission first.`
            );
            continue;
          }

          const cmd = createPCCommand({
            command_text: `Open ${allowedApp.displayName}`,
            action: 'open_app',
            params: {
              name: allowedApp.displayName,
              launch_command: allowedApp.launchCommand,
              process_name: allowedApp.processName,
            },
            requested_by: isAdmin ? 'admin' : 'user',
            forceImmediateApprove: true,
          });
          createdCommands.push(cmd);
          stepReplies.push(
            agentOnlineNow
              ? `Opening ${allowedApp.displayName}.`
              : `Queued ${allowedApp.displayName} (will launch once your PC Agent connects).`
          );
          continue;
        }

        if (action === 'lock_app') {
          const appName = String(safeParams.app || '');
          const endsAtIso = resolveLockEndsAt(latestUserMessage, safeParams, tzOffsetMinutes);
          if (!endsAtIso) {
            stepReplies.push(
              `Tell me how long to lock ${appName}—like "for 30 minutes" or "until 6 pm".`
            );
            continue;
          }

          const { lock, command } = createAppLock({
            appQuery: appName,
            endsAtIso,
            lockedBy: isAdmin ? 'admin' : 'user',
            commandText: latestUserMessage,
          });
          createdCommands.push(command);
          updatedLocksSnapshot = getActiveAppLocks();
          const durationText = formatRemainingDuration(lock.ends_at);
          stepReplies.push(
            agentOnlineNow
              ? `Locked ${lock.app} for ${durationText}.`
              : `Locked ${lock.app} for ${durationText} (PC Agent is offline, so background process closing starts once it connects).`
          );
          continue;
        }

        if (action === 'unlock_app') {
          const appName = String(safeParams.app || '');
          const activeLock = findActiveLockForApp(appName);
          if (!activeLock) {
            stepReplies.push(`${appName} isn't locked right now.`);
          } else {
            pendingAction = {
              type: 'unlock_app',
              lockId: activeLock.id,
              appName: activeLock.app,
            };
            stepReplies.push(
              `${activeLock.app} is locked—enter your admin passcode below to unlock it early.`
            );
          }
          continue;
        }

        let enrichedParams = { ...safeParams };
        if (action === 'close_app') {
          const target = findAllowedApp(String(safeParams.name || ''));
          if (target) {
            enrichedParams = {
              name: target.displayName,
              process_name: target.processName,
            };
          }
        }

        const cmd = createPCCommand({
          command_text: latestUserMessage,
          action,
          params: enrichedParams,
          requested_by: isAdmin ? 'admin' : 'user',
        });

        if (!isAdmin && cmd.status === 'approved') {
          cmd.status = 'pending_approval';
          cmd.decided_at = undefined;
        }

        createdCommands.push(cmd);
        if (cmd.status === 'approved') {
          stepReplies.push(`Queued ${action.replace('_', ' ')} on your PC.`);
        } else if (cmd.status === 'pending_approval') {
          stepReplies.push(
            cmd.risk_level === 'high'
              ? `${action.replace('_', ' ')} needs admin passcode approval within 60 seconds.`
              : `${action.replace('_', ' ')} is ready for your approval within 60 seconds.`
          );
        } else {
          stepReplies.push(cmd.result_message || `Skipped ${action.replace('_', ' ')}.`);
        }
        continue;
      }

      if (step.kind === 'research' && step.query) {
        researchJob = startResearchJob(step.query, async (sys, usr) => {
          const r = await runWithProviderChain(preference, sys, [{ role: 'user', content: usr }]);
          if (!r.ok) return { ok: false, error: r.error };
          return {
            ok: true,
            text: r.text,
            providerName: r.provider.name,
            modelUsed: r.provider.model,
          };
        });
        stepReplies.push(
          `I've started researching "${step.query}" in the background—you can keep chatting or run other commands while I pull sources together.`
        );
        continue;
      }

      if (step.kind === 'chat' && step.prompt) {
        const subChat = await runWithProviderChain(preference, JARVIS_SYSTEM_PROMPT, [
          ...messages.slice(-8, -1),
          { role: 'user', content: step.prompt },
        ]);
        if (subChat.ok) {
          stepReplies.push(subChat.text);
        }
      }
    }

    if (blockedNonDirectPC && stepReplies.length === 0) {
      stepReplies.push(
        'For safety, PC actions can only be triggered by typing or speaking directly—not from pasted or dropped text.'
      );
    }

    const finalReply =
      stepReplies.length > 0
        ? stepReplies.join(' ')
        : "I'm on it.";

    const responseType = pendingAction
      ? 'chat_passcode_action'
      : researchJob
      ? 'research_started'
      : createdCommands.length > 0
      ? 'pc_command'
      : 'chat';

    res.json({
      type: responseType,
      reply: finalReply,
      command: createdCommands[0],
      commands: createdCommands,
      pendingAction,
      researchJob,
      activeLocks: updatedLocksSnapshot,
      providerUsed: plannerResult.provider.id,
      providerName: plannerResult.provider.name,
      modelUsed: plannerResult.provider.model,
      fallbackUsed: plannerResult.fallbackUsed,
    });
  });

  // --- PC Control Admin Endpoints ---
  app.get('/api/pc/state', requireAdmin, (_req: Request, res: Response) => {
    const settings = getPublicAdminSettings();
    const commands = listPCCommands();
    const locks = listAppLocks();
    res.json({
      settings,
      commands,
      locks,
      agentOnline: isAgentOnline(settings.agent_last_seen),
      lockout: getPasscodeLockoutStatus(),
    });
  });

  app.patch('/api/pc/settings', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid settings payload.' });
      return;
    }

    const updated = updatePCSettings({
      pc_control_enabled:
        typeof body.pc_control_enabled === 'boolean' ? body.pc_control_enabled : undefined,
      kill_switch: typeof body.kill_switch === 'boolean' ? body.kill_switch : undefined,
      approval_mode:
        typeof body.approval_mode === 'string'
          ? (body.approval_mode as PCApprovalMode)
          : undefined,
      allowed_apps: Array.isArray(body.allowed_apps)
        ? (body.allowed_apps as AllowedAppEntry[])
        : undefined,
      voice_wake_word_enabled:
        typeof body.voice_wake_word_enabled === 'boolean'
          ? body.voice_wake_word_enabled
          : undefined,
    });

    res.json({
      settings: updated,
      agentOnline: isAgentOnline(updated.agent_last_seen),
      locks: listAppLocks(),
    });
  });

  app.post('/api/pc/token/regenerate', requireAdmin, (_req: Request, res: Response) => {
    const agent_token = regenerateAgentToken();
    res.json({ agent_token });
  });

  app.post('/api/pc/quick-action', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const action = typeof body?.action === 'string' ? (body.action.trim() as PCAction) : null;
    const rawParams =
      body?.params && typeof body.params === 'object' && !Array.isArray(body.params)
        ? (body.params as Record<string, unknown>)
        : {};

    if (!action || !ALLOWED_ACTIONS.includes(action)) {
      res.status(400).json({ error: 'Unsupported quick action.' });
      return;
    }

    const pcSettings = getSettingsInternal();
    if (pcSettings.kill_switch || !pcSettings.pc_control_enabled) {
      res.status(409).json({
        error: pcSettings.kill_switch
          ? 'Kill Switch is active—turn it off before running PC actions.'
          : 'Turn on PC Controls before running actions.',
      });
      return;
    }

    const safeParams = validateActionParams(action, rawParams);
    if (!safeParams) {
      res.status(400).json({ error: 'Invalid parameters for quick action.' });
      return;
    }

    if (action === 'lock_app') {
      const appName = String(safeParams.app || '');
      const minutesRaw = Number(rawParams.duration_minutes);
      const mins = Number.isFinite(minutesRaw) ? Math.max(1, Math.min(10080, Math.round(minutesRaw))) : 30;
      const endsAtIso = new Date(Date.now() + mins * 60_000).toISOString();
      const { lock, command } = createAppLock({
        appQuery: appName,
        endsAtIso,
        lockedBy: 'admin',
        commandText: `Quick lock ${appName} for ${mins} minutes`,
      });
      res.json({
        ok: true,
        command,
        lock,
        activeLocks: getActiveAppLocks(),
        locks: listAppLocks(),
      });
      return;
    }

    if (action === 'open_app') {
      const targetName = String(safeParams.name || '');
      const activeLock = findActiveLockForApp(targetName);
      if (activeLock) {
        res.status(409).json({
          error: `${activeLock.app} is locked with ${formatRemainingDuration(activeLock.ends_at)} remaining.`,
        });
        return;
      }
      const allowed = findAllowedApp(targetName);
      if (!allowed) {
        res.status(403).json({ error: `${targetName} is not on the permitted apps list.` });
        return;
      }
      const cmd = createPCCommand({
        command_text: `Quick launch ${allowed.displayName}`,
        action: 'open_app',
        params: {
          name: allowed.displayName,
          launch_command: allowed.launchCommand,
          process_name: allowed.processName,
        },
        requested_by: 'admin',
        forceImmediateApprove: true,
      });
      res.json({ ok: true, command: cmd });
      return;
    }

    let enrichedParams = { ...safeParams };
    let label = `Quick ${action.replace('_', ' ')}`;
    if (action === 'close_app') {
      const target = findAllowedApp(String(safeParams.name || ''));
      if (target) {
        enrichedParams = { name: target.displayName, process_name: target.processName };
        label = `Close ${target.displayName}`;
      }
    }

    const cmd = createPCCommand({
      command_text: label,
      action,
      params: enrichedParams,
      requested_by: 'admin',
      forceImmediateApprove: true,
    });
    res.json({ ok: true, command: cmd });
  });

  app.post('/api/pc/locks/:id/unlock', (req: Request, res: Response) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!passcode) {
      res.status(400).json({ error: 'Admin passcode is required to unlock an app early.' });
      return;
    }

    const result = unlockAppWithPasscode({
      lockIdOrApp: String(req.params.id),
      passcode,
      actor: verifyAdminBearer(req.headers.authorization) ? 'admin' : 'user_with_passcode',
    });

    if (!result.ok) {
      res.status(result.statusCode).json({
        error: result.error,
        locked: result.locked,
        remainingSeconds: result.remainingSeconds,
      });
      return;
    }

    res.json({
      ok: true,
      lock: result.lock,
      command: result.command,
      activeLocks: getActiveAppLocks(),
    });
  });

  app.post('/api/pc/permissions/chat-confirm', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const passcode = typeof body?.passcode === 'string' ? body.passcode : '';
    const action = body?.action;
    const appName = typeof body?.appName === 'string' ? body.appName.trim() : '';

    if (!passcode || !appName || (action !== 'grant_app' && action !== 'revoke_app')) {
      res.status(400).json({ error: 'Passcode, action, and app name are required.' });
      return;
    }

    const check = checkAdminPasscode(passcode);
    if (!check.ok) {
      res.status(check.locked ? 429 : 401).json({
        error: check.error,
        locked: check.locked,
        remainingSeconds: check.remainingSeconds,
      });
      return;
    }

    if (action === 'grant_app') {
      const aliases = Array.isArray(body?.aliases)
        ? body.aliases.filter((a): a is string => typeof a === 'string')
        : undefined;
      const launchCommand =
        typeof body?.launchCommand === 'string' ? body.launchCommand : undefined;
      const processName =
        typeof body?.processName === 'string' ? body.processName : undefined;

      const { app: addedApp } = grantAllowedApp({
        displayName: appName,
        aliases,
        launchCommand,
        processName,
      });

      const audit = recordDirectDeniedOrAuditCommand({
        command_text: `Give permission for ${addedApp.displayName}`,
        action: 'open_app',
        params: { permission: 'granted', app: addedApp.displayName, process: addedApp.processName },
        status: 'done',
        result_message: `Permission granted for ${addedApp.displayName}.`,
        requested_by: 'admin',
      });

      res.json({
        ok: true,
        app: addedApp,
        audit,
        message: `Permission granted for ${addedApp.displayName}.`,
      });
      return;
    }

    const removed = revokeAllowedApp(appName);
    if (!removed) {
      res.status(404).json({ error: `${appName} was not found in permitted apps.` });
      return;
    }

    const audit = recordDirectDeniedOrAuditCommand({
      command_text: `Revoke permission for ${removed.displayName}`,
      action: 'open_app',
      params: { permission: 'revoked', app: removed.displayName },
      status: 'done',
      result_message: `Permission revoked for ${removed.displayName}.`,
      requested_by: 'admin',
    });

    res.json({
      ok: true,
      removed,
      audit,
      message: `Permission revoked for ${removed.displayName}.`,
    });
  });

  app.get('/api/pc/commands/:id', requireAdmin, (req: Request, res: Response) => {
    const cmd = getPCCommandById(String(req.params.id));
    if (!cmd) {
      res.status(404).json({ error: 'Command not found.' });
      return;
    }
    res.json({ command: cmd });
  });

  app.post('/api/pc/commands/:id/decide', (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const isAdmin = verifyAdminBearer(req.headers.authorization);
    const passcode = typeof body?.passcode === 'string' ? body.passcode : undefined;

    if (!isAdmin) {
      if (!passcode) {
        res.status(401).json({ error: 'Admin passcode is required.' });
        return;
      }
      const check = checkAdminPasscode(passcode);
      if (!check.ok) {
        res.status(check.locked ? 429 : 401).json({
          error: check.error,
          locked: check.locked,
          remainingSeconds: check.remainingSeconds,
        });
        return;
      }
    }

    const decision = body?.decision;
    if (decision !== 'approve' && decision !== 'deny') {
      res.status(400).json({ error: 'Decision must be approve or deny.' });
      return;
    }

    const outcome = decidePCCommand({
      id: String(req.params.id),
      decision,
      passcode,
      alwaysAllowApp: Boolean(body?.alwaysAllowApp),
      viaVoice: Boolean(body?.viaVoice),
    });

    if (!outcome.ok) {
      res.status(outcome.statusCode).json({
        error: outcome.error,
        locked: outcome.locked,
        remainingSeconds: outcome.remainingSeconds,
      });
      return;
    }
    res.json({ command: outcome.command });
  });

  // --- Local PC Agent Endpoints (X-Agent-Token protected + rate-limited) ---
  app.get(
    '/api/agent/poll',
    agentRateLimiter,
    requireAgentToken,
    (_req: Request, res: Response) => {
      const payload = pollApprovedCommandsForAgent();
      res.json(payload);
    }
  );

  app.post(
    '/api/agent/report',
    agentRateLimiter,
    requireAgentToken,
    (req: Request, res: Response) => {
      const body = req.body as Record<string, unknown> | undefined;
      const id = typeof body?.id === 'string' ? body.id.trim() : '';
      const status = body?.status;
      const message = typeof body?.message === 'string' ? body.message : '';

      if (!id || (status !== 'done' && status !== 'failed')) {
        res.status(400).json({
          error: 'Invalid report payload. Requires id and status (done|failed).',
        });
        return;
      }

      const updated = reportCommandExecution({ id, status, message });
      if (!updated) {
        res.status(404).json({ error: 'PCCommand not found.' });
        return;
      }
      res.json({ ok: true, command: updated });
    }
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`JARVIS server running on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start JARVIS server:', err);
  process.exit(1);
});
