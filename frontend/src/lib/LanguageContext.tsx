import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

export type AppLanguage = 'th' | 'en';

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'th',
  setLanguage: () => {},
});

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<AppLanguage>(() => {
    const saved = window.localStorage.getItem('scamtrap:appLanguage');
    return saved === 'en' ? 'en' : 'th';
  });

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    window.localStorage.setItem('scamtrap:appLanguage', lang);
    // Also sync spoken language for live calls if desired
    window.localStorage.setItem('scamtrap:spokenLanguage', lang === 'en' ? 'en-US' : 'th-TH');
    window.dispatchEvent(new CustomEvent('scamtrap:language-change', { detail: { lang } }));
  };

  useEffect(() => {
    const handleSync = (e: Event) => {
      const custom = e as CustomEvent<{ lang: AppLanguage }>;
      if (custom.detail?.lang && custom.detail.lang !== language) {
        setLanguageState(custom.detail.lang);
      }
    };
    window.addEventListener('scamtrap:language-change', handleSync);
    return () => window.removeEventListener('scamtrap:language-change', handleSync);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useAppLanguage = () => useContext(LanguageContext);
