import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type AppLanguage = 'cs' | 'en';

export const LANGUAGE_STORAGE_KEY = 'betedge_language_v1';

export function getStoredLanguage(): AppLanguage {
  if (typeof window === 'undefined') return 'cs';
  try {
    const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (raw === 'en' || raw === '"en"') return 'en';
    return 'cs';
  } catch {
    return 'cs';
  }
}

interface LanguageContextValue {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'cs',
  setLanguage: () => {},
  toggleLanguage: () => {},
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => getStoredLanguage());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'en' ? 'en' : 'cs';
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      } catch {
        // Ignore storage quota errors
      }
    }
  }, [language]);

  const setLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'cs' ? 'en' : 'cs'));
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
