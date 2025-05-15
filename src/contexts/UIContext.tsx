import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import enTranslations from '../locales/en.json'; // Import default English strings

// --- Locale Definitions ---
export const SUPPORTED_LOCALES = ['en', 'ja', 'fr', 'de', 'es', 'pt', 'ru'] as const; 
type Locale = typeof SUPPORTED_LOCALES[number];
type LocaleData = Record<string, any>;

// --- Theme Definitions ---
const SUPPORTED_THEMES = ['light', 'dark'] as const;
type Theme = typeof SUPPORTED_THEMES[number];

// --- Context Type Definition ---
interface UIContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  // For SourceNotesView collapsible items
  sourceNotesExpansion: Record<string, Record<number, boolean>>;
  toggleSourceNoteExpansion: (languageName: string, noteId: number) => void;
  isSourceNoteExpanded: (languageName: string, noteId: number) => boolean;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

interface UIProviderProps {
  children: ReactNode;
}

// --- Helper Functions ---
const translate = (data: LocaleData, key: string, replacements?: Record<string, string | number>): string => {
  const keys = key.split('.');
  let result: any = data;
  for (const k of keys) {
    result = result?.[k];
    if (result === undefined) {
      console.warn(`Translation key "${key}" not found.`);
      return key;
    }
  }
  if (typeof result !== 'string') {
    console.warn(`Translation key "${key}" did not resolve to a string.`);
    return key;
  }
  if (replacements) {
    Object.entries(replacements).forEach(([placeholder, value]) => {
      result = result.replace(`{${placeholder}}`, String(value));
    });
  }
  return result;
};

const applyTheme = (theme: Theme) => {
    const body = document.body;
    body.classList.remove(...SUPPORTED_THEMES); 
    body.classList.add(theme); 
    console.log(`Applied theme class: ${theme}`);
};

