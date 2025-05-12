import React, { createContext, useState, useContext, ReactNode } from 'react';

// Define the shape of the context data
interface LanguageContextType {
  // For now, let's assume language is identified by a simple string ID or name
  // We'll expand this later to include more language details if needed
  activeLanguage: string | null; // Name of the language
  activeLanguageId: number | null; // Database ID of the language
  setActiveLanguage: (languageName: string | null) => Promise<void>; // Now async
  // We can add a list of available languages later
}

// Create the context with a default value
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Create a provider component
interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  // In a real app, this might load from storage or default differently
  const [activeLanguage, setActiveLanguageState] = useState<string | null>(null); // Renamed internal state setter
  const [activeLanguageId, setActiveLanguageIdState] = useState<number | null>(null); // Add state for ID

  // Make the setter async to fetch the ID
  const setActiveLanguage = async (languageName: string | null) => {
    setActiveLanguageState(languageName); // Set the name immediately
    if (languageName && window.electronAPI) {
      try {
        console.log(`Context: Fetching ID for language "${languageName}"`);
        const id = await window.electronAPI.getLanguageIdByName(languageName);
        setActiveLanguageIdState(id); // Set the fetched ID
        console.log(`Context: Set activeLanguageId to ${id}`);
      } catch (err) {
        console.error(`Context: Error fetching ID for language ${languageName}:`, err);
        setActiveLanguageIdState(null); // Clear ID on error
      }
    } else {
      setActiveLanguageIdState(null); // Clear ID if language name is null
    }
  };

  // Include name, ID, and the async setter in the context value
  const value = { activeLanguage, activeLanguageId, setActiveLanguage };

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