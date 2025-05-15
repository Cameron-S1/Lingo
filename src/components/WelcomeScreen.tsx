import React, { useState, useCallback } from 'react'; // Removed useEffect
import { useLanguage } from '../contexts/LanguageContext';
import SettingsPopup from './SettingsPopup'; // Import the new popup
import { useUI } from '../contexts/UIContext'; // Import useUI for translations

const WelcomeScreen: React.FC = () => {
  // Use the new language context
  const {
      availableLanguages,
      selectLanguage,
      addNewLanguage,
      isLoading: isContextLoading, // Renamed to avoid conflict with local submit loading
      refreshAvailableLanguages // Added for potential manual refresh later if needed
  } = useLanguage();
  const { t } = useUI(); // Get translation function

  // Local state for the add language form
  const [isSubmitting, setIsSubmitting] = useState(false); // For disabling add button during submission
  const [error, setError] = useState<string | null>(null);
  const [newLangName, setNewLangName] = useState('');
  // State for settings popup
  const [isSettingsPopupOpen, setIsSettingsPopupOpen] = useState(false);

  // No longer need local state for languages or fetchLanguages; context handles it.

  const handleSelectLanguage = (langName: string) => {
    console.log('Selecting language:', langName);
    selectLanguage(langName); // Update context
  };

  const handleAddLanguage = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newLangName.trim()) {
      setError(t('errors.languageNameEmpty', {default: "Language name cannot be empty."})); // Example using t()
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const trimmedName = newLangName.trim();
    try {
      await addNewLanguage(trimmedName);
      // Optional: automatically select the new language?
      // selectLanguage(trimmedName);
      setError(t('welcomeScreen.addSuccess', { language: trimmedName, default: `Language '${trimmedName}' created successfully!`})); // Use t() if key exists
      setNewLangName(''); // Clear input on success
    } catch (err) {
      console.error("Error adding language:", err);
      // Check if error message indicates already exists?
      // For now, just show the raw error or a generic one.
      setError(err instanceof Error ? err.message : t('errors.addLanguageFailed', {default: 'Failed to add language'}));
    } finally {
      setIsSubmitting(false);
    }
    // Context's addNewLanguage already calls refreshAvailableLanguages
  }, [newLangName, addNewLanguage, t]); // Added t to dependencies

  const handleOpenSettings = () => setIsSettingsPopupOpen(true);
  const handleCloseSettings = () => setIsSettingsPopupOpen(false);


  return (
    <div className="welcome-screen-container" style={{ padding: '30px', maxWidth: '800px', margin: 'auto', position: 'relative' }}>
      {/* Use translation key for title */}
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>{t('welcomeScreen.title')}</h1>
       {/* Settings Button */}
       <button
         onClick={handleOpenSettings}
         style={{
           position: 'absolute',
           top: '15px',
           right: '15px',
           fontSize: '1.5rem',
           background: 'none',
           border: 'none',
           cursor: 'pointer',
           padding: '5px'
         }}
         title={t('tabs.settings')} // Use translation key
       >
         ⚙️
       </button>

      <p style={{ textAlign: 'center', marginBottom: '40px' }}>
        {t('welcomeScreen.instructions')}
      </p>

      {/* Select Language Section */}
      <div style={{ marginBottom: '40px' }}>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>{t('welcomeScreen.selectLanguage')}</h2>
        {isContextLoading && <p>{t('welcomeScreen.loadingLanguages', {default: "Loading languages..."})}</p>}
        {!isContextLoading && availableLanguages.length === 0 && <p>{t('welcomeScreen.noLanguages')}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
          {/* Map over availableLanguages (string array) */}
          {availableLanguages.map((langName) => (
            <button
              key={langName} // Use language name as key
              onClick={() => handleSelectLanguage(langName)}
              style={{ padding: '10px 15px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              {/* Display language name directly (can improve later if needed) */}
              {langName}
            </button>
          ))}
        </div>
      </div>

      {/* Add Language Section */}
      <div>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px' }}>{t('welcomeScreen.addNewLanguage')}</h2>
        <form onSubmit={handleAddLanguage} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px', marginTop: '10px' }}>
          <div>
            <label htmlFor="newLangName">{t('welcomeScreen.languageName')}</label>
            <input
              type="text"
              id="newLangName"
              value={newLangName}
              onChange={(e) => setNewLangName(e.target.value)}
              placeholder={t('welcomeScreen.languageNamePlaceholder')}
              required
              style={{ width: '100%', padding: '8px', marginTop: '5px', boxSizing: 'border-box' }}
            />
          </div>
          {/* Native name input removed */}
          <button type="submit" disabled={isSubmitting || isContextLoading} style={{ padding: '10px 15px', cursor: 'pointer', alignSelf: 'flex-start' }}>
            {isSubmitting ? t('welcomeScreen.addingLanguage', {default: 'Adding...'}) : t('buttons.addLanguage')}
          </button>
        </form>
        {error && <p style={{ color: error.includes('successfully') ? 'green' : 'red', marginTop: '10px' }}>{error}</p>}
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