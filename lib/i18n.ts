// i18n configuration for internationalization
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from '../locales/en.json';
import ruTranslations from '../locales/ru.json';

// Map locale values to i18n language codes
export function localeToLanguage(locale: string): string {
  if (locale.startsWith('ru')) return 'ru';
  return 'en';
}

// Initialize i18n
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      ru: {
        translation: ruTranslations,
      },
    },
    fallbackLng: 'en',
    defaultNS: 'translation',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      // Don't use browser detection, we'll control it via company settings
      order: [],
      caches: [],
    },
  });

export default i18n;

