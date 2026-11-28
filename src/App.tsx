import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Check, Copy, Lock, X } from 'lucide-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import KineticGrid from './components/ui/kinetic-grid';
import { ActiveTasksTray } from './components/ActiveTasksTray';
import { ChatPasscodeActionCard } from './components/ChatPasscodeActionCard';
import { HeaderBar } from './components/HeaderBar';
import { HistoryPage } from './components/HistoryPage';
import { JarvisOrb } from './components/JarvisOrb';
import { PCApprovalCard } from './components/PCApprovalCard';
import { PCControlPage } from './components/PCControlPage';
import { PCGuidePage } from './components/PCGuidePage';
import { ResearchBriefCard } from './components/ResearchBriefCard';
import { RevealText } from './components/RevealText';
import { TranscriptDrawer } from './components/TranscriptDrawer';
import { VoiceControls } from './components/VoiceControls';
import { isJarvisColorTheme, JARVIS_THEMES } from './lib/jarvisThemes';
import type {
  ActiveTask,
  AppLock,
  AppView,
  AssistantState,
  ChatMessage,
  JarvisColorTheme,
  PCAction,
  PCCommand,
  PCPublicStatus,
  PCSettings,
  PendingChatAction,
  ProviderInfo,
  ProviderPreference,
  ResearchJob,
  ResearchSource,
} from './types/jarvis';
import {
  getJarvisSpeechConfig,
  getSpeechRecognitionConstructor,
  isSpeechSynthesisSupported,
  listJarvisVoiceOptions,
  prepareTextForSpeech,
  selectJarvisVoice,
  splitIntoSpeechChunks,
  type SpeechRecognitionInstance,
} from './utils/speech';

const QUICK_PROMPTS = [
  {
    label: 'Research a topic',
    prompt: 'Research solid-state EV batteries and summarize the latest breakthroughs.',
  },
  {
    label: 'Multitask on PC',
    prompt: 'Open Chrome and research how WebGPU improves browser AI.',
  },
  {
    label: 'Plan my day',
    prompt:
      'Ask me for my top three priorities today and build a realistic time-blocked plan.',
  },
  {
    label: 'Draft an email',
    prompt:
      'Help me draft a concise, friendly follow-up email after a client project kickoff.',
  },
];

