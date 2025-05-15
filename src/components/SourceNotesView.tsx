import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext'; 
import ProcessingModal from './ProcessingModal'; 
import type { SourceNoteProcessed } from '../database'; 
import { useUI } from '../contexts/UIContext'; 

type ProcessingStatus = 'idle' | 'selecting' | 'processing' | 'success' | 'error';

const SourceNotesView: React.FC = () => {
  const { selectedLanguageName } = useLanguage(); 
  const { t, toggleSourceNoteExpansion, isSourceNoteExpanded, theme } = useUI(); 
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [message, setMessage] = useState<string | null>(null); 
  const [processedNotesHistory, setProcessedNotesHistory] = useState<SourceNoteProcessed[]>([]);

  const fetchHistory = useCallback(async () => {
    setProcessedNotesHistory([]); 
    if (selectedLanguageName && window.electronAPI) {
      try {
        console.log(`SourceNotesView: Fetching processed notes history for language: ${selectedLanguageName}`);
        const history = await window.electronAPI.getSourceNotesProcessed(selectedLanguageName);
        setProcessedNotesHistory(history);
        console.log(`SourceNotesView: Fetched ${history.length} history items for ${selectedLanguageName}.`);
      } catch (err) {
        console.error(`Error fetching processed notes history for ${selectedLanguageName}:`, err);
        setMessage(t('errors.fetchHistoryFailed', { default: 'Failed to load processed notes history.' }));
      }
    }
  }, [selectedLanguageName, t]); 

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]); 

  const handleImportClick = async () => {
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

         const result = await window.electronAPI.processNoteFiles(selectedLanguageName, filePaths);

         if (result.success) {
           setStatus('success');
           setMessage(result.message);
           console.log(`Batch processing successful for ${selectedLanguageName}:`, result);
           await fetchHistory(); 
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

  const handleToggleNoteExpansion = (noteId: number) => {
    if (selectedLanguageName) {
      toggleSourceNoteExpansion(selectedLanguageName, noteId);
    }
  };

  const getPreSnippetStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = { 
      whiteSpace: 'pre-wrap', 
      wordBreak: 'break-all', 
      maxHeight: '150px', 
      overflowY: 'auto', 
      padding: '8px', 
      borderRadius: '3px', 
    };
    if (theme === 'dark') {
      return {
        ...baseStyle,
        backgroundColor: '#2E2E2E', 
        color: '#E0E0E0', 
        border: '1px solid #444' 
      };
    }
    return {
      ...baseStyle,
      backgroundColor: '#f9f9f9',
      color: '#333', 
      border: '1px solid #eee'
    };
  };

  const getDetailTextStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      marginTop: '5px', 
      fontSize: '0.9em', 
    };
    if (theme === 'dark') {
      return {
        ...baseStyle,
        color: '#AEAEAE' 
      };
    }
    return {
      ...baseStyle,
      color: '#555' 
    };
  };

  return (
    <div>
      <h2>{t('sourceNotesView.title', { language: selectedLanguageName || 'N/A' })}</h2>
      <p>{t('sourceNotesView.importInstruction')}</p>

       <div style={{ margin: '20px 0' }}>
         <button
            onClick={handleImportClick}
            disabled={status === 'processing' || status === 'selecting' || !selectedLanguageName}
            title={t('sourceNotesView.importTooltip', { default: "Select one or more .txt, .md, or .docx files to import"})}
            style={{ padding: '10px 15px', cursor: 'pointer' }}
          >
           {status === 'selecting' ? t('sourceNotesView.selecting', {default: 'Selecting...'}) : t('buttons.importAndAnalyze')}
         </button>
         {(!selectedLanguageName) && <p style={{ color: 'orange', marginTop: '5px' }}>{t('errors.noActiveLanguage', {default: 'No active language selected.'})}</p>}
         {message && status !== 'processing' && <p style={{ marginTop: '10px', color: status === 'error' ? 'red' : (status === 'success' ? 'green' : 'black') }}>{message}</p>}
       </div>

      <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h3>{t('sourceNotesView.processedHistoryTitle', {default: 'Processed Note History'})}</h3>
        {!selectedLanguageName ? (
            <p>{t('errors.selectLanguageViewHistory', {default: "Select a language to view its processed note history."})}</p>
        ) : processedNotesHistory.length === 0 ? (
          <p>{t('sourceNotesView.noHistory', {language: selectedLanguageName, default: `No processed notes found for ${selectedLanguageName}, or history is loading.`})}</p>
        ) : (
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            {processedNotesHistory.map(note => {
              const isExpanded = selectedLanguageName ? isSourceNoteExpanded(selectedLanguageName, note.id) : false;
              return (
                <li key={note.id} className="processed-note-history-item" style={{ marginBottom: '15px', border: '1px solid #ddd', padding: '10px', borderRadius: '4px' }}>
                  <div 
                    onClick={() => handleToggleNoteExpansion(note.id)} 
                    style={{ cursor: 'pointer', fontWeight: 'bold' }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleToggleNoteExpansion(note.id); }}
                    aria-expanded={isExpanded}
                    aria-controls={`note-details-${note.id}`}
                  >
                    {isExpanded ? '▼' : '►'} {t('sourceNotesView.historyFile', {default: 'File:'})} {note.source_file || 'N/A'}
                  </div>
                  {isExpanded && (
                    <div id={`note-details-${note.id}`} style={{ marginTop: '10px', paddingLeft: '20px' }}>
                      {note.original_snippet && (
                        <div style={{ marginTop: '5px' }}>
                          <strong>{t('sourceNotesView.historySnippet', {default: 'Snippet:'})}</strong>
                          <pre className="history-snippet-pre" style={getPreSnippetStyle()}>
                            {note.original_snippet}
                          </pre>
                        </div>
                      )}
                      <div style={getDetailTextStyle()}>
                        <strong>{t('sourceNotesView.historyProcessedOn', {default: 'Processed on:'})}</strong> {new Date(note.created_at).toLocaleString()}
                      </div>
                      {note.log_entry_id && (
                        <div style={getDetailTextStyle()}><strong>{t('sourceNotesView.historyLogEntryId', {default: 'Log Entry ID:'})}</strong> {note.log_entry_id}</div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ProcessingModal
            isOpen={status === 'processing'}
            message={message || t('sourceNotesView.processingDefaultMessage', {default: 'Processing selected files...'})}
            onCancel={handleCancelProcessing}
        />
    </div>
  );
};

export default SourceNotesView;