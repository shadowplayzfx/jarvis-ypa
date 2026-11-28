import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Ear,
  PanelRight,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { JARVIS_THEMES, JARVIS_THEME_ORDER } from '../lib/jarvisThemes';
import type {
  AppView,
  JarvisColorTheme,
  ProviderInfo,
  ProviderPreference,
} from '../types/jarvis';

interface HeaderBarProps {
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  colorTheme: JarvisColorTheme;
  onSelectColorTheme: (theme: JarvisColorTheme) => void;
  providers: ProviderInfo[];
  selectedProvider: ProviderPreference;
  onSelectProvider: (provider: ProviderPreference) => void;
  wakeWordEnabled: boolean;
  wakeWordSupported: boolean;
  onToggleWakeWord: () => void;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  voiceOptions: SpeechSynthesisVoice[];
  selectedVoiceURI: string;
  activeVoiceLabel: string;
  onSelectVoiceURI: (uri: string) => void;
  onTestVoice: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  messageCount: number;
  onClearConversation: () => void;
  agentOnline: boolean;
}

const DISCORD_INVITE_URL = 'https://discord.gg/QsApEcvXtJ';

export function HeaderBar({
  activeView,
  onChangeView,
  colorTheme,
  onSelectColorTheme,
  providers,
  selectedProvider,
  onSelectProvider,
  wakeWordEnabled,
  wakeWordSupported,
  onToggleWakeWord,
  voiceEnabled,
  onToggleVoice,
  voiceOptions,
  selectedVoiceURI,
  activeVoiceLabel,
  onSelectVoiceURI,
  onTestVoice,
  historyOpen,
  onToggleHistory,
  messageCount,
  onClearConversation,
  agentOnline,
}: HeaderBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const colorMenuRef = useRef<HTMLDivElement | null>(null);
  const voiceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
      if (colorMenuRef.current && !colorMenuRef.current.contains(event.target as Node)) {
        setColorMenuOpen(false);
      }
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(event.target as Node)) {
        setVoiceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const activeTheme = JARVIS_THEMES[colorTheme];
  const ui = activeTheme.ui;

  const activeProviderLabel =
    selectedProvider === 'auto'
      ? 'Auto'
      : providers.find((p) => p.id === selectedProvider)?.name || 'Auto';

  const firstAvailable = providers.find((p) => p.available);

  const navItems: Array<{ id: AppView; label: string; shortLabel?: string }> = [
    { id: 'assistant', label: 'Assistant' },
    { id: 'pc-control', label: 'PC Control' },
    { id: 'history', label: 'History' },
    { id: 'guide', label: 'PC Controls Guide', shortLabel: 'Guide' },
  ];

  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center justify-between gap-4 sm:gap-8 border-b border-white/[0.07] bg-[#04070D]/90 px-4 sm:px-6">
      {/* Zone 1: Single-line Brand Wordmark */}
      <button
        type="button"
        onClick={() => onChangeView('assistant')}
        className={`font-algerian text-lg sm:text-2xl font-bold ${ui.logoText} transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60 rounded`}
      >
        JARVIS
      </button>

      {/* Zone 2: Clean Typographic Nav Links */}
      <nav
        className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar"
        aria-label="Primary navigation"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeView(item.id)}
              className={`relative py-1 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {item.shortLabel ? (
                <>
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.shortLabel}</span>
                </>
              ) : (
                <span>{item.label}</span>
              )}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-0.5 h-px bg-current opacity-70"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Quiet Utilities + Primary Chat & Discord Action */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {/* Live PC Agent Status (unboxed typographic indicator) */}
        <button
          type="button"
          onClick={() => onChangeView('pc-control')}
          title={
            agentOnline
              ? 'PC Agent: Online (seen within the last 15 seconds)'
              : 'PC Agent: Offline — open PC Control or Guide to connect'
          }
          className="hidden xl:inline-flex items-center gap-2 px-2 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              agentOnline ? 'bg-emerald-400' : 'bg-slate-600'
            }`}
          />
          <span className={agentOnline ? 'text-emerald-300' : 'text-slate-400'}>
            PC Agent: {agentOnline ? 'Online' : 'Offline'}
          </span>
        </button>

        {/* Color Theme Switcher */}
        <div className="relative" ref={colorMenuRef}>
          <button
            type="button"
            onClick={() => {
              setColorMenuOpen((prev) => !prev);
              setMenuOpen(false);
              setVoiceMenuOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={colorMenuOpen}
            aria-label={`Change JARVIS color (${activeTheme.fullLabel})`}
            title={`Color: ${activeTheme.fullLabel}`}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60`}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: activeTheme.swatchHex }}
            />
            <span className="hidden lg:inline">{activeTheme.name}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-150 ${
                colorMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {colorMenuOpen && (
            <div
              role="listbox"
              aria-label="Select JARVIS color theme"
              className="absolute right-0 mt-2 w-48 rounded-xl border border-white/[0.1] bg-[#080D18] p-1.5 shadow-2xl shadow-black/75 z-50"
            >
              {JARVIS_THEME_ORDER.map((themeId) => {
                const option = JARVIS_THEMES[themeId];
                const selected = colorTheme === themeId;
                return (
                  <button
                    key={themeId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSelectColorTheme(themeId);
                      setColorMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? option.ui.activeOption
                        : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: option.swatchHex }}
                      />
                      <span>{option.fullLabel}</span>
                    </span>
                    {selected && <Check className={`h-3.5 w-3.5 ${option.ui.accentIcon}`} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* AI Model Switcher */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setColorMenuOpen(false);
              setVoiceMenuOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60`}
          >
            <span className={ui.accentTextSoft}>{activeProviderLabel}</span>
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
              className="absolute right-0 mt-2 w-72 rounded-xl border border-white/[0.1] bg-[#080D18] p-1.5 shadow-2xl shadow-black/70 z-50"
            >
              <button
                type="button"
                role="option"
                aria-selected={selectedProvider === 'auto'}
                onClick={() => {
                  onSelectProvider('auto');
                  setMenuOpen(false);
                }}
                className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer ${
                  selectedProvider === 'auto'
                    ? ui.activeOption
                    : 'text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white">Auto (Fastest First)</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">
                    {firstAvailable
                      ? `Routing via ${firstAvailable.name}`
                      : 'Groq → OpenTyphoon → OpenRouter → Gemini'}
                  </div>
                </div>
                {selectedProvider === 'auto' && (
                  <Check className={`h-4 w-4 ${ui.accentIcon} shrink-0 mt-0.5`} />
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
                    className={`flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? ui.activeOption
                        : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <span className="text-slate-100">{provider.name}</span>
                        <span className="text-slate-600">·</span>
                        <span
                          className={`text-xs font-normal ${
                            provider.available ? ui.accentIcon : 'text-slate-500'
                          }`}
                        >
                          {provider.available ? 'Ready' : 'Key not set'}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate mt-0.5">
                        {provider.model}
                      </div>
                    </div>
                    {isSelected && <Check className={`h-4 w-4 ${ui.accentIcon} shrink-0 mt-0.5`} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Wake Word Toggle */}
        {wakeWordSupported && (
          <button
            type="button"
            onClick={onToggleWakeWord}
            title={
              wakeWordEnabled
                ? 'Listening for "Hey Jarvis" (click to disable)'
                : 'Enable "Hey Jarvis" hands-free wake word'
            }
            className={`flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60 ${
              wakeWordEnabled
                ? ui.wakeWordActive
                : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
            }`}
          >
            <Ear className={`h-3.5 w-3.5 ${wakeWordEnabled ? ui.accentText : 'text-slate-400'}`} />
            <span className="hidden md:inline">
              {wakeWordEnabled ? 'Hey Jarvis: On' : 'Hey Jarvis'}
            </span>
          </button>
        )}

        {/* Voice Reply Toggle + British Male Voice Picker */}
        <div className="relative flex items-center" ref={voiceMenuRef}>
          <button
            type="button"
            onClick={onToggleVoice}
            aria-label={voiceEnabled ? 'Mute spoken replies' : 'Enable spoken replies'}
            title={voiceEnabled ? `Spoken replies on (${activeVoiceLabel})` : 'Spoken replies muted'}
            className={`flex h-9 w-9 items-center justify-center rounded-l-lg transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60 ${
              voiceEnabled
                ? 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                : 'bg-amber-500/12 text-amber-200 hover:bg-amber-500/20'
            }`}
          >
            {voiceEnabled ? (
              <Volume2 className={`h-4 w-4 ${ui.accentText}`} />
            ) : (
              <VolumeX className="h-4 w-4 text-amber-300" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setVoiceMenuOpen((prev) => !prev);
              setMenuOpen(false);
              setColorMenuOpen(false);
            }}
            aria-haspopup="listbox"
            aria-expanded={voiceMenuOpen}
            aria-label="Choose JARVIS voice"
            title={`JARVIS voice: ${activeVoiceLabel}`}
            className={`flex h-9 w-5 items-center justify-center rounded-r-lg text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform duration-150 ${
                voiceMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {voiceMenuOpen && (
            <div
              role="listbox"
              aria-label="Select JARVIS Web Speech voice"
              className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-white/[0.1] bg-[#080D18] p-1.5 shadow-2xl shadow-black/75 z-50"
            >
              <div className="flex items-center justify-between px-2.5 py-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">JARVIS Voice</div>
                  <div className="text-[11px] text-slate-400 truncate">
                    Free Web Speech · British Male target
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onTestVoice();
                  }}
                  className={`rounded-md border border-white/[0.1] bg-white/[0.04] px-2 py-1 text-[11px] font-medium ${ui.accentText} hover:bg-white/[0.09] transition-colors shrink-0 cursor-pointer`}
                >
                  Test voice
                </button>
              </div>

              <div className="my-1 border-t border-white/[0.07]" />

              <button
                type="button"
                role="option"
                aria-selected={selectedVoiceURI === ''}
                onClick={() => {
                  onSelectVoiceURI('');
                  setVoiceMenuOpen(false);
                }}
                className={`flex w-full items-start justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer ${
                  selectedVoiceURI === ''
                    ? ui.activeOption
                    : 'text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-white">Auto (British Gentleman)</div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    Using {activeVoiceLabel}
                  </div>
                </div>
                {selectedVoiceURI === '' && (
                  <Check className={`h-3.5 w-3.5 ${ui.accentIcon} shrink-0 mt-0.5`} />
                )}
              </button>

              {voiceOptions.length > 0 && (
                <>
                  <div className="my-1 border-t border-white/[0.07]" />
                  <div className="jarvis-scroll max-h-48 overflow-y-auto space-y-0.5">
                    {voiceOptions.map((v) => {
                      const isSelected = selectedVoiceURI === v.voiceURI;
                      return (
                        <button
                          key={v.voiceURI}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => {
                            onSelectVoiceURI(v.voiceURI);
                            setVoiceMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                            isSelected
                              ? ui.activeOption
                              : 'text-slate-300 hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="min-w-0 truncate">
                            <span className="block text-xs text-slate-100 truncate">{v.name}</span>
                            <span className="block text-[10px] text-slate-500">{v.lang}</span>
                          </span>
                          {isSelected && (
                            <Check className={`h-3.5 w-3.5 ${ui.accentIcon} shrink-0`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Clear Conversation */}
        {messageCount > 0 && (
          <button
            type="button"
            onClick={onClearConversation}
            aria-label="Clear conversation"
            title="Clear conversation"
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}

        {/* Session Transcript Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleHistory}
          aria-expanded={historyOpen}
          aria-label={historyOpen ? 'Close chat history' : 'Open chat history'}
          className={`flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}/60 ${
            historyOpen
              ? 'bg-white/[0.1] text-white'
              : 'text-slate-200 bg-white/[0.04] hover:bg-white/[0.09] hover:text-white'
          }`}
        >
          <PanelRight className={`h-4 w-4 ${ui.accentText}`} />
          <span className="hidden sm:inline">Chat</span>
          {messageCount > 0 && (
            <span className="tabular-nums text-xs text-slate-400">· {messageCount}</span>
          )}
        </button>

        {/* Official Discord Community Icon */}
        <div className="relative group shrink-0">
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Join Our Discord Community"
            title="Join Our Discord Community"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition-all duration-200 hover:scale-105 hover:bg-[#5865F2]/20 hover:text-white hover:shadow-[0_0_16px_rgba(88,101,242,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2]"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[18px] w-[18px] fill-current"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap rounded-lg border border-white/12 bg-[#080D18] px-2.5 py-1 text-xs text-slate-100 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            Join Our Discord Community
          </span>
        </div>
      </div>
    </header>
  );
}
