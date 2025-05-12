import React, { createContext, useState, useContext, useEffect, useCallback, ReactNode } from 'react';
import enTranslations from '../locales/en.json'; // Import default English strings

// --- Locale Definitions ---
export const SUPPORTED_LOCALES = ['en', 'ja', 'fr', 'de', 'es', 'pt', 'ru'] as const; // Export for use in Settings
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
}

const UIContext = createContext<UIContextType | undefined>(undefined);

interface UIProviderProps {
  children: ReactNode;
}

// --- Helper Functions ---
const translate = (data: LocaleData, key: string, replacements?: Record<string, string | number>): string => {
  // (Translation logic as before)
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

// Function to apply theme class to body
const applyTheme = (theme: Theme) => {
    const body = document.body;
    body.classList.remove(...SUPPORTED_THEMES); // Remove any existing theme classes
    body.classList.add(theme); // Add the new theme class
    console.log(`Applied theme class: ${theme}`);
};

// --- Provider Component ---
export const UIProvider: React.FC<UIProviderProps> = ({ children }) => {
  // Locale State
  const [locale, setLocaleState] = useState<Locale>('en');
  const [translations, setTranslations] = useState<LocaleData>(enTranslations);
  // Theme State
  const [theme, setThemeState] = useState<Theme>('light'); // Default to light


  // --- Locale Logic ---
  const setLocale = useCallback(async (newLocale: Locale) => {
    if (newLocale === locale && translations !== enTranslations && Object.keys(translations).length > 0) { // Check if translations are already loaded for current non-english locale
        console.log(`Locale ${newLocale} is already active with translations loaded.`);
        return;
    }
    if (newLocale === 'en' && locale === 'en' && translations === enTranslations) { // Avoid reloading 'en' if already set
        console.log('Locale "en" is already active.');
        return;
    }

    console.log(`Attempting to set UI locale to: ${newLocale}`);
    try {
      let newTranslations: LocaleData = enTranslations; // Default to English
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
        // newLocale remains 'en' implicitly as per initial state or fallback.
      }

      setTranslations(newTranslations);
      setLocaleState(newLocale); // Set the actual new locale

      if (window.electronAPI) {
        await window.electronAPI.setSetting('uiLanguage', newLocale);
        console.log(`UI locale set to: ${newLocale} and saved.`);
      } else {
        console.warn('ElectronAPI not available, could not save UI language preference.');
      }
    } catch (error) {
      console.error(`Error setting locale to ${newLocale}:`, error);
      // Fallback to English if loading fails for some reason
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
          applyTheme(newTheme); // Apply class to body
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
      setTheme(newTheme); // Calls setTheme which handles saving and applying
  }, [theme, setTheme]);


  // --- Translation Function ---
  const t = useCallback((key: string, replacements?: Record<string, string | number>) => {
    return translate(translations, key, replacements);
  }, [translations]);


  // --- Initial Load Logic ---
  useEffect(() => {
    // Load Locale Preference
    const loadLocalePreference = async () => {
        if (window.electronAPI) {
            try {
                const savedLocale = await window.electronAPI.getSetting('uiLanguage');
                if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale as Locale)) {
                   // setLocale will handle not reloading if it's the same and already loaded
                   await setLocale(savedLocale as Locale);
                } else {
                  // If no saved locale, or invalid, ensure 'en' is loaded if not already
                  if (locale !== 'en' || Object.keys(translations).length === 0) {
                     await setLocale('en');
                  }
                }
             } catch (error) {
                console.error("Failed to load UI language preference:", error);
                if (locale !== 'en' || Object.keys(translations).length === 0) {
                  await setLocale('en'); // Fallback on error
                }
             }
        } else {
            console.warn('ElectronAPI not available on mount for locale loading.');
            if (locale !== 'en' || Object.keys(translations).length === 0) {
              await setLocale('en'); // Ensure English is loaded if API is not there
            }
        }
    };

    // Load Theme Preference
     const loadThemePreference = async () => {
        if (window.electronAPI) {
            try {
                const savedTheme = await window.electronAPI.getSetting('uiTheme');
                const validTheme = savedTheme && SUPPORTED_THEMES.includes(savedTheme as Theme) ? savedTheme as Theme : 'light'; // Default to light if invalid/missing
                if (validTheme !== theme) {
                    setThemeState(validTheme); // Set state directly first
                    applyTheme(validTheme); // Apply theme class
                    console.log("Loaded and applied theme preference:", validTheme);
                } else {
                     applyTheme(theme); // Apply default theme on initial load if no preference saved
                }
            } catch (error) {
                 console.error("Failed to load UI theme preference:", error);
                 applyTheme('light'); // Fallback to light on error
            }
        } else {
            console.log("ElectronAPI not available on mount, applying default theme.");
            applyTheme(theme); // Apply default theme if API not available
        }
     };

    loadLocalePreference(); // Call it
    loadThemePreference();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount, setLocale is memoized so it's safe here.


  const value = { locale, setLocale, t, theme, setTheme, toggleTheme };

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

// Custom hook to use the UI context
export const useUI = (): UIContextType => {
  const context = useContext(UIContext);
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};