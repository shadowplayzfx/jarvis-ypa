import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUp, Mic, MicOff, Radio, Square } from 'lucide-react';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type { AssistantState, JarvisColorTheme } from '../types/jarvis';

interface VoiceControlsProps {
  state: AssistantState;
  colorTheme?: JarvisColorTheme;
  continuousMode: boolean;
  pushToTalkActive: boolean;
  speechRecognitionSupported: boolean;
  onToggleTalk: () => void;
  onStopSpeaking: () => void;
  onPushToTalkStart: () => void;
  onPushToTalkEnd: () => void;
  onSendText: (text: string, source: 'typed' | 'pasted') => void;
}

export function VoiceControls({
  state,
  colorTheme = 'blue',
  continuousMode,
  pushToTalkActive,
  speechRecognitionSupported,
  onToggleTalk,
  onStopSpeaking,
  onPushToTalkStart,
  onPushToTalkEnd,
  onSendText,
}: VoiceControlsProps) {
  const [draft, setDraft] = useState('');
  const pttPressedRef = useRef(false);
  const wasPastedRef = useRef(false);

  useEffect(() => {
    const handleGlobalRelease = () => {
      if (pttPressedRef.current) {
        pttPressedRef.current = false;
        onPushToTalkEnd();
      }
    };
    window.addEventListener('pointerup', handleGlobalRelease);
    window.addEventListener('pointercancel', handleGlobalRelease);
    return () => {
      window.removeEventListener('pointerup', handleGlobalRelease);
      window.removeEventListener('pointercancel', handleGlobalRelease);
    };
  }, [onPushToTalkEnd]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned) return;
    const source = wasPastedRef.current ? 'pasted' : 'typed';
    wasPastedRef.current = false;
    setDraft('');
    onSendText(cleaned, source);
  };

  const isListeningContinuous = continuousMode && state === 'listening';
  const ui = JARVIS_THEMES[colorTheme].ui;

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-3 px-4 pb-5 pt-2">
      <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
        {state === 'speaking' ? (
          <button
            type="button"
            onClick={onStopSpeaking}
            className={`flex h-11 items-center gap-2 rounded-full ${ui.activePillButton} px-5 text-sm font-medium shadow-md shadow-black/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing}`}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            <span>Stop Speaking</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleTalk}
          disabled={!speechRecognitionSupported}
          className={`flex h-11 items-center gap-2 rounded-full px-6 text-sm font-semibold shadow-lg shadow-black/50 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing} ${
            continuousMode
              ? `${ui.activePillButton} hover:-translate-y-0.5 active:translate-y-0`
              : `${ui.primaryButton} hover:-translate-y-0.5 active:translate-y-0`
          }`}
        >
          {continuousMode ? (
            <>
              <MicOff className="h-4 w-4" />
              <span>{isListeningContinuous ? 'Stop Listening' : 'End Talk Mode'}</span>
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              <span>Talk to Jarvis</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={!speechRecognitionSupported}
          onPointerDown={(e) => {
            if (!speechRecognitionSupported) return;
            e.preventDefault();
            pttPressedRef.current = true;
            onPushToTalkStart();
          }}
          className={`flex h-11 items-center gap-2 rounded-full border px-4 sm:px-5 text-sm font-medium shadow-md shadow-black/40 transition-all duration-150 select-none whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 ${ui.focusRing} ${
            pushToTalkActive
              ? `${ui.activePillButton} scale-[0.98]`
              : 'border-white/[0.12] bg-[#080D18]/90 text-slate-200 hover:bg-white/[0.08] hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0'
          }`}
        >
          <Radio className={`h-4 w-4 ${pushToTalkActive ? ui.accentText : 'text-slate-400'}`} />
          <span>{pushToTalkActive ? 'Release to Send' : 'Hold to Talk'}</span>
          <span className="hidden sm:inline text-xs text-slate-500 font-normal">Space</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div
          className={`flex items-center gap-2 rounded-xl border border-white/[0.09] bg-[#060A14]/90 px-3.5 py-1 shadow-lg shadow-black/40 ${ui.inputFocusWithin} transition-colors`}
        >
          <input
            type="text"
            value={draft}
            onPaste={() => {
              wasPastedRef.current = true;
            }}
            onDrop={() => {
              wasPastedRef.current = true;
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!e.target.value) wasPastedRef.current = false;
            }}
            placeholder={
              state === 'thinking'
                ? 'Queue another task, launch an app, or ask something else…'
                : speechRecognitionSupported
                ? 'Ask me to research a topic, open apps, or run tasks together…'
                : 'Type a message, research topic, or multi-step command…'
            }
            aria-label="Message Jarvis"
            className="w-full bg-transparent py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Send message"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.08] ${ui.sendButton} disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer`}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
