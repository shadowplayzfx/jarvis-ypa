export interface SpeechRecognitionAlternativeLike {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

const FEMALE_VOICE_PATTERN =
  /\b(female|woman|girl|zira|hazel|susan|libby|sonia|maisie|abbi|bella|hollie|kate|serena|martha|stephanie|samantha|victoria|karen|moira|tessa|fiona|veena|aria|jenny|ana|michelle|emma|ava|clara|emily|natasha|amy|joanna|kendra|kimberly|salli|ivy|ruth|danielle|helen|linda|catherine|heera|kalpana|sangeeta|lekha|tina|zoe|allison|nicky|kathy|princess|vicki|agnes|shelley|sandy|flo|grandma|elsa|monica|paulina|angelica)\b/i;

const UK_MALE_VOICE_PATTERN =
  /\b(ryan|thomas|george|oliver|alfie|elliot|noah|daniel|arthur|jamie|malcolm|gordon|charlie|harry|jack|edward|charles|henry|hugh|alistair|benedict)\b/i;

const OTHER_MALE_VOICE_PATTERN =
  /\b(male|man|guy|andrew|brian|christopher|eric|steffan|davis|david|mark|alex|aaron|nathan|evan|matthew|joey|justin|stephen|gregory|kevin|tony|jason|brandon|jacob|roger|william|connor|liam|sean|lee|james|russell|fred|junior|ralph|albert|bruce|tom)\b/i;

export function isLikelyFemaleVoice(voice: SpeechSynthesisVoice): boolean {
  const name = voice.name.trim();
  if (FEMALE_VOICE_PATTERN.test(name)) return true;
  // Chrome's default "Google US English" (without Male/Female suffix) is a female voice
  if (/^google us english$/i.test(name)) return true;
  return false;
}

export function isBritishVoice(voice: SpeechSynthesisVoice): boolean {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  return (
    lang.startsWith('en-gb') ||
    name.includes('uk english') ||
    name.includes('united kingdom') ||
    name.includes('british') ||
    /\bdaniel\b/i.test(name)
  );
}

export function scoreJarvisVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name;
  const lang = voice.lang.toLowerCase();
  const isEnglish = lang.startsWith('en');
  if (!isEnglish) return -5000;

  if (isLikelyFemaleVoice(voice)) return -2000;

  let score = 0;
  const isUK = isBritishVoice(voice);
  const isNatural = /\b(natural|neural|online|enhanced|premium)\b/i.test(name);

  if (/google uk english male/i.test(name)) {
    score += 1200;
  } else if (isUK && (UK_MALE_VOICE_PATTERN.test(name) || /\bmale\b/i.test(name))) {
    score += 1050;
  } else if (/\bdaniel\b/i.test(name)) {
    score += 980;
  } else if (UK_MALE_VOICE_PATTERN.test(name)) {
    score += 880;
  } else if (OTHER_MALE_VOICE_PATTERN.test(name)) {
    score += 650;
  } else if (isUK) {
    // Unknown-gender en-GB voice (still non-female)
    score += 320;
  } else {
    // Unknown-gender en voice
    score += 120;
  }

  if (isNatural) score += 120;
  if (isUK) score += 90;

  return score;
}

export function selectJarvisVoice(
  voices: SpeechSynthesisVoice[],
  preferredVoiceURI?: string | null
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  if (preferredVoiceURI) {
    const manual = voices.find((v) => v.voiceURI === preferredVoiceURI);
    if (manual) return manual;
  }

  const englishVoices = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Strongly prefer non-female voices; only fall back if literally every voice on the OS is female
  const nonFemalePool = pool.filter((v) => !isLikelyFemaleVoice(v));
  const candidates = nonFemalePool.length > 0 ? nonFemalePool : pool;

  const sorted = [...candidates].sort((a, b) => scoreJarvisVoice(b) - scoreJarvisVoice(a));
  return sorted[0] || null;
}

export function selectNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  return selectJarvisVoice(voices);
}

export function listJarvisVoiceOptions(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const pool = english.length > 0 ? english : voices;
  const nonFemale = pool.filter((v) => !isLikelyFemaleVoice(v));
  const list = nonFemale.length > 0 ? nonFemale : pool;
  return [...list].sort((a, b) => scoreJarvisVoice(b) - scoreJarvisVoice(a));
}

export function getJarvisSpeechConfig(voice: SpeechSynthesisVoice | null): {
  pitch: number;
  rate: number;
  lang: string;
  profileLabel: string;
} {
  if (!voice) {
    return {
      pitch: 0.85,
      rate: 0.96,
      lang: 'en-GB',
      profileLabel: 'British Gentleman (Default)',
    };
  }

  const uk = isBritishVoice(voice);
  const explicitMale =
    /google uk english male/i.test(voice.name) ||
    UK_MALE_VOICE_PATTERN.test(voice.name) ||
    OTHER_MALE_VOICE_PATTERN.test(voice.name);

  if (uk && explicitMale) {
    return {
      pitch: 0.93,
      rate: 0.97,
      lang: voice.lang || 'en-GB',
      profileLabel: voice.name,
    };
  }

  if (explicitMale) {
    return {
      pitch: 0.9,
      rate: 0.97,
      lang: voice.lang || 'en-US',
      profileLabel: voice.name,
    };
  }

  if (isLikelyFemaleVoice(voice)) {
    // Last-resort shift only if the host OS provides zero male voices
    return {
      pitch: 0.78,
      rate: 0.96,
      lang: voice.lang || 'en-GB',
      profileLabel: voice.name,
    };
  }

  return {
    pitch: 0.86,
    rate: 0.96,
    lang: voice.lang || 'en-GB',
    profileLabel: voice.name,
  };
}

export function prepareTextForSpeech(markdown: string): string {
  let text = markdown;

  // Replace fenced code blocks with a natural spoken cue
  text = text.replace(
    /```[\s\S]*?```/g,
    ' I have included the code snippet in the transcript for you. '
  );

  // Remove inline code backticks while preserving content
  text = text.replace(/`([^`]+)`/g, '$1');

  // Remove markdown links [label](url) -> label
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Remove headings, bold/italic markers, and blockquotes
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  text = text.replace(/^>\s?/gm, '');

  // Convert bullet list markers into smooth spoken pauses
  text = text.replace(/^\s*[-*•]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');

  // Collapse excess whitespace/newlines into clean pauses
  text = text.replace(/\n{2,}/g, '. ');
  text = text.replace(/\n/g, ', ');
  text = text.replace(/\s{2,}/g, ' ').trim();

  return text;
}

export function splitIntoSpeechChunks(text: string, maxLength = 190): string[] {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const chunks: string[] = [];
  let current = '';

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if ((current + ' ' + sentence).trim().length <= maxLength) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxLength) {
        current = sentence;
      } else {
        const words = sentence.split(/\s+/);
        let sub = '';
        for (const word of words) {
          if ((sub + ' ' + word).trim().length <= maxLength) {
            sub = (sub + ' ' + word).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = word;
          }
        }
        current = sub;
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
