import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Ear,
  PanelRight,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AppView, ProviderInfo, ProviderPreference } from '../types/jarvis';

interface HeaderBarProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  providers: ProviderInfo[];
  selectedProvider: ProviderPreference;
  onSelectProvider: (provider: ProviderPreference) => void;
  wakeWordEnabled: boolean;
  wakeWordSupported: boolean;
  onToggleWakeWord: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  messageCount: number;
  onClearConversation: () => void;
  agentOnline: boolean;
  isAdmin: boolean;
}

const DISCORD_INVITE_URL = 'https://discord.gg/QsApEcvXtJ';

export function HeaderBar({
  activeView,
  onChangeView,
  providers,
  selectedProvider,
  onSelectProvider,
  wakeWordEnabled,
  wakeWordSupported,
  onToggleWakeWord,
  voiceEnabled,
  onToggleVoice,
  historyOpen,
  onToggleHistory,
  messageCount,
  onClearConversation,
  agentOnline,
  isAdmin,
}: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeProviderLabel =
    selectedProvider === 'auto'
      ? 'Auto'
      : providers.find((p) => p.id === selectedProvider)?.name || 'Auto';

  const firstAvailable = providers.find((p) => p.available);

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-3 sm:gap-6 border-b border-white/[0.08] bg-[#04070F]/92 px-3 sm:px-6">
      {/* Left: Algerian JARVIS Wordmark + View Nav */}
      <div className="flex items-center gap-4 sm:gap-7 min-w-0">
        <button
          type="button"
          onClick={() => onChangeView('assistant')}
          className="font-algerian text-lg sm:text-2xl font-bold text-cyan-300 hover:text-cyan-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded"
        >
          JARVIS
        </button>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary navigation">
          <button
            type="button"
            onClick={() => onChangeView('assistant')}
            className={`px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'assistant'
                ? 'bg-cyan-500/15 text-cyan-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Assistant
          </button>

          <button
            type="button"
            onClick={() => onChangeView('pc-control')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeView === 'pc-control'
                ? 'bg-cyan-500/15 text-cyan-200'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            <Terminal className="h-3.5 w-3.5 hidden sm:inline" />
            <span>PC Control</span>
            {isAdmin && (
              <span
                className={`hidden md:inline text-[11px] font-mono ${
                  agentOnline ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                · {agentOnline ? 'Online' : 'Offline'}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Right: Model Switcher, Hey Jarvis, Voice, History, Discord */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* AI Model Switcher */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className="flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-2.5 sm:px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] hover:border-cyan-400/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <span className="text-slate-400 hidden lg:inline">Model:</span>
            <span className="text-cyan-200">{activeProviderLabel}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                menuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="listbox"
              aria-label="Select AI Model Provider"
              className="absolute right-0 mt-2 w-72 rounded-2xl border border-white/[0.12] bg-[#080E1C] p-1.5 shadow-2xl z-50"
            >
              <button
                type="button"
                role="option"
                aria-selected={selectedProvider === 'auto'}
                onClick={() => {
                  onSelectProvider('auto');
                  setMenuOpen(false);
                }}
                className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  selectedProvider === 'auto'
                    ? 'bg-cyan-500/15 text-white'
                    : 'text-slate-300 hover:bg-white/[0.05]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">Auto (Fastest First)</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">
                    {firstAvailable
                      ? `Routing via ${firstAvailable.name}`
                      : 'Groq → OpenRouter → Gemini'}
                  </div>
                </div>
                {selectedProvider === 'auto' && (
                  <Check className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                )}
              </button>

              <div className="my-1 border-t border-white/[0.07]" />

              {providers.map((provider) => {
                const isSelected = selectedProvider === provider.id;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onSelectProvider(provider.id);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 text-white'
                        : 'text-slate-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-slate-100">{provider.name}</span>
                        <span className="text-slate-500">·</span>
                        <span
                          className={`text-xs font-normal ${
                            provider.available ? 'text-cyan-400' : 'text-slate-500'
                          }`}
                        >
                          {provider.available ? 'Ready' : 'Key not set'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                        {provider.model}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* "Hey Jarvis" Wake-Word Continuous Mic Toggle */}
        {wakeWordSupported && (
          <button
            type="button"
            onClick={onToggleWakeWord}
            title={
              wakeWordEnabled
                ? 'Listening for "Hey Jarvis" (click to disable)'
                : 'Enable "Hey Jarvis" hands-free wake word'
            }
            className={`flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
              wakeWordEnabled
                ? 'border-cyan-400/50 bg-cyan-500/18 text-cyan-100'
                : 'border-white/[0.09] bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
            }`}
          >
            <Ear className={`h-3.5 w-3.5 ${wakeWordEnabled ? 'text-cyan-300' : 'text-slate-400'}`} />
            <span className="hidden md:inline">
              {wakeWordEnabled ? 'Hey Jarvis: On' : 'Hey Jarvis'}
            </span>
          </button>
        )}

        {/* Spoken Reply Toggle */}
        <button
          type="button"
          onClick={onToggleVoice}
          aria-label={voiceEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}
          title={voiceEnabled ? 'Spoken replies on' : 'Spoken replies muted'}
          className={`flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
            voiceEnabled
              ? 'border-white/[0.09] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
              : 'border-amber-400/35 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
          }`}
        >
          {voiceEnabled ? (
            <Volume2 className="h-4 w-4 text-cyan-300" />
          ) : (
            <VolumeX className="h-4 w-4 text-amber-300" />
          )}
          <span className="hidden xl:inline">{voiceEnabled ? 'Voice' : 'Muted'}</span>
        </button>

        {/* Clear Conversation */}
        {messageCount > 0 && (
          <button
            type="button"
            onClick={onClearConversation}
            aria-label="Clear conversation"
            title="Clear conversation"
            className="flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-2.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            <Trash2 className="h-4 w-4 text-slate-400" />
          </button>
        )}

        {/* History Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleHistory}
          aria-expanded={historyOpen}
          aria-label={historyOpen ? 'Close chat history' : 'Open chat history'}
          className={`flex h-9 sm:h-10 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
            historyOpen
              ? 'border-cyan-400/45 bg-cyan-500/15 text-cyan-100'
              : 'border-white/[0.09] bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]'
          }`}
        >
          <PanelRight className="h-4 w-4 text-cyan-300" />
          <span className="hidden sm:inline">History</span>
          {messageCount > 0 && (
            <span className="tabular-nums text-xs text-slate-400">· {messageCount}</span>
          )}
        </button>

        {/* Official Discord Community Icon (Top-Right, Desktop & Mobile) */}
        <div className="relative group shrink-0">
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Our Discord Community"
            title="Join Our Discord Community"
            className="flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.04] text-slate-200 transition-all duration-200 hover:scale-105 hover:border-[#5865F2]/70 hover:bg-[#5865F2]/20 hover:text-white hover:shadow-[0_0_18px_rgba(88,101,242,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-4 w-4 sm:h-[18px] sm:w-[18px] fill-current"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg border border-white/15 bg-[#080E1C] px-2.5 py-1 text-xs text-slate-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Join Our Discord Community
          </span>
        </div>
      </div>
    </header>
  );
}
