"use client";

import React from "react";
import { UNIFIED_EMOJI_BY_CHAR } from "@/features/stickers/lib/emojiCatalog";

// Normalize lookup so VS16 (\uFE0F) variations still hit local Twemoji SVGs reliably
const NORMALIZED_EMOJI_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [k, src] of Object.entries(UNIFIED_EMOJI_BY_CHAR)) {
    map[k] = src;
    const stripped = k.replace(/\uFE0F/g, "");
    if (!map[stripped]) map[stripped] = src;
  }
  return map;
})();

export function resolveTwemojiSrc(char: string): string | null {
  if (!char) return null;
  return NORMALIZED_EMOJI_MAP[char] || NORMALIZED_EMOJI_MAP[char.replace(/\uFE0F/g, "")] || null;
}

function splitGraphemes(input: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(input), (s) => s.segment);
  }
  return Array.from(input);
}

/** Counts pure Twemoji/Unicode emoji-only messages (1-3 emojis -> jumbo display) */
function inspectPureEmojiOnly(text: string): { isPure: boolean; count: number } {
  const trimmed = text.trim();
  if (!trimmed) return { isPure: false, count: 0 };
  const graphemes = splitGraphemes(trimmed).filter((g) => g.trim().length > 0);
  if (graphemes.length === 0 || graphemes.length > 3) return { isPure: false, count: 0 };
  for (const g of graphemes) {
    if (!resolveTwemojiSrc(g)) return { isPure: false, count: 0 };
  }
  return { isPure: true, count: graphemes.length };
}

interface UnifiedEmojiTextProps {
  text: string;
  isMe?: boolean;
  onClickMention?: (handle: string) => void;
}

const TOKEN_SPLIT_RE = /(https?:\/\/[^\s]+|@admin|#help|@[a-zA-Z0-9ก-๛_.-]+)/g;

function renderTextWithTwemoji(chunk: string, keyPrefix: string, emojiSizeClass: string): React.ReactNode[] {
  const graphemes = splitGraphemes(chunk);
  const out: React.ReactNode[] = [];
  let textBuf = "";

  const flushBuf = (idx: number) => {
    if (textBuf) {
      out.push(<React.Fragment key={`${keyPrefix}-t-${idx}`}>{textBuf}</React.Fragment>);
      textBuf = "";
    }
  };

  graphemes.forEach((g, idx) => {
    const src = resolveTwemojiSrc(g);
    if (src) {
      flushBuf(idx);
      out.push(
        <img
          key={`${keyPrefix}-e-${idx}`}
          src={src}
          alt={g}
          draggable={false}
          loading="lazy"
          className={`inline-block select-none align-[-0.2em] ${emojiSizeClass}`}
        />
      );
    } else {
      textBuf += g;
    }
  });

  flushBuf(graphemes.length);
  return out;
}

export function UnifiedEmojiText({ text, isMe = false, onClickMention }: UnifiedEmojiTextProps) {
  if (!text) return null;

  const { isPure } = inspectPureEmojiOnly(text);
  const emojiSizeClass = isPure ? "w-9 h-9 mx-0.5 drop-shadow-sm" : "w-[1.22em] h-[1.22em] mx-[1px]";

  const parts = text.split(TOKEN_SPLIT_RE);

  return (
    <span data-no-i18n="true">
      {parts.map((part, idx) => {
        if (!part) return null;

        if (/^https?:\/\/[^\s]+$/i.test(part)) {
          return (
            <a
              key={`tok-${idx}`}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`underline break-all ${isMe ? "text-white hover:text-blue-100" : "text-blue-600 hover:text-blue-800"}`}
            >
              {part}
            </a>
          );
        }

        if (part.toLowerCase() === "@admin" || part.toLowerCase() === "#help") {
          return (
            <span
              key={`tok-${idx}`}
              onClick={() => onClickMention?.(part)}
              className={`inline-flex items-center px-1.5 py-0.2 rounded font-bold text-[12px] mx-0.5 ${
                isMe
                  ? "bg-amber-300 text-slate-900"
                  : "bg-amber-100 text-amber-800 border border-amber-300"
              }`}
            >
              {part}
            </span>
          );
        }

        if (part.startsWith("@") && part.length > 1) {
          return (
            <span
              key={`tok-${idx}`}
              onClick={() => onClickMention?.(part)}
              className={`inline-flex items-center px-1 rounded font-semibold mx-0.5 ${
                isMe
                  ? "bg-white/20 text-white"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {part}
            </span>
          );
        }

        return <React.Fragment key={`tok-${idx}`}>{renderTextWithTwemoji(part, `p-${idx}`, emojiSizeClass)}</React.Fragment>;
      })}
    </span>
  );
}
