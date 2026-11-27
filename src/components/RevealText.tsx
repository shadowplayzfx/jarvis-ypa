import { useEffect, useState } from 'react';

interface RevealTextProps {
  text: string;
  active: boolean;
}

export function RevealText({ text, active }: RevealTextProps) {
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

  return (
    <span className="whitespace-pre-wrap">
      {shown}
      {stillTyping && (
        <span
          aria-hidden="true"
          className="ml-0.5 inline-block h-4 w-0.5 align-middle bg-cyan-300 animate-jarvis-caret"
        />
      )}
    </span>
  );
}
