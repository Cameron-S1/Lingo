import { app, BrowserWindow, ipcMain, dialog } from 'electron'; // Import dialog
import path from 'path';
import './database'; // Import database module to initialize connection and schema
// Import ALL necessary DB functions & types
import {
  closeDatabase,
  // Languages
  type Language, // Ensure types are also explicitly imported if needed elsewhere
  getLanguages,
  addLanguage,
  getLanguageIdByName,
  // Settings
  getSetting,
  setSetting,
  // Log Entries
  type LogEntry, // Type needed for review item link
  type LogEntryData,
  addLogEntry,
  findLogEntryByTarget,
  getLogEntries,
  updateLogEntry,
  getLogEntriesByIds, // Import the new function
  deleteLogEntry,
  clearLogEntriesForLanguage, // Import the new function
  // Source Notes Processed
  type SourceNoteProcessed, // Type needed for linking
  type SourceNoteProcessedData,
  addSourceNoteProcessed, // Function needed
  getSourceNotesProcessed, // Function needed
  // Review Items
  type ReviewItem, // Type needed for return values
  type ReviewItemData,
  type ReviewStatus, // Type needed for parameters
  addReviewItem, // Function needed
  getReviewItems, // Function needed
  updateReviewItemStatus, // Function needed
  deleteReviewItem, // Import the new function
  clearReviewItemsForLanguage, // Import the new function
} from './database';
// Import the actual Gemini client function and its types
import { analyzeNoteContent, type ExtractedItem } from './geminiClient'; // Use the renamed function, import ExtractedItem
import fs from 'fs/promises'; // For reading files
import fsSync from 'fs'; // Synchronous fs for initial log setup if needed
import mammoth from 'mammoth'; // For DOCX extraction
import log from 'electron-log/main'; // Import electron-log for main process

// Configure electron-log (optional but recommended)
log.initialize({ preload: true }); // Helps ensure preload context access if needed later
log.transports.file.level = 'info'; // Log info level and above to file
log.transports.console.level = 'info'; // Keep console logging level similar for dev
console.log(`Logging initialized. Log file at: ${log.transports.file.getFile().path}`); // Show log file location on startup

// Squirrel Startup Handling (Commented Out)
// if (require('electron-squirrel-startup')) { app.quit(); }

let mainWindow: BrowserWindow | null = null; // Keep a reference

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000, // Slightly wider default
    height: 700, // Slightly taller default
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Use path.join to ensure compatibility
      contextIsolation: true, // Protect against prototype pollution
      nodeIntegration: false, // Disallow Node.js APIs in the renderer process
    },
  });

  // Load the content
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools(); // Open DevTools automatically in development
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html')); // Adjust path relative to main.js in dist-electron
  }

  mainWindow.on('closed', () => { mainWindow = null; });

  return mainWindow; // Return mainWindow instance
};

