import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
// Import NEW and ADAPTED database functions & types
import {
  // DB Management
  getDB, 
  closeLanguageDB,
  closeAllDatabases,
  listAvailableLanguages,
  createLanguage,
  deleteLanguageLog,
  // Global Settings
  getSetting,
  setSetting,
  // Language Specific Data Types
  type LogEntry, // Make sure LogEntry is imported if used for existing entry type
  type LogEntryData,
  type GetLogEntriesOptions,
  type SourceNoteProcessed,
  type SourceNoteProcessedData,
  type ReviewItem,
  type ReviewType,
  type ReviewStatus,
  type ReviewItemData,
  // Adapted CRUD Operations
  addLogEntry,
  findLogEntryByTarget,
  getLogEntries,
  getLogEntriesByIds,
  updateLogEntry,
  deleteLogEntry,
  clearLogEntriesForLanguage,
  addSourceNoteProcessed,
  getSourceNotesProcessed,
  addReviewItem,
  getReviewItems,
  updateReviewItemStatus,
  deleteReviewItem,
  clearReviewItemsForLanguage
} from './database';
// Import the actual Gemini client function and its types
import { analyzeNoteContent, type ExtractedItem, type AnalysisResult } from './geminiClient'; // Added AnalysisResult type import
import fs from 'fs/promises';
import fsSync from 'fs';
import mammoth from 'mammoth';
import log from 'electron-log/main';

log.initialize({ preload: true });
log.transports.file.level = 'info';
log.transports.console.level = 'info';
console.log(`Logging initialized. Log file at: ${log.transports.file.getFile().path}`);

let mainWindow: BrowserWindow | null = null;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
};

