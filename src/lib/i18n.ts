"use client";

import { useCallback, useSyncExternalStore } from "react";
import { translateUiTextToEn, useAutoDomTranslate } from "./i18nDomTranslator";

export type AppLang = "th" | "en";

const LANG_STORAGE_KEY = "lan_chat_lang";
const LANG_EVENT = "lan-chat-lang-change";

export function getStoredLang(): AppLang {
  if (typeof window === "undefined") return "th";
  const val = localStorage.getItem(LANG_STORAGE_KEY);
  return val === "en" ? "en" : "th";
}

export function setStoredLang(next: AppLang) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LANG_STORAGE_KEY, next);
  window.dispatchEvent(new Event(LANG_EVENT));
}

function subscribeLang(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  window.addEventListener(LANG_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(LANG_EVENT, cb);
  };
}

export function useLanguage() {
  const lang = useSyncExternalStore<AppLang>(subscribeLang, getStoredLang, () => "th");
  useAutoDomTranslate(lang);

  const toggleLang = useCallback(() => {
    setStoredLang(lang === "th" ? "en" : "th");
  }, [lang]);

  const tx = useCallback(
    (thText: string, enText?: string): string => {
      if (lang !== "en") return thText;
      return enText ?? translateUiTextToEn(thText);
    },
    [lang]
  );

  return {
    lang,
    isEn: lang === "en",
    setLang: setStoredLang,
    toggleLang,
    tx,
  };
}
