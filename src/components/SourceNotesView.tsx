import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext'; // Import language hook
import ProcessingModal from './ProcessingModal'; // Import the new modal
import type { SourceNoteProcessed } from '../database'; // Import the type
import { useUI } from '../contexts/UIContext'; // For translations

type ProcessingStatus = 'idle' | 'selecting' | 'processing' | 'success' | 'error';

const SourceNotesView: React.FC = () => {
  const { selectedLanguageName } = useLanguage(); // Use selectedLanguageName
  const { t } = useUI(); // For translations
  // languageId state is removed
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [message, setMessage] = useState<string | null>(null); // For success/error messages
  // processingError state seems redundant with message, let's use message for errors too.
  const [processedNotesHistory, setProcessedNotesHistory] = useState<SourceNoteProcessed[]>([]);

  // useEffect for fetching languageId is removed.

  // Fetch processed notes history when selectedLanguageName is available
  const fetchHistory = useCallback(async () => {
    setProcessedNotesHistory([]); // Clear history on language change or if no language
    if (selectedLanguageName && window.electronAPI) {
      try {
        console.log(`SourceNotesView: Fetching processed notes history for language: ${selectedLanguageName}`);
        // Pass selectedLanguageName
        const history = await window.electronAPI.getSourceNotesProcessed(selectedLanguageName);
        setProcessedNotesHistory(history);
        console.log(`SourceNotesView: Fetched ${history.length} history items for ${selectedLanguageName}.`);
      } catch (err) {
        console.error(`Error fetching processed notes history for ${selectedLanguageName}:`, err);
        setMessage(t('errors.fetchHistoryFailed', { default: 'Failed to load processed notes history.' }));
      }
    }
  }, [selectedLanguageName, t]); // Depend on selectedLanguageName and t

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]); // fetchHistory is memoized with selectedLanguageName


  const handleImportClick = async () => {
    // Check selectedLanguageName
    if (!selectedLanguageName) {
      setMessage(t('errors.languageNotSelectedImport', { default: 'Error: Cannot import notes without an active language.'}));
      setStatus('error');
      return;
    }
    if (!window.electronAPI) {
         setMessage('Error: Electron API is not available.');
         setStatus('error');
        return;
    }

    setStatus('selecting');
    setMessage(t('sourceNotesView.selectFilesPrompt', { default: 'Select note file(s) (.txt, .md, .docx)...'}));
    let filePaths: string[] | null = null;

    try {
      filePaths = await window.electronAPI.showOpenDialog();

      if (filePaths && filePaths.length > 0) {
         setStatus('processing');
         setMessage(t('sourceNotesView.processingFiles', { count: filePaths.length, default: `Processing ${filePaths.length} file(s)...`}));
         console.log(`Starting processing for ${filePaths.length} files for language ${selectedLanguageName}:`, filePaths);

         // Call processNoteFiles with selectedLanguageName
         const result = await window.electronAPI.processNoteFiles(selectedLanguageName, filePaths);

         if (result.success) {
           setStatus('success');
           setMessage(result.message);
           console.log(`Batch processing successful for ${selectedLanguageName}:`, result);
           await fetchHistory(); // Refresh history after successful processing
         } else {
           setStatus('error');
           setMessage(result.message || t('sourceNotesView.batchFailed', {default: 'Batch processing failed with errors.'}));
           console.error(`Batch processing reported failure for ${selectedLanguageName}:`, result);
         }
       } else {
         setStatus('idle');
         setMessage(t('sourceNotesView.selectionCanceled', {default: 'File selection canceled.'}));
         console.log('File selection canceled by user.');
          setTimeout(() => setMessage(null), 3000);
       }
     } catch (err) {
       console.error(`Error during import process for ${selectedLanguageName}:`, err);
        if (status === 'processing' || status === 'selecting') {
           setStatus('error');
           setMessage(err instanceof Error ? `Error: ${err.message}` : t('errors.importUnknown', {default: 'An unknown error occurred during import.'}));
        }
     }
   };

   const handleCancelProcessing = () => {
     console.log("User requested cancellation of processing UI.");
     setStatus('idle');
     setMessage(t('sourceNotesView.processingCanceledUser', {default: 'Processing canceled by user (background tasks may still finish).'}));
      setTimeout(() => setMessage(null), 4000);
   };


  return (
    <div>
      {/* Display selectedLanguageName */}
      <h2>{t('sourceNotesView.title', { language: selectedLanguageName || 'N/A' })}</h2>
      <p>{t('sourceNotesView.importInstruction')}</p>

       <div style={{ margin: '20px 0' }}>
         <button
            onClick={handleImportClick}
            // Disable based on selectedLanguageName
            disabled={status === 'processing' || status === 'selecting' || !selectedLanguageName}
            title={t('sourceNotesView.importTooltip', { default: "Select one or more .txt, .md, or .docx files to import"})}
            style={{ padding: '10px 15px', cursor: 'pointer' }}
          >
           {status === 'selecting' ? t('sourceNotesView.selecting', {default: 'Selecting...'}) : t('buttons.importAndAnalyze')}
         </button>
         {/* Check selectedLanguageName */}
         {(!selectedLanguageName) && <p style={{ color: 'orange', marginTop: '5px' }}>{t('errors.noActiveLanguage', {default: 'No active language selected.'})}</p>}
         {message && status !== 'processing' && <p style={{ marginTop: '10px', color: status === 'error' ? 'red' : (status === 'success' ? 'green' : 'black') }}>{message}</p>}
       </div>

      {/* Display for processed notes history */}
      <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h3>{t('sourceNotesView.processedHistoryTitle', {default: 'Processed Note History'})}</h3>
        {/* Show loading/empty state based on selectedLanguageName */}
        {!selectedLanguageName ? (
            <p>{t('errors.selectLanguageViewHistory', {default: "Select a language to view its processed note history."})}</p>
        ) : processedNotesHistory.length === 0 ? (
          <p>{t('sourceNotesView.noHistory', {language: selectedLanguageName, default: `No processed notes found for ${selectedLanguageName}, or history is loading.`})}</p>
        ) : (
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            {processedNotesHistory.map(note => (
              <li key={note.id} className="processed-note-history-item" style={{ marginBottom: '15px' }}>
                <div><strong>{t('sourceNotesView.historyFile', {default: 'File:'})}</strong> {note.source_file || 'N/A'}</div>
                {note.original_snippet && (
                  <div style={{ marginTop: '5px' }}>
                    <strong>{t('sourceNotesView.historySnippet', {default: 'Snippet:'})}</strong>
                    <pre className="history-snippet-pre" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '100px', overflowY: 'auto' }}>
                      {note.original_snippet}
                    </pre>
                  </div>
                )}
                <div style={{ marginTop: '5px', fontSize: '0.9em', color: '#555' }}>
                  <strong>{t('sourceNotesView.historyProcessedOn', {default: 'Processed on:'})}</strong> {new Date(note.created_at).toLocaleString()}
                </div>
                {note.log_entry_id && (
                  <div style={{ fontSize: '0.9em', color: '#555' }}><strong>{t('sourceNotesView.historyLogEntryId', {default: 'Log Entry ID:'})}</strong> {note.log_entry_id}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Processing Modal */}
      <ProcessingModal
            isOpen={status === 'processing'}
            message={message || t('sourceNotesView.processingDefaultMessage', {default: 'Processing selected files...'})}
            onCancel={handleCancelProcessing}
        />
    </div>
  );
};

export default SourceNotesView;