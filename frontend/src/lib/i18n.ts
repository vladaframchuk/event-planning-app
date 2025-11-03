import ru from '../../i18n/ru.json';

type Resources = {
  readonly ru: typeof ru;
};

const resources: Resources = {
  ru,
} as const;

type Locale = keyof Resources;
type TranslationKey = keyof typeof ru;

const fallbackLocale: Locale = 'ru';

const normalizeLocale = (value: string | undefined): Locale | null => {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  const locales = Object.keys(resources) as Locale[];
  return locales.find((locale) => normalized.startsWith(locale)) ?? null;
};

const detectLocale = (): Locale => {
  if (typeof navigator !== 'undefined') {
    const candidate = normalizeLocale(navigator.language);
    if (candidate) {
      return candidate;
    }
  }
  return fallbackLocale;
};

let activeLocale: Locale = detectLocale();

const interpolationPattern = /{{\s*([\w.-]+)\s*}}/g;

const formatTemplate = (template: string, replacements?: Record<string, string | number>): string => {
  if (!replacements) {
    return template;
  }

  return template.replace(interpolationPattern, (match, key) => {
    const value = replacements[key];
    if (value === undefined || value === null) {
      return match;
    }
    return String(value);
  });
};

export const setLocale = (value: string | undefined): void => {
  const locale = normalizeLocale(value);
  activeLocale = locale ?? fallbackLocale;
};

export const getLocale = (): Locale => activeLocale;

export const t = (key: TranslationKey, replacements?: Record<string, string | number>): string => {
  const messages = resources[activeLocale] ?? resources[fallbackLocale];
  const fallbackMessages = resources[fallbackLocale];

  const template = messages[key] ?? fallbackMessages[key] ?? key;
  return formatTemplate(template, replacements);
};

export type { Locale, TranslationKey };
