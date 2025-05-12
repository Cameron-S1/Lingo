import React, { useState, useEffect } from 'react';
import { useUI, SUPPORTED_LOCALES } from '../contexts/UIContext'; // Import useUI and SUPPORTED_LOCALES

interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

// Helper function to get a display name for a locale code (can be expanded)
// Duplicated from SettingsView for now, consider moving to a shared util if used in more places.
const getLocaleDisplayName = (locale: string): string => {
    switch (locale) {
        case 'en': return 'English';
        case 'ja': return '日本語 (Japanese)';
        case 'fr': return 'Français (French)';
        case 'de': return 'Deutsch (German)';
        case 'es': return 'Español (Spanish)';
        case 'pt': return 'Português (Portuguese)';
        case 'ru': return 'Русский (Russian)';
        default: return locale;
    }
};


// Basic styling - adjust as needed
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1100, // Ensure it's on top
};

const popupBaseStyle: React.CSSProperties = { // Renamed to avoid conflict, background removed
  // backgroundColor: 'white', // Removed
  padding: '20px 30px',
  borderRadius: '5px',
  maxWidth: '500px',
  width: '90%',
  position: 'relative',
  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
};

const closeButtonStyle: React.CSSProperties = {
  position: 'absolute',
  top: '10px',
  right: '15px',
  background: 'none',
  border: 'none',
  fontSize: '1.5rem',
  cursor: 'pointer',
  lineHeight: '1',
  padding: '5px',
};

const inputStyle: React.CSSProperties = {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '1rem',
    width: 'calc(100% - 90px)', // Adjust width considering button size
    marginRight: '10px'
};

const buttonStyle: React.CSSProperties = {
    padding: '8px 15px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px'
    // backgroundColor will be handled by general button styles or specific dark mode overrides
};

const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
    borderTop: '1px solid #eee',
    paddingTop: '15px'
};

const selectStyle: React.CSSProperties = {
    padding: '8px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '1rem',
    width: '100%', // Full width for select
};


const SettingsPopup: React.FC<SettingsPopupProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState<string>('');
  const [isLoadingKey, setIsLoadingKey] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<'success' | 'error' | null>(null);

  const { theme, toggleTheme, t, locale, setLocale } = useUI(); // Get theme and locale stuff from context

  useEffect(() => {
    const loadKey = async () => {
      if (isOpen && window.electronAPI) {
        setIsLoadingKey(true);
        setStatusMessage(null);
        setStatusType(null);
        try {
          const storedKey = await window.electronAPI.getSetting('geminiApiKey');
          setApiKey(storedKey || '');
        } catch (error) {
          console.error('Error loading API key in popup:', error);
          setStatusMessage('Failed to load API key.');
          setStatusType('error');
        } finally {
          setIsLoadingKey(false);
        }
      }
    };
    loadKey();
  }, [isOpen]); // Reload key when popup opens

  const handleSaveKey = async () => {
    if (!window.electronAPI) {
      setStatusMessage('Error: Electron API not available.');
      setStatusType('error');
      return;
    }
    setIsLoadingKey(true);
    setStatusMessage(null);
    setStatusType(null);
    try {
      // const success = await window.electronAPI.setSetting('geminiApiKey', apiKey); // Original, ensure it returns boolean or handle appropriately
      await window.electronAPI.setSetting('geminiApiKey', apiKey); // Assuming setSetting resolves on success or rejects on error
      setStatusMessage(t('settingsView.apiKeySaveSuccess', {defaultValue: 'API Key saved successfully!'}));
      setStatusType('success');
      if (window.electronAPI.invoke) { // Check if invoke exists before calling
        window.electronAPI.invoke('settings:apiKeyUpdated'); // Signal update
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      setStatusMessage(error instanceof Error ? error.message : 'An unknown error occurred while saving API key.');
      setStatusType('error');
    } finally {
      setIsLoadingKey(false);
       if (statusType === 'success' && !isLoadingKey) {
         setTimeout(onClose, 1500); // Close popup on successful save after a delay
       }
    }
  };

  const handleLocaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = event.target.value as typeof SUPPORTED_LOCALES[number];
    setLocale(newLocale); // Call the function from the context
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      {/* Add className and apply base style */}
      <div style={popupBaseStyle} className="settings-popup-content" onClick={e => e.stopPropagation()}>
        <button style={closeButtonStyle} onClick={onClose} title="Close">&times;</button>
        <h3>{t('settingsPopup.title', {defaultValue: 'Settings'})}</h3>
        <hr style={{ margin: '15px 0' }}/>

        <div style={{ marginBottom: '15px' }}>
          <strong>{t('settingsView.geminiKey', {defaultValue: 'Gemini API Key'})}</strong>
          <p style={{ fontSize: '0.9em', color: '#666', margin: '5px 0' }}>
            {t('settingsView.geminiKeyDescription', {defaultValue: 'Enter your Gemini API key here. You can generate one from Google AI Studio.'})}<br/>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">{t('settingsView.geminiKeyLink', {defaultValue: 'Get an API Key'})}</a> {t('settingsView.geminiKeyRequirement', {defaultValue: '(Requires a Google account)'})}
          </p>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="password" // Keep it masked
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Paste your API key"
              style={inputStyle}
              disabled={isLoadingKey}
            />
            <button onClick={handleSaveKey} disabled={isLoadingKey} style={buttonStyle}>
              {isLoadingKey ? t('modal.saving', {defaultValue: 'Saving...'}) : t('buttons.saveKey', {defaultValue: 'Save Key'})}
            </button>
          </div>
        </div>

        {/* Status Message Area */}
        {statusMessage && (
          <p style={{ marginTop: '10px', color: statusType === 'error' ? 'red' : 'green' }}>
            {statusMessage}
          </p>
        )}

        {/* Interface Language Section */}
        <div style={sectionStyle}>
            <h4>{t('settingsView.nativeLanguage', { defaultValue: 'Interface Language' })}</h4>
            <p style={{ fontSize: '0.9em', color: '#666', margin: '5px 0 10px 0' }}>
                {t('settingsView.nativeLanguageDescription', { defaultValue: 'Select the display language for the application itself.'})}
            </p>
            <select value={locale} onChange={handleLocaleChange} style={selectStyle}>
                {SUPPORTED_LOCALES.map(loc => (
                    <option key={loc} value={loc}>
                        {getLocaleDisplayName(loc)}
                    </option>
                ))}
            </select>
             <p style={{fontSize: '0.8em', color: 'grey', marginTop: '5px'}}><i>(Note: Requires adding translations to <code>src/locales/{locale}.json</code> for full support)</i></p>
        </div>

        {/* Appearance Section for Theme Toggle */}
        <div style={sectionStyle}>
            <h4>{t('settingsPopup.appearanceTitle', { defaultValue: 'Appearance'})}</h4>
            <button onClick={toggleTheme} style={buttonStyle}>
                {theme === 'light' ? t('settingsPopup.switchToDarkMode', {defaultValue: 'Switch to Dark Mode'}) : t('settingsPopup.switchToLightMode', {defaultValue: 'Switch to Light Mode'})}
            </button>
        </div>

         {/* Placeholder for future settings - can be removed if language covers it */}
          {/*
          <div style={{ ...sectionStyle, color: '#888', marginTop: '10px' }}>
             <small>{t('settingsPopup.moreSettingsComing', {defaultValue: 'More settings coming soon.'})}</small>
         </div>
          */}

      </div>
    </div>
  );
};

export default SettingsPopup;