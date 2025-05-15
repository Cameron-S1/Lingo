import { contextBridge, ipcRenderer } from 'electron';
// Import necessary types (Language type is removed)
import type {
    // Language specific types
    LogEntry,
    LogEntryData,
    GetLogEntriesOptions, // Re-exporting this type if used in frontend
    SourceNoteProcessed,
    SourceNoteProcessedData,
    ReviewItem,
    ReviewItemData,
    ReviewStatus,
    ReviewType
    // Global settings types are simple key/value, usually not needed here
} from './database';

// Define the shape of the updated API
export interface ElectronAPI {
  // Basic IPC (keep for flexibility)
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
  once: (channel: string, listener: (...args: any[]) => void) => () => void;

  // Language Management (NEW)
  listAvailableLanguages: () => Promise<string[]>;
  createLanguage: (languageName: string) => Promise<{ success: boolean; languageName: string }>;
  deleteLanguageLog: (languageName: string) => Promise<{ success: boolean }>; // Deletes the DB file

  // Global Settings operations
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<boolean>; 

  // Language UI Settings operations (NEW)
  getLanguageUISetting: (languageName: string, key: string) => Promise<string | null>;
  setLanguageUISetting: (languageName: string, key: string, value: string) => Promise<void>;

  // Log Entry operations (ADAPTED: takes languageName)
  addLogEntry: (languageName: string, data: LogEntryData) => Promise<number>;
  findLogEntryByTarget: (languageName: string, targetText: string) => Promise<LogEntry | null>;
  getLogEntries: (languageName: string, options?: GetLogEntriesOptions) => Promise<LogEntry[]>; 
  getLogEntriesByIds: (languageName: string, entryIds: number[]) => Promise<LogEntry[]>;
  updateLogEntry: (languageName: string, id: number, updates: Partial<LogEntryData>) => Promise<boolean>;
  deleteLogEntry: (languageName: string, id: number) => Promise<boolean>;
  clearLogEntriesForLanguage: (languageName: string) => Promise<{ success: boolean; rowsAffected: number }>; 

  // Dialog/File operations 
  showOpenDialog: () => Promise<string[] | null>;

  // Note Processing operations (ADAPTED: takes languageName)
  processNoteFiles: (languageName: string, filePaths: string[]) => Promise<{success: boolean; message: string; added: number; reviewed: number }>;

  // Source Note Processed operations (ADAPTED: takes languageName)
  addSourceNoteProcessed: (languageName: string, data: SourceNoteProcessedData) => Promise<number>;
  getSourceNotesProcessed: (languageName: string, options?: any) => Promise<SourceNoteProcessed[]>; 

  // Review Item operations (ADAPTED: takes languageName)
  addReviewItem: (languageName: string, data: ReviewItemData) => Promise<number>;
  getReviewItems: (languageName: string, status?: ReviewStatus) => Promise<ReviewItem[]>;
  updateReviewItemStatus: (languageName: string, id: number, newStatus: ReviewStatus) => Promise<boolean>;
  deleteReviewItem: (languageName: string, id: number) => Promise<boolean>;
  clearReviewItemsForLanguage: (languageName: string, status?: ReviewStatus) => Promise<{ success: boolean; rowsAffected: number }>; 
}

const api: ElectronAPI = {
  // Basic IPC
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  send: (channel: string, ...args: any[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args);
    ipcRenderer.on(channel, subscription);
    return () => { ipcRenderer.removeListener(channel, subscription); };
  },
  once: (channel: string, listener: (...args: any[]) => void) => {
     const subscription = (_event: Electron.IpcRendererEvent, ...args: any[]) => listener(...args);
    ipcRenderer.once(channel, subscription);
     return () => { ipcRenderer.removeListener(channel, subscription); };
  },

  // --- Language Management exposed to Renderer ---
  listAvailableLanguages: () => ipcRenderer.invoke('languages:listAvailable'),
  createLanguage: (languageName: string) => ipcRenderer.invoke('languages:create', languageName),
  deleteLanguageLog: (languageName: string) => ipcRenderer.invoke('languages:deleteLog', languageName),

  // --- Global Settings exposed to Renderer ---
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key), 
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value), 

  // --- Language UI Settings exposed to Renderer ---
  getLanguageUISetting: (languageName: string, key: string) => ipcRenderer.invoke('db:getLanguageUISetting', languageName, key),
  setLanguageUISetting: (languageName: string, key: string, value: string) => ipcRenderer.invoke('db:setLanguageUISetting', languageName, key, value),

  // --- Language-Specific DB Operations exposed to Renderer ---
  // Log Entries
  addLogEntry: (languageName: string, data: LogEntryData) => ipcRenderer.invoke('db:addLogEntry', languageName, data),
  findLogEntryByTarget: (languageName: string, targetText: string) => ipcRenderer.invoke('db:findLogEntryByTarget', languageName, targetText),
  getLogEntries: (languageName: string, options?: GetLogEntriesOptions) => ipcRenderer.invoke('db:getLogEntries', languageName, options),
  getLogEntriesByIds: (languageName: string, entryIds: number[]) => ipcRenderer.invoke('db:getLogEntriesByIds', languageName, entryIds),
  updateLogEntry: (languageName: string, id: number, updates: Partial<LogEntryData>) => ipcRenderer.invoke('db:updateLogEntry', languageName, id, updates),
  deleteLogEntry: (languageName: string, id: number) => ipcRenderer.invoke('db:deleteLogEntry', languageName, id),
  clearLogEntriesForLanguage: (languageName: string) => ipcRenderer.invoke('db:clearLogEntriesForLanguage', languageName),

  // Dialog/File Operations
  showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),

  // Note Processing Operations
  processNoteFiles: (languageName: string, filePaths: string[]) => ipcRenderer.invoke('notes:processFiles', languageName, filePaths),

  // Source Note Processed Operations
  addSourceNoteProcessed: (languageName: string, data: SourceNoteProcessedData) => ipcRenderer.invoke('db:addSourceNoteProcessed', languageName, data),
  getSourceNotesProcessed: (languageName: string, options?: any) => ipcRenderer.invoke('db:getSourceNotesProcessed', languageName, options),

  // Review Item Operations
  addReviewItem: (languageName: string, data: ReviewItemData) => ipcRenderer.invoke('db:addReviewItem', languageName, data),
  getReviewItems: (languageName: string, status?: ReviewStatus) => ipcRenderer.invoke('db:getReviewItems', languageName, status),
  updateReviewItemStatus: (languageName: string, id: number, newStatus: ReviewStatus) => ipcRenderer.invoke('db:updateReviewItemStatus', languageName, id, newStatus),
  deleteReviewItem: (languageName: string, id: number) => ipcRenderer.invoke('db:deleteReviewItem', languageName, id),
  clearReviewItemsForLanguage: (languageName: string, status?: ReviewStatus) => ipcRenderer.invoke('db:clearReviewItemsForLanguage', languageName, status),
};

contextBridge.exposeInMainWorld('electronAPI', api);

console.log('Preload script loaded and electronAPI exposed.');