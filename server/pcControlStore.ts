import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type PCAction =
  | 'open_app'
  | 'close_app'
  | 'open_url'
  | 'search_web'
  | 'media_control'
  | 'volume'
  | 'screenshot'
  | 'lock_app'
  | 'unlock_app';

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

export interface AllowedAppEntry {
  id: string;
  displayName: string;
  aliases: string[];
  launchCommand: string;
  processName: string;
}

export type AppLockStatus = 'active' | 'expired' | 'unlocked';

export interface AppLockRecord {
  id: string;
  app: string;
  process_name: string;
  started_at: string;
  ends_at: string;
  locked_by: string;
  status: AppLockStatus;
  unlocked_at?: string;
}

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
  allowed_apps: AllowedAppEntry[];
  voice_wake_word_enabled: boolean;
  admin_passcode_hash: string;
  failed_passcode_attempts: number;
  passcode_locked_until: string | null;
}

interface StoreData {
  schema_version: number;
  settings: PCSettingsInternal;
  commands: PCCommandRecord[];
  locks: AppLockRecord[];
}

export const ACTION_RISK_MAP: Record<PCAction, PCRiskLevel> = {
  open_app: 'low',
  open_url: 'low',
  search_web: 'low',
  media_control: 'low',
  volume: 'low',
  lock_app: 'low',
  screenshot: 'medium',
  close_app: 'high',
  unlock_app: 'high',
};

export const ALLOWED_ACTIONS: ReadonlyArray<PCAction> = Object.keys(
  ACTION_RISK_MAP
) as PCAction[];

// Salted SHA-256 hash stored at rest (format: "<saltHex>:<sha256Hex>")
const DEFAULT_ADMIN_PASSCODE_HASH =
  '5c97c7396971ce566c6471f2a19f5f3d:5d7cedbf0094012286345e32c7130c019089e8d371075470b9a939a58e4c03ae';

const COMMAND_EXPIRY_MS = 60_000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PASSCODE_ATTEMPTS = 5;
const PASSCODE_LOCKOUT_MS = 5 * 60 * 1000;

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'pc-control.json');

export const DEFAULT_ALLOWED_APPS: AllowedAppEntry[] = [
  {
    id: 'app_chrome',
    displayName: 'Chrome',
    aliases: ['chrome', 'google chrome', 'browser', 'web browser'],
    launchCommand: 'chrome',
    processName: 'chrome.exe',
  },
  {
    id: 'app_edge',
    displayName: 'Edge',
    aliases: ['edge', 'microsoft edge', 'msedge'],
    launchCommand: 'msedge',
    processName: 'msedge.exe',
  },
  {
    id: 'app_firefox',
    displayName: 'Firefox',
    aliases: ['firefox', 'mozilla firefox', 'mozilla'],
    launchCommand: 'firefox',
    processName: 'firefox.exe',
  },
  {
    id: 'app_notepad',
    displayName: 'Notepad',
    aliases: ['notepad', 'text editor'],
    launchCommand: 'notepad',
    processName: 'notepad.exe',
  },
  {
    id: 'app_calculator',
    displayName: 'Calculator',
    aliases: ['calculator', 'calc'],
    launchCommand: 'calc',
    processName: 'CalculatorApp.exe',
  },
  {
    id: 'app_vscode',
    displayName: 'VS Code',
    aliases: ['vs code', 'vscode', 'visual studio code', 'code'],
    launchCommand: 'code',
    processName: 'Code.exe',
  },
  {
    id: 'app_spotify',
    displayName: 'Spotify',
    aliases: ['spotify', 'spotify music'],
    launchCommand: 'spotify',
    processName: 'Spotify.exe',
  },
];

const KNOWN_APP_TEMPLATES: Record<
  string,
  { displayName: string; aliases: string[]; launchCommand: string; processName: string }
