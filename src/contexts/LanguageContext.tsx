import React, { createContext, useState, useContext, ReactNode, useEffect, useCallback } from 'react';

// Define the shape of the context data based on language names (folder names)
interface LanguageContextType {
  availableLanguages: string[]; // List of language names (folder names)
  selectedLanguageName: string | null; // Name of the currently selected language
  selectLanguage: (languageName: string | null) => void; // Sets the selected language
  refreshAvailableLanguages: () => Promise<void>; // Reloads the list of languages
  addNewLanguage: (languageName: string) => Promise<void>; // Creates a new language folder/db
  isLoading: boolean; // Indicates if the language list is being loaded
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Create a provider component
interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [selectedLanguageName, setSelectedLanguageName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); // Start loading initially

  // Function to fetch available languages from the main process
  const refreshAvailableLanguages = useCallback(async () => {
    setIsLoading(true);
    console.log("Context: Refreshing available languages...");
    if (window.electronAPI) {
      try {
        const languages = await window.electronAPI.listAvailableLanguages();
        // TODO: Decide if we need to map sanitized names back to original names if stored elsewhere.
        // For now, assuming folder names are usable as display names.
        setAvailableLanguages(languages.sort() || []); // Sort alphabetically
        console.log("Context: Available languages loaded:", languages);

        // If the currently selected language is no longer available, deselect it
        if (selectedLanguageName && !languages.includes(selectedLanguageName)) {
             console.log(`Context: Previously selected language "${selectedLanguageName}" no longer available. Deselecting.`);
             setSelectedLanguageName(null);
        }

      } catch (err) {
        console.error("Context: Error fetching available languages:", err);
        setAvailableLanguages([]); // Reset on error
      } finally {
        setIsLoading(false);
      }
    } else {
      console.warn("Context: ElectronAPI not available for fetching languages.");
      setAvailableLanguages([]);
      setIsLoading(false);
    }
  }, [selectedLanguageName]); // Dependency ensures check runs if selected language changes externally

  // Function to set the selected language
  const selectLanguage = (languageName: string | null) => {
    // TODO: Add logic here if switching languages requires closing/opening DBs immediately,
    // or handle that at the point of DB access based on selectedLanguageName.
    console.log(`Context: Selecting language: ${languageName}`);
    setSelectedLanguageName(languageName);
    // Persist selection? Could use global settings DB via setSetting('lastSelectedLanguage', languageName)
  };

  // Function to add a new language
  const addNewLanguage = useCallback(async (languageName: string) => {
    if (!languageName || typeof languageName !== 'string' || languageName.trim().length === 0) {
        console.error("Context: Invalid language name provided to addNewLanguage.");
        throw new Error("Invalid language name.");
    }
    const trimmedName = languageName.trim();
    console.log(`Context: Attempting to add new language: ${trimmedName}`);
    if (window.electronAPI) {
        try {
            // Check if it already exists (case-insensitive folder check might be good in main process)
            // For now, assume main process handles potential conflicts if needed.
            await window.electronAPI.createLanguage(trimmedName);
            console.log(`Context: Language ${trimmedName} creation requested.`);
            await refreshAvailableLanguages(); // Refresh the list after adding
            // Optionally select the newly added language
            // selectLanguage(trimmedName);
        } catch (err) {
            console.error(`Context: Error adding language ${trimmedName}:`, err);
            throw err; // Re-throw to allow UI to handle error
        }
    } else {
        console.error("Context: ElectronAPI not available for adding language.");
        throw new Error("ElectronAPI not available.");
    }
  }, [refreshAvailableLanguages]); // Depends on refresh function

  // Load available languages on initial mount
  useEffect(() => {
    refreshAvailableLanguages();
    // TODO: Load last selected language name from global settings?
    // const loadLastSelected = async () => {
    //   const lastSelected = await window.electronAPI?.getSetting('lastSelectedLanguage');
    //   if (lastSelected && availableLanguages.includes(lastSelected)) { // Check if still available after refresh
    //      setSelectedLanguageName(lastSelected);
    //   }
    // }
    // loadLastSelected();
  }, [refreshAvailableLanguages]); // Run once on mount

  // Provide the state and functions to consuming components
  const value = {
    availableLanguages,
    selectedLanguageName,
    selectLanguage,
    refreshAvailableLanguages,
    addNewLanguage,
    isLoading
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

// Create a custom hook for easy consumption
export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};