import React, { useState } from 'react';
import GrammarLogView from './components/GrammarLogView';
import SourceNotesView from './components/SourceNotesView';
import ReviewView from './components/ReviewView';
import SettingsView from './components/SettingsView';
import WelcomeScreen from './components/WelcomeScreen'; // Import WelcomeScreen
import { useLanguage } from './contexts/LanguageContext'; // Import language hook
import { useUI } from './contexts/UIContext'; // Import UI context hook

// Define available tabs
type Tab = 'log' | 'notes' | 'review' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('log'); // Default to 'log' tab when a language is active
  const { activeLanguage, setActiveLanguage } = useLanguage(); // Get language and setter
  const { t } = useUI(); // Get translation function

  const handleSwitchLanguage = () => {
      setActiveLanguage(null); // Clear active language to return to WelcomeScreen
  };

  // Render main tabbed view
  const renderMainView = () => {
    const renderViewContent = () => {
      switch (activeTab) {
        case 'log':
          return <GrammarLogView />;
        case 'notes':
          return <SourceNotesView />;
        case 'review':
          return <ReviewView />;
        case 'settings':
          return <SettingsView />;
        default:
          return <GrammarLogView />; // Fallback to log view
      }
    };

    const tabButtonStyle = (tab: Tab): React.CSSProperties => ({
      padding: '10px 15px',
      cursor: 'pointer',
      border: '1px solid #ccc',
      borderBottom: activeTab === tab ? 'none' : '1px solid #ccc',
      borderLeft: 'none', // Avoid double borders between tabs
      marginBottom: '-1px', // Overlap bottom border
      backgroundColor: activeTab === tab ? 'white' : '#f1f1f1',
      fontWeight: activeTab === tab ? 'bold' : 'normal',
    });

     const navStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center', // Vertically center items in nav
        borderBottom: '1px solid #ccc',
        flexShrink: 0,
        paddingLeft: '10px' // Add some padding
     };

     const activeLangStyle: React.CSSProperties = {
        marginRight: 'auto', // Push tabs and switch button to the right
        padding: '0 15px',
        fontWeight: 'bold',
        fontSize: '0.9em',
        color: '#555'
     };

     const switchButtonStyle: React.CSSProperties = {
        marginLeft: '20px',
        padding: '8px 12px',
        cursor: 'pointer',
     };


    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <nav style={navStyle}>
          {/* Display active language */}
          <span style={activeLangStyle}>Language: {activeLanguage}</span>

          {/* Tab Buttons - Use t() function */}
          <button style={tabButtonStyle('log')} onClick={() => setActiveTab('log')}>
            {t('tabs.grammarLog', { defaultValue: 'Grammar Log' })}
          </button>
          <button style={tabButtonStyle('notes')} onClick={() => setActiveTab('notes')}>
             {t('tabs.sourceNotes', { defaultValue: 'Source Notes' })}
          </button>
          <button style={tabButtonStyle('review')} onClick={() => setActiveTab('review')}>
             {t('tabs.review', { defaultValue: 'Review' })}
          </button>
          <button style={tabButtonStyle('settings')} onClick={() => setActiveTab('settings')}>
             {t('tabs.settings', { defaultValue: 'Settings' })}
          </button>

          {/* Switch Language Button - Use t() function */}
          <button onClick={handleSwitchLanguage} style={switchButtonStyle} title="Go back to language selection">
             {t('buttons.switchLanguage', { defaultValue: 'Switch Language' })}
          </button>
        </nav>
        <main style={{ padding: '20px', flexGrow: 1, overflowY: 'auto' }}>
          {renderViewContent()}
        </main>
      </div>
    );
  };

  // Choose whether to show Welcome Screen or Main View
  return activeLanguage ? renderMainView() : <WelcomeScreen />;
}

export default App;