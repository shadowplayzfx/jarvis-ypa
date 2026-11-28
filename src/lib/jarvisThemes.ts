import * as THREE from 'three';
import type { JarvisColorTheme } from '../types/jarvis';

export interface JarvisThemeSpec {
  id: JarvisColorTheme;
  name: string;
  fullLabel: string;
  swatchHex: string;
  accentRgb: string;
  orb: {
    light: THREE.Color;
    shellBack: THREE.Color;
    shellFront: THREE.Color;
    plasmaDeep: THREE.Color;
    plasmaMid: THREE.Color;
    plasmaBright: THREE.Color;
  };
  grid: {
    bg: string;
    bgClass: string;
    lineActive: { r: number; g: number; b: number; a: number };
    nodeActive: { r: number; g: number; b: number; a: number };
    glow: string;
    ripple: string;
  };
  ui: {
    logoText: string;
    accentText: string;
    accentTextSoft: string;
    accentIcon: string;
    primaryButton: string;
    activePillButton: string;
    activeOption: string;
    wakeWordActive: string;
    orbAmbientListening: string;
    orbAmbientSpeaking: string;
    orbAmbientThinking: string;
    orbAmbientIdle: string;
    orbRingRipple: string;
    orbRingSpin: string;
    orbRingDrift: string;
    orbRingSpeaking: string;
    focusRing: string;
    inputFocusWithin: string;
    sendButton: string;
    promptHover: string;
    userBubble: string;
    copyHover: string;
    caretBg: string;
    timerText: string;
    stateListening: string;
    stateSpeaking: string;
    stateThinking: string;
  };
}

export const JARVIS_THEME_ORDER: JarvisColorTheme[] = [
  'blue',
  'purple',
  'green',
  'yellow',
];

