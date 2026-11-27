import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type PCAction =
  | 'open_app'
  | 'open_url'
  | 'search_web'
  | 'media_control'
  | 'volume'
  | 'close_app'
  | 'type_text'
  | 'screenshot'
  | 'lock_screen'
  | 'restart'
  | 'shutdown';

export type PCRiskLevel = 'low' | 'medium' | 'high';

export type PCCommandStatus =
  | 'pending_approval'
  | 'approved'
  | 'denied'
  | 'running'
  | 'done'
  | 'failed'
  | 'expired';

export type PCApprovalMode =
  | 'ask_always'
  | 'auto_low_risk'
  | 'auto_all_except_high';

export interface PCCommandRecord {
  id: string;
  command_text: string;
  action: PCAction;
  params: Record<string, unknown>;
  risk_level: PCRiskLevel;
  status: PCCommandStatus;
  result_message?: string;
  requested_by: string;
  created_at: string;
  decided_at?: string;
  executed_at?: string;
}

export interface PCSettingsInternal {
  pc_control_enabled: boolean;
  kill_switch: boolean;
  approval_mode: PCApprovalMode;
  agent_token: string;
  agent_last_seen: string | null;
  allowed_apps: string[];
  voice_wake_word_enabled: boolean;
  pin_for_high_risk_hash: string | null;
  admin_passcode_hash: string | null;
}

interface StoreData {
  settings: PCSettingsInternal;
  commands: PCCommandRecord[];
}

export const ACTION_RISK_MAP: Record<PCAction, PCRiskLevel> = {
  open_app: 'low',
  open_url: 'low',
  search_web: 'low',
  media_control: 'low',
  volume: 'low',
  close_app: 'medium',
  type_text: 'medium',
  screenshot: 'medium',
  lock_screen: 'high',
  restart: 'high',
  shutdown: 'high',
};

export const ALLOWED_ACTIONS: ReadonlyArray<PCAction> = Object.keys(
  ACTION_RISK_MAP
) as PCAction[];

const COMMAND_EXPIRY_MS = 60_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'pc-control.json');

function generateAgentToken(): string {
  return crypto.randomBytes(24).toString('hex'); // 48 chars
}

function createDefaultStore(): StoreData {
  return {
    settings: {
      pc_control_enabled: true,
      kill_switch: false,
      approval_mode: 'auto_low_risk',
      agent_token: generateAgentToken(),
      agent_last_seen: null,
      allowed_apps: ['chrome', 'spotify', 'notepad', 'vscode', 'calculator'],
      voice_wake_word_enabled: false,
      pin_for_high_risk_hash: null,
      admin_passcode_hash: null,
    },
    commands: [],
  };
}

let storeCache: StoreData | null = null;
const adminSessions = new Map<string, number>();

function loadStore(): StoreData {
  if (storeCache) return storeCache;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreData>;
      const defaults = createDefaultStore();
      storeCache = {
        settings: {
          ...defaults.settings,
          ...(parsed.settings || {}),
          agent_token:
            typeof parsed.settings?.agent_token === 'string' &&
            parsed.settings.agent_token.length >= 40
              ? parsed.settings.agent_token
              : defaults.settings.agent_token,
          allowed_apps: Array.isArray(parsed.settings?.allowed_apps)
            ? parsed.settings.allowed_apps.filter((a): a is string => typeof a === 'string')
            : defaults.settings.allowed_apps,
        },
        commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      };
      return storeCache;
    }
  } catch {
    // Fall back to fresh default store if unreadable
  }

  storeCache = createDefaultStore();
  saveStore();
  return storeCache;
}

