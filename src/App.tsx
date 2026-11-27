import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import KineticGrid from './components/ui/kinetic-grid';
import { HeaderBar } from './components/HeaderBar';
import { JarvisOrb } from './components/JarvisOrb';
import { PCApprovalCard } from './components/PCApprovalCard';
import { PCControlPage } from './components/PCControlPage';
import { RevealText } from './components/RevealText';
import { TranscriptDrawer } from './components/TranscriptDrawer';
import { VoiceControls } from './components/VoiceControls';
import type {
  AppView,
  AssistantState,
  ChatMessage,
  PCCommand,
  PCSettings,
  ProviderInfo,
  ProviderPreference,
} from './types/jarvis';
import {
  getSpeechRecognitionConstructor,
  isSpeechSynthesisSupported,
  prepareTextForSpeech,
  selectNaturalVoice,
  splitIntoSpeechChunks,
  type SpeechRecognitionInstance,
} from './utils/speech';

const QUICK_PROMPTS = [
  {
    label: 'Draft an email',
    prompt:
      'Help me draft a concise, friendly follow-up email after a client project kickoff.',
  },
  {
    label: 'Plan my day',
    prompt:
      'Ask me for my top three priorities today and build a realistic time-blocked plan.',
  },
  {
    label: 'Brainstorm ideas',
    prompt:
      'Let us brainstorm three practical ways to cut down unnecessary weekly status meetings.',
  },
  {
    label: 'Debug an issue',
    prompt:
      'Walk me through a crisp checklist for tracking down slow Node.js API endpoints.',
  },
];

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTimeAwareGreeting(): { headline: string; subline: string } {
  const hour = new Date().getHours();
  if (hour < 12) {
    return {
      headline: 'Good morning. What are we tackling today?',
      subline: 'Tap Talk to Jarvis, hold Spacebar, or enable Hey Jarvis in the header.',
    };
  }
  if (hour < 18) {
    return {
      headline: 'Good afternoon. Ready whenever you are.',
      subline: 'Speak naturally for emails, planning, code help, or PC commands.',
    };
  }
  return {
    headline: 'Good evening. What is on your mind tonight?',
    subline: 'Tap Talk to Jarvis or hold Spacebar for quick voice interaction.',
  };
}