const THINKING_PHRASES = [
  'Give me just a second…',
  'Working through that now…',
  'Pulling my thoughts together…',
  'On it—one moment…',
];

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTimeAwareGreeting(): { headline: string; subline: string } {
  const hour = new Date().getHours();
  if (hour < 12) {
    return {
      headline: 'Good morning. What should we tackle first?',
      subline: 'Speak naturally, hold Spacebar to talk, or type whatever is on your plate.',
    };
  }
  if (hour < 18) {
    return {
      headline: 'Good afternoon. Ready whenever you are.',
      subline: 'Ask for help with emails, planning, code, or a quick PC command.',
    };
  }
  return {
    headline: 'Good evening. What are we wrapping up tonight?',
    subline: 'Tap Talk to Jarvis, hold Spacebar, or type below to pick up right away.',
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
  const [colorTheme, setColorTheme] = useState<JarvisColorTheme>(() => {
    try {
      const saved = window.localStorage.getItem('jarvis_color_theme');
      if (isJarvisColorTheme(saved)) return saved;
    } catch {
      // Ignore storage access errors
    }
    return 'blue';
  });
  const [assistantState, setAssistantState] = useState<AssistantState>('idle');
  const [continuousMode, setContinuousMode] = useState(false);
  const [wakeWordMode, setWakeWordMode] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>(() => {
    try {
      return window.localStorage.getItem('jarvis_voice_uri') || '';
    } catch {
      return '';
    }
  });
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderPreference>('auto');

  useEffect(() => {
    const spec = JARVIS_THEMES[colorTheme];
    document.documentElement.style.setProperty('--jarvis-accent-rgb', spec.accentRgb);
    try {
      window.localStorage.setItem('jarvis_color_theme', colorTheme);
    } catch {
      // Ignore storage access errors
    }
  }, [colorTheme]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [liveFinalText, setLiveFinalText] = useState('');
  const [liveInterimText, setLiveInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedReply, setCopiedReply] = useState(false);

  // Admin & PC Control State (Bearer token held strictly in memory)
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [pcSettings, setPcSettings] = useState<PCSettings | null>(null);
  const [pcCommands, setPcCommands] = useState<PCCommand[]>([]);
  const [pcLocks, setPcLocks] = useState<AppLock[]>([]);
  const [publicStatus, setPublicStatus] = useState<PCPublicStatus>({
    pc_control_enabled: true,
    kill_switch: false,
    agentOnline: false,
    agent_last_seen: null,
    allowedAppsCount: 7,
    activeLocks: [],
  });
  const [guideBannerDismissed, setGuideBannerDismissed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('jarvis_guide_banner_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [lockClock, setLockClock] = useState(Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [researchJobs, setResearchJobs] = useState<Record<string, ResearchJob>>({});
  const [taskClock, setTaskClock] = useState(Date.now());

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
  const activeDispatchCountRef = useRef(0);
  const speechSessionRef = useRef(0);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const selectedVoiceURIRef = useRef(selectedVoiceURI);

  useEffect(() => {
    selectedVoiceURIRef.current = selectedVoiceURI;
    try {
      window.localStorage.setItem('jarvis_voice_uri', selectedVoiceURI);
    } catch {
      // Ignore storage access errors
    }
  }, [selectedVoiceURI]);

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

  const announcedCommandResultsRef = useRef<Set<string>>(new Set());
  const finishedResearchIdsRef = useRef<Set<string>>(new Set());

  // Fetch providers on mount
  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data: { providers?: ProviderInfo[] }) => {
        if (Array.isArray(data.providers)) setProviders(data.providers);
      })
      .catch(() => {});
  }, []);

  // Load voices for speechSynthesis
  useEffect(() => {
    if (!isSpeechSynthesisSupported()) return;
    const loadVoices = () => {
      const loaded = window.speechSynthesis.getVoices();
      voicesRef.current = loaded;
      setAvailableVoices(loaded);
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const fetchPublicStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/pc/public-status');
      if (!res.ok) return;
      const data = (await res.json()) as PCPublicStatus;
      setPublicStatus(data);
    } catch {
      // Ignore transient poll error
    }
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
        setPcLocks([]);
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as {
        settings: PCSettings;
        commands: PCCommand[];
        locks: AppLock[];
        agentOnline: boolean;
      };
      setPcSettings(data.settings);
      setPcCommands(data.commands);
      setPcLocks(data.locks || []);
      setPublicStatus((prev) => ({
        ...prev,
        pc_control_enabled: data.settings.pc_control_enabled,
        kill_switch: data.settings.kill_switch,
        agentOnline: data.agentOnline,
        agent_last_seen: data.settings.agent_last_seen,
        allowedAppsCount: data.settings.allowed_apps.length,
        activeLocks: (data.locks || []).filter((l) => l.status === 'active'),
      }));
      setLastSyncedAt(Date.now());
    } catch {
      // Ignore transient poll error
    }
  }, []);

  useEffect(() => {
    fetchPublicStatus();
  }, [fetchPublicStatus]);

  useEffect(() => {
    if (!adminToken) return;
    fetchPCState();
  }, [adminToken, fetchPCState]);

  // 1-second tick when any active lock exists so live countdowns stay smooth
  useEffect(() => {
    if (publicStatus.activeLocks.length === 0) return;
    const id = window.setInterval(() => setLockClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [publicStatus.activeLocks.length]);

  const hasActiveCommands = pcCommands.some(
    (c) =>
      c.status === 'pending_approval' || c.status === 'approved' || c.status === 'running'
  );

  // Poll non-secret public status (badge, active locks, guide checklist)
  useEffect(() => {
    const intervalMs = hasActiveCommands || activeView === 'guide' ? 2000 : 4000;
    const id = window.setInterval(() => {
      fetchPublicStatus();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [activeView, hasActiveCommands, fetchPublicStatus]);

  // Poll admin PC state while on PC Control page or while commands are active
  useEffect(() => {
    if (!adminToken) return;
    if (activeView !== 'pc-control' && !hasActiveCommands) return;
    const intervalMs = hasActiveCommands ? 1500 : 4000;
    const id = window.setInterval(() => {
      fetchPCState();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [adminToken, activeView, hasActiveCommands, fetchPCState]);

  // Listen for Change Passcode event from PCControlPage
  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (
        ev as CustomEvent<{
          currentPasscode: string;
          newPasscode: string;
          resolve: (res: { ok: boolean; text: string }) => void;
        }>
      ).detail;
      const token = adminTokenRef.current;
      if (!token) {
        detail.resolve({ ok: false, text: 'Admin session expired.' });
        return;
      }
      try {
        const res = await fetch('/api/admin/change-passcode', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            currentPasscode: detail.currentPasscode,
            newPasscode: detail.newPasscode,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
        if (!res.ok || !data.ok) {
          detail.resolve({ ok: false, text: data.error || 'Unable to change passcode.' });
        } else {
          detail.resolve({ ok: true, text: data.message || 'Admin passcode updated.' });
        }
      } catch {
        detail.resolve({ ok: false, text: 'Network error while updating passcode.' });
      }
    };
    window.addEventListener('jarvis-change-passcode', handler);
    return () => window.removeEventListener('jarvis-change-passcode', handler);
  }, []);

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

    const startSpeakingWithVoices = (voices: SpeechSynthesisVoice[]) => {
      if (speechSessionRef.current !== sessionId) return;
      const preferredVoice = selectJarvisVoice(voices, selectedVoiceURIRef.current);
      const speechCfg = getJarvisSpeechConfig(preferredVoice);

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
        utterance.lang = speechCfg.lang;
        utterance.rate = speechCfg.rate;
        utterance.pitch = speechCfg.pitch;

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
    };

    const freshVoices = window.speechSynthesis.getVoices();
    const initialVoices = freshVoices.length > 0 ? freshVoices : voicesRef.current;
    if (initialVoices.length > 0) {
      voicesRef.current = initialVoices;
      startSpeakingWithVoices(initialVoices);
      return;
    }

    // Chrome can populate remote voices (e.g. Google UK English Male) shortly after first call
    let started = false;
    const finishWait = () => {
      if (started) return;
      started = true;
      window.speechSynthesis.removeEventListener('voiceschanged', onReady);
      const loaded = window.speechSynthesis.getVoices();
      if (loaded.length > 0) {
        voicesRef.current = loaded;
        setAvailableVoices(loaded);
      }
      startSpeakingWithVoices(loaded.length > 0 ? loaded : voicesRef.current);
    };
    const onReady = () => {
      if (window.speechSynthesis.getVoices().length > 0) {
        finishWait();
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onReady);
    window.setTimeout(finishWait, 350);
  }, []);

  const handleDecideCommand = useCallback(
    async (
      id: string,
      decision: 'approve' | 'deny',
      opts?: { passcode?: string; alwaysAllowApp?: boolean; viaVoice?: boolean }
    ): Promise<string | null> => {
      const token = adminTokenRef.current;
      if (!token && !opts?.passcode) return 'Admin passcode is required.';

      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`/api/pc/commands/${encodeURIComponent(id)}/decide`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            decision,
            passcode: opts?.passcode,
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
        fetchPublicStatus();
        return null;
      } catch {
        return 'Network error while sending decision.';
      }
    },
    [fetchPCState, fetchPublicStatus]
  );

  const handleUnlockApp = useCallback(
    async (lockId: string, passcode: string): Promise<string | null> => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (adminTokenRef.current) headers.Authorization = `Bearer ${adminTokenRef.current}`;

        const res = await fetch(`/api/pc/locks/${encodeURIComponent(lockId)}/unlock`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ passcode }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          activeLocks?: AppLock[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          return data.error || 'Unable to unlock app.';
        }
        if (Array.isArray(data.activeLocks)) {
          setPublicStatus((prev) => ({ ...prev, activeLocks: data.activeLocks! }));
        }
        fetchPCState();
        fetchPublicStatus();
        return null;
      } catch {
        return 'Network error while unlocking app.';
      }
    },
    [fetchPCState, fetchPublicStatus]
  );

  const handleConfirmChatAction = useCallback(
    async (
      messageId: string,
      action: PendingChatAction,
      passcode: string
    ): Promise<string | null> => {
      if (action.type === 'unlock_app') {
        if (!action.lockId) return 'Lock ID missing.';
        const err = await handleUnlockApp(action.lockId, passcode);
        if (err) return err;
        const doneText = `${action.appName} is now unlocked.`;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.pendingAction
              ? { ...m, pendingAction: { ...m.pendingAction, resolved: true, statusText: doneText } }
              : m
          )
        );
        return null;
      }

      try {
        const res = await fetch('/api/pc/permissions/chat-confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passcode,
            action: action.type,
            appName: action.appName,
            aliases: action.aliases,
            launchCommand: action.launchCommand,
            processName: action.processName,
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          return data.error || 'Passcode check failed.';
        }
        const statusText = data.message || 'Updated permitted apps.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId && m.pendingAction
              ? {
                  ...m,
                  pendingAction: {
                    ...m.pendingAction,
                    resolved: true,
                    statusText,
                  },
                }
              : m
          )
        );
        fetchPCState();
        fetchPublicStatus();
        return null;
      } catch {
        return 'Network error while confirming permission.';
      }
    },
    [fetchPCState, fetchPublicStatus, handleUnlockApp]
  );

  const hasRunningTasks = activeTasks.some((t) => t.status === 'running');
  useEffect(() => {
    if (!hasRunningTasks) return;
    const id = window.setInterval(() => setTaskClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasRunningTasks]);

  const handleDismissTask = useCallback((taskId: string) => {
    setActiveTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  // Poll active autonomous research jobs concurrently
  const runningResearchIds = Object.values(researchJobs)
    .filter(
      (j) =>
        j.status === 'queued' ||
        j.status === 'planning' ||
        j.status === 'searching' ||
        j.status === 'reading' ||
        j.status === 'synthesizing'
    )
    .map((j) => j.id);

  useEffect(() => {
    if (runningResearchIds.length === 0) return;

    const pollResearch = async () => {
      await Promise.all(
        runningResearchIds.map(async (jobId) => {
          try {
            const res = await fetch(`/api/research/${encodeURIComponent(jobId)}`);
            if (!res.ok) return;
            const data = (await res.json()) as { job?: ResearchJob };
            const job = data.job;
            if (!job) return;

            setResearchJobs((prev) => ({ ...prev, [job.id]: job }));

            setActiveTasks((prev) =>
              prev.map((t) =>
                t.researchJobId === job.id
                  ? {
                      ...t,
                      detail: job.stepLabel,
                      status:
                        job.status === 'done'
                          ? 'done'
                          : job.status === 'failed'
                          ? 'failed'
                          : 'running',
                    }
                  : t
              )
            );

            if (job.status === 'done' && !finishedResearchIdsRef.current.has(job.id)) {
              finishedResearchIdsRef.current.add(job.id);
              const reportText = job.report || `Finished researching "${job.query}".`;
              const currentMsgs = messagesRef.current;
              const starterIdx = currentMsgs.findIndex((m) => m.researchJobId === job.id);
              const hasNewerMessages =
                starterIdx !== -1 && starterIdx < currentMsgs.length - 1;

              if (starterIdx !== -1 && !hasNewerMessages) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.researchJobId === job.id
                      ? {
                          ...m,
                          content: reportText,
                          sources: job.sources,
                          providerName: job.providerName || m.providerName,
                          modelUsed: job.modelUsed || m.modelUsed,
                        }
                      : m
                  )
                );
              } else {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: createId(),
                    role: 'assistant',
                    content: reportText,
                    timestamp: Date.now(),
                    providerName: job.providerName,
                    modelUsed: job.modelUsed,
                    researchJobId: job.id,
                    sources: job.sources,
                  },
                ]);
              }

              if (assistantStateRef.current === 'idle') {
                speakResponse(
                  job.spokenSummary || reportText,
                  continuousModeRef.current || wakeWordModeRef.current
                );
              }
            } else if (job.status === 'failed' && !finishedResearchIdsRef.current.has(job.id)) {
              finishedResearchIdsRef.current.add(job.id);
              const failText = `I couldn't finish researching "${job.query}": ${
                job.error || 'please try again.'
              }`;
              setMessages((prev) => [
                ...prev,
                {
                  id: createId(),
                  role: 'assistant',
                  content: failText,
                  timestamp: Date.now(),
                  researchJobId: job.id,
                },
              ]);
            }
          } catch {
            // Ignore transient research poll glitch
          }
        })
      );
    };

    const id = window.setInterval(pollResearch, 1200);
    return () => window.clearInterval(id);
  }, [runningResearchIds.join(','), speakResponse]);

  // Watch active PC commands (for both admin and non-admin chat sessions) so /api/agent/report results show in chat
  useEffect(() => {
    const activeIds = pcCommands
      .filter((c) => c.status === 'pending_approval' || c.status === 'approved' || c.status === 'running')
      .map((c) => c.id);

    // Sync activeTasks status for PC tasks
    setActiveTasks((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.kind !== 'pc' || t.status !== 'running' || !t.pcCommandIds?.length) return t;
        const tracked = t.pcCommandIds
          .map((cid) => pcCommands.find((c) => c.id === cid))
          .filter((c): c is PCCommand => Boolean(c));
        if (tracked.length === 0) return t;
        const anyPending = tracked.some(
          (c) => c.status === 'pending_approval' || c.status === 'approved' || c.status === 'running'
        );
        if (anyPending) return t;
        changed = true;
        const anyBad = tracked.some(
          (c) => c.status === 'failed' || c.status === 'denied' || c.status === 'expired'
        );
        return {
          ...t,
          status: anyBad ? ('failed' as const) : ('done' as const),
          detail: tracked[0].result_message || (anyBad ? 'Action did not complete' : 'Completed on PC'),
        };
      });
      return changed ? next : prev;
    });

    if (activeIds.length === 0) return;

    const id = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/pc/commands/status?ids=${encodeURIComponent(activeIds.join(','))}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { commands?: PCCommand[] };
        if (!Array.isArray(data.commands)) return;

        const updatesById = new Map(data.commands.map((c) => [c.id, c]));
        setPcCommands((prev) => prev.map((c) => updatesById.get(c.id) || c));

        for (const updated of data.commands) {
          if (
            (updated.status === 'done' || updated.status === 'failed') &&
            !announcedCommandResultsRef.current.has(updated.id)
          ) {
            announcedCommandResultsRef.current.add(updated.id);
            const reportLine =
              updated.status === 'done'
                ? updated.result_message || `Finished ${updated.action.replace('_', ' ')}.`
                : `PC Agent couldn't run that: ${updated.result_message || 'Command failed.'}`;
            setMessages((prev) => [
              ...prev,
              {
                id: createId(),
                role: 'assistant',
                content: reportLine,
                timestamp: Date.now(),
              },
            ]);
            if (assistantStateRef.current === 'idle') {
              speakResponse(reportLine, continuousModeRef.current || wakeWordModeRef.current);
            }
          }
        }
      } catch {
        // Ignore transient status poll failure
      }
    }, 1500);

    return () => window.clearInterval(id);
  }, [pcCommands, speakResponse]);

  const submitPrompt = useCallback(
    async (text: string, inputSource: 'voice' | 'typed' | 'pasted') => {
      const cleaned = text.trim();
      if (!cleaned) return;

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

      const isConcurrentDispatch = activeDispatchCountRef.current > 0;
      activeDispatchCountRef.current += 1;
      const dispatchTaskId = createId();

      if (isConcurrentDispatch) {
        setActiveTasks((prev) => [
          {
            id: dispatchTaskId,
            kind: 'chat',
            title: cleaned.length > 38 ? `${cleaned.slice(0, 36)}…` : cleaned,
            detail: 'Working in parallel…',
            status: 'running',
            startedAt: Date.now(),
          },
          ...prev,
        ]);
      }

      setErrorMessage(null);
      setLiveFinalText('');
      setLiveInterimText('');
      if (activeDispatchCountRef.current === 1 && assistantStateRef.current !== 'speaking') {
        setAssistantState('thinking');
      }

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
            clientTzOffsetMinutes: new Date().getTimezoneOffset(),
            messages: updatedHistory.slice(-24).map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        const data = (await res.json()) as {
          type?: 'chat' | 'pc_command' | 'chat_passcode_action' | 'research_started';
          reply?: string;
          command?: PCCommand;
          commands?: PCCommand[];
          pendingAction?: PendingChatAction;
          researchJob?: ResearchJob;
          activeLocks?: AppLock[];
          providerName?: string;
          modelUsed?: string;
          sources?: ResearchSource[];
          error?: string;
        };

        if (!res.ok || !data.reply) {
          throw new Error(data.error || 'Unable to reach AI provider.');
        }

        const returnedCommands =
          Array.isArray(data.commands) && data.commands.length > 0
            ? data.commands
            : data.command
            ? [data.command]
            : [];

        if (returnedCommands.length > 0) {
          for (const cmd of returnedCommands) {
            if (cmd.status === 'done' || cmd.status === 'denied') {
              announcedCommandResultsRef.current.add(cmd.id);
            }
          }
          setPcCommands((prev) => [...returnedCommands, ...prev]);
        }

        if (Array.isArray(data.activeLocks)) {
          setPublicStatus((prev) => ({ ...prev, activeLocks: data.activeLocks! }));
        }

        // Clean up temporary concurrent chat indicator, and register persistent research / PC tasks
        if (isConcurrentDispatch) {
          setActiveTasks((prev) => prev.filter((t) => t.id !== dispatchTaskId));
        }

        if (data.researchJob) {
          const job = data.researchJob;
          setResearchJobs((prev) => ({ ...prev, [job.id]: job }));
          setActiveTasks((prev) => [
            {
              id: `research-${job.id}`,
              kind: 'research',
              title: job.query.length > 38 ? `${job.query.slice(0, 36)}…` : job.query,
              detail: job.stepLabel,
              status: 'running',
              startedAt: Date.now(),
              researchJobId: job.id,
            },
            ...prev,
          ]);
        }

        const activePcCmds = returnedCommands.filter(
          (c) => c.status === 'pending_approval' || c.status === 'approved' || c.status === 'running'
        );
        if (activePcCmds.length > 0) {
          setActiveTasks((prev) => [
            {
              id: `pc-${activePcCmds[0].id}`,
              kind: 'pc',
              title:
                activePcCmds.length > 1
                  ? `${activePcCmds.length} PC actions`
                  : activePcCmds[0].command_text.length > 38
                  ? `${activePcCmds[0].command_text.slice(0, 36)}…`
                  : activePcCmds[0].command_text,
              detail:
                activePcCmds[0].status === 'pending_approval'
                  ? 'Waiting for approval'
                  : publicStatus.agentOnline
                  ? 'Sending to PC Agent'
                  : 'Queued for PC Agent',
              status: 'running',
              startedAt: Date.now(),
              pcCommandIds: activePcCmds.map((c) => c.id),
            },
            ...prev,
          ]);
        }

        const assistantMessage: ChatMessage = {
          id: createId(),
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
          providerName: data.providerName,
          modelUsed: data.modelUsed,
          pcCommandId: returnedCommands[0]?.id,
          pcCommandIds: returnedCommands.map((c) => c.id),
          pendingAction: data.pendingAction,
          researchJobId: data.researchJob?.id,
          sources: data.sources,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        activeDispatchCountRef.current = Math.max(0, activeDispatchCountRef.current - 1);

        speakResponse(
          data.reply,
          continuousModeRef.current || wakeWordModeRef.current
        );
      } catch (err) {
        activeDispatchCountRef.current = Math.max(0, activeDispatchCountRef.current - 1);
        if (isConcurrentDispatch) {
          setActiveTasks((prev) => prev.filter((t) => t.id !== dispatchTaskId));
        }
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        setErrorMessage(msg);
        if (activeDispatchCountRef.current === 0) {
          setContinuousMode(false);
          setWakeWordMode(false);
          stopMicMonitor();
          setAssistantState('idle');
        }
      }
    },
    [handleDecideCommand, publicStatus.agentOnline, speakResponse, stopMicMonitor]
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
    if (pushToTalkActiveRef.current) return;
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
      if (!speechRecognitionSupported) return;
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
    } else {
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
    setActiveTasks([]);
    setResearchJobs({});
    finishedResearchIdsRef.current.clear();
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
          locks?: AppLock[];
          error?: string;
        };
        if (!res.ok || !data.settings) {
          return data.error || 'Unable to update settings.';
        }
        setPcSettings(data.settings);
        if (Array.isArray(data.locks)) {
          setPcLocks(data.locks);
        }
        setPublicStatus((prev) => ({
          ...prev,
          pc_control_enabled: data.settings!.pc_control_enabled,
          kill_switch: data.settings!.kill_switch,
          agentOnline: typeof data.agentOnline === 'boolean' ? data.agentOnline : prev.agentOnline,
          allowedAppsCount: data.settings!.allowed_apps.length,
          activeLocks: Array.isArray(data.locks)
            ? data.locks.filter((l) => l.status === 'active')
            : prev.activeLocks,
        }));
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
    setPcLocks([]);
  }, []);

  const handleQuickAction = useCallback(
    async (
      action: PCAction,
      params: Record<string, unknown>
    ): Promise<{ ok: boolean; error?: string; message?: string }> => {
      const token = adminTokenRef.current;
      if (!token) return { ok: false, error: 'Admin sign-in is required.' };
      try {
        const res = await fetch('/api/pc/quick-action', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, params }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          command?: PCCommand;
          activeLocks?: AppLock[];
          locks?: AppLock[];
          error?: string;
        };
        if (!res.ok || !data.ok) {
          return { ok: false, error: data.error || 'Could not queue quick action.' };
        }
        if (data.command) {
          setPcCommands((prev) => [data.command!, ...prev]);
        }
        if (Array.isArray(data.locks)) {
          setPcLocks(data.locks);
        }
        if (Array.isArray(data.activeLocks)) {
          setPublicStatus((prev) => ({ ...prev, activeLocks: data.activeLocks! }));
        }
        fetchPCState();
        fetchPublicStatus();
        return { ok: true };
      } catch {
        return { ok: false, error: 'Network error while sending action.' };
      }
    },
    [fetchPCState, fetchPublicStatus]
  );

  const handleDismissGuideBanner = () => {
    setGuideBannerDismissed(true);
    try {
      window.localStorage.setItem('jarvis_guide_banner_dismissed', '1');
    } catch {
      // Ignore storage error
    }
  };

  const commandsById: Record<string, PCCommand> = {};
  for (const cmd of pcCommands) {
    commandsById[cmd.id] = cmd;
  }

  const latestAssistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
  const latestUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const latestPcCmdIds = latestAssistantMsg?.pcCommandIds?.length
    ? latestAssistantMsg.pcCommandIds
    : latestAssistantMsg?.pcCommandId
    ? [latestAssistantMsg.pcCommandId]
    : [];
  const latestPcCmds = latestPcCmdIds
    .map((id) => commandsById[id])
    .filter((c): c is PCCommand => Boolean(c));
  const latestResearchJob = latestAssistantMsg?.researchJobId
    ? researchJobs[latestAssistantMsg.researchJobId]
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
        ? 'Listening (push-to-talk)'
        : wakeWordMode && !continuousMode
        ? 'Listening for “Hey Jarvis”'
        : 'Listening'
      : assistantState === 'thinking'
      ? 'Thinking'
      : assistantState === 'speaking'
      ? 'Speaking'
      : 'Standing by';

  const hasTranscriptText = Boolean(liveFinalText || liveInterimText);
  const thinkingLine = THINKING_PHRASES[messages.length % THINKING_PHRASES.length];
  const stageKey =
    assistantState === 'listening'
      ? 'listening'
      : assistantState === 'thinking'
      ? 'thinking'
      : latestAssistantMsg
      ? `reply-${latestAssistantMsg.id}`
      : 'welcome';

  const voiceOptions = listJarvisVoiceOptions(availableVoices);
  const resolvedVoice = selectJarvisVoice(availableVoices, selectedVoiceURI);
  const activeVoiceLabel = getJarvisSpeechConfig(resolvedVoice).profileLabel;

  const handleTestVoice = useCallback(() => {
    setVoiceEnabled(true);
    voiceEnabledRef.current = true;
    speakResponse('At your service. All systems are online and standing by.', false);
  }, [speakResponse]);

  const ui = JARVIS_THEMES[colorTheme].ui;

  return (
    <MotionConfig reducedMotion="user">
      <KineticGrid
        globalColor="default"
        colorTheme={colorTheme}
        className="flex flex-col h-[100dvh]"
      >
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden">
          <HeaderBar
            activeView={activeView}
            onChangeView={setActiveView}
            colorTheme={colorTheme}
            onSelectColorTheme={setColorTheme}
            providers={providers}
            selectedProvider={selectedProvider}
            onSelectProvider={setSelectedProvider}
            wakeWordEnabled={wakeWordMode}
            wakeWordSupported={speechRecognitionSupported}
            onToggleWakeWord={handleToggleWakeWord}
            voiceEnabled={voiceEnabled}
            onToggleVoice={handleToggleVoice}
            voiceOptions={voiceOptions}
            selectedVoiceURI={selectedVoiceURI}
            activeVoiceLabel={activeVoiceLabel}
            onSelectVoiceURI={setSelectedVoiceURI}
            onTestVoice={handleTestVoice}
            historyOpen={historyOpen}
            onToggleHistory={() => setHistoryOpen((prev) => !prev)}
            messageCount={messages.length}
            onClearConversation={handleClearConversation}
            agentOnline={publicStatus.agentOnline}
          />

          <AnimatePresence mode="wait" initial={false}>
            {activeView === 'pc-control' ? (
              <motion.div
                key="pc-control-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-1 min-h-0 flex-col"
              >
                <PCControlPage
                  isAdmin={Boolean(adminToken)}
                  onAdminAuthenticated={(token) => {
                    setAdminToken(token);
                  }}
                  onAdminLogout={handleAdminLogout}
                  onNavigateView={setActiveView}
                  settings={pcSettings}
                  commands={pcCommands}
                  locks={pcLocks}
                  agentOnline={publicStatus.agentOnline}
                  lastSyncedAt={lastSyncedAt}
                  onRefreshState={fetchPCState}
                  onUpdateSettings={handleUpdateSettings}
                  onRegenerateToken={handleRegenerateToken}
                  onDecideCommand={handleDecideCommand}
                  onUnlockApp={handleUnlockApp}
                  onQuickAction={handleQuickAction}
                />
              </motion.div>
            ) : activeView === 'history' ? (
              <motion.div
                key="history-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-1 min-h-0 flex-col"
              >
                <HistoryPage />
              </motion.div>
            ) : activeView === 'guide' ? (
              <motion.div
                key="guide-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-1 min-h-0 flex-col"
              >
                <PCGuidePage publicStatus={publicStatus} onNavigateView={setActiveView} />
              </motion.div>
            ) : (
              <motion.main
                key="assistant-view"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 flex flex-1 min-h-0 flex-col items-center justify-between overflow-y-auto px-4 sm:px-6 pt-3 pb-2"
              >
                {/* First-Time Guide Banner */}
                {!guideBannerDismissed && !publicStatus.agentOnline && (
                  <div className="w-full max-w-2xl mb-2 flex items-center justify-between gap-3 rounded-xl border border-white/[0.09] bg-[#070B14]/92 px-3.5 py-2 text-xs text-slate-300 shadow-md shadow-black/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className={`h-3.5 w-3.5 shrink-0 ${ui.accentIcon}`} />
                      <span className="truncate">
                        New to PC Controls? Follow the step-by-step setup guide to connect your PC.
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveView('guide')}
                        className={`font-semibold ${ui.accentText} hover:underline cursor-pointer whitespace-nowrap`}
                      >
                        Open Guide
                      </button>
                      <button
                        type="button"
                        onClick={handleDismissGuideBanner}
                        aria-label="Dismiss guide banner"
                        className="p-0.5 text-slate-500 hover:text-white cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Active App Locks Live Countdown Strip */}
                {publicStatus.activeLocks.length > 0 && (
                  <div className="w-full max-w-2xl mb-2 rounded-xl border border-amber-500/30 bg-[#120D05]/92 px-3.5 py-2 text-xs text-amber-100 space-y-1.5 shadow-md shadow-black/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {publicStatus.activeLocks.map((lock) => {
                          const remSec = Math.max(
                            0,
                            Math.ceil((Date.parse(lock.ends_at) - lockClock) / 1000)
                          );
                          const mins = Math.floor(remSec / 60);
                          const secs = remSec % 60;
                          return (
                            <span
                              key={lock.id}
                              className="inline-flex items-center gap-1.5 font-mono tabular-nums"
                            >
                              <Lock className="h-3 w-3 text-amber-300" />
                              <span className="font-sans font-medium text-white">{lock.app}</span>
                              <span className="text-amber-300">
                                {mins}m {secs.toString().padStart(2, '0')}s
                              </span>
                            </span>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveView('pc-control')}
                        className="text-[11px] font-medium text-amber-200 hover:text-white underline underline-offset-2 cursor-pointer"
                      >
                        Manage locks
                      </button>
                    </div>
                    {!publicStatus.agentOnline && (
                      <div className="flex items-center gap-1.5 text-[11px] text-amber-300/90">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          PC Agent is offline — locks cannot close running apps until the agent is running.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <ActiveTasksTray
                  tasks={activeTasks}
                  colorTheme={colorTheme}
                  nowMs={taskClock}
                  onDismissTask={handleDismissTask}
                />

                <div className="flex flex-1 flex-col items-center justify-center w-full max-w-3xl mx-auto py-2">
                  {/* Refined Status Line */}
                  <div className="mb-1.5 text-xs font-medium tracking-wide">
                    <span
                      className={`transition-colors duration-200 ${
                        assistantState === 'listening'
                          ? ui.stateListening
                          : assistantState === 'speaking'
                          ? ui.stateSpeaking
                          : assistantState === 'thinking'
                          ? ui.stateThinking
                          : 'text-slate-400'
                      }`}
                    >
                      {stateTitle}
                    </span>
                  </div>

                  {/* Three.js WebGL Plasma Sphere + Signature Voice Stage */}
                  <JarvisOrb
                    state={assistantState}
                    colorTheme={colorTheme}
                    audioLevelRef={audioLevelRef}
                    speechPulseRef={speechPulseRef}
                    onOrbClick={handleOrbClick}
                  />

                  {/* Live Transcription & Response Stage */}
                  <div className="mt-4 w-full max-w-2xl px-1">
                    <AnimatePresence>
                      {errorMessage && (
                        <motion.div
                          key="error-banner"
                          role="alert"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18 }}
                          className="mb-3 rounded-xl border border-rose-500/30 bg-[#140A0E]/95 px-4 py-3 text-sm text-rose-200 flex items-start justify-between gap-3 shadow-lg shadow-black/40"
                        >
                          <p className="leading-relaxed">{errorMessage}</p>
                          <button
                            type="button"
                            onClick={() => setErrorMessage(null)}
                            className="text-xs font-medium text-rose-300 hover:text-white shrink-0 transition-colors cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={stageKey}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      >
                        {assistantState === 'listening' ? (
                          <div className="min-h-[68px] flex items-center justify-center px-4 py-3 text-center">
                            {hasTranscriptText ? (
                              <p className="text-base sm:text-lg leading-relaxed text-white max-w-xl">
                                <span>{liveFinalText}</span>
                                {liveFinalText && liveInterimText ? ' ' : ''}
                                <span className={`${ui.accentText} opacity-85`}>
                                  {liveInterimText}
                                </span>
                              </p>
                            ) : (
                              <p className="text-sm sm:text-base text-slate-400">
                                {wakeWordMode && !continuousMode && !pushToTalkActive
                                  ? 'Say “Hey Jarvis” whenever you are ready.'
                                  : 'Go ahead—I am listening.'}
                              </p>
                            )}
                          </div>
                        ) : assistantState === 'thinking' ? (
                          <div className="min-h-[68px] flex flex-col items-center justify-center px-4 py-3 text-center">
                            {latestUserMsg && (
                              <p className="text-sm text-slate-400 line-clamp-2 max-w-lg mb-1.5">
                                “{latestUserMsg.content}”
                              </p>
                            )}
                            <p className={`text-sm font-medium ${ui.accentTextSoft}`}>
                              {thinkingLine}
                            </p>
                          </div>
                        ) : latestAssistantMsg ? (
                          <div className="rounded-2xl border border-white/[0.08] bg-[#070B14]/94 px-5 py-4 shadow-xl shadow-black/50">
                            <div className="mb-2.5 flex items-center justify-between gap-3 text-xs text-slate-400">
                              <div className="flex items-center gap-1.5 min-w-0 truncate">
                                <span className={`font-semibold ${ui.accentText}`}>JARVIS</span>
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
                                className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/[0.05] ${ui.copyHover} transition-colors shrink-0 cursor-pointer`}
                              >
                                {copiedReply ? (
                                  <>
                                    <Check className={`h-3.5 w-3.5 ${ui.accentIcon}`} />
                                    <span className={ui.accentText}>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="jarvis-scroll max-h-48 sm:max-h-60 overflow-y-auto pr-1 text-sm sm:text-[15px] leading-relaxed text-slate-100">
                              <RevealText
                                text={latestAssistantMsg.content}
                                active={assistantState === 'speaking'}
                                colorTheme={colorTheme}
                              />
                            </div>

                            {latestPcCmds.map((cmd) => (
                              <PCApprovalCard
                                key={cmd.id}
                                command={cmd}
                                isAdmin={Boolean(adminToken)}
                                onDecide={handleDecideCommand}
                              />
                            ))}

                            {(latestResearchJob ||
                              (latestAssistantMsg.sources &&
                                latestAssistantMsg.sources.length > 0)) && (
                              <ResearchBriefCard
                                job={latestResearchJob}
                                sources={latestAssistantMsg.sources}
                                colorTheme={colorTheme}
                              />
                            )}

                            {latestAssistantMsg.pendingAction && (
                              <ChatPasscodeActionCard
                                messageId={latestAssistantMsg.id}
                                pendingAction={latestAssistantMsg.pendingAction}
                                onConfirmAction={handleConfirmChatAction}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-center">
                            <div
                              className={`font-algerian text-2xl sm:text-3xl font-bold ${ui.accentText} mb-2 transition-colors`}
                            >
                              JARVIS
                            </div>
                            <h1
                              className="text-lg sm:text-xl font-medium text-white tracking-tight"
                              style={{ textWrap: 'balance' }}
                            >
                              {greeting.headline}
                            </h1>
                            <p className="mt-1.5 text-xs sm:text-sm text-slate-400 max-w-md leading-relaxed">
                              {greeting.subline}
                            </p>

                            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                              {QUICK_PROMPTS.map((item) => (
                                <button
                                  key={item.label}
                                  type="button"
                                  onClick={() => handleSendText(item.prompt, 'typed')}
                                  className={`rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-slate-300 hover:-translate-y-0.5 ${ui.promptHover} hover:bg-white/[0.07] hover:text-white active:translate-y-0 transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer`}
                                >
                                  {item.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>

                <VoiceControls
                  state={assistantState}
                  colorTheme={colorTheme}
                  continuousMode={continuousMode}
                  pushToTalkActive={pushToTalkActive}
                  speechRecognitionSupported={speechRecognitionSupported}
                  onToggleTalk={handleToggleTalk}
                  onStopSpeaking={handleStopSpeaking}
                  onPushToTalkStart={handlePushToTalkStart}
                  onPushToTalkEnd={handlePushToTalkEnd}
                  onSendText={handleSendText}
                />
              </motion.main>
            )}
          </AnimatePresence>

          <TranscriptDrawer
            open={historyOpen}
            colorTheme={colorTheme}
            messages={messages}
            commandsById={commandsById}
            researchJobsById={researchJobs}
            isAdmin={Boolean(adminToken)}
            onDecideCommand={handleDecideCommand}
            onConfirmChatAction={handleConfirmChatAction}
            onClose={() => setHistoryOpen(false)}
            onClear={handleClearConversation}
            onReplayMessage={handleReplayMessage}
          />
        </div>
      </KineticGrid>
    </MotionConfig>
  );
}
