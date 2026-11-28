export type ProviderId = 'groq' | 'opentyphoon' | 'openrouter' | 'gemini';
export type ProviderPreference = 'auto' | ProviderId;

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AppView = 'assistant' | 'pc-control' | 'history' | 'guide';
export type JarvisColorTheme = 'blue' | 'purple' | 'green' | 'yellow';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  model: string;
  envVar: string;
  available: boolean;
}

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

export interface AppLock {
  id: string;
  app: string;
  process_name: string;
  started_at: string;
  ends_at: string;
  locked_by: string;
  status: AppLockStatus;
  unlocked_at?: string;
}

export interface PCCommand {
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

export interface PCSettings {
  pc_control_enabled: boolean;
  kill_switch: boolean;
  approval_mode: PCApprovalMode;
  agent_token: string;
  agent_last_seen: string | null;
  allowed_apps: AllowedAppEntry[];
  voice_wake_word_enabled: boolean;
}

export interface PCPublicStatus {
  pc_control_enabled: boolean;
  kill_switch: boolean;
  agentOnline: boolean;
  agent_last_seen: string | null;
  allowedAppsCount: number;
  activeLocks: AppLock[];
  permittedApps?: Array<{ id: string; displayName: string }>;
}

export interface PendingChatAction {
  type: 'grant_app' | 'revoke_app' | 'unlock_app';
  appName: string;
  lockId?: string;
  aliases?: string[];
  launchCommand?: string;
  processName?: string;
  resolved?: boolean;
  statusText?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export type ResearchJobStatus =
  | 'queued'
  | 'planning'
  | 'searching'
  | 'reading'
  | 'synthesizing'
  | 'done'
  | 'failed';

export interface ResearchJob {
  id: string;
  query: string;
  status: ResearchJobStatus;
  stepLabel: string;
  subQueries: string[];
  sources: ResearchSource[];
  report?: string;
  spokenSummary?: string;
  providerName?: string;
  modelUsed?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export type ActiveTaskKind = 'chat' | 'research' | 'pc';

export interface ActiveTask {
  id: string;
  kind: ActiveTaskKind;
  title: string;
  detail: string;
  status: 'running' | 'done' | 'failed';
  startedAt: number;
  researchJobId?: string;
  pcCommandIds?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  providerName?: string;
  modelUsed?: string;
  pcCommandId?: string;
  pcCommandIds?: string[];
  pendingAction?: PendingChatAction;
  researchJobId?: string;
  sources?: ResearchSource[];
}
