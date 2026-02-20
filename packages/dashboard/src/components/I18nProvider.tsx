import { useState, useEffect, useCallback } from 'react';
import { I18nContext, translate, getInitialLang, type Lang } from '@/lib/i18n';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  const setLang = useCallback((newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('forgeai-language', newLang);
    document.documentElement.lang = newLang;
    // Persist to Vault
    fetch('/api/settings/language', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: newLang }),
    }).catch(() => {});
  }, []);

  const t = useCallback((key: string) => translate(lang, key), [lang]);

  // Load from Vault on mount
  useEffect(() => {
    fetch('/api/settings/language')
      .then(r => r.json())
      .then((d: { language?: string }) => {
        if (d.language && d.language !== lang) {
          setLangState(d.language as Lang);
          localStorage.setItem('forgeai-language', d.language);
          document.documentElement.lang = d.language;
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}
