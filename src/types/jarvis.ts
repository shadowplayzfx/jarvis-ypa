export type ProviderId = 'groq' | 'openrouter' | 'gemini';
export type ProviderPreference = 'auto' | ProviderId;

export type AssistantState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type AppView = 'assistant' | 'pc-control';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  model: string;
  envVar: string;
  available: boolean;
}

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
  allowed_apps: string[];
  voice_wake_word_enabled: boolean;
  pin_configured: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  providerName?: string;
  modelUsed?: string;
  pcCommandId?: string;
}