// --- Provider Component ---
export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  // Locale State
  const [locale, setLocaleState] = useState<Locale>('en');
  const [translations, setTranslations] = useState<LocaleData>(enTranslations);
  // Theme State
  const [theme, setThemeState] = useState<Theme>('dark'); 
  // SourceNotesView Expansion State
  const [sourceNotesExpansion, setSourceNotesExpansion] = useState<Record<string, Record<number, boolean>>>({});

  // --- Locale Logic ---
  const setLocale = useCallback(async (newLocale: Locale) => {
    if (newLocale === locale && translations !== enTranslations && Object.keys(translations).length > 0) { 
        console.log(`Locale ${newLocale} is already active with translations loaded.`);
        return;
    }
    if (newLocale === 'en' && locale === 'en' && translations === enTranslations) { 
        console.log('Locale "en" is already active.');
        return;
    }

    console.log(`Attempting to set UI locale to: ${newLocale}`);
    try {
      let newTranslations: LocaleData = enTranslations; 
      if (newLocale === 'en') {
        newTranslations = enTranslations;
      } else if (newLocale === 'ja') {
        const module = await import('../locales/ja.json');
        newTranslations = module.default;
      } else if (newLocale === 'fr') {
        const module = await import('../locales/fr.json');
        newTranslations = module.default;
      } else if (newLocale === 'de') {
        const module = await import('../locales/de.json');
        newTranslations = module.default;
      } else if (newLocale === 'es') {
        const module = await import('../locales/es.json');
        newTranslations = module.default;
      } else if (newLocale === 'pt') {
        const module = await import('../locales/pt.json');
        newTranslations = module.default;
      } else if (newLocale === 'ru') {
        const module = await import('../locales/ru.json');
        newTranslations = module.default;
      } else {
        console.warn(`Unsupported locale: ${newLocale}. Defaulting to English.`);
      }

      setTranslations(newTranslations);
      setLocaleState(newLocale); 

      if (window.electronAPI) {
        await window.electronAPI.setSetting('uiLanguage', newLocale);
        console.log(`UI locale set to: ${newLocale} and saved.`);
      } else {
        console.warn('ElectronAPI not available, could not save UI language preference.');
      }
    } catch (error) {
      console.error(`Error setting locale to ${newLocale}:`, error);
      setTranslations(enTranslations);
      setLocaleState('en');
      if (window.electronAPI) {
        await window.electronAPI.setSetting('uiLanguage', 'en');
      }
    }
  }, [locale, translations]);

  // --- Theme Logic ---
  const setTheme = useCallback(async (newTheme: Theme) => {
      if (newTheme === theme) return;
      console.log(`Attempting to set theme to: ${newTheme}`);
      try {
          setThemeState(newTheme);
          applyTheme(newTheme); 
          if (window.electronAPI) {
              await window.electronAPI.setSetting('uiTheme', newTheme);
              console.log(`Theme set to: ${newTheme} and saved.`);
          } else {
              console.warn('ElectronAPI not available, could not save theme preference.');
          }
      } catch (error) {
          console.error(`Error setting theme to ${newTheme}:`, error);
      }
  }, [theme]);

  const toggleTheme = useCallback(() => {
      const newTheme = theme === 'light' ? 'dark' : 'light';
      setTheme(newTheme); 
  }, [theme, setTheme]);

  // --- Translation Function ---
  const t = useCallback((key: string, replacements?: Record<string, string | number>) => {
    return translate(translations, key, replacements);
  }, [translations]);

  // --- Source Notes Expansion Logic ---
  const toggleSourceNoteExpansion = useCallback((languageName: string, noteId: number) => {
    setSourceNotesExpansion(prev => {
      const langExpansion = prev[languageName] || {};
      return {
        ...prev,
        [languageName]: {
          ...langExpansion,
          [noteId]: !langExpansion[noteId] // Toggle state, defaults to true if undefined
        }
      };
    });
  }, []);

  const isSourceNoteExpanded = useCallback((languageName: string, noteId: number): boolean => {
    return sourceNotesExpansion[languageName]?.[noteId] || false; // Default to false (collapsed)
  }, [sourceNotesExpansion]);

  // --- Initial Load Logic ---
  useEffect(() => {
    const loadLocalePreference = async () => {
        if (window.electronAPI) {
            try {
                const savedLocale = await window.electronAPI.getSetting('uiLanguage');
                if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale as Locale)) {
                   await setLocale(savedLocale as Locale);
                } else {
                  if (locale !== 'en' || Object.keys(translations).length === 0) {
                     await setLocale('en');
                  }
                }
             } catch (error) {
                console.error("Failed to load UI language preference:", error);
                if (locale !== 'en' || Object.keys(translations).length === 0) {
                  await setLocale('en'); 
                }
             }
        } else {
            console.warn('ElectronAPI not available on mount for locale loading.');
            if (locale !== 'en' || Object.keys(translations).length === 0) {
              await setLocale('en'); 
            }
        }
    };

     const loadThemePreference = async () => {
        if (window.electronAPI) {
            try {
                const savedTheme = await window.electronAPI.getSetting('uiTheme');
                const validTheme = savedTheme && SUPPORTED_THEMES.includes(savedTheme as Theme) ? savedTheme as Theme : 'dark'; 
                if (validTheme !== theme) {
                    setThemeState(validTheme); 
                    applyTheme(validTheme); 
                    console.log("Loaded and applied theme preference:", validTheme);
                } else {
                     applyTheme(theme); 
                }
            } catch (error) {
                 console.error("Failed to load UI theme preference:", error);
                 applyTheme('dark'); 
            }
        } else {
            console.log("ElectronAPI not available on mount, applying default theme.");
            applyTheme(theme); 
        }
     };

    loadLocalePreference(); 
    loadThemePreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  const value = { 
    locale, 
    setLocale, 
    t, 
    theme, 
    setTheme, 
    toggleTheme,
    sourceNotesExpansion,
    toggleSourceNoteExpansion,
    isSourceNoteExpanded
  };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

export const useUI = (): UIContextType => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};