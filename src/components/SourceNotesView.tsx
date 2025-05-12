import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext'; // Import language hook
import ProcessingModal from './ProcessingModal'; // Import the new modal
import type { SourceNoteProcessed } from '../database'; // Import the type

type ProcessingStatus = 'idle' | 'selecting' | 'processing' | 'success' | 'error';

const SourceNotesView: React.FC = () => {
  const { activeLanguage } = useLanguage();
  const [languageId, setLanguageId] = useState<number | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [message, setMessage] = useState<string | null>(null); // For success/error messages
  const [processingError, setProcessingError] = useState<string | null>(null); // Store processing errors
  const [processedNotesHistory, setProcessedNotesHistory] = useState<SourceNoteProcessed[]>([]);

  // Fetch language ID based on active language name
  useEffect(() => {
    const fetchLanguageId = async () => {
      setLanguageId(null); // Reset on language change
      setProcessedNotesHistory([]); // Clear history on language change
      if (activeLanguage && window.electronAPI) {
        try {
          console.log(`SourceNotesView: Fetching ID for language: ${activeLanguage}`);
          const id = await window.electronAPI.getLanguageIdByName(activeLanguage);
          setLanguageId(id);
           console.log(`SourceNotesView: Language ID for ${activeLanguage}: ${id}`);
        } catch (err) {
          console.error(`SourceNotesView: Error fetching language ID for ${activeLanguage}:`, err);
          setProcessingError(`Failed to get ID for language: ${activeLanguage}`); // Show error in this view
        }
      }
    };
    fetchLanguageId();
  }, [activeLanguage]);

  // Fetch processed notes history when languageId is available
  useEffect(() => {
    const fetchHistory = async () => {
      if (languageId !== null && window.electronAPI) {
        try {
          console.log(`SourceNotesView: Fetching processed notes history for language ID: ${languageId}`);
          const history = await window.electronAPI.getSourceNotesProcessed(languageId);
          setProcessedNotesHistory(history);
          console.log(`SourceNotesView: Fetched ${history.length} history items.`);
        } catch (err) {
          console.error('Error fetching processed notes history:', err);
          setMessage('Failed to load processed notes history.');
          // setStatus('error'); // Optionally set a general error status
        }
      }
    };
    fetchHistory();
  }, [languageId]);


  const handleImportClick = async () => {
    if (!languageId) {
      setMessage('Error: Cannot import notes without an active language ID.');
      setStatus('error');
      return;
    }
    if (!window.electronAPI) {
         setMessage('Error: Electron API is not available.');
         setStatus('error');
        return;
    }

    setStatus('selecting');
    setMessage('Select note file(s) (.txt, .md, .docx)...'); // Update message
    setProcessingError(null); // Clear previous errors
    let filePaths: string[] | null = null; // Store multiple paths

    try {
      filePaths = await window.electronAPI.showOpenDialog(); // Expecting array or null

      if (filePaths && filePaths.length > 0) { // Check if we got paths
         setStatus('processing');
         setMessage(`Processing ${filePaths.length} file(s)...`); // Update message for modal
         console.log(`Starting processing for ${filePaths.length} files with LangID ${languageId}:`, filePaths);

         // Call the function that handles multiple files (returns aggregated result)
         const result = await window.electronAPI.processNoteFiles(filePaths, languageId);

         // Always update status based on the actual result from the backend
         if (result.success) {
           setStatus('success');
           setMessage(result.message); // Display the aggregated result message
           console.log('Batch processing successful:', result);
           // Refresh history after successful processing
           if (window.electronAPI) {
             const history = await window.electronAPI.getSourceNotesProcessed(languageId);
             setProcessedNotesHistory(history);
           }
         } else {
           setStatus('error');
           setMessage(result.message || 'Batch processing failed with errors.'); // Use specific error message
           console.error('Batch processing reported failure:', result);
         }
         // Message will now persist until next action or language change.

       } else {
         // User canceled the dialog
         setStatus('idle');
         setMessage('File selection canceled.');
         console.log('File selection canceled by user.');
          // Clear message after a few seconds
          setTimeout(() => setMessage(null), 3000);
       }
     } catch (err) {
       console.error('Error during import process:', err);
       // Only set error if not cancelled
        if (status === 'processing' || status === 'selecting') {
           setStatus('error');
           setMessage(err instanceof Error ? `Error: ${err.message}` : 'An unknown error occurred during import.');
        }
        // Keep error message displayed until next action
     }
      // Do not reset status to 'idle' immediately on error, let user see the message
   };

   const handleCancelProcessing = () => {
     console.log("User requested cancellation of processing UI.");
     // Note: This only cancels the UI waiting state. Backend processing might continue.
     setStatus('idle');
     setMessage('Processing canceled by user (background tasks may still finish).');
      setTimeout(() => setMessage(null), 4000); // Clear message after a while
   };


  return (
    <div>
      <h2>Source Notes {activeLanguage ? `(${activeLanguage})` : ''}</h2>
      <p>Import notes from supported files (.txt, .md, .docx) to populate your Grammar Log.</p>

       <div style={{ margin: '20px 0' }}>
         <button
            onClick={handleImportClick}
            disabled={status === 'processing' || status === 'selecting' || !languageId}
            title="Select one or more .txt, .md, or .docx files to import" // Updated tooltip
            style={{ padding: '10px 15px', cursor: 'pointer' }}
          >
           {status === 'selecting' ? 'Selecting...' : 'Import & Analyze Notes'}
         </button>
         {(!languageId && !activeLanguage) && <p style={{ color: 'orange', marginTop: '5px' }}>No active language selected.</p>}
         {/* Only show status messages when not showing the processing modal */}
         {message && status !== 'processing' && <p style={{ marginTop: '10px', color: status === 'error' ? 'red' : (status === 'success' ? 'green' : 'black') }}>{message}</p>}
       </div>

      {/* Display for processed notes history */}
      <div style={{ marginTop: '20px', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <h3>Processed Note History</h3>
        {processedNotesHistory.length === 0 ? (
          <p>No processed notes found for this language, or history is loading.</p>
        ) : (
          <ul style={{ listStyleType: 'none', paddingLeft: 0 }}>
            {processedNotesHistory.map(note => (
              <li key={note.id} className="processed-note-history-item" style={{ marginBottom: '15px' }}>
                <div><strong>File:</strong> {note.source_file || 'N/A'}</div>
                {note.original_snippet && (
                  <div style={{ marginTop: '5px' }}>
                    <strong>Snippet:</strong>
                    <pre className="history-snippet-pre" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '100px', overflowY: 'auto' }}>
                      {note.original_snippet}
                    </pre>
                  </div>
                )}
                <div style={{ marginTop: '5px', fontSize: '0.9em', color: '#555' }}>
                  <strong>Processed on:</strong> {new Date(note.created_at).toLocaleString()}
                </div>
                {note.log_entry_id && (
                  <div style={{ fontSize: '0.9em', color: '#555' }}><strong>Log Entry ID:</strong> {note.log_entry_id}</div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Processing Modal */}
      <ProcessingModal
            isOpen={status === 'processing'}
            message={message || 'Processing selected files...'} // Show specific or default message
            onCancel={handleCancelProcessing}
        />
    </div>
  );
};

export default SourceNotesView;