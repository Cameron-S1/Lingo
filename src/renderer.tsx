import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LanguageProvider } from './contexts/LanguageContext'; // Import the language provider
import { UIProvider } from './contexts/UIContext'; // Import the UI provider
import type { Language } from './database'; // Import the Language type for the API definition
import type { ElectronAPI } from './preload'; // Import the ElectronAPI interface shape

// Define type for the exposed Electron API using the imported interface
declare global {
    interface Window {
        // Use the imported interface directly
        electronAPI?: ElectronAPI;
    }
}


const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <UIProvider> {/* Wrap everything with UIProvider */}
        <LanguageProvider> {/* LanguageProvider is now inside UIProvider */}
           <App />
        </LanguageProvider>
    </UIProvider>
  </React.StrictMode>
);

console.log('React app mounted with UIProvider and LanguageProvider.');

// Example usage of exposed API
async function testPing() {
    try {
        // Check if the API exists (good practice)
        if (window.electronAPI && typeof window.electronAPI.invoke === 'function') {
             const result = await window.electronAPI.invoke('ping');
             console.log('IPC Ping-Pong Result:', result); // Should log "pong"
        } else {
            console.error('electronAPI or invoke function not found on window object.');
        }
    } catch (error) {
        console.error('Error invoking IPC:', error);
    }
}

// Example usage of new DB API (can be removed later)
// async function testDb() { // Function definition removed/commented
//   try {
//     if (window.electronAPI) {
//       console.log('Testing getLanguages...');
//       const languages = await window.electronAPI.getLanguages();
//       console.log('Languages found:', languages);

//       // Add a test language if it doesn't exist
//       const testLangName = 'TestLang';
//       const existingId = await window.electronAPI.getLanguageIdByName(testLangName);
//       if (existingId === null) {
//           console.log(`Adding ${testLangName}...`);
//           const newId = await window.electronAPI.addLanguage(testLangName, 'TestNative');
//           console.log(`Added ${testLangName} with ID: ${newId}`);
//           const langsAfterAdd = await window.electronAPI.getLanguages();
//           console.log('Languages after add:', langsAfterAdd);
//       } else {
//          console.log(`${testLangName} already exists with ID: ${existingId}`);
//       }

//     }
//   } catch(error) {
//     console.error('Error testing DB API:', error);
//   }
// }


// Delay the tests slightly to ensure preload script has executed
setTimeout(testPing, 500);
// setTimeout(testDb, 600); // Test DB call removed