app.whenReady().then(() => {
  createWindow();

  console.log("Registering IPC handlers...");
  ipcMain.handle('ping', () => 'pong');

  // --- Language Management Handlers ---
  ipcMain.handle('languages:listAvailable', async () => {
    console.log('IPC: Handling languages:listAvailable');
    try { return await listAvailableLanguages(); }
    catch (error) { log.error('Error handling languages:listAvailable:', error); throw error; }
  });

  ipcMain.handle('languages:create', async (_event, languageName: string) => {
     console.log(`IPC: Handling languages:create (Name: ${languageName})`);
     try {
       if (!languageName || typeof languageName !== 'string' || languageName.trim().length === 0) { throw new Error('Invalid language name provided.'); }
       await createLanguage(languageName.trim());
       return { success: true, languageName: languageName.trim() };
     } catch (error) { log.error('Error handling languages:create:', error); throw error; }
   });

  // --- Global Settings Handlers ---
   ipcMain.handle('settings:get', async (_event, key: string) => {
     console.log(`IPC: Handling settings:get (Key: ${key})`);
     try {
       if (!key || typeof key !== 'string') { throw new Error('Invalid settings key provided.'); }
       return await getSetting(key);
     } catch (error) { log.error(`Error handling settings:get for key '${key}':`, error); throw error; }
   });
   ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
     console.log(`IPC: Handling settings:set (Key: ${key})`);
     try {
       if (!key || typeof key !== 'string') { throw new Error('Invalid settings key provided.'); }
       if (typeof value !== 'string') { throw new Error('Invalid settings value provided (must be string).'); }
       await setSetting(key, value);
       return true;
     } catch (error) { log.error(`Error handling settings:set for key '${key}':`, error); throw error; }
   });

  // --- Log Entry Handlers ---
   ipcMain.handle('db:addLogEntry', async (_event, languageName: string, data: LogEntryData) => {
     console.log(`IPC: Handling db:addLogEntry for language: ${languageName}`);
     try {
       if (!languageName || !data || typeof data !== 'object' || !data.target_text) { throw new Error('Invalid language name or log entry data provided.'); }
       return await addLogEntry(languageName, data);
     } catch (error) { log.error(`Error handling db:addLogEntry for ${languageName}:`, error); throw error; }
   });
   ipcMain.handle('db:findLogEntryByTarget', async (_event, languageName: string, targetText: string) => {
        console.log(`IPC: Handling db:findLogEntryByTarget (Lang: ${languageName}, Target: ${targetText})`);
        try {
            if (!languageName || !targetText) { throw new Error('Invalid arguments for findLogEntryByTarget.'); }
            return await findLogEntryByTarget(languageName, targetText);
        } catch (error) { log.error(`Error handling db:findLogEntryByTarget for ${languageName}:`, error); throw error; }
   });
   ipcMain.handle('db:getLogEntries', async (_event, languageName: string, options: GetLogEntriesOptions) => {
     console.log(`IPC: Handling db:getLogEntries (Lang: ${languageName}) with options:`, options);
     try {
       if (!languageName) { throw new Error('Invalid languageName for getLogEntries.'); }
       return await getLogEntries(languageName, options);
     } catch (error) { log.error(`Error handling db:getLogEntries for ${languageName}:`, error); throw error; }
   });
 	ipcMain.handle('db:getLogEntriesByIds', async (_event, languageName: string, entryIds: number[]) => {
 		console.log(`IPC: Handling db:getLogEntriesByIds for ${languageName} (IDs: ${entryIds.join(', ')})`);
 		try {
           if (!languageName) { throw new Error('Invalid languageName for getLogEntriesByIds.'); }
 			if (!Array.isArray(entryIds)) { throw new Error('Invalid entryIds provided (must be an array).'); }
 			return await getLogEntriesByIds(languageName, entryIds.filter(id => id != null));
 		} catch (error) { log.error(`Error handling db:getLogEntriesByIds for ${languageName}:`, error); throw error; }
 	});
   ipcMain.handle('db:updateLogEntry', async (_event, languageName: string, id: number, updates: Partial<LogEntryData>) => {
     console.log(`IPC: Handling db:updateLogEntry (Lang: ${languageName}, ID: ${id})`);
     try {
       if (!languageName || id == null || typeof updates !== 'object' || Object.keys(updates).length === 0) { throw new Error('Invalid arguments for updateLogEntry.'); }
       return await updateLogEntry(languageName, id, updates);
     } catch (error) { log.error(`Error handling db:updateLogEntry for ${languageName}, ID ${id}:`, error); throw error; }
   });
   ipcMain.handle('db:deleteLogEntry', async (_event, languageName: string, id: number) => {
     console.log(`IPC: Handling db:deleteLogEntry (Lang: ${languageName}, ID: ${id})`);
     try {
       if (!languageName || id == null) { throw new Error('Invalid arguments for deleteLogEntry.'); }
       return await deleteLogEntry(languageName, id);
     } catch (error) { log.error(`Error handling db:deleteLogEntry for ${languageName}, ID ${id}:`, error); throw error; }
   });
 	ipcMain.handle('db:clearLogEntriesForLanguage', async (_event, languageName: string) => {
 		console.log(`IPC: Handling db:clearLogEntriesForLanguage (Lang: ${languageName})`);
 		try {
 			if (!languageName) { throw new Error('Invalid languageName for clearLogEntriesForLanguage.'); }
 			const rowsAffected = await clearLogEntriesForLanguage(languageName);
 			return { success: true, rowsAffected };
 		} catch (error) { log.error(`Error handling db:clearLogEntriesForLanguage for ${languageName}:`, error); throw error; }
 	});
    ipcMain.handle('languages:deleteLog', async (_event, languageName: string) => {
        console.log(`IPC: Handling languages:deleteLog (Lang: ${languageName})`);
        try {
            if (!languageName) { throw new Error('Invalid languageName provided for deleting log.'); }
            await deleteLanguageLog(languageName);
            return { success: true };
        } catch (error) { log.error(`Error handling languages:deleteLog for ${languageName}:`, error); throw error; }
    });

  ipcMain.handle('dialog:showOpenDialog', async () => {
    console.log('IPC: Handling dialog:showOpenDialog');
    if (!mainWindow) { throw new Error('Main window is not available.'); }
    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Note Files',
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: 'Supported Notes', extensions: ['txt', 'md', 'docx'] },
            { name: 'Text Files', extensions: ['txt'] },
            { name: 'Markdown Files', extensions: ['md'] },
            { name: 'Word Documents', extensions: ['docx'] },
            { name: 'All Files', extensions: ['*'] }
        ]
      });
      if (result.canceled || result.filePaths.length === 0) {
        console.log('File selection canceled.');
        return null;
      } else {
        console.log('Files selected:', result.filePaths);
        return result.filePaths;
      }
    } catch (error) { log.error('Error showing open file dialog:', error); throw error; }
  });

  interface ProcessSingleFileResult {
    added: number;
    reviewed: number;
    error?: string; 
    fileName: string;
    skippedDueToRateLimit?: boolean;
    updated: number; 
  }

  async function processSingleFile(filePath: string, languageName: string): Promise<ProcessSingleFileResult> {
       const fileName = path.basename(filePath);
       log.info(`--- Starting processSingleFile: ${fileName} for language ${languageName} ---`);
       let sourceNoteId: number | null = null;
       let rawText = '';
       let entriesAdded = 0;
       let itemsForReview = 0;
       let entriesUpdated = 0; 

       try {
           const fileExtension = path.extname(filePath).toLowerCase();
           if (fileExtension === '.docx') {
               const result = await mammoth.extractRawText({ path: filePath });
               rawText = result.value;
               log.info(`Extracted text from DOCX ${fileName} (${Math.round(rawText.length / 1024)} KB)`);
           } else {
               rawText = await fs.readFile(filePath, 'utf-8');
               log.info(`Read text from file ${fileName} (${Math.round(rawText.length / 1024)} KB)`);
           }
           if (!rawText.trim()) {
               log.warn(`File ${fileName} is empty.`);
               return { added: 0, reviewed: 0, updated: 0, fileName, error: `${fileName} is empty.` };
           }

            const sourceData: SourceNoteProcessedData = { source_file: filePath, original_snippet: rawText.substring(0, 10000) };
            try {
                sourceNoteId = await addSourceNoteProcessed(languageName, sourceData);
            } catch (dbErr) {
                log.error(`Failed to add source note processed entry for ${fileName} in ${languageName}:`, dbErr);
            }

           log.info(`Analyzing content for ${fileName} (${Math.round(rawText.length / 1024)} KB)...`);
           const analysisResult: AnalysisResult = await analyzeNoteContent(rawText);

           if (analysisResult.error && analysisResult.error !== "RATE_LIMIT_EXCEEDED") {
               log.error(`AI Analysis Error for ${fileName} (non-retryable): ${analysisResult.error}. Details:`, analysisResult.errorDetails);
           } else if (analysisResult.error === "RATE_LIMIT_EXCEEDED") {
                log.warn(`Skipping file ${fileName} for language ${languageName} due to API rate limit to be handled by batch processor. Details: ${analysisResult.errorDetails}`);
                return { added: 0, reviewed: itemsForReview, updated: 0, fileName, skippedDueToRateLimit: true };
           } else if (analysisResult.extractedItems && analysisResult.extractedItems.length > 0) {
               log.info(`AI analysis for ${fileName} returned ${analysisResult.extractedItems.length} items.`);
               for (const item of analysisResult.extractedItems) {
                   if (!item.target_text || typeof item.target_text !== 'string' || item.target_text.trim() === '') {
                       log.warn(`Item from ${fileName} has missing target_text. Creating review item for ${languageName}. Item:`, JSON.stringify(item).substring(0, 200));
                       const reviewData: ReviewItemData = {
                           review_type: 'parsing_assist',
                           original_snippet: item.original_snippet ?? `Raw item data: ${JSON.stringify(item).substring(0, 400)}`,
                           ai_suggestion: 'Item from AI response has invalid target_text (missing, empty, or not a string).',
                           source_note_processed_id: sourceNoteId
                       };
                       try { await addReviewItem(languageName, reviewData); itemsForReview++; }
                       catch (revErr) { log.error(`Failed to add review item for invalid target_text in ${fileName} for ${languageName}:`, revErr); }
                       continue;
                   }
                   try {
                       const existing: LogEntry | null = await findLogEntryByTarget(languageName, item.target_text);
                       if (existing) {
                           const isPotentialHomonym = 
                               existing.native_text && existing.native_text.trim() !== '' &&
                               item.native_text && item.native_text.trim() !== '' &&
                               existing.native_text.trim().toLowerCase() !== item.native_text.trim().toLowerCase();

                           if (isPotentialHomonym) {
                               log.warn(`Potential homonym conflict for "${item.target_text}" (Existing ID: ${existing.id}). Existing native: "${existing.native_text}", New AI native: "${item.native_text}". Creating review item.`);
                               const reviewData: ReviewItemData = {
                                   review_type: 'duplicate', // Using 'duplicate' but with specific suggestion
                                   target_text: item.target_text,
                                   native_text: item.native_text, // AI's proposed native text
                                   ai_suggestion: `Potential homonym: Existing entry (ID: ${existing.id}) for "${item.target_text}" has native text: "${existing.native_text}". AI proposed a different native text: "${item.native_text}". Please review.`,
                                   original_snippet: item.original_snippet || item.target_text.substring(0,500),
                                   related_log_entry_id: existing.id,
                                   ai_extracted_kanji_form: item.kanji_form,
                                   ai_extracted_kana_form: item.kana_form,
                                   ai_extracted_romanization: item.romanization,
                                   category_guess: item.category_guess,
                                   source_note_processed_id: sourceNoteId
                               };
                               await addReviewItem(languageName, reviewData);
                               itemsForReview++;
                               continue; // Skip merging for this item, let user resolve homonym
                           } else {
                               // Not a homonym conflict, proceed with merge logic
                               const updates: Partial<LogEntryData> = {};
                               let madeUpdate = false;

                               if ((!existing.native_text || existing.native_text.trim() === '') && item.native_text) { updates.native_text = item.native_text; madeUpdate = true; }
                               if ((!existing.category || existing.category.trim() === '') && item.category_guess) { updates.category = item.category_guess; madeUpdate = true; }
                               if (item.notes && (!existing.notes || item.notes.length > (existing.notes || '').length)) { updates.notes = item.notes; madeUpdate = true; }
                               if ((!existing.example_sentence || existing.example_sentence.trim() === '') && item.example_sentence) { updates.example_sentence = item.example_sentence; madeUpdate = true; }
                               if ((!existing.kanji_form || existing.kanji_form.trim() === '') && item.kanji_form) { updates.kanji_form = item.kanji_form; madeUpdate = true; }
                               if ((!existing.kana_form || existing.kana_form.trim() === '') && item.kana_form) { updates.kana_form = item.kana_form; madeUpdate = true; }
                               if ((!existing.romanization || existing.romanization.trim() === '') && item.romanization) { updates.romanization = item.romanization; madeUpdate = true; }
                               if ((!existing.writing_system_note || existing.writing_system_note.trim() === '') && item.writing_system_note) { updates.writing_system_note = item.writing_system_note; madeUpdate = true; }
                               
                               if (madeUpdate && Object.keys(updates).length > 0) {
                                   await updateLogEntry(languageName, existing.id, updates);
                                   entriesUpdated++;
                                   log.info(`Merged new AI data into existing entry ID ${existing.id} ('${item.target_text}'). Updates: ${JSON.stringify(updates)}`);
                               } else {
                                   log.info(`Duplicate item for target "${item.target_text}" (ID ${existing.id}), no new information to merge (or not a homonym conflict). Skipping.`);
                               }
                           }
                       } else { // No existing entry, add new
                           const entryData: LogEntryData = {
                                target_text: item.target_text,
                                native_text: item.native_text ?? null,
                                category: item.category_guess ?? 'Other',
                                notes: item.notes ?? null,
                                example_sentence: item.example_sentence ?? null,
                                kanji_form: item.kanji_form ?? null,
                                kana_form: item.kana_form ?? null,
                                romanization: item.romanization ?? null,
                                writing_system_note: item.writing_system_note ?? null
                            };
                           try {
                               await addLogEntry(languageName, entryData); entriesAdded++;
                           } catch (addErr: any) { 
                               log.error(`Error adding new log entry for ${fileName} (target: ${item.target_text}), creating review item:`, addErr);
                               const reviewData: ReviewItemData = {
                                    review_type: 'parsing_assist',
                                    target_text: item.target_text, native_text: item.native_text,
                                    original_snippet: item.original_snippet ?? item.target_text.substring(0,500),
                                    ai_suggestion: `Failed to add entry: ${addErr.message}. AI data: cat='${item.category_guess}', kanji='${item.kanji_form}'`,
                                    source_note_processed_id: sourceNoteId
                                };
                               await addReviewItem(languageName, reviewData); itemsForReview++;
                           }
                       }
                   } catch (dbOpError: any) {
                        log.error(`Database error during item processing for ${fileName} (target: ${item.target_text}):`, dbOpError);
                        const reviewData: ReviewItemData = {
                            review_type: 'parsing_assist',
                            target_text: item.target_text,
                            original_snippet: item.original_snippet ?? `Error processing item. Raw: ${JSON.stringify(item).substring(0,350)}`,
                            ai_suggestion: `DB operation error: ${dbOpError.message}`,
                            source_note_processed_id: sourceNoteId
                        };
                        try { await addReviewItem(languageName, reviewData); itemsForReview++; } catch (revErr) { log.error("Failed to add review item for DB error:", revErr); }
                   }
               }
           } else if (!analysisResult.error) { 
               log.warn(`AI Analysis returned no items for ${fileName}. Creating a review item.`);
               const reviewData: ReviewItemData = { review_type: 'parsing_assist', original_snippet: rawText.substring(0, 1000), ai_suggestion: `AI returned no items. Check content or if the AI prompt needs adjustment.`, source_note_processed_id: sourceNoteId };
               await addReviewItem(languageName, reviewData); itemsForReview++;
           }

            log.info(`--- Finished processSingleFile: ${fileName} for ${languageName} (Added: ${entriesAdded}, Updated: ${entriesUpdated}, Reviewed: ${itemsForReview}) ---`);
            return { added: entriesAdded, reviewed: itemsForReview, updated: entriesUpdated, fileName };

       } catch (error: any) { 
            const errorMsg = `Catastrophic failure processing ${fileName} for ${languageName}: ${error.message}`;
            log.error(errorMsg, error); 
            try { 
               const reviewData: ReviewItemData = { review_type: 'parsing_assist', original_snippet: rawText.substring(0, 1000) || filePath, ai_suggestion: `File processing error: ${error.message}`, source_note_processed_id: sourceNoteId };
               await addReviewItem(languageName, reviewData); itemsForReview++;
            } catch (revErr) { log.error("Failed to add review item for catastrophic file error:", revErr); }
            return { added: 0, reviewed: itemsForReview, updated: 0, error: errorMsg, fileName }; 
       }
  }

  ipcMain.handle('notes:processFiles', async (_event, languageName: string, filePaths: string[]) => {
       log.info(`IPC: Handling notes:processFiles (${filePaths.length} files, Lang: ${languageName}) with concurrent processing.`);
       if (!languageName || !Array.isArray(filePaths) || filePaths.length === 0) {
            throw new Error('Invalid arguments for processing files.');
       }

       let totalEntriesAdded = 0;
       let totalItemsForReview = 0;
       let totalEntriesUpdated = 0; 
       const collectedErrorMessages: string[] = [];
       const rateLimitedFilePathsQueue: string[] = [];
       let filesProcessedSuccessfullyCount = 0;
       const attemptedFileNamesLogInitialPass: string[] = [];

       // --- Initial Processing Pass (Concurrent) ---
       log.info(`Starting initial concurrent processing pass for ${filePaths.length} files for language ${languageName}.`);
       let processingPromises = filePaths.map(filePath => processSingleFile(filePath, languageName));
       let settledResults = await Promise.allSettled(processingPromises);

       settledResults.forEach((result, index) => {
           const originalFilePath = filePaths[index];
           const fileNameForLog = path.basename(originalFilePath);
           attemptedFileNamesLogInitialPass.push(fileNameForLog);

           if (result.status === 'fulfilled') {
               const fileResult = result.value;
               totalEntriesAdded += fileResult.added;
               totalItemsForReview += fileResult.reviewed;
               totalEntriesUpdated += fileResult.updated;


               if (fileResult.skippedDueToRateLimit) {
                   log.warn(`File ${fileResult.fileName} hit rate limit on initial pass. Queuing for retry.`);
                   rateLimitedFilePathsQueue.push(originalFilePath);
               } else if (fileResult.error) {
                   log.error(`Error processing ${fileResult.fileName} in initial pass: ${fileResult.error}`);
                   collectedErrorMessages.push(fileResult.error);
               } else {
                   filesProcessedSuccessfullyCount++;
               }
           } else { // Promise was rejected
               const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
               const errorMsg = `Catastrophic failure processing ${fileNameForLog} in initial pass (promise rejected): ${reason}`;
               log.error(errorMsg, result.reason);
               collectedErrorMessages.push(errorMsg);
           }
       });
       log.info(`Initial concurrent pass complete. Files attempted: ${attemptedFileNamesLogInitialPass.length}. Files queued for rate limit retry: ${rateLimitedFilePathsQueue.length}. Files processed without catastrophic error so far: ${filesProcessedSuccessfullyCount}`);
       
       // --- Secondary Retry Pass for Rate-Limited Files (Concurrent) ---
       let finalRateLimitSkips = 0;
       const successfullyRetriedFileNames: string[] = [];

       if (rateLimitedFilePathsQueue.length > 0) {
           const retryDelayMs = 60000; 
           log.info(`Waiting ${retryDelayMs / 1000}s before retrying ${rateLimitedFilePathsQueue.length} rate-limited files (concurrently)...`);
           await new Promise(resolve => setTimeout(resolve, retryDelayMs));
           
           log.info(`Starting concurrent retry pass for ${rateLimitedFilePathsQueue.length} rate-limited files.`);
           processingPromises = rateLimitedFilePathsQueue.map(filePath => processSingleFile(filePath, languageName));
           settledResults = await Promise.allSettled(processingPromises);
           
           settledResults.forEach((result, index) => {
               const retriedFilePath = rateLimitedFilePathsQueue[index];
               const fileNameForLog = path.basename(retriedFilePath);

               if (result.status === 'fulfilled') {
                   const fileResult = result.value;
                   totalEntriesAdded += fileResult.added;
                   totalItemsForReview += fileResult.reviewed;
                   totalEntriesUpdated += fileResult.updated;

                   if (fileResult.skippedDueToRateLimit) {
                       log.warn(`File ${fileResult.fileName} STILL rate-limited after retry pass.`);
                       finalRateLimitSkips++;
                       collectedErrorMessages.push(`File ${fileResult.fileName} failed due to persistent API rate limits after retry.`);
                   } else if (fileResult.error) {
                       log.error(`Error processing ${fileResult.fileName} in retry pass: ${fileResult.error}`);
                       collectedErrorMessages.push(fileResult.error); 
                   } else {
                       successfullyRetriedFileNames.push(fileResult.fileName);
                       filesProcessedSuccessfullyCount++;
                   }
               } else { 
                   const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
                   const errorMsg = `Catastrophic failure processing ${fileNameForLog} in retry pass (promise rejected): ${reason}`;
                   log.error(errorMsg, result.reason);
                   collectedErrorMessages.push(errorMsg);
                   finalRateLimitSkips++; 
               }
           });
           log.info(`Concurrent retry pass complete. Successfully retried: ${successfullyRetriedFileNames.length}. Files ultimately skipped/failed in retry pass: ${finalRateLimitSkips}`);
       }

       // --- Construct Final Message ---
       const totalFilesAttempted = filePaths.length;

       let finalMessage = `Batch processing complete for ${languageName}. `;
       finalMessage += `Attempted: ${totalFilesAttempted} files. Files processed without fatal errors: ${filesProcessedSuccessfullyCount}. `;
       finalMessage += `Total entries added: ${totalEntriesAdded}. Total entries updated/merged: ${totalEntriesUpdated}. Total items for review: ${totalItemsForReview}.`;

       if (successfullyRetriedFileNames.length > 0) {
           finalMessage += ` Of these, ${successfullyRetriedFileNames.length} files were successfully processed after an initial rate limit: (${successfullyRetriedFileNames.join(', ')}).`;
       }
       if (finalRateLimitSkips > 0) {
           finalMessage += ` Files ultimately skipped or failed due to persistent API rate limits after all retries: ${finalRateLimitSkips}.`;
       }
       
       const otherErrorMessages = collectedErrorMessages.filter(e => !e.includes("persistent API rate limits after retry"));
       if (otherErrorMessages.length > 0) {
         finalMessage += ` Other errors encountered for ${otherErrorMessages.length} files (see logs for details). First error: ${otherErrorMessages[0]}`;
       }

       log.info(`Final batch result: ${finalMessage}`);
       const overallSuccess = collectedErrorMessages.length === 0 && finalRateLimitSkips === 0;
       return { 
           success: overallSuccess, 
           message: finalMessage, 
           added: totalEntriesAdded,
           updated: totalEntriesUpdated, 
           reviewed: totalItemsForReview, 
           rateLimitSkips: finalRateLimitSkips 
       };
  });

  // --- Source Notes Processed Handlers ---
   ipcMain.handle('db:addSourceNoteProcessed', async (_event, languageName: string, data: SourceNoteProcessedData) => {
     console.log(`IPC: Handling db:addSourceNoteProcessed for ${languageName}`);
     try {
       if (!languageName || !data || typeof data !== 'object') { throw new Error('Invalid source note data or language name provided.'); }
       return await addSourceNoteProcessed(languageName, data);
     } catch (error) { log.error(`Error handling db:addSourceNoteProcessed for ${languageName}:`, error); throw error; }
   });
   ipcMain.handle('db:getSourceNotesProcessed', async (_event, languageName: string, options: any) => {
        console.log(`IPC: Handling db:getSourceNotesProcessed (Lang: ${languageName}) with options:`, options);
        try {
            if (!languageName) { throw new Error('Invalid languageName for getSourceNotesProcessed.'); }
            return await getSourceNotesProcessed(languageName, options);
        } catch (error) { log.error(`Error handling db:getSourceNotesProcessed for ${languageName}:`, error); throw error; }
   });

  // --- Review Item Handlers ---
   ipcMain.handle('db:addReviewItem', async (_event, languageName: string, data: ReviewItemData) => {
     console.log(`IPC: Handling db:addReviewItem for ${languageName}`);
     try {
       if (!languageName || !data || typeof data !== 'object' || !data.review_type) { throw new Error('Invalid review item data or language name provided.'); }
       return await addReviewItem(languageName, data);
     } catch (error) { log.error(`Error handling db:addReviewItem for ${languageName}:`, error); throw error; }
   });
   ipcMain.handle('db:getReviewItems', async (_event, languageName: string, status?: ReviewStatus) => {
     console.log(`IPC: Handling db:getReviewItems (Lang: ${languageName}, Status: ${status ?? 'pending'})`);
     try {
       if (!languageName) { throw new Error('Invalid languageName for getReviewItems.'); }
       return await getReviewItems(languageName, status);
     } catch (error) { log.error(`Error handling db:getReviewItems for ${languageName}:`, error); throw error; }
   });
    ipcMain.handle('db:updateReviewItemStatus', async (_event, languageName: string, id: number, newStatus: ReviewStatus) => {
     console.log(`IPC: Handling db:updateReviewItemStatus (Lang: ${languageName}, ID: ${id}, Status: ${newStatus})`);
     try {
       if (!languageName || id == null || !newStatus || !['pending', 'resolved', 'ignored'].includes(newStatus)) { throw new Error('Invalid arguments for updateReviewItemStatus.'); }
       return await updateReviewItemStatus(languageName, id, newStatus);
     } catch (error) { log.error(`Error handling db:updateReviewItemStatus for ${languageName}, ID ${id}:`, error); throw error; }
   });
 	ipcMain.handle('db:deleteReviewItem', async (_event, languageName: string, id: number) => {
 		console.log(`IPC: Handling db:deleteReviewItem (Lang: ${languageName}, ID: ${id})`);
 		try {
 			if (!languageName || id == null) { throw new Error('Invalid arguments for deleteReviewItem.'); }
 			return await deleteReviewItem(languageName, id);
 		} catch (error) { log.error(`Error handling db:deleteReviewItem for ${languageName}, ID ${id}:`, error); throw error; }
 	});
 	ipcMain.handle('db:clearReviewItemsForLanguage', async (_event, languageName: string, status: ReviewStatus = 'pending') => {
 		console.log(`IPC: Handling db:clearReviewItemsForLanguage (Lang: ${languageName}, Status: ${status})`);
 		try {
 			if (!languageName) { throw new Error('Invalid languageName for clearReviewItemsForLanguage.'); }
 			const rowsAffected = await clearReviewItemsForLanguage(languageName, status);
 			return { success: true, rowsAffected };
 		} catch (error) { log.error(`Error handling db:clearReviewItemsForLanguage for ${languageName}, status ${status}:`, error); throw error; }
 	});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { app.quit(); }
});

app.on('before-quit', async (event) => {
  log.info('App is about to quit. Closing all database connections...');
  try {
    await closeAllDatabases();
    log.info('Finished closing database connections.');
  }
  catch (error) {
    log.error('Error during database closing process:', error);
  }
});