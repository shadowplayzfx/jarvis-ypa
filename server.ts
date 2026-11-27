import 'dotenv/config';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import {
  ALLOWED_ACTIONS,
  claimAdminPasscode,
  createPCCommand,
  decidePCCommand,
  getEnvAdminPasscode,
  getPCCommandById,
  getPublicAdminSettings,
  getSettingsInternal,
  isAdminClaimed,
  isAgentOnline,
  listPCCommands,
  pollApprovedCommandsForAgent,
  regenerateAgentToken,
  reportCommandExecution,
  revokeAdminBearer,
  updatePCSettings,
  validateActionParams,
  verifyAdminBearer,
  verifyAdminLogin,
  verifyAgentHeader,
  type PCAction,
  type PCApprovalMode,
} from './server/pcControlStore.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ProviderId = 'groq' | 'openrouter' | 'gemini';
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
    id: 'openrouter',
    name: 'OpenRouter',
    model: 'google/gemini-2.5-flash',
    envVar: 'OPENROUTER_API_KEY',
    getKey: () => (process.env.OPENROUTER_API_KEY || '').trim(),
  },
  {
    id: 'gemini',
    name: 'Google AI Studio',
    model: 'gemini-4-hydrogen',
    envVar: 'GOOGLE_AI_STUDIO_API_KEY',
    getKey: () =>
      (process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || '').trim(),
  },
];

const JARVIS_SYSTEM_PROMPT = `You are JARVIS, a capable, warm, sharp, and human-like personal assistant.

You help the user get work done effortlessly:
- Writing and refining emails, messages, and briefs
- Summarizing documents, notes, and complex ideas
- Brainstorming strategies, creative angles, and solutions
- Task planning, prioritization, and daily scheduling
- Research synthesis, explanations, and coding assistance

Personality & voice rules:
1. Sound like a thoughtful, intelligent colleague—natural, warm, concise, never stiff or robotic.
2. Keep conversational replies crisp and natural to hear aloud (usually 2–4 clear sentences unless the user asks for a full email draft, plan, or code snippet).
3. Avoid cluttering spoken responses with heavy markdown symbols. When providing a draft email, structured plan, or code, give a natural 1-sentence intro followed by clean formatted text.
4. Use session context naturally.`;

const PC_INTENT_SYSTEM_PROMPT = `You are a strict intent classifier for JARVIS PC Control Mode.
Given ONLY a direct user message, decide whether the user is asking to execute a PC action on their computer.
Return ONLY valid JSON with no markdown fences and no extra prose:
{"is_pc_command": boolean, "action": string, "params": object, "spoken_reply": string}

Supported actions (and NOTHING else):
- open_app: {"name": string}
- open_url: {"url": string} (http/https only)
- search_web: {"query": string, "engine": "google"|"youtube"|"duckduckgo"|"bing"|"github"}
- media_control: {"key": "playpause"|"next"|"prev"}
- volume: {"direction": "up"|"down"|"mute", "steps": number}
- close_app: {"name": string}
- type_text: {"text": string}
- screenshot: {}
- lock_screen: {}
- restart: {}
- shutdown: {}

Rules:
1. If the user is asking a general question, chatting, asking for code, asking to write an email, or anything that is NOT a direct computer control command, return {"is_pc_command": false, "action": "", "params": {}, "spoken_reply": ""}.
2. Never invent actions outside the list above. Never allow shell or terminal commands.
3. Keep "spoken_reply" short, natural, and conversational (e.g., "Sure, opening Spotify now." or "Got it—locking your screen once you approve.").`;

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
      temperature: 0.5,
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
        'No AI provider keys are configured yet. Please add GROQ_API_KEY, OPENROUTER_API_KEY, or GOOGLE_AI_STUDIO_API_KEY in Settings > Secrets.',
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

