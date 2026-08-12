import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en } from '../locales/en';
import { fr } from '../locales/fr';
import { tr } from '../locales/tr';

// Interface language. Recipe CONTENT is a separate problem: the vault is
// mostly French and Turkish already, and only some recipes carry an English
// translation (see instructions_en / ingredients_en). This module translates
// the chrome only -- the words the app itself puts on screen.

export type Lang = 'en' | 'fr' | 'tr';

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'tr', label: 'Türkçe' },
];

// English is the source of truth: every key exists here, so it also doubles
// as the fallback for anything not yet translated.
export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Lang, Partial<Record<TranslationKey, string>>> = { en, fr, tr };

const STORAGE_KEY = 'vault.lang';

const isLang = (value: unknown): value is Lang =>
  value === 'en' || value === 'fr' || value === 'tr';

/**
 * An explicit choice wins; otherwise take the device's own language.
 *
 * Deliberately not asked at sign-up: that would add a question to the one
 * screen people want to get past, do nothing for guests (who have no
 * account), and do nothing for anyone who signed up before this existed.
 * navigator.languages is ordered by preference, so the first supported hit
 * is the best match rather than merely the first one listed.
 */
export function detectLanguage(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // Private mode -- fall through to the device language.
  }
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    // "fr-CA" and "fr" both mean French here; region only matters for
    // formatting, which Intl handles on its own.
    const base = tag?.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

type Vars = Record<string, string | number>;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => en[key] ?? key,
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLanguage);

  // Screen readers switch voice from this, and it drives :lang() styling and
  // the browser's own offer to translate the page.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is survivable; the choice still applies this session.
    }
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Vars) => {
      // Fall back to English rather than showing a raw key, so a missing
      // translation reads as untranslated instead of broken.
      let text: string = DICTIONARIES[lang][key] ?? en[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.split(`{${name}}`).join(String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Shorthand for the common case of only needing the translate function. */
export const useT = () => useContext(I18nContext).t;