// App Ready Event
app.whenReady().then(() => {
  createWindow(); // Create the main window

  // Register IPC handlers
  console.log("Registering IPC handlers..."); // Keep this high-level console log
  ipcMain.handle('ping', () => 'pong');

  // --- Language Handlers ---
  ipcMain.handle('db:getLanguages', async () => {
    console.log('IPC: Handling db:getLanguages'); // Keep console log
    try { return await getLanguages(); }
    catch (error) { log.error('Error handling db:getLanguages:', error); throw error; } // Log error to file
  });
  ipcMain.handle('db:addLanguage', async (_event, name: string, nativeName?: string) => {
     console.log(`IPC: Handling db:addLanguage (Name: ${name}, Native: ${nativeName})`); // Keep console log
     try {
       if (!name || typeof name !== 'string' || name.trim().length === 0) { throw new Error('Invalid language name provided.'); }
       return await addLanguage(name.trim(), nativeName?.trim());
     } catch (error) { log.error('Error handling db:addLanguage:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:getLanguageIdByName', async (_event, name: string) => {
     console.log(`IPC: Handling db:getLanguageIdByName (Name: ${name})`); // Keep console log
      try {
        if (!name || typeof name !== 'string') { throw new Error('Invalid language name provided for ID lookup.'); }
        return await getLanguageIdByName(name.trim());
      } catch (error) { log.error('Error handling db:getLanguageIdByName:', error); throw error; } // Log error to file
    });

  // --- Settings Handlers ---
   ipcMain.handle('db:getSetting', async (_event, key: string) => {
     console.log(`IPC: Handling db:getSetting (Key: ${key})`); // Keep console log
     try {
       if (!key || typeof key !== 'string') { throw new Error('Invalid settings key provided.'); }
       return await getSetting(key);
     } catch (error) { log.error(`Error handling db:getSetting for key '${key}':`, error); throw error; } // Log error to file
   });
   ipcMain.handle('db:setSetting', async (_event, key: string, value: string) => {
     console.log(`IPC: Handling db:setSetting (Key: ${key})`); // Keep console log
     try {
       if (!key || typeof key !== 'string') { throw new Error('Invalid settings key provided.'); }
       if (typeof value !== 'string') { throw new Error('Invalid settings value provided (must be string).'); }
       await setSetting(key, value);
       return true;
     } catch (error) { log.error(`Error handling db:setSetting for key '${key}':`, error); throw error; } // Log error to file
   });

  // --- Log Entry Handlers ---
   ipcMain.handle('db:addLogEntry', async (_event, data: LogEntryData) => {
     console.log('IPC: Handling db:addLogEntry'); // Keep console log
     try {
       if (!data || typeof data !== 'object' || data.language_id == null || !data.target_text) { throw new Error('Invalid log entry data provided.'); }
       return await addLogEntry(data);
     } catch (error) { log.error('Error handling db:addLogEntry:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:findLogEntryByTarget', async (_event, languageId: number, targetText: string) => {
        console.log(`IPC: Handling db:findLogEntryByTarget (LangID: ${languageId}, Target: ${targetText})`); // Keep console log
        try {
            if (languageId == null || !targetText) { throw new Error('Invalid arguments for findLogEntryByTarget.'); }
            return await findLogEntryByTarget(languageId, targetText);
        } catch (error) { log.error('Error handling db:findLogEntryByTarget:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:getLogEntries', async (_event, languageId: number, options: any) => { // Use 'any' for options initially
     console.log(`IPC: Handling db:getLogEntries (LangID: ${languageId}) with options:`, options); // Keep console log
     try {
       if (languageId == null) { throw new Error('Invalid languageId for getLogEntries.'); }
       return await getLogEntries(languageId, options);
     } catch (error) { log.error('Error handling db:getLogEntries:', error); throw error; } // Log error to file
   });

 	ipcMain.handle('db:getLogEntriesByIds', async (_event, entryIds: number[]) => {
 		console.log(`IPC: Handling db:getLogEntriesByIds (IDs: ${entryIds.join(', ')})`); // Keep console log
 		try {
 			if (!Array.isArray(entryIds)) { throw new Error('Invalid entryIds provided (must be an array).'); }
 			return await getLogEntriesByIds(entryIds.filter(id => id != null)); // Filter out null/undefined IDs
 		} catch (error) { log.error('Error handling db:getLogEntriesByIds:', error); throw error; } // Log error to file
 	});
   ipcMain.handle('db:updateLogEntry', async (_event, id: number, updates: Partial<LogEntryData>) => {
     console.log(`IPC: Handling db:updateLogEntry (ID: ${id})`); // Keep console log
     try {
       if (id == null || typeof updates !== 'object' || Object.keys(updates).length === 0) { throw new Error('Invalid arguments for updateLogEntry.'); }
       return await updateLogEntry(id, updates);
     } catch (error) { log.error('Error handling db:updateLogEntry:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:deleteLogEntry', async (_event, id: number) => {
     console.log(`IPC: Handling db:deleteLogEntry (ID: ${id})`); // Keep console log
     try {
       if (id == null) { throw new Error('Invalid ID for deleteLogEntry.'); }
       return await deleteLogEntry(id);
     } catch (error) { log.error('Error handling db:deleteLogEntry:', error); throw error; } // Log error to file
   });
 	// Handler for clearing log entries
 	ipcMain.handle('db:clearLogEntriesForLanguage', async (_event, languageId: number) => {
 		console.log(`IPC: Handling db:clearLogEntriesForLanguage (LangID: ${languageId})`); // Keep console log
 		try {
 			if (languageId == null) { throw new Error('Invalid languageId for clearLogEntriesForLanguage.'); }
 			const rowsAffected = await clearLogEntriesForLanguage(languageId);
 			return { success: true, rowsAffected };
 		} catch (error) { log.error('Error handling db:clearLogEntriesForLanguage:', error); throw error; } // Log error to file
 	});

  // --- File Dialog Handler ---
  ipcMain.handle('dialog:showOpenDialog', async () => {
    console.log('IPC: Handling dialog:showOpenDialog'); // Keep console log
    if (!mainWindow) { throw new Error('Main window is not available.'); }
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Note Files',
        properties: [
           'openFile',
           'multiSelections' // Allow multiple files
       ],
        filters: [
            { name: 'Supported Notes', extensions: ['txt', 'md', 'docx'] },
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'Word Documents', extensions: ['docx'] },
            { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        console.log('File selection canceled.'); // Keep console log
        return null; // Return null if canceled or no files selected
      } else {
        console.log('Files selected:', result.filePaths); // Keep console log
        return result.filePaths; // Return the array of paths
      }
    } catch (error) { log.error('Error showing open file dialog:', error); throw error; } // Log error to file
  });

  // --- Helper Function for Processing a Single File ---
  // Returns details for aggregation later
  async function processSingleFile(filePath: string, languageId: number): Promise<{ added: number; reviewed: number; error?: string; fileName: string }> {
       const fileName = path.basename(filePath);
       log.info(`--- Starting processSingleFile: ${fileName} ---`); // Use log
       let sourceNoteId: number | null = null;
       let rawText = '';
       let entriesAdded = 0;
       let itemsForReview = 0;

       try {
           // 1. Read file content
           const fileExtension = path.extname(filePath).toLowerCase();
           if (fileExtension === '.docx') {
               const result = await mammoth.extractRawText({ path: filePath });
               rawText = result.value;
               log.info(`Extracted text from DOCX ${fileName} (${Math.round(rawText.length / 1024)} KB)`); // Use log
           } else {
               rawText = await fs.readFile(filePath, 'utf-8');
               log.info(`Read text from file ${fileName} (${Math.round(rawText.length / 1024)} KB)`); // Use log
           }
           if (!rawText.trim()) {
               log.warn(`File ${fileName} is empty.`); // Use log
               return { added: 0, reviewed: 0, fileName, error: `${fileName} is empty.` }; // Indicate skipped empty file
           }

            // 2. Add Source Note Processed entry
            const sourceData: SourceNoteProcessedData = { language_id: languageId, source_file: filePath, original_snippet: rawText.substring(0, 10000) }; // Store a preview
            try {
                sourceNoteId = await addSourceNoteProcessed(sourceData);
            } catch (dbErr) {
                log.error(`Failed to add source note processed entry for ${fileName}:`, dbErr); // Use log
                 // Don't block processing, but review items won't be linked
            }

           // 3. Analyze content
           log.info(`Analyzing content for ${fileName} (${Math.round(rawText.length / 1024)} KB)...`); // Use log
           const analysisResult = await analyzeNoteContent(rawText);

           // 4. Process results
           if (analysisResult?.extractedItems?.length > 0) {
               log.info(`AI analysis for ${fileName} returned ${analysisResult.extractedItems.length} items.`); // Use log
               for (const item of analysisResult.extractedItems) { // item is of type ExtractedItem
                   // ** START VALIDATION LOGIC **
                   // 1. Validate target_text (Primary Key for identification)
                   if (!item.target_text || typeof item.target_text !== 'string' || item.target_text.trim() === '') {
                       log.warn(`Item from ${fileName} has missing, empty, or non-string target_text. Creating review item. Item:`, JSON.stringify(item).substring(0, 200));
                       const reviewData: ReviewItemData = {
                           language_id: languageId,
                           review_type: 'parsing_assist',
                           original_snippet: item.original_snippet ?? `Raw item data: ${JSON.stringify(item).substring(0, 400)}`,
                           ai_suggestion: 'Item from AI response has invalid target_text (missing, empty, or not a string).',
                           source_note_processed_id: sourceNoteId
                       };
                       try { await addReviewItem(reviewData); itemsForReview++; }
                       catch (revErr) { log.error(`Failed to add review item for invalid target_text in ${fileName}:`, revErr); }
                       continue; // Skip to next item
                   }

                   // 2. Validate types of other optional fields if they are present
                   let isCurrentItemValid = true;
                   const currentItemValidationErrors: string[] = [];
                   const fieldsToValidate: Array<[keyof ExtractedItem, 'string|null' | 'string']> = [
                       ['native_text', 'string|null'],
                       ['category_guess', 'string|null'],
                       ['notes', 'string|null'],
                       ['example_sentence', 'string|null'],
                       ['kanji_form', 'string|null'],
                       ['kana_form', 'string|null'],
                       ['romanization', 'string|null'],
                       ['writing_system_note', 'string|null'],
                       ['date_context', 'string|null'],
                       ['original_snippet', 'string'] // original_snippet, if present, must be a string
                   ];

                   for (const [fieldName, expectedType] of fieldsToValidate) {
                       if (fieldName in item) { // Check if the field exists on the AI-returned object
                           const value = item[fieldName];
                           if (expectedType === 'string|null') {
                               if (value !== null && typeof value !== 'string') {
                                   isCurrentItemValid = false;
                                   currentItemValidationErrors.push(`Field '${String(fieldName)}' has invalid type (expected string or null, got ${typeof value}). Value: ${String(value).substring(0,50)}`);
                               }
                           } else if (expectedType === 'string') {
                               if (typeof value !== 'string') { // Note: null is not allowed here as per 'string' type
                                   isCurrentItemValid = false;
                                   currentItemValidationErrors.push(`Field '${String(fieldName)}' has invalid type (expected string, got ${typeof value}). Value: ${String(value).substring(0,50)}`);
                               }
                           }
                       }
                   }

                   if (!isCurrentItemValid) {
                       log.warn(`Item from ${fileName} (target: ${item.target_text}) has type validation errors: ${currentItemValidationErrors.join('; ')}. Creating review item. Item:`, JSON.stringify(item).substring(0, 200));
                       const reviewData: ReviewItemData = {
                           language_id: languageId,
                           review_type: 'parsing_assist',
                           target_text: item.target_text, // Valid target_text is known here
                           native_text: (typeof item.native_text === 'string' || item.native_text === null) ? item.native_text : String(item.native_text ?? '').substring(0, 100),
                           original_snippet: item.original_snippet ?? `Item with validation errors. Raw: ${JSON.stringify(item).substring(0,350)}`,
                           ai_suggestion: `Item from AI response has field type validation errors: ${currentItemValidationErrors.join('; ')}`,
                           source_note_processed_id: sourceNoteId
                       };
                       try { await addReviewItem(reviewData); itemsForReview++; }
                       catch (revErr) { log.error(`Failed to add review item for type validation error in ${fileName}:`, revErr); }
                       continue; // Skip to next item
                   }
                   // ** END VALIDATION LOGIC **

                   // If item is valid, proceed with duplicate check and adding to log
                   try {
                       const existing = await findLogEntryByTarget(languageId, item.target_text);
                       if (existing) {
                           const reviewData: ReviewItemData = {
                               language_id: languageId,
                               review_type: 'duplicate',
                               target_text: item.target_text,
                               native_text: item.native_text,
                               original_snippet: item.original_snippet ?? item.target_text.substring(0, 500),
                               related_log_entry_id: existing.id,
                               source_note_processed_id: sourceNoteId,
                               // Pass AI's version of character fields for potential review/merge
                               ai_extracted_kanji_form: item.kanji_form,
                               ai_extracted_kana_form: item.kana_form,
                               ai_extracted_romanization: item.romanization,
                               ai_extracted_writing_system_note: item.writing_system_note,
                               category_guess: item.category_guess // Pass AI's category guess
                           };
                           await addReviewItem(reviewData); itemsForReview++;
                       } else {
                           const entryData: LogEntryData = {
                               language_id: languageId,
                               target_text: item.target_text,
                               native_text: item.native_text ?? null,
                               category: item.category_guess ?? 'Other', // Default to 'Other' if AI provides null or invalid
                               notes: item.notes ?? null,
                               example_sentence: item.example_sentence ?? null,
                               kanji_form: item.kanji_form ?? null,
                               kana_form: item.kana_form ?? null,
                               romanization: item.romanization ?? null,
                               writing_system_note: item.writing_system_note ?? null
                               // date_context is not directly stored in log_entries yet
                           };
                           try {
                               await addLogEntry(entryData); entriesAdded++;
                           } catch (addErr) {
                               log.error(`Error adding new log entry for ${fileName} (target: ${item.target_text}), creating review item:`, addErr);
                               const reviewData: ReviewItemData = {
                                   language_id: languageId, review_type: 'parsing_assist',
                                   target_text: item.target_text, native_text: item.native_text,
                                   original_snippet: item.original_snippet ?? item.target_text.substring(0, 500),
                                   ai_suggestion: `Failed to add entry: ${addErr instanceof Error ? addErr.message : addErr}. AI data: cat='${item.category_guess}', kanji='${item.kanji_form}'`,
                                   source_note_processed_id: sourceNoteId
                               };
                               await addReviewItem(reviewData); itemsForReview++;
                           }
                       }
                   } catch (dbOpError) {
                       log.error(`Database error during item processing for ${fileName} (target: ${item.target_text}):`, dbOpError);
                       const reviewData: ReviewItemData = { 
                           language_id: languageId, 
                           review_type: 'parsing_assist', 
                           target_text: item.target_text, // Include target_text if available
                           original_snippet: item.original_snippet ?? `Error processing item. Raw: ${JSON.stringify(item).substring(0,350)}`, 
                           ai_suggestion: `DB operation error: ${dbOpError instanceof Error ? dbOpError.message : dbOpError}`, 
                           source_note_processed_id: sourceNoteId 
                       };
                       try { await addReviewItem(reviewData); itemsForReview++; } catch (revErr) { log.error("Failed to add review item for DB error:", revErr); }
                   }
               } // End for loop
           } else if (analysisResult?.error) {
               log.error(`AI Analysis Error for ${fileName}:`, analysisResult.error); // Use log
               const reviewData: ReviewItemData = { language_id: languageId, review_type: 'parsing_assist', original_snippet: rawText.substring(0, 1000), ai_suggestion: `AI analysis failed: ${analysisResult.error}`, source_note_processed_id: sourceNoteId };
               await addReviewItem(reviewData); itemsForReview++;
           } else {
               log.warn(`AI Analysis returned no items for ${fileName}.`); // Use log
               const reviewData: ReviewItemData = { language_id: languageId, review_type: 'parsing_assist', original_snippet: rawText.substring(0, 1000), ai_suggestion: `AI returned no items. Check content or prompt.`, source_note_processed_id: sourceNoteId };
               await addReviewItem(reviewData); itemsForReview++;
           }

            log.info(`--- Finished processSingleFile: ${fileName} (Added: ${entriesAdded}, Reviewed: ${itemsForReview}) ---`); // Use log
            return { added: entriesAdded, reviewed: itemsForReview, fileName };

       } catch (error) {
            const errorMsg = `Failed processing ${fileName}: ${error instanceof Error ? error.message : error}`;
            log.error(errorMsg); // Use log
            // Optionally add a general 'parsing_assist' review item for the file itself on failure
            try {
               const reviewData: ReviewItemData = { language_id: languageId, review_type: 'parsing_assist', original_snippet: rawText.substring(0, 1000) || filePath, ai_suggestion: `File processing error: ${error instanceof Error ? error.message : error}`, source_note_processed_id: sourceNoteId };
               await addReviewItem(reviewData); itemsForReview++; // Increment reviewed even on file error if review item added
            } catch (revErr) { log.error("Failed to add review item for file error:", revErr); } // Use log
            return { added: 0, reviewed: itemsForReview, error: errorMsg, fileName };
       }
  }

  // --- Note Processing Trigger Handler (Still Parallel) ---
  ipcMain.handle('notes:processFiles', async (_event, filePaths: string[], languageId: number) => {
       console.log(`IPC: Handling notes:processFiles (${filePaths.length} files, LangID: ${languageId})`); // Keep console log
       if (!Array.isArray(filePaths) || filePaths.length === 0 || languageId == null) {
            throw new Error('Invalid arguments for processing files.');
       }

       let totalEntriesAdded = 0;
       let totalItemsForReview = 0;
       const errors: string[] = [];
       const processedFiles: string[] = [];

       // Create an array of promises, one for each file processing task
       const processingPromises = filePaths.map(filePath => processSingleFile(filePath, languageId));

       // Wait for all promises to settle (either succeed or fail)
       const results = await Promise.allSettled(processingPromises);

       // Aggregate results
       results.forEach((result, index) => { // Use index to get filePath if needed
           if (result.status === 'fulfilled') {
               processedFiles.push(result.value.fileName); // Track successfully processed file names
               totalEntriesAdded += result.value.added;
               totalItemsForReview += result.value.reviewed;
               if (result.value.error) {
                  errors.push(result.value.error); // Capture errors reported by the helper
              }
           } else {
               // Handle promises that rejected (unexpected errors in processSingleFile itself)
               const reason = result.reason instanceof Error ? result.reason.message : result.reason;
               const failedFileName = path.basename(filePaths[index]); // Get filename from original array using index
               const errorMsg = `Unexpected failure processing ${failedFileName}: ${reason}`;
               log.error(errorMsg); // Use log
               errors.push(errorMsg);
           }
       });


       // Compile final result message
       let finalMessage = `Batch processing complete. Processed ${processedFiles.length} of ${filePaths.length} files. `;
       finalMessage += `Total added: ${totalEntriesAdded}. Total for review: ${totalItemsForReview}.`;
       if (errors.length > 0) {
         finalMessage += ` Errors encountered: ${errors.join('; ')}`;
       }

       log.info(finalMessage); // Log final summary to file
       return { success: errors.length === 0, message: finalMessage, added: totalEntriesAdded, reviewed: totalItemsForReview };
  });

  // --- Source Notes Processed Handlers ---
   ipcMain.handle('db:addSourceNoteProcessed', async (_event, data: SourceNoteProcessedData) => {
     console.log('IPC: Handling db:addSourceNoteProcessed'); // Keep console log
     try {
       if (!data || typeof data !== 'object' || data.language_id == null) { throw new Error('Invalid source note data provided.'); }
       return await addSourceNoteProcessed(data);
     } catch (error) { log.error('Error handling db:addSourceNoteProcessed:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:getSourceNotesProcessed', async (_event, languageId: number, options: any) => {
        console.log(`IPC: Handling db:getSourceNotesProcessed (LangID: ${languageId}) with options:`, options); // Keep console log
        try {
            if (languageId == null) { throw new Error('Invalid languageId for getSourceNotesProcessed.'); }
            return await getSourceNotesProcessed(languageId, options);
        } catch (error) { log.error('Error handling db:getSourceNotesProcessed:', error); throw error; } // Log error to file
   });

  // --- Review Item Handlers ---
   ipcMain.handle('db:addReviewItem', async (_event, data: ReviewItemData) => {
     console.log('IPC: Handling db:addReviewItem'); // Keep console log
     try {
       if (!data || typeof data !== 'object' || data.language_id == null || !data.review_type) { throw new Error('Invalid review item data provided.'); }
       return await addReviewItem(data);
     } catch (error) { log.error('Error handling db:addReviewItem:', error); throw error; } // Log error to file
   });
   ipcMain.handle('db:getReviewItems', async (_event, languageId: number, status?: ReviewStatus) => {
     console.log(`IPC: Handling db:getReviewItems (LangID: ${languageId}, Status: ${status ?? 'pending'})`); // Keep console log
     try {
       if (languageId == null) { throw new Error('Invalid languageId for getReviewItems.'); }
       return await getReviewItems(languageId, status); // Pass optional status
     } catch (error) { log.error('Error handling db:getReviewItems:', error); throw error; } // Log error to file
   });
    ipcMain.handle('db:updateReviewItemStatus', async (_event, id: number, newStatus: ReviewStatus) => {
     console.log(`IPC: Handling db:updateReviewItemStatus (ID: ${id}, Status: ${newStatus})`); // Keep console log
     try {
       if (id == null || !newStatus || !['pending', 'resolved', 'ignored'].includes(newStatus)) { throw new Error('Invalid arguments for updateReviewItemStatus.'); }
       return await updateReviewItemStatus(id, newStatus);
     } catch (error) { log.error('Error handling db:updateReviewItemStatus:', error); throw error; } // Log error to file
   });

 	ipcMain.handle('db:deleteReviewItem', async (_event, id: number) => {
 		console.log(`IPC: Handling db:deleteReviewItem (ID: ${id})`); // Keep console log
 		try {
 			if (id == null) { throw new Error('Invalid ID for deleteReviewItem.'); }
 			return await deleteReviewItem(id);
 		} catch (error) { log.error('Error handling db:deleteReviewItem:', error); throw error; } // Log error to file
 	});

 	// Handler for clearing review items
 	ipcMain.handle('db:clearReviewItemsForLanguage', async (_event, languageId: number, status: ReviewStatus = 'pending') => {
 		console.log(`IPC: Handling db:clearReviewItemsForLanguage (LangID: ${languageId}, Status: ${status})`); // Keep console log
 		try {
 			if (languageId == null) { throw new Error('Invalid languageId for clearReviewItemsForLanguage.'); }
 			const rowsAffected = await clearReviewItemsForLanguage(languageId, status); // Pass status
 			return { success: true, rowsAffected };
 		} catch (error) { log.error(`Error handling db:clearReviewItemsForLanguage for status ${status}:`, error); throw error; } // Log error to file
 	});

    // --- Add more IPC handlers here ---


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// --- App lifecycle events ---
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); }
});
app.on('before-quit', (event) => {
  log.info('App is about to quit. Closing database connection...'); // Use log
  try { closeDatabase(); log.info('Database closed.'); } // Use log
  catch (error) { log.error('Error closing database:', error); } // Use log
});