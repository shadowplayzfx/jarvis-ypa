import { useEffect, useState } from 'react';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type { JarvisColorTheme } from '../types/jarvis';

interface RevealTextProps {
  text: string;
  active: boolean;
  colorTheme?: JarvisColorTheme;
}

export function RevealText({ text, active, colorTheme = 'blue' }: RevealTextProps) {
  const [visibleCount, setVisibleCount] = useState(0);
  const words = text.split(/(\s+)/);

  useEffect(() => {
    if (!active) {
      setVisibleCount(words.length);
      return;
    }

    setVisibleCount(0);
    let idx = 0;
    const stepMs = Math.max(24, Math.min(55, Math.round(2800 / Math.max(1, words.length))));
    const timer = window.setInterval(() => {
      idx += 2;
      if (idx >= words.length) {
        setVisibleCount(words.length);
        window.clearInterval(timer);
      } else {
        setVisibleCount(idx);
      }
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [text, active, words.length]);

  const shown = active ? words.slice(0, visibleCount).join('') : text;
  const stillTyping = active && visibleCount < words.length;
  const caretBg = JARVIS_THEMES[colorTheme].ui.caretBg;

  return (
    <span className="whitespace-pre-wrap">
      {shown}
      {stillTyping && (
        <span
          aria-hidden="true"
          className={`ml-0.5 inline-block h-4 w-0.5 align-middle ${caretBg} animate-jarvis-caret`}
        />
      )}
    </span>
  );
}
