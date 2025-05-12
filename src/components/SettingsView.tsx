import React, { useState, useEffect } from 'react';
import { useUI } from '../contexts/UIContext'; // Import the UI context hook
import { SUPPORTED_LOCALES } from '../contexts/UIContext'; // Import supported locales

// Helper function to get a display name for a locale code (can be expanded)
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

const SettingsView: React.FC = () => {
    // API Key State
    const [apiKey, setApiKey] = useState<string>('');
    const [isLoadingKey, setIsLoadingKey] = useState<boolean>(true);
    const [isSavingKey, setIsSavingKey] = useState<boolean>(false);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [keySaveStatus, setKeySaveStatus] = useState<string | null>(null);

    // Get locale and theme state and setters from context
    const { locale, setLocale, theme, toggleTheme, t } = useUI(); // Use the context hook

    // --- Load API Key Setting on Mount ---
    useEffect(() => {
        const loadKey = async () => {
            setIsLoadingKey(true);
            setKeyError(null);
            setKeySaveStatus(null);

            if (!window.electronAPI) {
                 setKeyError('Electron API not available.');
                 setIsLoadingKey(false);
                 return;
            }

            try {
                // Load API Key
                const storedKey = await window.electronAPI.getSetting('geminiApiKey');
                setApiKey(storedKey ?? '');
                console.log('Loaded Gemini API Key setting.');
            } catch (err) {
                console.error('Error loading API key setting:', err);
                setKeyError(err instanceof Error ? err.message : 'Failed to load API key.');
            } finally {
                setIsLoadingKey(false);
            }
        };
        loadKey();
    }, []); // Run only once

    // --- Save Handlers ---
    const handleSaveKey = async (event: React.FormEvent) => {
        event.preventDefault();
        setIsSavingKey(true);
        setKeyError(null);
        setKeySaveStatus(null);
        try {
            if (window.electronAPI) {
                await window.electronAPI.setSetting('geminiApiKey', apiKey);
                setKeySaveStatus(t('settingsView.apiKeySaveSuccess', {defaultValue: 'API Key saved successfully!'})); // Use t()
                console.log('Gemini API Key saved.');
                setTimeout(() => setKeySaveStatus(null), 3000);
            } else {
                throw new Error(t('errors.electronAPINotAvailable', {defaultValue: 'Electron API not available.'})); // Use t()
            }
        } catch (err) {
            console.error('Error saving API key:', err);
            setKeyError(err instanceof Error ? err.message : t('errors.apiKeySaveFailed', { defaultValue: 'Failed to save API key.'})); // Use t()
            setKeySaveStatus(null);
        } finally {
            setIsSavingKey(false);
        }
    };

    // --- Locale Change Handler ---
    const handleLocaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newLocale = event.target.value as typeof SUPPORTED_LOCALES[number];
        setLocale(newLocale); // Call the function from the context
    };


    return (
        <div>
            {/* Use t() for translatable strings */}
            <h2>{t('settingsView.title', {defaultValue: 'Settings'})}</h2>
            <p>{t('settingsView.description', {defaultValue: 'Manage application settings below.'})}</p>

            {/* Gemini API Key Section */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <h3>{t('settingsView.geminiKey', { defaultValue: 'Gemini API Key'})}</h3>
                {isLoadingKey && <p>Loading API Key...</p>}
                {keyError && !isLoadingKey && <p style={{ color: 'red' }}>Error: {keyError}</p>}

                {!isLoadingKey && (
                    <form onSubmit={handleSaveKey}>
                        <p>
                            {t('settingsView.geminiKeyDescription', {defaultValue: 'Enter your Gemini API key here. You can generate one from Google AI Studio.'})}
                            <br />
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                                {t('settingsView.geminiKeyLink', {defaultValue: 'Get an API Key'})}
                            </a> {t('settingsView.geminiKeyRequirement', {defaultValue: '(Requires a Google account)'})}
                        </p>
                        <input
                            type="password" // Use password type to obscure the key visually
                            value={apiKey}
                            onChange={(e) => { setApiKey(e.target.value); setKeySaveStatus(null); setKeyError(null); }}
                            placeholder="Enter your Gemini API Key"
                            style={{ width: '400px', padding: '8px', marginRight: '10px' }}
                            disabled={isSavingKey}
                        />
                        <button type="submit" disabled={isSavingKey || isLoadingKey} style={{ padding: '8px 15px' }}>
                            {isSavingKey ? 'Saving...' : t('buttons.saveKey', {defaultValue: 'Save Key'})}
                        </button>
                        {keySaveStatus && <p style={{ color: 'green', marginTop: '10px' }}>{keySaveStatus}</p>}
                    </form>
                )}
            </div>

             {/* Interface Language Section */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                 <h3>{t('settingsView.nativeLanguage', { defaultValue: 'Interface Language' })}</h3>
                 <p>{t('settingsView.nativeLanguageDescription', { defaultValue: 'Select the display language for the application itself.'})}</p>
                 <select value={locale} onChange={handleLocaleChange} style={{padding: '8px'}}>
                     {SUPPORTED_LOCALES.map(loc => (
                         <option key={loc} value={loc}>
                             {getLocaleDisplayName(loc)} {/* Show user-friendly name */}
                         </option>
                     ))}
                 </select>
                 <p style={{fontSize: '0.9em', color: 'grey'}}><i>(Note: Requires adding actual translations for other languages in <code>src/locales</code>)</i></p>
             </div>

            {/* Appearance Section */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
                <h3>{t('settingsView.appearance', { defaultValue: 'Appearance (Theme)'})}</h3>
                <p>{t('settingsView.themeDescription', { defaultValue: 'Theme switching implemented. Further styling needed.'})}</p> {/* Updated description */}
                 {/* Activate button */}
                 <button onClick={toggleTheme} style={{ padding: '8px 15px' }}>
                     {/* Change text based on current theme */}
                     Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
                 </button>
            </div>
            {/* Add more settings sections later */}
        </div>
    );
};

export default SettingsView;