> = {
  discord: {
    displayName: 'Discord',
    aliases: ['discord'],
    launchCommand: 'discord',
    processName: 'Discord.exe',
  },
  slack: {
    displayName: 'Slack',
    aliases: ['slack'],
    launchCommand: 'slack',
    processName: 'slack.exe',
  },
  telegram: {
    displayName: 'Telegram',
    aliases: ['telegram'],
    launchCommand: 'telegram',
    processName: 'Telegram.exe',
  },
  zoom: {
    displayName: 'Zoom',
    aliases: ['zoom'],
    launchCommand: 'zoom',
    processName: 'Zoom.exe',
  },
  steam: {
    displayName: 'Steam',
    aliases: ['steam'],
    launchCommand: 'steam',
    processName: 'steam.exe',
  },
  vlc: {
    displayName: 'VLC',
    aliases: ['vlc', 'vlc media player'],
    launchCommand: 'vlc',
    processName: 'vlc.exe',
  },
  obs: {
    displayName: 'OBS Studio',
    aliases: ['obs', 'obs studio'],
    launchCommand: 'obs64',
    processName: 'obs64.exe',
  },
  word: {
    displayName: 'Microsoft Word',
    aliases: ['word', 'microsoft word', 'ms word'],
    launchCommand: 'winword',
    processName: 'WINWORD.EXE',
  },
  excel: {
    displayName: 'Microsoft Excel',
    aliases: ['excel', 'microsoft excel', 'ms excel'],
    launchCommand: 'excel',
    processName: 'EXCEL.EXE',
  },
  paint: {
    displayName: 'Paint',
    aliases: ['paint', 'mspaint'],
    launchCommand: 'mspaint',
    processName: 'mspaint.exe',
  },
  explorer: {
    displayName: 'File Explorer',
    aliases: ['explorer', 'file explorer', 'files'],
    launchCommand: 'explorer',
    processName: 'explorer.exe',
  },
};

function generateAgentToken(): string {
  return crypto.randomBytes(24).toString('hex'); // 48 chars
}

export function hashPasscodeSha256(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto
    .createHash('sha256')
    .update(`${salt}:${plain}`, 'utf8')
    .digest('hex');
  return `${salt}:${digest}`;
}