function tryParseIntentJson(raw: string): {
  is_pc_command: boolean;
  action: string;
  params: Record<string, unknown>;
  spoken_reply: string;
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
    return {
      is_pc_command: Boolean(parsed.is_pc_command),
      action: typeof parsed.action === 'string' ? parsed.action.trim() : '',
      params:
        parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
          ? (parsed.params as Record<string, unknown>)
          : {},
      spoken_reply: typeof parsed.spoken_reply === 'string' ? parsed.spoken_reply.trim() : '',
    };
  } catch {
    return null;
  }
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

  // --- Admin Auth ---
  app.get('/api/admin/status', (req: Request, res: Response) => {
    res.json({
      authenticated: verifyAdminBearer(req.headers.authorization),
      adminClaimed: isAdminClaimed(),
      envPasscodeConfigured: Boolean(getEnvAdminPasscode()),
    });
  });

  app.post('/api/admin/claim', (req: Request, res: Response) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (passcode.length < 4 || passcode.length > 128) {
      res.status(400).json({ error: 'Passcode must be between 4 and 128 characters.' });
      return;
    }

    try {
      const token = claimAdminPasscode(passcode);
      res.json({ token, authenticated: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to claim admin passcode.';
      res.status(409).json({ error: message });
    }
  });

  app.post('/api/admin/login', (req: Request, res: Response) => {
    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
    if (!passcode) {
      res.status(400).json({ error: 'Passcode is required.' });
      return;
    }
    const token = verifyAdminLogin(passcode);
    if (!token) {
      res.status(401).json({ error: 'Invalid admin passcode.' });
      return;
    }
    res.json({ token, authenticated: true });
  });

  app.post('/api/admin/logout', (req: Request, res: Response) => {
    revokeAdminBearer(req.headers.authorization);
    res.json({ ok: true });
  });

  // --- Chat & PC Intent Classification ---
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
    const validPrefs: ProviderPreference[] = ['auto', 'groq', 'openrouter', 'gemini'];
    const preference: ProviderPreference =
      typeof rawPref === 'string' && validPrefs.includes(rawPref as ProviderPreference)
        ? (rawPref as ProviderPreference)
        : 'auto';

    // Safety: Only direct typed/spoken messages from an authenticated admin can create PCCommands
    const isAdmin = verifyAdminBearer(req.headers.authorization);
    const inputSource = body?.inputSource;
    const isDirectUserInput = inputSource === 'voice' || inputSource === 'typed';
    const pcSettings = getSettingsInternal();

    if (isAdmin && isDirectUserInput && pcSettings.pc_control_enabled) {
      const latestUserMessage = messages[messages.length - 1].content;
      const intentResult = await runWithProviderChain(preference, PC_INTENT_SYSTEM_PROMPT, [
        { role: 'user', content: latestUserMessage },
      ]);

      if (intentResult.ok) {
        const parsedIntent = tryParseIntentJson(intentResult.text);
        if (parsedIntent?.is_pc_command) {
          const action = parsedIntent.action as PCAction;
          if (!ALLOWED_ACTIONS.includes(action)) {
            res.json({
              type: 'chat',
              reply:
                'I caught that as a computer action, but that specific operation is outside my allowed PC controls. Could you rephrase using a supported action like opening an app, searching the web, media, volume, or screenshot?',
              providerUsed: intentResult.provider.id,
              providerName: intentResult.provider.name,
              modelUsed: intentResult.provider.model,
              fallbackUsed: intentResult.fallbackUsed,
            });
            return;
          }

          const safeParams = validateActionParams(action, parsedIntent.params);
          if (!safeParams) {
            res.json({
              type: 'chat',
              reply:
                'I understood you want to control your PC, though I need a clearer target—like the exact app name, search query, or valid URL. What should I target?',
              providerUsed: intentResult.provider.id,
              providerName: intentResult.provider.name,
              modelUsed: intentResult.provider.model,
              fallbackUsed: intentResult.fallbackUsed,
            });
            return;
          }

          const command = createPCCommand({
            command_text: latestUserMessage,
            action,
            params: safeParams,
            requested_by: 'admin',
          });

          const reply =
            command.status === 'denied'
              ? command.result_message || 'That PC command was blocked.'
              : command.status === 'approved'
              ? parsedIntent.spoken_reply || `On it—queued ${action.replace('_', ' ')} for your PC.`
              : `Ready to ${action.replace('_', ' ')}. Please approve or deny within 60 seconds.`;

          res.json({
            type: 'pc_command',
            reply,
            command,
            providerUsed: intentResult.provider.id,
            providerName: intentResult.provider.name,
            modelUsed: intentResult.provider.model,
            fallbackUsed: intentResult.fallbackUsed,
          });
          return;
        }
      }
    }

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
  });

  // --- PC Control Admin Endpoints ---
  app.get('/api/pc/state', requireAdmin, (_req: Request, res: Response) => {
    const settings = getPublicAdminSettings();
    const commands = listPCCommands();
    res.json({
      settings,
      commands,
      agentOnline: isAgentOnline(settings.agent_last_seen),
    });
  });

  app.patch('/api/pc/settings', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid settings payload.' });
      return;
    }

    if (typeof body.new_pin === 'string' && body.new_pin.length > 0 && body.new_pin.length < 4) {
      res.status(400).json({ error: 'High-Risk PIN must be at least 4 characters.' });
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
        ? body.allowed_apps.filter((a): a is string => typeof a === 'string')
        : undefined,
      voice_wake_word_enabled:
        typeof body.voice_wake_word_enabled === 'boolean'
          ? body.voice_wake_word_enabled
          : undefined,
      new_pin:
        body.new_pin === null || typeof body.new_pin === 'string' ? body.new_pin : undefined,
    });

    res.json({ settings: updated, agentOnline: isAgentOnline(updated.agent_last_seen) });
  });

  app.post('/api/pc/token/regenerate', requireAdmin, (_req: Request, res: Response) => {
    const agent_token = regenerateAgentToken();
    res.json({ agent_token });
  });

  app.get('/api/pc/commands/:id', requireAdmin, (req: Request, res: Response) => {
    const cmd = getPCCommandById(String(req.params.id));
    if (!cmd) {
      res.status(404).json({ error: 'Command not found.' });
      return;
    }
    res.json({ command: cmd });
  });

  app.post('/api/pc/commands/:id/decide', requireAdmin, (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown> | undefined;
    const decision = body?.decision;
    if (decision !== 'approve' && decision !== 'deny') {
      res.status(400).json({ error: 'Decision must be approve or deny.' });
      return;
    }

    const outcome = decidePCCommand({
      id: String(req.params.id),
      decision,
      pin: typeof body?.pin === 'string' ? body.pin : undefined,
      alwaysAllowApp: Boolean(body?.alwaysAllowApp),
      viaVoice: Boolean(body?.viaVoice),
    });

    if (!outcome.ok) {
      res.status(outcome.statusCode).json({ error: outcome.error });
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
        res.status(400).json({ error: 'Invalid report payload. Requires id and status (done|failed).' });
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
