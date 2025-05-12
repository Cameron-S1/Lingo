import React, { useState, useEffect, useCallback } from 'react'; // Added useCallback
import type { Language } from '../database';
import { useLanguage } from '../contexts/LanguageContext';
import SettingsPopup from './SettingsPopup'; // Import the new popup

const WelcomeScreen: React.FC = () => {
  const { setActiveLanguage } = useLanguage();
  const [languages, setLanguages] = useState<Language[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null); // Used for status/error messages now
  const [newLangName, setNewLangName] = useState('');
  const [newLangNativeName, setNewLangNativeName] = useState('');
  // State for settings popup
  const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false);

  // Fetch existing languages on mount
  const fetchLanguages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!window.electronAPI) throw new Error('Electron API not available.');
      const fetchedLanguages = await window.electronAPI.getLanguages();
      setLanguages(fetchedLanguages);
    } catch (err) {
      console.error("Error fetching languages:", err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, []); // Empty dependency array means this runs once on mount

  useEffect(() => {
    fetchLanguages();
  }, [fetchLanguages]);

  const handleSelectLanguage = (langName: string) => {
    console.log('Setting active language:', langName);
    setActiveLanguage(langName); // Update context, App.tsx will handle routing
  };

  const handleAddLanguage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newLangName.trim()) {
      setError("Language name cannot be empty.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      if (!window.electronAPI) throw new Error('Electron API not available.');
      await window.electronAPI.addLanguage(newLangName.trim(), newLangNativeName.trim() || undefined); // Pass native name or undefined
       setError(`Language '${newLangName.trim()}' added successfully!`); // Use error state for success message too
    } catch (err) {
      console.error("Error adding language:", err);
      setError(err instanceof Error ? err.message : 'Failed to add language');
    } finally {
      setIsLoading(false);
    }
    setNewLangName('');
    setNewLangNativeName(''); // Clear native name too
    fetchLanguages(); // Re-fetch languages to update list
    // Clear message after a delay? Or keep it? Let's keep it for now.
  }, [newLangName, newLangNativeName, fetchLanguages]); // Add dependencies

  const handleOpenSettings = () => setIsSettingsPopupOpen(true);
  const handleCloseSettings = () => setIsSettingsPopupOpen(false);


  return (
    <div className="welcome-screen-container" style={{ padding: '30px', maxWidth: '800px', margin: 'auto', position: 'relative' /* Needed for absolute positioning of button */ }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>Welcome to AI Grammar Log</h1>
       {/* Settings Button */}
       <button
         onClick={handleOpenSettings}
         style={{
           position: 'absolute',
           top: '15px',
           right: '15px',
           fontSize: '1.5rem', // Make icon larger
           background: 'none',
           border: 'none',
           cursor: 'pointer',
           padding: '5px'
         }}
         title="Settings"
       >
         ⚙️
       </button>

      <p style={{ textAlign: 'center', marginBottom: '40px' }}>
        Please select or add a language to begin.
      </p>

      {/* Select Language Section */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Select Language:</h2>
        {isLoading && !languages.length && <p>Loading languages...</p>} {/* Show loading only if no languages yet */}
        {!isLoading && languages.length === 0 && <p>No languages found. Add one below.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
          {languages.map((lang) => (
            <button
              key={lang.id}
              onClick={() => handleSelectLanguage(lang.name)}
              style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              {lang.name} {lang.native_name ? `(${lang.native_name})` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Add Language Section */}
      <div>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>Add New Language:</h2>
        <form onSubmit={handleAddLanguage} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px', marginTop: '10px' }}>
          <div>
            <label htmlFor="newLangName">Name:</label>
            <input
              type="text"
              id="newLangName"
              value={newLangName}
              onChange={(e) => setNewLangName(e.target.value)}
              placeholder="e.g., Japanese"
              required // Make name required
              style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="newLangNativeName">Native Name:</label>
            <input
              type="text"
              id="newLangNativeName"
              value={newLangNativeName}
              onChange={(e) => setNewLangNativeName(e.target.value)}
              placeholder="e.g., 日本語 (Optional)"
              style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
            />
          </div>
          <button type="submit" disabled={isLoading} style={{ padding: '10px 15px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            {isLoading ? 'Adding...' : 'Add Language'}
          </button>
        </form> { /* Close form tag here */ }
          {error && <p style={{ color: error.includes('successfully') ? 'green' : 'red', marginTop: '10px' }}>{error}</p>} { /* Display status/error message here, check content for color */ }
      </div>

       {/* Settings Popup */}
        <SettingsPopup
            isOpen={isSettingsPopupOpen}
            onClose={handleCloseSettings}
        />

    </div>
  );
};

export default WelcomeScreen;