export const JARVIS_THEMES: Record<JarvisColorTheme, JarvisThemeSpec> = {
  blue: {
    id: 'blue',
    name: 'Blue',
    fullLabel: 'Blue JARVIS',
    swatchHex: '#22d3ee',
    accentRgb: '0, 188, 212',
    orb: {
      light: new THREE.Color(0x0088ff),
      shellBack: new THREE.Color(0x000055),
      shellFront: new THREE.Color(0x0066ff),
      plasmaDeep: new THREE.Color(0x001433),
      plasmaMid: new THREE.Color(0x0084ff),
      plasmaBright: new THREE.Color(0x00ffe1),
    },
    grid: {
      bg: '#020409',
      bgClass: 'bg-[#020409]',
      lineActive: { r: 0, g: 188, b: 212, a: 0.65 },
      nodeActive: { r: 74, g: 158, b: 255, a: 0.95 },
      glow: '0,188,212',
      ripple: '74,158,255',
    },
    ui: {
      logoText: 'text-cyan-300 hover:text-cyan-200',
      accentText: 'text-cyan-300',
      accentTextSoft: 'text-cyan-200',
      accentIcon: 'text-cyan-400',
      primaryButton:
        'bg-cyan-400 text-slate-950 border-t border-white/40 hover:bg-cyan-300',
      activePillButton:
        'border border-cyan-400/55 bg-cyan-500/18 text-cyan-100 hover:bg-cyan-500/26',
      activeOption: 'bg-cyan-500/12 text-white',
      wakeWordActive: 'bg-cyan-500/15 text-cyan-200',
      orbAmbientListening: 'bg-cyan-500/14',
      orbAmbientSpeaking: 'bg-sky-400/14',
      orbAmbientThinking: 'bg-blue-500/12',
      orbAmbientIdle: 'bg-cyan-500/6',
      orbRingRipple: 'border-cyan-400/30',
      orbRingSpin: 'border-t-cyan-300/75 border-r-cyan-400/35',
      orbRingDrift: 'border-sky-400/35',
      orbRingSpeaking: 'border-cyan-300/30',
      focusRing: 'focus-visible:ring-cyan-400',
      inputFocusWithin: 'focus-within:border-cyan-400/45',
      sendButton: 'text-cyan-200 hover:bg-cyan-400 hover:text-slate-950',
      promptHover: 'hover:border-cyan-400/35',
      userBubble: 'bg-cyan-500/12 border border-cyan-400/20 text-slate-100',
      copyHover: 'hover:text-cyan-300',
      caretBg: 'bg-cyan-300',
      timerText: 'text-cyan-300/90',
      stateListening: 'text-cyan-300',
      stateSpeaking: 'text-sky-300',
      stateThinking: 'text-blue-300',
    },
  },
  purple: {
    id: 'purple',
    name: 'Purple',
    fullLabel: 'Purple JARVIS',
    swatchHex: '#c084fc',
    accentRgb: '168, 85, 247',
    orb: {
      light: new THREE.Color(0x9333ea),
      shellBack: new THREE.Color(0x240548),
      shellFront: new THREE.Color(0xa855f7),
      plasmaDeep: new THREE.Color(0x16052e),
      plasmaMid: new THREE.Color(0x9333ea),
      plasmaBright: new THREE.Color(0xe879f9),
    },
    grid: {
      bg: '#05020a',
      bgClass: 'bg-[#05020a]',
      lineActive: { r: 168, g: 85, b: 247, a: 0.65 },
      nodeActive: { r: 216, g: 130, b: 255, a: 0.95 },
      glow: '168,85,247',
      ripple: '216,130,255',
    },
    ui: {
      logoText: 'text-purple-300 hover:text-purple-200',
      accentText: 'text-purple-300',
      accentTextSoft: 'text-purple-200',
      accentIcon: 'text-purple-400',
      primaryButton:
        'bg-purple-400 text-slate-950 border-t border-white/40 hover:bg-purple-300',
      activePillButton:
        'border border-purple-400/55 bg-purple-500/18 text-purple-100 hover:bg-purple-500/26',
      activeOption: 'bg-purple-500/14 text-white',
      wakeWordActive: 'bg-purple-500/16 text-purple-200',
      orbAmbientListening: 'bg-purple-500/14',
      orbAmbientSpeaking: 'bg-fuchsia-400/14',
      orbAmbientThinking: 'bg-violet-500/12',
      orbAmbientIdle: 'bg-purple-500/6',
      orbRingRipple: 'border-purple-400/30',
      orbRingSpin: 'border-t-purple-300/75 border-r-fuchsia-400/35',
      orbRingDrift: 'border-violet-400/35',
      orbRingSpeaking: 'border-purple-300/30',
      focusRing: 'focus-visible:ring-purple-400',
      inputFocusWithin: 'focus-within:border-purple-400/45',
      sendButton: 'text-purple-200 hover:bg-purple-400 hover:text-slate-950',
      promptHover: 'hover:border-purple-400/35',
      userBubble: 'bg-purple-500/12 border border-purple-400/22 text-slate-100',
      copyHover: 'hover:text-purple-300',
      caretBg: 'bg-purple-300',
      timerText: 'text-purple-300/90',
      stateListening: 'text-purple-300',
      stateSpeaking: 'text-fuchsia-300',
      stateThinking: 'text-violet-300',
    },
  },
  green: {
    id: 'green',
    name: 'Green',
    fullLabel: 'Green JARVIS',
    swatchHex: '#34d399',
    accentRgb: '16, 185, 129',
    orb: {
      light: new THREE.Color(0x10b981),
      shellBack: new THREE.Color(0x022c1e),
      shellFront: new THREE.Color(0x10b981),
      plasmaDeep: new THREE.Color(0x022117),
      plasmaMid: new THREE.Color(0x059669),
      plasmaBright: new THREE.Color(0x6ee7b7),
    },
    grid: {
      bg: '#020805',
      bgClass: 'bg-[#020805]',
      lineActive: { r: 16, g: 185, b: 129, a: 0.65 },
      nodeActive: { r: 110, g: 231, b: 183, a: 0.95 },
      glow: '16,185,129',
      ripple: '52,211,153',
    },
    ui: {
      logoText: 'text-emerald-300 hover:text-emerald-200',
      accentText: 'text-emerald-300',
      accentTextSoft: 'text-emerald-200',
      accentIcon: 'text-emerald-400',
      primaryButton:
        'bg-emerald-400 text-slate-950 border-t border-white/40 hover:bg-emerald-300',
      activePillButton:
        'border border-emerald-400/55 bg-emerald-500/18 text-emerald-100 hover:bg-emerald-500/26',
      activeOption: 'bg-emerald-500/14 text-white',
      wakeWordActive: 'bg-emerald-500/16 text-emerald-200',
      orbAmbientListening: 'bg-emerald-500/14',
      orbAmbientSpeaking: 'bg-teal-400/14',
      orbAmbientThinking: 'bg-green-500/12',
      orbAmbientIdle: 'bg-emerald-500/6',
      orbRingRipple: 'border-emerald-400/30',
      orbRingSpin: 'border-t-emerald-300/75 border-r-teal-400/35',
      orbRingDrift: 'border-emerald-400/35',
      orbRingSpeaking: 'border-emerald-300/30',
      focusRing: 'focus-visible:ring-emerald-400',
      inputFocusWithin: 'focus-within:border-emerald-400/45',
      sendButton: 'text-emerald-200 hover:bg-emerald-400 hover:text-slate-950',
      promptHover: 'hover:border-emerald-400/35',
      userBubble: 'bg-emerald-500/12 border border-emerald-400/22 text-slate-100',
      copyHover: 'hover:text-emerald-300',
      caretBg: 'bg-emerald-300',
      timerText: 'text-emerald-300/90',
      stateListening: 'text-emerald-300',
      stateSpeaking: 'text-teal-300',
      stateThinking: 'text-green-300',
    },
  },
  yellow: {
    id: 'yellow',
    name: 'Yellow',
    fullLabel: 'Yellow JARVIS',
    swatchHex: '#facc15',
    accentRgb: '234, 179, 8',
    orb: {
      light: new THREE.Color(0xeab308),
      shellBack: new THREE.Color(0x3a2002),
      shellFront: new THREE.Color(0xfacc15),
      plasmaDeep: new THREE.Color(0x281401),
      plasmaMid: new THREE.Color(0xd97706),
      plasmaBright: new THREE.Color(0xfef08a),
    },
    grid: {
      bg: '#080602',
      bgClass: 'bg-[#080602]',
      lineActive: { r: 234, g: 179, b: 8, a: 0.65 },
      nodeActive: { r: 253, g: 224, b: 71, a: 0.95 },
      glow: '234,179,8',
      ripple: '250,204,21',
    },
    ui: {
      logoText: 'text-amber-300 hover:text-amber-200',
      accentText: 'text-amber-300',
      accentTextSoft: 'text-amber-200',
      accentIcon: 'text-amber-400',
      primaryButton:
        'bg-amber-400 text-slate-950 border-t border-white/40 hover:bg-amber-300',
      activePillButton:
        'border border-amber-400/55 bg-amber-500/18 text-amber-100 hover:bg-amber-500/26',
      activeOption: 'bg-amber-500/14 text-white',
      wakeWordActive: 'bg-amber-500/16 text-amber-200',
      orbAmbientListening: 'bg-amber-500/14',
      orbAmbientSpeaking: 'bg-yellow-400/14',
      orbAmbientThinking: 'bg-amber-500/12',
      orbAmbientIdle: 'bg-amber-500/6',
      orbRingRipple: 'border-amber-400/30',
      orbRingSpin: 'border-t-yellow-300/75 border-r-amber-400/35',
      orbRingDrift: 'border-amber-400/35',
      orbRingSpeaking: 'border-yellow-300/30',
      focusRing: 'focus-visible:ring-amber-400',
      inputFocusWithin: 'focus-within:border-amber-400/45',
      sendButton: 'text-amber-200 hover:bg-amber-400 hover:text-slate-950',
      promptHover: 'hover:border-amber-400/35',
      userBubble: 'bg-amber-500/12 border border-amber-400/22 text-slate-100',
      copyHover: 'hover:text-amber-300',
      caretBg: 'bg-amber-300',
      timerText: 'text-amber-300/90',
      stateListening: 'text-amber-300',
      stateSpeaking: 'text-yellow-300',
      stateThinking: 'text-amber-200',
    },
  },
};

export function isJarvisColorTheme(value: unknown): value is JarvisColorTheme {
  return (
    value === 'blue' ||
    value === 'purple' ||
    value === 'green' ||
    value === 'yellow'
  );
}