function saveStore(): void {
  if (!storeCache) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(storeCache, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  } catch {
    // Best-effort disk persistence
  }
}

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hexHash] = parts;
  if (!salt || !hexHash) return false;
  try {
    const derived = crypto.scryptSync(plain, salt, 64);
    const storedBuf = Buffer.from(hexHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

export function safeCompareTokens(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

export function getEnvAdminPasscode(): string {
  return (process.env.JARVIS_ADMIN_PASSCODE || '').trim();
}

export function isAdminClaimed(): boolean {
  const store = loadStore();
  return Boolean(getEnvAdminPasscode() || store.settings.admin_passcode_hash);
}

export function claimAdminPasscode(passcode: string): string {
  const store = loadStore();
  if (getEnvAdminPasscode() || store.settings.admin_passcode_hash) {
    throw new Error('Admin passcode is already configured.');
  }
  store.settings.admin_passcode_hash = hashSecret(passcode);
  saveStore();
  return createAdminSession();
}

export function verifyAdminLogin(passcode: string): string | null {
  const envPass = getEnvAdminPasscode();
  if (envPass) {
    if (!safeCompareTokens(passcode, envPass)) return null;
    return createAdminSession();
  }

  const store = loadStore();
  if (!store.settings.admin_passcode_hash) return null;
  if (!verifySecret(passcode, store.settings.admin_passcode_hash)) return null;
  return createAdminSession();
}

function createAdminSession(): string {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function verifyAdminBearer(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

export function revokeAdminBearer(authHeader: string | undefined): void {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return;
  const token = authHeader.slice(7).trim();
  if (token) adminSessions.delete(token);
}

export function expireStaleCommands(): boolean {
  const store = loadStore();
  const now = Date.now();
  let changed = false;

  for (const cmd of store.commands) {
    if (cmd.status === 'pending_approval') {
      const createdMs = Date.parse(cmd.created_at);
      if (!Number.isNaN(createdMs) && now - createdMs >= COMMAND_EXPIRY_MS) {
        cmd.status = 'expired';
        cmd.decided_at = new Date(now).toISOString();
        cmd.result_message = 'Approval window expired after 60 seconds.';
        changed = true;
      }
    }
  }

  if (changed) saveStore();
  return changed;
}

export function isAgentOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  const ts = Date.parse(lastSeen);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < 15_000;
}

export function getPublicAdminSettings() {
  const store = loadStore();
  const s = store.settings;
  return {
    pc_control_enabled: s.pc_control_enabled,
    kill_switch: s.kill_switch,
    approval_mode: s.approval_mode,
    agent_token: s.agent_token,
    agent_last_seen: s.agent_last_seen,
    allowed_apps: s.allowed_apps,
    voice_wake_word_enabled: s.voice_wake_word_enabled,
    pin_configured: Boolean(s.pin_for_high_risk_hash),
  };
}

export function getSettingsInternal(): PCSettingsInternal {
  return loadStore().settings;
}

export function updatePCSettings(updates: {
  pc_control_enabled?: boolean;
  kill_switch?: boolean;
  approval_mode?: PCApprovalMode;
  allowed_apps?: string[];
  voice_wake_word_enabled?: boolean;
  new_pin?: string | null;
}) {
  const store = loadStore();
  const s = store.settings;

  if (typeof updates.pc_control_enabled === 'boolean') {
    s.pc_control_enabled = updates.pc_control_enabled;
  }
  if (typeof updates.kill_switch === 'boolean') {
    s.kill_switch = updates.kill_switch;
    // If kill switch is activated, immediately cancel any pending or approved commands
    if (s.kill_switch) {
      const nowIso = new Date().toISOString();
      for (const cmd of store.commands) {
        if (cmd.status === 'pending_approval' || cmd.status === 'approved') {
          cmd.status = 'denied';
          cmd.decided_at = nowIso;
          cmd.result_message = 'Blocked by Kill Switch.';
        }
      }
    }
  }
  if (
    updates.approval_mode === 'ask_always' ||
    updates.approval_mode === 'auto_low_risk' ||
    updates.approval_mode === 'auto_all_except_high'
  ) {
    s.approval_mode = updates.approval_mode;
  }
  if (Array.isArray(updates.allowed_apps)) {
    const cleaned = updates.allowed_apps
      .map((a) => a.trim().toLowerCase())
      .filter((a) => a.length > 0 && a.length <= 60);
    s.allowed_apps = Array.from(new Set(cleaned));
  }
  if (typeof updates.voice_wake_word_enabled === 'boolean') {
    s.voice_wake_word_enabled = updates.voice_wake_word_enabled;
  }
  if (updates.new_pin !== undefined) {
    if (updates.new_pin === null || updates.new_pin === '') {
      s.pin_for_high_risk_hash = null;
    } else {
      s.pin_for_high_risk_hash = hashSecret(updates.new_pin);
    }
  }

  saveStore();
  return getPublicAdminSettings();
}

export function regenerateAgentToken(): string {
  const store = loadStore();
  store.settings.agent_token = generateAgentToken();
  saveStore();
  return store.settings.agent_token;
}

export function listPCCommands(): PCCommandRecord[] {
  expireStaleCommands();
  const store = loadStore();
  return [...store.commands].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

export function getPCCommandById(id: string): PCCommandRecord | null {
  expireStaleCommands();
  const store = loadStore();
  return store.commands.find((c) => c.id === id) || null;
}

export function validateActionParams(
  action: PCAction,
  rawParams: Record<string, unknown>
): Record<string, unknown> | null {
  switch (action) {
    case 'open_app':
    case 'close_app': {
      const name = typeof rawParams.name === 'string' ? rawParams.name.trim() : '';
      if (!name || name.length > 80) return null;
      return { name };
    }
    case 'open_url': {
      let rawUrl = typeof rawParams.url === 'string' ? rawParams.url.trim() : '';
      if (!rawUrl) return null;
      if (!/^https?:\/\//i.test(rawUrl)) {
        rawUrl = `https://${rawUrl}`;
      }
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return { url: parsed.toString() };
      } catch {
        return null;
      }
    }
    case 'search_web': {
      const query = typeof rawParams.query === 'string' ? rawParams.query.trim() : '';
      if (!query || query.length > 300) return null;
      const rawEngine =
        typeof rawParams.engine === 'string' ? rawParams.engine.trim().toLowerCase() : 'google';
      const engine = ['google', 'youtube', 'duckduckgo', 'bing', 'github'].includes(rawEngine)
        ? rawEngine
        : 'google';
      return { query, engine };
    }
    case 'media_control': {
      const key = typeof rawParams.key === 'string' ? rawParams.key.trim().toLowerCase() : '';
      if (!['playpause', 'next', 'prev'].includes(key)) return null;
      return { key };
    }
    case 'volume': {
      const direction =
        typeof rawParams.direction === 'string' ? rawParams.direction.trim().toLowerCase() : '';
      if (!['up', 'down', 'mute'].includes(direction)) return null;
      const stepsRaw = Number(rawParams.steps);
      const steps = Number.isFinite(stepsRaw)
        ? Math.max(1, Math.min(20, Math.round(stepsRaw)))
        : 2;
      return { direction, steps };
    }
    case 'type_text': {
      const text = typeof rawParams.text === 'string' ? rawParams.text : '';
      if (!text.trim() || text.length > 500) return null;
      return { text };
    }
    case 'screenshot':
    case 'lock_screen':
    case 'restart':
    case 'shutdown':
      return {};
  }
}

export function createPCCommand(input: {
  command_text: string;
  action: PCAction;
  params: Record<string, unknown>;
  requested_by: string;
}): PCCommandRecord {
  expireStaleCommands();
  const store = loadStore();
  const s = store.settings;
  const risk_level = ACTION_RISK_MAP[input.action];
  const nowIso = new Date().toISOString();

  let status: PCCommandStatus = 'pending_approval';
  let decided_at: string | undefined;
  let result_message: string | undefined;

  if (s.kill_switch || !s.pc_control_enabled) {
    status = 'denied';
    decided_at = nowIso;
    result_message = s.kill_switch
      ? 'Kill Switch is active—command blocked.'
      : 'PC Control is currently disabled.';
  } else if (risk_level === 'high') {
    status = 'pending_approval';
  } else if (s.approval_mode === 'auto_all_except_high') {
    status = 'approved';
    decided_at = nowIso;
  } else if (s.approval_mode === 'auto_low_risk' && risk_level === 'low') {
    if (input.action === 'open_app') {
      const appName = String(input.params.name || '').trim().toLowerCase();
      const isAllowed = s.allowed_apps.some(
        (allowed) => allowed === appName || appName.includes(allowed) || allowed.includes(appName)
      );
      if (isAllowed) {
        status = 'approved';
        decided_at = nowIso;
      } else {
        status = 'pending_approval';
      }
    } else {
      status = 'approved';
      decided_at = nowIso;
    }
  }

  const record: PCCommandRecord = {
    id: `cmd_${crypto.randomBytes(8).toString('hex')}`,
    command_text: input.command_text,
    action: input.action,
    params: input.params,
    risk_level,
    status,
    result_message,
    requested_by: input.requested_by,
    created_at: nowIso,
    decided_at,
  };

  store.commands.unshift(record);
  if (store.commands.length > 250) {
    store.commands = store.commands.slice(0, 250);
  }
  saveStore();
  return record;
}

export function decidePCCommand(input: {
  id: string;
  decision: 'approve' | 'deny';
  pin?: string;
  alwaysAllowApp?: boolean;
  viaVoice?: boolean;
}): { ok: true; command: PCCommandRecord } | { ok: false; statusCode: number; error: string } {
  expireStaleCommands();
  const store = loadStore();
  const cmd = store.commands.find((c) => c.id === input.id);
  if (!cmd) {
    return { ok: false, statusCode: 404, error: 'Command not found.' };
  }
  if (cmd.status !== 'pending_approval') {
    return {
      ok: false,
      statusCode: 409,
      error: `Command is already ${cmd.status.replace('_', ' ')}.`,
    };
  }

  if (input.viaVoice && cmd.risk_level === 'high') {
    return {
      ok: false,
      statusCode: 403,
      error: 'High-risk commands require explicit button approval (and PIN if configured).',
    };
  }

  if (input.decision === 'approve') {
    if (store.settings.kill_switch || !store.settings.pc_control_enabled) {
      return {
        ok: false,
        statusCode: 409,
        error: 'Cannot approve while Kill Switch is active or PC Control is disabled.',
      };
    }

    if (cmd.risk_level === 'high' && store.settings.pin_for_high_risk_hash) {
      if (!input.pin || !verifySecret(input.pin, store.settings.pin_for_high_risk_hash)) {
        return {
          ok: false,
          statusCode: 403,
          error: 'Valid High-Risk Security PIN is required.',
        };
      }
    }

    if (input.alwaysAllowApp && (cmd.action === 'open_app' || cmd.action === 'close_app')) {
      const appName = String(cmd.params.name || '').trim().toLowerCase();
      if (appName && !store.settings.allowed_apps.includes(appName)) {
        store.settings.allowed_apps.push(appName);
      }
    }

    cmd.status = 'approved';
    cmd.decided_at = new Date().toISOString();
  } else {
    cmd.status = 'denied';
    cmd.decided_at = new Date().toISOString();
    cmd.result_message = 'Denied by admin.';
  }

  saveStore();
  return { ok: true, command: cmd };
}

export function verifyAgentHeader(tokenHeader: string | undefined): boolean {
  const store = loadStore();
  return Boolean(tokenHeader && safeCompareTokens(tokenHeader.trim(), store.settings.agent_token));
}

export function pollApprovedCommandsForAgent(): {
  kill_switch: boolean;
  commands: Array<{ id: string; action: PCAction; params: Record<string, unknown> }>;
} {
  expireStaleCommands();
  const store = loadStore();
  store.settings.agent_last_seen = new Date().toISOString();

  if (store.settings.kill_switch || !store.settings.pc_control_enabled) {
    saveStore();
    return { kill_switch: true, commands: [] };
  }

  const ready = store.commands.filter((c) => c.status === 'approved');
  const payload = ready.map((c) => {
    c.status = 'running';
    return {
      id: c.id,
      action: c.action,
      params: c.params,
    };
  });

  saveStore();
  return { kill_switch: false, commands: payload };
}

export function reportCommandExecution(input: {
  id: string;
  status: 'done' | 'failed';
  message: string;
}): PCCommandRecord | null {
  const store = loadStore();
  store.settings.agent_last_seen = new Date().toISOString();
  const cmd = store.commands.find((c) => c.id === input.id);
  if (!cmd) return null;

  cmd.status = input.status;
  cmd.result_message = input.message.slice(0, 500);
  cmd.executed_at = new Date().toISOString();
  saveStore();
  return cmd;
}
