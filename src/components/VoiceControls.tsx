import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUp, Mic, MicOff, Radio, Square } from 'lucide-react';
import type { AssistantState } from '../types/jarvis';

interface VoiceControlsProps {
  state: AssistantState;
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
    if (!cleaned || state === 'thinking') return;
    const source = wasPastedRef.current ? 'pasted' : 'typed';
    wasPastedRef.current = false;
    setDraft('');
    onSendText(cleaned, source);
  };

  const isListeningContinuous = continuousMode && state === 'listening';

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col items-center gap-3 px-4 pb-5 pt-2">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {state === 'speaking' ? (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="flex min-h-[48px] items-center gap-2 rounded-full border border-sky-400/45 bg-sky-500/20 px-5 text-sm font-medium text-sky-100 hover:bg-sky-500/30 transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <Square className="h-4 w-4 fill-current" />
            <span>Stop Speaking</span>
          </button>
        ) : null}

        <button
          type="button"
          onClick={onToggleTalk}
          disabled={!speechRecognitionSupported || state === 'thinking'}
          className={`flex min-h-[50px] items-center gap-2.5 rounded-full px-7 text-sm font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            continuousMode
              ? 'border border-cyan-400/60 bg-cyan-500/20 text-cyan-100 shadow-[0_0_26px_rgba(0,188,212,0.28)] hover:bg-cyan-500/30'
              : 'bg-cyan-400 text-slate-950 shadow-[0_0_26px_rgba(0,188,212,0.28)] hover:bg-cyan-300'
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
          disabled={!speechRecognitionSupported || state === 'thinking'}
          onPointerDown={(e) => {
            if (!speechRecognitionSupported || state === 'thinking') return;
            e.preventDefault();
            pttPressedRef.current = true;
            onPushToTalkStart();
          }}
          className={`flex min-h-[50px] items-center gap-2 rounded-full border px-5 text-sm font-medium transition-all select-none whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
            pushToTalkActive
              ? 'border-cyan-400 bg-cyan-500/25 text-white scale-[0.98]'
              : 'border-white/[0.14] bg-[#080E1C]/90 text-slate-200 hover:bg-white/[0.08] hover:border-white/25'
          }`}
        >
          <Radio className={`h-4 w-4 ${pushToTalkActive ? 'text-cyan-300' : 'text-slate-400'}`} />
          <span>{pushToTalkActive ? 'Release to Send' : 'Hold to Talk'}</span>
          <span className="hidden sm:inline text-xs text-slate-400 font-normal">(Space)</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-xl">
        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.1] bg-[#060B16]/90 px-3.5 py-1.5 focus-within:border-cyan-400/45 transition-colors">
          <input
            type="text"
            value={draft}
            onPaste={() => {
              wasPastedRef.current = true;
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!e.target.value) wasPastedRef.current = false;
            }}
            placeholder={
              speechRecognitionSupported
                ? 'Type a command or ask Jarvis anything...'
                : 'Type a message or command for Jarvis...'
            }
            disabled={state === 'thinking'}
            aria-label="Message Jarvis"
            className="w-full bg-transparent py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!draft.trim() || state === 'thinking'}
            aria-label="Send message"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/35 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