export function verifyPasscodeSha256(plain: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex || expectedHex.length !== 64) return false;
  try {
    const computedHex = crypto
      .createHash('sha256')
      .update(`${salt}:${plain}`, 'utf8')
      .digest('hex');
    const a = Buffer.from(computedHex, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
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

function createDefaultStore(): StoreData {
  return {
    schema_version: 2,
    settings: {
      pc_control_enabled: true,
      kill_switch: false,
      approval_mode: 'auto_low_risk',
      agent_token: generateAgentToken(),
      agent_last_seen: null,
      allowed_apps: DEFAULT_ALLOWED_APPS.map((a) => ({ ...a, aliases: [...a.aliases] })),
      voice_wake_word_enabled: false,
      admin_passcode_hash: DEFAULT_ADMIN_PASSCODE_HASH,
      failed_passcode_attempts: 0,
      passcode_locked_until: null,
    },
    commands: [],
    locks: [],
  };
}

function normalizeAllowedApps(raw: unknown): AllowedAppEntry[] {
  if (!Array.isArray(raw)) {
    return DEFAULT_ALLOWED_APPS.map((a) => ({ ...a, aliases: [...a.aliases] }));
  }

  const result: AllowedAppEntry[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (typeof item === 'string') {
      const slug = item.trim().toLowerCase();
      if (!slug) continue;
      const preset = DEFAULT_ALLOWED_APPS.find(
        (d) => d.displayName.toLowerCase() === slug || d.aliases.includes(slug)
      );
      if (preset && !seenIds.has(preset.id)) {
        seenIds.add(preset.id);
        result.push({ ...preset, aliases: [...preset.aliases] });
      } else if (!preset) {
        const template = buildAppTemplate(slug);
        if (!seenIds.has(template.id)) {
          seenIds.add(template.id);
          result.push(template);
        }
      }
      continue;
    }

    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const displayName =
        typeof rec.displayName === 'string' ? rec.displayName.trim().slice(0, 60) : '';
      const launchCommand =
        typeof rec.launchCommand === 'string' ? rec.launchCommand.trim().slice(0, 120) : '';
      const processName =
        typeof rec.processName === 'string' ? rec.processName.trim().slice(0, 80) : '';
      if (!displayName || !launchCommand || !processName) continue;

      const aliasesRaw = Array.isArray(rec.aliases)
        ? rec.aliases
            .filter((a): a is string => typeof a === 'string')
            .map((a) => a.trim().toLowerCase())
            .filter((a) => a.length > 0 && a.length <= 60)
        : [displayName.toLowerCase()];
      const aliases = Array.from(
        new Set(aliasesRaw.length > 0 ? aliasesRaw : [displayName.toLowerCase()])
      );

      const id =
        typeof rec.id === 'string' && rec.id.trim()
          ? rec.id.trim()
          : `app_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;

      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({ id, displayName, aliases, launchCommand, processName });
      }
    }
  }

  return result;
}

let storeCache: StoreData | null = null;
const adminSessions = new Map<string, number>();

function loadStore(): StoreData {
  if (storeCache) return storeCache;

  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<StoreData> & {
        settings?: Record<string, unknown>;
      };
      const defaults = createDefaultStore();
      const needsMigration = parsed.schema_version !== 2;

      const existingAllowed = normalizeAllowedApps(parsed.settings?.allowed_apps);
      let finalApps = existingAllowed;
      if (needsMigration) {
        // Ensure all 7 required pre-filled apps exist after v1 -> v2 upgrade
        const merged = [...existingAllowed];
        for (const preset of DEFAULT_ALLOWED_APPS) {
          if (
            !merged.some(
              (m) =>
                m.id === preset.id ||
                m.displayName.toLowerCase() === preset.displayName.toLowerCase()
            )
          ) {
            merged.push({ ...preset, aliases: [...preset.aliases] });
          }
        }
        finalApps = merged;
      }

      const rawHash = parsed.settings?.admin_passcode_hash;
      const validSha256Hash =
        typeof rawHash === 'string' && /^[a-f0-9]{32}:[a-f0-9]{64}$/.test(rawHash)
          ? rawHash
          : DEFAULT_ADMIN_PASSCODE_HASH;

      const filteredCommands: PCCommandRecord[] = Array.isArray(parsed.commands)
        ? parsed.commands.filter((c) => ALLOWED_ACTIONS.includes(c.action))
        : [];

      storeCache = {
        schema_version: 2,
        settings: {
          pc_control_enabled:
            typeof parsed.settings?.pc_control_enabled === 'boolean'
              ? parsed.settings.pc_control_enabled
              : defaults.settings.pc_control_enabled,
          kill_switch:
            typeof parsed.settings?.kill_switch === 'boolean'
              ? parsed.settings.kill_switch
              : defaults.settings.kill_switch,
          approval_mode:
            parsed.settings?.approval_mode === 'ask_always' ||
            parsed.settings?.approval_mode === 'auto_low_risk' ||
            parsed.settings?.approval_mode === 'auto_all_except_high'
              ? parsed.settings.approval_mode
              : defaults.settings.approval_mode,
          agent_token:
            typeof parsed.settings?.agent_token === 'string' &&
            parsed.settings.agent_token.length >= 40
              ? parsed.settings.agent_token
              : defaults.settings.agent_token,
          agent_last_seen:
            typeof parsed.settings?.agent_last_seen === 'string'
              ? parsed.settings.agent_last_seen
              : null,
          allowed_apps: finalApps,
          voice_wake_word_enabled:
            typeof parsed.settings?.voice_wake_word_enabled === 'boolean'
              ? parsed.settings.voice_wake_word_enabled
              : false,
          admin_passcode_hash: needsMigration ? DEFAULT_ADMIN_PASSCODE_HASH : validSha256Hash,
          failed_passcode_attempts:
            typeof parsed.settings?.failed_passcode_attempts === 'number'
              ? parsed.settings.failed_passcode_attempts
              : 0,
          passcode_locked_until:
            typeof parsed.settings?.passcode_locked_until === 'string'
              ? parsed.settings.passcode_locked_until
              : null,
        },
        commands: filteredCommands,
        locks: Array.isArray(parsed.locks) ? parsed.locks : [],
      };

      if (needsMigration) {
        saveStore();
      }
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

export function getPasscodeLockoutStatus(): {
  locked: boolean;
  lockedUntil: string | null;
  remainingSeconds: number;
  failedAttempts: number;
} {
  const store = loadStore();
  const s = store.settings;
  if (s.passcode_locked_until) {
    const untilMs = Date.parse(s.passcode_locked_until);
    const now = Date.now();
    if (!Number.isNaN(untilMs) && untilMs > now) {
      return {
        locked: true,
        lockedUntil: s.passcode_locked_until,
        remainingSeconds: Math.ceil((untilMs - now) / 1000),
        failedAttempts: MAX_PASSCODE_ATTEMPTS,
      };
    }
    // Lockout expired
    s.passcode_locked_until = null;
    s.failed_passcode_attempts = 0;
    saveStore();
  }
  return {
    locked: false,
    lockedUntil: null,
    remainingSeconds: 0,
    failedAttempts: s.failed_passcode_attempts,
  };
}

export type PasscodeCheckResult =
  | { ok: true }
  | {
      ok: false;
      locked: boolean;
      remainingSeconds: number;
      lockedUntil: string | null;
      attemptsRemaining: number;
      error: string;
    };

export function checkAdminPasscode(passcode: string): PasscodeCheckResult {
  const lockout = getPasscodeLockoutStatus();
  if (lockout.locked) {
    const mins = Math.floor(lockout.remainingSeconds / 60);
    const secs = lockout.remainingSeconds % 60;
    return {
      ok: false,
      locked: true,
      remainingSeconds: lockout.remainingSeconds,
      lockedUntil: lockout.lockedUntil,
      attemptsRemaining: 0,
      error: `Too many wrong attempts. Passcode prompt locked for ${mins}m ${secs}s.`,
    };
  }

  const store = loadStore();
  const s = store.settings;

  if (verifyPasscodeSha256(passcode, s.admin_passcode_hash)) {
    if (s.failed_passcode_attempts > 0 || s.passcode_locked_until) {
      s.failed_passcode_attempts = 0;
      s.passcode_locked_until = null;
      saveStore();
    }
    return { ok: true };
  }

  s.failed_passcode_attempts = (s.failed_passcode_attempts || 0) + 1;
  if (s.failed_passcode_attempts >= MAX_PASSCODE_ATTEMPTS) {
    const untilIso = new Date(Date.now() + PASSCODE_LOCKOUT_MS).toISOString();
    s.passcode_locked_until = untilIso;
    s.failed_passcode_attempts = MAX_PASSCODE_ATTEMPTS;
    saveStore();
    return {
      ok: false,
      locked: true,
      remainingSeconds: Math.ceil(PASSCODE_LOCKOUT_MS / 1000),
      lockedUntil: untilIso,
      attemptsRemaining: 0,
      error: 'Too many wrong attempts (5/5). Passcode prompt locked for 5 minutes.',
    };
  }

  saveStore();
  const attemptsRemaining = MAX_PASSCODE_ATTEMPTS - s.failed_passcode_attempts;
  return {
    ok: false,
    locked: false,
    remainingSeconds: 0,
    lockedUntil: null,
    attemptsRemaining,
    error: `Incorrect passcode. ${attemptsRemaining} ${
      attemptsRemaining === 1 ? 'attempt' : 'attempts'
    } left before 5-minute lock.`,
  };
}

export function loginAdminWithPasscode(
  passcode: string
): { ok: true; token: string } | (PasscodeCheckResult & { ok: false }) {
  const check = checkAdminPasscode(passcode);
  if (!check.ok) return check;
  return { ok: true, token: createAdminSession() };
}

export function changeAdminPasscode(
  currentPasscode: string,
  newPasscode: string
): { ok: true } | { ok: false; statusCode: number; error: string; locked?: boolean; remainingSeconds?: number } {
  const check = checkAdminPasscode(currentPasscode);
  if (!check.ok) {
    return {
      ok: false,
      statusCode: check.locked ? 429 : 401,
      error: check.error,
      locked: check.locked,
      remainingSeconds: check.remainingSeconds,
    };
  }

  if (newPasscode.length < 4 || newPasscode.length > 128) {
    return {
      ok: false,
      statusCode: 400,
      error: 'New passcode must be between 4 and 128 characters.',
    };
  }

  const store = loadStore();
  store.settings.admin_passcode_hash = hashPasscodeSha256(newPasscode);
  saveStore();
  return { ok: true };
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

export function expireStaleLocks(): boolean {
  const store = loadStore();
  const now = Date.now();
  let changed = false;

  for (const lock of store.locks) {
    if (lock.status === 'active') {
      const endMs = Date.parse(lock.ends_at);
      if (!Number.isNaN(endMs) && now >= endMs) {
        lock.status = 'expired';
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
  expireStaleLocks();
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
  };
}

export function getPublicSafeStatus() {
  expireStaleLocks();
  const store = loadStore();
  const s = store.settings;
  const activeLocks = store.locks.filter((l) => l.status === 'active');
  return {
    pc_control_enabled: s.pc_control_enabled,
    kill_switch: s.kill_switch,
    agentOnline: isAgentOnline(s.agent_last_seen),
    agent_last_seen: s.agent_last_seen,
    allowedAppsCount: s.allowed_apps.length,
    activeLocks,
    permittedApps: s.allowed_apps.map((a) => ({
      id: a.id,
      displayName: a.displayName,
    })),
  };
}

export function getSettingsInternal(): PCSettingsInternal {
  expireStaleLocks();
  return loadStore().settings;
}

export function updatePCSettings(updates: {
  pc_control_enabled?: boolean;
  kill_switch?: boolean;
  approval_mode?: PCApprovalMode;
  allowed_apps?: AllowedAppEntry[];
  voice_wake_word_enabled?: boolean;
}) {
  const store = loadStore();
  const s = store.settings;

  if (typeof updates.pc_control_enabled === 'boolean') {
    s.pc_control_enabled = updates.pc_control_enabled;
  }
  if (typeof updates.kill_switch === 'boolean') {
    s.kill_switch = updates.kill_switch;
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
    s.allowed_apps = normalizeAllowedApps(updates.allowed_apps);
  }
  if (typeof updates.voice_wake_word_enabled === 'boolean') {
    s.voice_wake_word_enabled = updates.voice_wake_word_enabled;
  }

  saveStore();
  return getPublicAdminSettings();
}

export function buildAppTemplate(rawName: string): AllowedAppEntry {
  const cleaned = rawName.trim();
  const lower = cleaned.toLowerCase();

  const knownPreset = DEFAULT_ALLOWED_APPS.find(
    (d) =>
      d.displayName.toLowerCase() === lower ||
      d.aliases.includes(lower) ||
      d.launchCommand.toLowerCase() === lower
  );
  if (knownPreset) {
    return { ...knownPreset, aliases: [...knownPreset.aliases] };
  }

  const knownTemplate = KNOWN_APP_TEMPLATES[lower];
  if (knownTemplate) {
    return {
      id: `app_${lower.replace(/[^a-z0-9]+/g, '_')}`,
      displayName: knownTemplate.displayName,
      aliases: [...knownTemplate.aliases],
      launchCommand: knownTemplate.launchCommand,
      processName: knownTemplate.processName,
    };
  }

  const slug = lower.replace(/[^a-z0-9_-]+/g, '') || 'app';
  const title = cleaned
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');
  return {
    id: `app_${slug}_${crypto.randomBytes(3).toString('hex')}`,
    displayName: title || cleaned,
    aliases: [lower],
    launchCommand: slug,
    processName: `${slug}.exe`,
  };
}

export function findAllowedApp(query: string): AllowedAppEntry | null {
  const store = loadStore();
  const q = query.trim().toLowerCase();
  if (!q) return null;

  // Exact match on displayName, alias, launchCommand, or processName (with/without .exe)
  for (const app of store.settings.allowed_apps) {
    const procBase = app.processName.toLowerCase().replace(/\.exe$/, '');
    if (
      app.displayName.toLowerCase() === q ||
      app.launchCommand.toLowerCase() === q ||
      app.processName.toLowerCase() === q ||
      procBase === q ||
      app.aliases.some((a) => a.toLowerCase() === q)
    ) {
      return app;
    }
  }

  // Fallback partial match when query is specific (>= 3 chars)
  if (q.length >= 3) {
    for (const app of store.settings.allowed_apps) {
      const displayLower = app.displayName.toLowerCase();
      if (displayLower.includes(q) || q.includes(displayLower)) {
        return app;
      }
      if (app.aliases.some((a) => a.length >= 3 && (a.includes(q) || q.includes(a)))) {
        return app;
      }
    }
  }

  return null;
}

export function inferAppIdentity(query: string): {
  displayName: string;
  launchCommand: string;
  processName: string;
} {
  const allowed = findAllowedApp(query);
  if (allowed) {
    return {
      displayName: allowed.displayName,
      launchCommand: allowed.launchCommand,
      processName: allowed.processName,
    };
  }
  const tpl = buildAppTemplate(query);
  return {
    displayName: tpl.displayName,
    launchCommand: tpl.launchCommand,
    processName: tpl.processName,
  };
}

export function grantAllowedApp(entryInput: {
  displayName: string;
  aliases?: string[];
  launchCommand?: string;
  processName?: string;
}): { added: boolean; app: AllowedAppEntry } {
  const store = loadStore();
  const base = buildAppTemplate(entryInput.displayName);
  const entry: AllowedAppEntry = {
    id: base.id,
    displayName: entryInput.displayName.trim() || base.displayName,
    aliases:
      entryInput.aliases && entryInput.aliases.length > 0
        ? Array.from(new Set(entryInput.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean)))
        : base.aliases,
    launchCommand: entryInput.launchCommand?.trim() || base.launchCommand,
    processName: entryInput.processName?.trim() || base.processName,
  };

  const existingIdx = store.settings.allowed_apps.findIndex(
    (a) =>
      a.displayName.toLowerCase() === entry.displayName.toLowerCase() ||
      a.processName.toLowerCase() === entry.processName.toLowerCase()
  );

  if (existingIdx >= 0) {
    store.settings.allowed_apps[existingIdx] = {
      ...store.settings.allowed_apps[existingIdx],
      ...entry,
      id: store.settings.allowed_apps[existingIdx].id,
    };
    saveStore();
    return { added: false, app: store.settings.allowed_apps[existingIdx] };
  }

  store.settings.allowed_apps.push(entry);
  saveStore();
  return { added: true, app: entry };
}

export function revokeAllowedApp(query: string): AllowedAppEntry | null {
  const store = loadStore();
  const target = findAllowedApp(query);
  if (!target) return null;
  store.settings.allowed_apps = store.settings.allowed_apps.filter((a) => a.id !== target.id);
  saveStore();
  return target;
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

export function getPCCommandsByIds(ids: string[]): PCCommandRecord[] {
  expireStaleCommands();
  const store = loadStore();
  const idSet = new Set(ids);
  return store.commands.filter((c) => idSet.has(c.id));
}

export function getPCCommandById(id: string): PCCommandRecord | null {
  expireStaleCommands();
  const store = loadStore();
  return store.commands.find((c) => c.id === id) || null;
}

export function listAppLocks(): AppLockRecord[] {
  expireStaleLocks();
  const store = loadStore();
  return [...store.locks].sort(
    (a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)
  );
}

export function getActiveAppLocks(): AppLockRecord[] {
  expireStaleLocks();
  const store = loadStore();
  return store.locks
    .filter((l) => l.status === 'active')
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at));
}

export function findActiveLockForApp(query: string): AppLockRecord | null {
  expireStaleLocks();
  const store = loadStore();
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const allowed = findAllowedApp(q);
  const candidates = new Set<string>([q, q.replace(/\.exe$/, '')]);
  if (allowed) {
    candidates.add(allowed.displayName.toLowerCase());
    candidates.add(allowed.processName.toLowerCase());
    candidates.add(allowed.processName.toLowerCase().replace(/\.exe$/, ''));
    for (const alias of allowed.aliases) candidates.add(alias.toLowerCase());
  }

  return (
    store.locks.find((l) => {
      if (l.status !== 'active') return false;
      const appLower = l.app.toLowerCase();
      const procLower = l.process_name.toLowerCase();
      const procBase = procLower.replace(/\.exe$/, '');
      return (
        candidates.has(appLower) ||
        candidates.has(procLower) ||
        candidates.has(procBase) ||
        appLower.includes(q) ||
        q.includes(appLower)
      );
    }) || null
  );
}

export function formatRemainingDuration(endsAtIso: string): string {
  const ms = Math.max(0, Date.parse(endsAtIso) - Date.now());
  const totalSec = Math.ceil(ms / 1000);
  if (totalSec < 60) {
    return `${totalSec} ${totalSec === 1 ? 'second' : 'seconds'}`;
  }
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return mins > 0
      ? `${hours} ${hours === 1 ? 'hour' : 'hours'} ${mins} ${mins === 1 ? 'minute' : 'minutes'}`
      : `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return secs > 0
    ? `${mins} ${mins === 1 ? 'minute' : 'minutes'} ${secs} ${secs === 1 ? 'second' : 'seconds'}`
    : `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
}

export function createAppLock(input: {
  appQuery: string;
  endsAtIso: string;
  lockedBy: string;
  commandText: string;
}): { lock: AppLockRecord; command: PCCommandRecord } {
  expireStaleLocks();
  const store = loadStore();
  const identity = inferAppIdentity(input.appQuery);
  const nowIso = new Date().toISOString();

  // Supersede any prior active lock on the same app/process cleanly
  for (const existing of store.locks) {
    if (
      existing.status === 'active' &&
      (existing.process_name.toLowerCase() === identity.processName.toLowerCase() ||
        existing.app.toLowerCase() === identity.displayName.toLowerCase())
    ) {
      existing.status = 'unlocked';
      existing.unlocked_at = nowIso;
    }
  }

  const lock: AppLockRecord = {
    id: `lock_${crypto.randomBytes(6).toString('hex')}`,
    app: identity.displayName,
    process_name: identity.processName,
    started_at: nowIso,
    ends_at: input.endsAtIso,
    locked_by: input.lockedBy,
    status: 'active',
  };

  store.locks.unshift(lock);
  if (store.locks.length > 150) {
    store.locks = store.locks.slice(0, 150);
  }

  const command: PCCommandRecord = {
    id: `cmd_${crypto.randomBytes(8).toString('hex')}`,
    command_text: input.commandText,
    action: 'lock_app',
    params: {
      app: lock.app,
      process: lock.process_name,
      ends_at: lock.ends_at,
    },
    risk_level: 'low',
    status: 'done',
    result_message: `Locked ${lock.app} (${lock.process_name}) until ${new Date(
      lock.ends_at
    ).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
    requested_by: input.lockedBy,
    created_at: nowIso,
    decided_at: nowIso,
    executed_at: nowIso,
  };

  store.commands.unshift(command);
  if (store.commands.length > 250) {
    store.commands = store.commands.slice(0, 250);
  }

  saveStore();
  return { lock, command };
}

export function unlockAppWithPasscode(input: {
  lockIdOrApp: string;
  passcode: string;
  actor: string;
  commandText?: string;
}):
  | { ok: true; lock: AppLockRecord; command: PCCommandRecord }
  | { ok: false; statusCode: number; error: string; locked?: boolean; remainingSeconds?: number } {
  const check = checkAdminPasscode(input.passcode);
  if (!check.ok) {
    return {
      ok: false,
      statusCode: check.locked ? 429 : 401,
      error: check.error,
      locked: check.locked,
      remainingSeconds: check.remainingSeconds,
    };
  }

  expireStaleLocks();
  const store = loadStore();
  const byId = store.locks.find((l) => l.id === input.lockIdOrApp && l.status === 'active');
  const lock = byId || findActiveLockForApp(input.lockIdOrApp);

  if (!lock) {
    return { ok: false, statusCode: 404, error: 'Active lock not found.' };
  }

  const nowIso = new Date().toISOString();
  lock.status = 'unlocked';
  lock.unlocked_at = nowIso;

  const command: PCCommandRecord = {
    id: `cmd_${crypto.randomBytes(8).toString('hex')}`,
    command_text: input.commandText || `Unlock ${lock.app}`,
    action: 'unlock_app',
    params: { app: lock.app, process: lock.process_name },
    risk_level: 'high',
    status: 'done',
    result_message: `Unlocked ${lock.app} early after admin passcode verification.`,
    requested_by: input.actor,
    created_at: nowIso,
    decided_at: nowIso,
    executed_at: nowIso,
  };

  store.commands.unshift(command);
  if (store.commands.length > 250) {
    store.commands = store.commands.slice(0, 250);
  }

  saveStore();
  return { ok: true, lock, command };
}

export function recordDirectDeniedOrAuditCommand(input: {
  command_text: string;
  action: PCAction;
  params: Record<string, unknown>;
  status: PCCommandStatus;
  result_message: string;
  requested_by: string;
}): PCCommandRecord {
  const store = loadStore();
  const nowIso = new Date().toISOString();
  const record: PCCommandRecord = {
    id: `cmd_${crypto.randomBytes(8).toString('hex')}`,
    command_text: input.command_text,
    action: input.action,
    params: input.params,
    risk_level: ACTION_RISK_MAP[input.action],
    status: input.status,
    result_message: input.result_message,
    requested_by: input.requested_by,
    created_at: nowIso,
    decided_at: nowIso,
    executed_at: input.status === 'done' ? nowIso : undefined,
  };
  store.commands.unshift(record);
  if (store.commands.length > 250) {
    store.commands = store.commands.slice(0, 250);
  }
  saveStore();
  return record;
}

export function validateActionParams(
  action: PCAction,
  rawParams: Record<string, unknown>
): Record<string, unknown> | null {
  switch (action) {
    case 'open_app':
    case 'close_app': {
      const name =
        typeof rawParams.name === 'string'
          ? rawParams.name.trim()
          : typeof rawParams.app === 'string'
          ? rawParams.app.trim()
          : '';
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
    case 'screenshot':
      return {};
    case 'lock_app':
    case 'unlock_app': {
      const app =
        typeof rawParams.app === 'string'
          ? rawParams.app.trim()
          : typeof rawParams.name === 'string'
          ? rawParams.name.trim()
          : '';
      if (!app || app.length > 80) return null;
      return { ...rawParams, app };
    }
  }
}

export function createPCCommand(input: {
  command_text: string;
  action: PCAction;
  params: Record<string, unknown>;
  requested_by: string;
  forceImmediateApprove?: boolean;
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
  } else if (input.forceImmediateApprove) {
    status = 'approved';
    decided_at = nowIso;
  } else if (risk_level === 'high') {
    status = 'pending_approval';
  } else if (s.approval_mode === 'auto_all_except_high') {
    status = 'approved';
    decided_at = nowIso;
  } else if (s.approval_mode === 'auto_low_risk' && risk_level === 'low') {
    status = 'approved';
    decided_at = nowIso;
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
  passcode?: string;
  alwaysAllowApp?: boolean;
  viaVoice?: boolean;
}):
  | { ok: true; command: PCCommandRecord }
  | { ok: false; statusCode: number; error: string; locked?: boolean; remainingSeconds?: number } {
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
      error: 'High-risk commands require explicit button approval with the admin passcode.',
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

    if (cmd.risk_level === 'high') {
      const check = checkAdminPasscode(input.passcode || '');
      if (!check.ok) {
        return {
          ok: false,
          statusCode: check.locked ? 429 : 403,
          error: check.error,
          locked: check.locked,
          remainingSeconds: check.remainingSeconds,
        };
      }
    }

    if (input.alwaysAllowApp && (cmd.action === 'open_app' || cmd.action === 'close_app')) {
      const appName = String(cmd.params.name || '').trim();
      if (appName && !findAllowedApp(appName)) {
        grantAllowedApp({ displayName: appName });
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
  locks: Array<{ app: string; process: string; ends_at: string }>;
} {
  expireStaleCommands();
  expireStaleLocks();
  const store = loadStore();
  store.settings.agent_last_seen = new Date().toISOString();

  if (store.settings.kill_switch || !store.settings.pc_control_enabled) {
    saveStore();
    return { kill_switch: true, commands: [], locks: [] };
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

  const activeLocks = store.locks
    .filter((l) => l.status === 'active')
    .map((l) => ({
      app: l.app,
      process: l.process_name,
      ends_at: l.ends_at,
    }));

  saveStore();
  return { kill_switch: false, commands: payload, locks: activeLocks };
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