function stripWakeWord(transcript: string): { matched: boolean; stripped: string } {
  const trimmed = transcript.trim();
  const wakeRegex = /^(?:hey\s+jarvis|jarvis)[\s,.:!?-]*(.*)$/i;
  const match = trimmed.match(wakeRegex);
  if (!match) return { matched: false, stripped: '' };
  return { matched: true, stripped: (match[1] || '').trim() };
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('assistant');
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [continuousMode, setContinuousMode] = useState(false);
  const [wakeWordMode, setWakeWordMode] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderPreference>('auto');

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveFinalText, setLiveFinalText] = useState('');
  const [liveInterimText, setLiveInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedReply, setCopiedReply] = useState(false);

  // Admin & PC Control State (Bearer token held strictly in memory)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [adminClaimed, setAdminClaimed] = useState(false);
  const [envPasscodeConfigured, setEnvPasscodeConfigured] = useState(false);
  const [pcSettings, setPcSettings] = useState<PCSettings | null>(null);
  const [pcCommands, setPcCommands] = useState<PCCommand[]>([]);
  const [agentOnline, setAgentOnline] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const speechRecognitionSupported = Boolean(getSpeechRecognitionConstructor());
  const greeting = getTimeAwareGreeting();

  // 60fps animation refs
  const audioLevelRef = useRef(0);
  const speechPulseRef = useRef(0);
  const speechActivityBoostRef = useRef(0);

  // Lifecycle refs
  const assistantStateRef = useRef<AssistantState>('idle');
  const continuousModeRef = useRef(false);
  const wakeWordModeRef = useRef(false);
  const pushToTalkActiveRef = useRef(false);
  const voiceEnabledRef = useRef(true);
  const selectedProviderRef = useRef<ProviderPreference>('auto');
  const messagesRef = useRef<ChatMessage[]>([]);
  const adminTokenRef = useRef<string | null>(null);
  const pcCommandsRef = useRef<PCCommand[]>([]);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalBufferRef = useRef('');
  const interimBufferRef = useRef('');
  const silenceTimerRef = useRef<number | null>(null);
  const pttStopTimeoutRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const speechSessionRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Mic analyser refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micRafRef = useRef<number | null>(null);

  useEffect(() => {
    assistantStateRef.current = assistantState;
  }, [assistantState]);

  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    wakeWordModeRef.current = wakeWordMode;
  }, [wakeWordMode]);

  useEffect(() => {
    pushToTalkActiveRef.current = pushToTalkActive;
  }, [pushToTalkActive]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    selectedProviderRef.current = selectedProvider;
  }, [selectedProvider]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    adminTokenRef.current = adminToken;
  }, [adminToken]);

  useEffect(() => {
    pcCommandsRef.current = pcCommands;
  }, [pcCommands]);

  // Fetch providers & admin status on mount
  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data: { providers?: ProviderInfo[] }) => {
        if (Array.isArray(data.providers)) setProviders(data.providers);
      })
      .catch(() => {});

    fetch('/api/admin/status')
      .then((res) => res.json())
      .then(
        (data: { adminClaimed?: boolean; envPasscodeConfigured?: boolean }) => {
          setAdminClaimed(Boolean(data.adminClaimed));
          setEnvPasscodeConfigured(Boolean(data.envPasscodeConfigured));
        }
      )
      .catch(() => {});
  }, []);

  // Load voices for speechSynthesis
  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const fetchPCState = useCallback(async () => {
    const token = adminTokenRef.current;
    if (!token) return;
    try {
      const res = await fetch('/api/pc/state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        setAdminToken(null);
        setPcSettings(null);
        setPcCommands([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        settings: PCSettings;
        commands: PCCommand[];
        agentOnline: boolean;
      };
      setPcSettings(data.settings);
      setPcCommands(data.commands);
      setAgentOnline(data.agentOnline);
      setLastSyncedAt(Date.now());
    } catch {
      // Ignore transient poll error
    }
  }, []);

  useEffect(() => {
    if (!adminToken) return;
    fetchPCState();
  }, [adminToken, fetchPCState]);

  // Poll PC state automatically while on PC Control page or while commands are active
  const hasActiveCommands = pcCommands.some(
    (c) =>
      c.status === 'pending_approval' || c.status === 'approved' || c.status === 'running'
  );

  useEffect(() => {
    if (!adminToken) return;
    if (activeView !== 'pc-control' && !hasActiveCommands) return;
    const intervalMs = hasActiveCommands ? 1500 : 4000;
    const id = window.setInterval(() => {
      fetchPCState();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [adminToken, activeView, hasActiveCommands, fetchPCState]);

  const stopMicMonitor = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    audioLevelRef.current = 0;
  }, []);

  const startMicMonitor = useCallback(async () => {
    if (
      micStreamRef.current ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (
        !continuousModeRef.current &&
        !pushToTalkActiveRef.current &&
        !wakeWordModeRef.current
      ) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      micStreamRef.current = stream;
      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sumSq = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sumSq += normalized * normalized;
        }
        const rms = Math.sqrt(sumSq / dataArray.length);
        const scaledMic = Math.min(1, rms * 4.5);
        speechActivityBoostRef.current = Math.max(0, speechActivityBoostRef.current - 0.04);
        audioLevelRef.current = Math.max(scaledMic, speechActivityBoostRef.current);
        micRafRef.current = requestAnimationFrame(sample);
      };
      micRafRef.current = requestAnimationFrame(sample);
    } catch {
      // Fallback: orb reacts via speechActivityBoostRef
    }
  }, []);

  const clearTimers = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (pttStopTimeoutRef.current !== null) {
      window.clearTimeout(pttStopTimeoutRef.current);
      pttStopTimeoutRef.current = null;
    }
  }, []);

  const stopRecognitionOnly = useCallback(() => {
    clearTimers();
    const rec = recognitionRef.current;
    if (rec) {
      recognitionRef.current = null;
      rec.onresult = null;
      rec.onend = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        // Ignore
      }
    }
  }, [clearTimers]);

  const cancelSpeech = useCallback(() => {
    speechSessionRef.current += 1;
    if (isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
    speechPulseRef.current = 0;
  }, []);

  const startListeningSessionRef = useRef<() => void>(() => {});

  const speakResponse = useCallback((rawText: string, resumeAfter: boolean) => {
    const resumeIfNeeded = () => {
      if (resumeAfter && (continuousModeRef.current || wakeWordModeRef.current)) {
        startListeningSessionRef.current();
      } else {
        setAssistantState('idle');
      }
    };

    if (!voiceEnabledRef.current || !isSpeechSynthesisSupported()) {
      resumeIfNeeded();
      return;
    }

    const spokenText = prepareTextForSpeech(rawText);
    const chunks = splitIntoSpeechChunks(spokenText);
    if (chunks.length === 0) {
      resumeIfNeeded();
      return;
    }

    speechSessionRef.current += 1;
    const sessionId = speechSessionRef.current;

    window.speechSynthesis.cancel();
    setAssistantState('speaking');

    const voices =
      voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
    const preferredVoice = selectNaturalVoice(voices);

    let index = 0;
    const speakNext = () => {
      if (speechSessionRef.current !== sessionId) return;
      if (index >= chunks.length) {
        speechPulseRef.current = 0;
        resumeIfNeeded();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      if (preferredVoice) utterance.voice = preferredVoice;
      utterance.rate = 1.03;
      utterance.pitch = 1.0;

      utterance.onboundary = () => {
        if (speechSessionRef.current === sessionId) {
          speechPulseRef.current = 0.95;
        }
      };

      utterance.onend = () => {
        if (speechSessionRef.current !== sessionId) return;
        index += 1;
        speakNext();
      };

      utterance.onerror = () => {
        if (speechSessionRef.current !== sessionId) return;
        speechPulseRef.current = 0;
        resumeIfNeeded();
      };

      speechPulseRef.current = 0.72;
      window.speechSynthesis.speak(utterance);
    };

    speakNext();
  }, []);

  const handleDecideCommand = useCallback(
    async (
      id: string,
      decision: 'approve' | 'deny',
      opts?: { pin?: string; alwaysAllowApp?: boolean; viaVoice?: boolean }
    ): Promise<string | null> => {
      const token = adminTokenRef.current;
      if (!token) return 'Admin authentication required.';

      try {
        const res = await fetch(`/api/pc/commands/${encodeURIComponent(id)}/decide`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            decision,
            pin: opts?.pin,
            alwaysAllowApp: opts?.alwaysAllowApp,
            viaVoice: opts?.viaVoice,
          }),
        });
        const data = (await res.json()) as { command?: PCCommand; error?: string };
        if (!res.ok || !data.command) {
          return data.error || 'Unable to process decision.';
        }

        setPcCommands((prev) => {
          const exists = prev.some((c) => c.id === data.command!.id);
          return exists
            ? prev.map((c) => (c.id === data.command!.id ? data.command! : c))
            : [data.command!, ...prev];
        });
        fetchPCState();
        return null;
      } catch {
        return 'Network error while sending decision.';
      }
    },
    [fetchPCState]
  );

  const submitPrompt = useCallback(
    async (text: string, inputSource: 'voice' | 'typed' | 'pasted') => {
      const cleaned = text.trim();
      if (!cleaned || submittingRef.current) return;

      // Support voice approval ("approve" / "deny") for low and medium risk pending commands
      if (inputSource === 'voice' && adminTokenRef.current) {
        const latestPending = pcCommandsRef.current.find(
          (c) => c.status === 'pending_approval'
        );
        const lower = cleaned.toLowerCase().replace(/[.!?]/g, '');
        if (latestPending && (lower === 'approve' || lower === 'yes' || lower === 'confirm')) {
          const err = await handleDecideCommand(latestPending.id, 'approve', { viaVoice: true });
          const replyText = err
            ? err
            : `Approved ${latestPending.action.replace('_', ' ')}. Sending it to your PC now.`;
          setMessages((prev) => [
            ...prev,
            { id: createId(), role: 'user', content: cleaned, timestamp: Date.now() },
            { id: createId(), role: 'assistant', content: replyText, timestamp: Date.now() },
          ]);
          speakResponse(
            replyText,
            continuousModeRef.current || wakeWordModeRef.current
          );
          return;
        }
        if (latestPending && (lower === 'deny' || lower === 'cancel' || lower === 'no')) {
          const err = await handleDecideCommand(latestPending.id, 'deny', { viaVoice: true });
          const replyText = err ? err : 'Cancelled that PC command.';
          setMessages((prev) => [
            ...prev,
            { id: createId(), role: 'user', content: cleaned, timestamp: Date.now() },
            { id: createId(), role: 'assistant', content: replyText, timestamp: Date.now() },
          ]);
          speakResponse(
            replyText,
            continuousModeRef.current || wakeWordModeRef.current
          );
          return;
        }
      }

      submittingRef.current = true;
      setErrorMessage(null);
      setLiveFinalText('');
      setLiveInterimText('');
      setAssistantState('thinking');

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: cleaned,
        timestamp: Date.now(),
      };

      const updatedHistory = [...messagesRef.current, userMessage];
      setMessages(updatedHistory);

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (adminTokenRef.current) {
          headers.Authorization = `Bearer ${adminTokenRef.current}`;
        }

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            provider: selectedProviderRef.current,
            inputSource,
            messages: updatedHistory.slice(-24).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        const data = (await res.json()) as {
          type?: 'chat' | 'pc_command';
          reply?: string;
          command?: PCCommand;
          providerName?: string;
          modelUsed?: string;
          error?: string;
        };

        if (!res.ok || !data.reply) {
          throw new Error(data.error || 'Unable to reach AI provider.');
        }

        if (data.type === 'pc_command' && data.command) {
          setPcCommands((prev) => [data.command!, ...prev]);
        }

        const assistantMessage: ChatMessage = {
          id: createId(),
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          providerName: data.providerName,
          modelUsed: data.modelUsed,
          pcCommandId: data.command?.id,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        submittingRef.current = false;

        speakResponse(
          data.reply,
          continuousModeRef.current || wakeWordModeRef.current
        );
      } catch (err) {
        submittingRef.current = false;
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setErrorMessage(msg);
        setContinuousMode(false);
        setWakeWordMode(false);
        stopMicMonitor();
        setAssistantState('idle');
      }
    },
    [handleDecideCommand, speakResponse, stopMicMonitor]
  );

  const startListeningSession = useCallback(() => {
    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setErrorMessage(
        'Voice recognition is not available in this browser. You can type below or open JARVIS in Chrome, Edge, or Safari.'
      );
      setContinuousMode(false);
      setWakeWordMode(false);
      setPushToTalkActive(false);
      setAssistantState('idle');
      return;
    }

    cancelSpeech();
    stopRecognitionOnly();
    setErrorMessage(null);

    finalBufferRef.current = '';
    interimBufferRef.current = '';
    setLiveFinalText('');
    setLiveInterimText('');
    setAssistantState('listening');

    startMicMonitor();

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    const commitBufferedSpeech = () => {
      clearTimers();
      const combined = `${finalBufferRef.current} ${interimBufferRef.current}`.trim();
      finalBufferRef.current = '';
      interimBufferRef.current = '';
      stopRecognitionOnly();

      if (!combined) {
        if (continuousModeRef.current || wakeWordModeRef.current) {
          startListeningSession();
        } else {
          stopMicMonitor();
          setAssistantState('idle');
        }
        return;
      }

      // If only wake-word mode is active (not Talk / PTT), require "Hey Jarvis" or "Jarvis"
      if (
        wakeWordModeRef.current &&
        !continuousModeRef.current &&
        !pushToTalkActiveRef.current
      ) {
        const wake = stripWakeWord(combined);
        if (!wake.matched || !wake.stripped) {
          startListeningSession();
          return;
        }
        submitPrompt(wake.stripped, 'voice');
        return;
      }

      if (!continuousModeRef.current) {
        stopMicMonitor();
      }
      submitPrompt(combined, 'voice');
    };

    recognition.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalBufferRef.current = `${finalBufferRef.current} ${transcript}`.trim();
        } else {
          interim = `${interim} ${transcript}`.trim();
        }
      }

      interimBufferRef.current = interim;
      setLiveFinalText(finalBufferRef.current);
      setLiveInterimText(interim);
      speechActivityBoostRef.current = 0.85;

      if ((continuousModeRef.current || wakeWordModeRef.current) && !pushToTalkActiveRef.current) {
        if (silenceTimerRef.current !== null) {
          window.clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = window.setTimeout(() => {
          const textReady = `${finalBufferRef.current} ${interimBufferRef.current}`.trim();
          if (
            textReady &&
            (continuousModeRef.current || wakeWordModeRef.current) &&
            !pushToTalkActiveRef.current
          ) {
            commitBufferedSpeech();
          }
        }, 1250);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') {
        if (
          (continuousModeRef.current || wakeWordModeRef.current) &&
          !pushToTalkActiveRef.current
        ) {
          return;
        }
      }

      clearTimers();
      stopRecognitionOnly();
      stopMicMonitor();

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setErrorMessage(
          'Microphone permission is blocked. Enable microphone access in your browser to speak with JARVIS.'
        );
      } else if (event.error !== 'no-speech') {
        setErrorMessage(`Voice recognition error (${event.error}). Try speaking again or typing.`);
      }

      setContinuousMode(false);
      setWakeWordMode(false);
      setPushToTalkActive(false);
      setAssistantState('idle');
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      clearTimers();

      const combined = `${finalBufferRef.current} ${interimBufferRef.current}`.trim();

      if (pushToTalkActiveRef.current) {
        try {
          startListeningSession();
        } catch {
          setPushToTalkActive(false);
          stopMicMonitor();
          setAssistantState('idle');
        }
        return;
      }

      if (combined) {
        finalBufferRef.current = '';
        interimBufferRef.current = '';

        if (wakeWordModeRef.current && !continuousModeRef.current) {
          const wake = stripWakeWord(combined);
          if (!wake.matched || !wake.stripped) {
            startListeningSession();
            return;
          }
          submitPrompt(wake.stripped, 'voice');
          return;
        }

        if (!continuousModeRef.current) {
          stopMicMonitor();
        }
        submitPrompt(combined, 'voice');
      } else if (
        (continuousModeRef.current || wakeWordModeRef.current) &&
        assistantStateRef.current === 'listening'
      ) {
        window.setTimeout(() => {
          if (
            (continuousModeRef.current || wakeWordModeRef.current) &&
            assistantStateRef.current === 'listening'
          ) {
            startListeningSession();
          }
        }, 160);
      } else {
        stopMicMonitor();
        if (assistantStateRef.current === 'listening') {
          setAssistantState('idle');
        }
      }
    };

    try {
      recognition.start();
    } catch {
      stopRecognitionOnly();
      stopMicMonitor();
      setContinuousMode(false);
      setWakeWordMode(false);
      setPushToTalkActive(false);
      setAssistantState('idle');
    }
  }, [cancelSpeech, clearTimers, startMicMonitor, stopMicMonitor, stopRecognitionOnly, submitPrompt]);

  useEffect(() => {
    startListeningSessionRef.current = startListeningSession;
  }, [startListeningSession]);

  useEffect(() => {
    return () => {
      stopRecognitionOnly();
      stopMicMonitor();
      cancelSpeech();
    };
  }, [cancelSpeech, stopMicMonitor, stopRecognitionOnly]);

  const handleToggleTalk = useCallback(() => {
    if (assistantStateRef.current === 'thinking') return;

    if (assistantStateRef.current === 'speaking') {
      cancelSpeech();
      setContinuousMode(true);
      continuousModeRef.current = true;
      startListeningSession();
      return;
    }

    if (continuousModeRef.current) {
      setContinuousMode(false);
      continuousModeRef.current = false;
      const pending = `${finalBufferRef.current} ${interimBufferRef.current}`.trim();
      stopRecognitionOnly();
      if (!wakeWordModeRef.current) {
        stopMicMonitor();
      }
      if (pending) {
        finalBufferRef.current = '';
        interimBufferRef.current = '';
        submitPrompt(pending, 'voice');
      } else if (wakeWordModeRef.current) {
        startListeningSession();
      } else {
        setLiveFinalText('');
        setLiveInterimText('');
        setAssistantState('idle');
      }
    } else {
      setContinuousMode(true);
      continuousModeRef.current = true;
      startListeningSession();
    }
  }, [cancelSpeech, startListeningSession, stopMicMonitor, stopRecognitionOnly, submitPrompt]);

  const handleToggleWakeWord = useCallback(() => {
    if (wakeWordModeRef.current) {
      setWakeWordMode(false);
      wakeWordModeRef.current = false;
      if (!continuousModeRef.current && !pushToTalkActiveRef.current) {
        stopRecognitionOnly();
        stopMicMonitor();
        setLiveFinalText('');
        setLiveInterimText('');
        setAssistantState('idle');
      }
    } else {
      setWakeWordMode(true);
      wakeWordModeRef.current = true;
      if (assistantStateRef.current === 'idle') {
        startListeningSession();
      }
    }
  }, [startListeningSession, stopMicMonitor, stopRecognitionOnly]);

  const handlePushToTalkStart = useCallback(() => {
    if (assistantStateRef.current === 'thinking' || pushToTalkActiveRef.current) return;
    setContinuousMode(false);
    continuousModeRef.current = false;
    setPushToTalkActive(true);
    pushToTalkActiveRef.current = true;
    startListeningSession();
  }, [startListeningSession]);

  const handlePushToTalkEnd = useCallback(() => {
    if (!pushToTalkActiveRef.current) return;
    setPushToTalkActive(false);
    pushToTalkActiveRef.current = false;

    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // Ignore
      }
      pttStopTimeoutRef.current = window.setTimeout(() => {
        const combined = `${finalBufferRef.current} ${interimBufferRef.current}`.trim();
        stopRecognitionOnly();
        if (!wakeWordModeRef.current) stopMicMonitor();
        if (combined) {
          finalBufferRef.current = '';
          interimBufferRef.current = '';
          submitPrompt(combined, 'voice');
        } else if (wakeWordModeRef.current) {
          startListeningSession();
        } else {
          setAssistantState('idle');
        }
      }, 450);
    } else {
      if (!wakeWordModeRef.current) stopMicMonitor();
      setAssistantState('idle');
    }
  }, [startListeningSession, stopMicMonitor, stopRecognitionOnly, submitPrompt]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (activeView !== 'assistant') return;
      if (isTypingTarget(e.target)) return;
      if (!speechRecognitionSupported || assistantStateRef.current === 'thinking') return;
      e.preventDefault();
      handlePushToTalkStart();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (pushToTalkActiveRef.current) {
        e.preventDefault();
        handlePushToTalkEnd();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [activeView, handlePushToTalkEnd, handlePushToTalkStart, speechRecognitionSupported]);

  const handleStopSpeaking = useCallback(() => {
    cancelSpeech();
    if (continuousModeRef.current || wakeWordModeRef.current) {
      startListeningSession();
    } else {
      setAssistantState('idle');
    }
  }, [cancelSpeech, startListeningSession]);

  const handleOrbClick = useCallback(() => {
    if (assistantStateRef.current === 'speaking') {
      handleStopSpeaking();
    } else if (assistantStateRef.current !== 'thinking') {
      handleToggleTalk();
    }
  }, [handleStopSpeaking, handleToggleTalk]);

  const handleToggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      if (!next && assistantStateRef.current === 'speaking') {
        cancelSpeech();
        setAssistantState('idle');
      }
      return next;
    });
  }, [cancelSpeech]);

  const handleClearConversation = useCallback(() => {
    cancelSpeech();
    stopRecognitionOnly();
    stopMicMonitor();
    setContinuousMode(false);
    setWakeWordMode(false);
    setPushToTalkActive(false);
    setMessages([]);
    setLiveFinalText('');
    setLiveInterimText('');
    setErrorMessage(null);
    setAssistantState('idle');
  }, [cancelSpeech, stopMicMonitor, stopRecognitionOnly]);

  const handleSendText = useCallback(
    (text: string, source: 'typed' | 'pasted') => {
      cancelSpeech();
      stopRecognitionOnly();
      if (!wakeWordModeRef.current) stopMicMonitor();
      setContinuousMode(false);
      submitPrompt(text, source);
    },
    [cancelSpeech, stopMicMonitor, stopRecognitionOnly, submitPrompt]
  );

  const handleReplayMessage = useCallback(
    (content: string) => {
      stopRecognitionOnly();
      setContinuousMode(false);
      speakResponse(content, wakeWordModeRef.current);
    },
    [speakResponse, stopRecognitionOnly]
  );

  const handleUpdateSettings = useCallback(
    async (patch: Record<string, unknown>): Promise<string | null> => {
      if (!adminTokenRef.current) return 'Admin authentication required.';
      try {
        const res = await fetch('/api/pc/settings', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminTokenRef.current}`,
          },
          body: JSON.stringify(patch),
        });
        const data = (await res.json()) as {
          settings?: PCSettings;
          agentOnline?: boolean;
          error?: string;
        };
        if (!res.ok || !data.settings) {
          return data.error || 'Unable to update settings.';
        }
        setPcSettings(data.settings);
        if (typeof data.agentOnline === 'boolean') setAgentOnline(data.agentOnline);
        if (patch.kill_switch === true) {
          fetchPCState();
        }
        return null;
      } catch {
        return 'Network error while updating settings.';
      }
    },
    [fetchPCState]
  );

  const handleRegenerateToken = useCallback(async () => {
    if (!adminTokenRef.current) return;
    try {
      const res = await fetch('/api/pc/token/regenerate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminTokenRef.current}` },
      });
      const data = (await res.json()) as { agent_token?: string };
      if (res.ok && data.agent_token) {
        setPcSettings((prev) =>
          prev ? { ...prev, agent_token: data.agent_token! } : prev
        );
      }
    } catch {
      // Ignore
    }
  }, []);

  const handleAdminLogout = useCallback(async () => {
    const token = adminTokenRef.current;
    if (token) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setAdminToken(null);
    setPcSettings(null);
    setPcCommands([]);
  }, []);

  const commandsById: Record<string, PCCommand> = {};
  for (const cmd of pcCommands) {
    commandsById[cmd.id] = cmd;
  }

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const latestPcCmd = latestAssistantMsg?.pcCommandId
    ? commandsById[latestAssistantMsg.pcCommandId]
    : undefined;

  const handleCopyLatest = async () => {
    if (!latestAssistantMsg) return;
    try {
      await navigator.clipboard.writeText(latestAssistantMsg.content);
      setCopiedReply(true);
      setTimeout(() => setCopiedReply(false), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const stateTitle =
    assistantState === 'listening'
      ? pushToTalkActive
        ? 'Listening (Push-to-Talk)'
        : wakeWordMode && !continuousMode
        ? 'Listening for “Hey Jarvis”'
        : 'Listening'
      : assistantState === 'thinking'
      ? 'Thinking'
      : assistantState === 'speaking'
      ? 'Speaking'
      : 'Standing By';

  const hasTranscriptText = Boolean(liveFinalText || liveInterimText);

  return (
    <KineticGrid globalColor="default" className="flex flex-col h-[100dvh]">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
        <HeaderBar
          activeView={activeView}
          onChangeView={setActiveView}
          providers={providers}
          selectedProvider={selectedProvider}
          onSelectProvider={setSelectedProvider}
          wakeWordEnabled={wakeWordMode}
          wakeWordSupported={speechRecognitionSupported}
          onToggleWakeWord={handleToggleWakeWord}
          voiceEnabled={voiceEnabled}
          onToggleVoice={handleToggleVoice}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((prev) => !prev)}
          messageCount={messages.length}
          onClearConversation={handleClearConversation}
          agentOnline={agentOnline}
          isAdmin={Boolean(adminToken)}
        />

        {activeView === 'pc-control' ? (
          <PCControlPage
            isAdmin={Boolean(adminToken)}
            adminClaimed={adminClaimed}
            envPasscodeConfigured={envPasscodeConfigured}
            onAdminAuthenticated={(token) => {
              setAdminToken(token);
              setAdminClaimed(true);
            }}
            onAdminLogout={handleAdminLogout}
            settings={pcSettings}
            commands={pcCommands}
            agentOnline={agentOnline}
            lastSyncedAt={lastSyncedAt}
            onRefreshState={fetchPCState}
            onUpdateSettings={handleUpdateSettings}
            onRegenerateToken={handleRegenerateToken}
            onDecideCommand={handleDecideCommand}
          />
        ) : (
          <main className="relative z-10 flex flex-1 flex-col items-center justify-between overflow-y-auto px-4 pt-3 pb-2">
            <div className="flex flex-1 flex-col items-center justify-center w-full max-w-3xl mx-auto py-1">
              {/* Quiet State Label */}
              <div className="mb-1 text-xs font-mono tracking-[0.2em] uppercase">
                <span
                  className={
                    assistantState === 'listening'
                      ? 'text-cyan-300'
                      : assistantState === 'speaking'
                      ? 'text-sky-300'
                      : assistantState === 'thinking'
                      ? 'text-blue-300'
                      : 'text-slate-400'
                  }
                >
                  {stateTitle}
                </span>
              </div>

              {/* Three.js WebGL Plasma Sphere + Signature Voice Stage */}
              <JarvisOrb
                state={assistantState}
                audioLevelRef={audioLevelRef}
                speechPulseRef={speechPulseRef}
                onOrbClick={handleOrbClick}
              />

              {/* Live Transcription & Response Stage */}
              <div className="mt-3 w-full max-w-2xl px-1">
                {errorMessage && (
                  <div
                    role="alert"
                    className="mb-3 rounded-2xl border border-rose-500/35 bg-[#12080D]/92 px-4 py-3 text-sm text-rose-200 flex items-start justify-between gap-3"
                  >
                    <p className="leading-relaxed">{errorMessage}</p>
                    <button
                      type="button"
                      onClick={() => setErrorMessage(null)}
                      className="text-xs text-rose-300 hover:text-white shrink-0 cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                {assistantState === 'listening' ? (
                  <div className="min-h-[78px] rounded-2xl border border-cyan-400/25 bg-[#050A14]/92 px-5 py-4 text-center">
                    {hasTranscriptText ? (
                      <p className="text-base sm:text-lg leading-relaxed text-white">
                        <span>{liveFinalText}</span>
                        {liveFinalText && liveInterimText ? ' ' : ''}
                        <span className="text-cyan-300/85">{liveInterimText}</span>
                      </p>
                    ) : (
                      <p className="text-sm sm:text-base text-slate-400">
                        {wakeWordMode && !continuousMode && !pushToTalkActive
                          ? 'Say “Hey Jarvis” followed by your request.'
                          : 'Listening—go ahead when you are ready.'}
                      </p>
                    )}
                  </div>
                ) : assistantState === 'thinking' ? (
                  <div className="min-h-[78px] rounded-2xl border border-sky-400/25 bg-[#050A14]/92 px-5 py-4 text-center">
                    {latestUserMsg && (
                      <p className="text-sm text-slate-400 line-clamp-2 mb-1">
                        “{latestUserMsg.content}”
                      </p>
                    )}
                    <p className="text-sm font-medium text-sky-200">
                      Let me pull that together...
                    </p>
                  </div>
                ) : latestAssistantMsg ? (
                  <div className="rounded-2xl border border-white/[0.1] bg-[#060B16]/92 px-5 py-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="font-semibold text-cyan-300">JARVIS</span>
                        {latestAssistantMsg.providerName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{latestAssistantMsg.providerName}</span>
                          </>
                        )}
                        {latestAssistantMsg.modelUsed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-slate-500 truncate">
                              {latestAssistantMsg.modelUsed}
                            </span>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleCopyLatest}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition-colors shrink-0 cursor-pointer"
                      >
                        {copiedReply ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-cyan-400" />
                            <span className="text-cyan-300">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="jarvis-scroll max-h-36 sm:max-h-44 overflow-y-auto pr-1 text-sm sm:text-[15px] leading-relaxed text-slate-100">
                      <RevealText
                        text={latestAssistantMsg.content}
                        active={assistantState === 'speaking'}
                      />
                    </div>

                    {latestPcCmd && (
                      <PCApprovalCard
                        command={latestPcCmd}
                        pinConfigured={Boolean(pcSettings?.pin_configured)}
                        onDecide={handleDecideCommand}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <div className="font-algerian text-2xl sm:text-3xl font-bold text-cyan-300 mb-1.5">
                      JARVIS
                    </div>
                    <h1
                      className="text-lg sm:text-xl font-medium text-white tracking-tight"
                      style={{ textWrap: 'balance' }}
                    >
                      {greeting.headline}
                    </h1>
                    <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-md">
                      {greeting.subline}
                    </p>

                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      {QUICK_PROMPTS.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => handleSendText(item.prompt, 'typed')}
                          className="rounded-xl border border-white/[0.1] bg-[#060B16]/90 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-cyan-400/45 hover:bg-cyan-500/12 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <VoiceControls
              state={assistantState}
              continuousMode={continuousMode}
              pushToTalkActive={pushToTalkActive}
              speechRecognitionSupported={speechRecognitionSupported}
              onToggleTalk={handleToggleTalk}
              onStopSpeaking={handleStopSpeaking}
              onPushToTalkStart={handlePushToTalkStart}
              onPushToTalkEnd={handlePushToTalkEnd}
              onSendText={handleSendText}
            />
          </main>
        )}

        <TranscriptDrawer
          open={historyOpen}
          messages={messages}
          commandsById={commandsById}
          pinConfigured={Boolean(pcSettings?.pin_configured)}
          onDecideCommand={handleDecideCommand}
          onClose={() => setHistoryOpen(false)}
          onClear={handleClearConversation}
          onReplayMessage={handleReplayMessage}
        />
      </div>
    </KineticGrid>
  );
}
