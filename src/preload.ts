import { contextBridge, ipcRenderer } from 'electron';
// Import all necessary types from database module
import type {
    Language,
    LogEntry,
    LogEntryData,
    SourceNoteProcessed,
    SourceNoteProcessedData,
    ReviewItem,
    ReviewItemData,
    ReviewStatus
} from './database';

// Define the shape of the API we're exposing
export interface ElectronAPI {
  // Basic IPC
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, listener: (...args: any[]) => void) => () => void;
  once: (channel: string, listener: (...args: any[]) => void) => () => void;
  // Language operations
  getLanguages: () => Promise<Language[]>;
  addLanguage: (name: string, nativeName?: string) => Promise<number>;
  getLanguageIdByName: (name: string) => Promise<number | null>;
  // Settings operations
  getSetting: (key: string) => Promise<string | null>;
  setSetting: (key: string, value: string) => Promise<boolean>;
  // Log Entry operations
  addLogEntry: (data: LogEntryData) => Promise<number>;
  findLogEntryByTarget: (languageId: number, targetText: string) => Promise<LogEntry | null>;
  getLogEntries: (languageId: number, options?: any) => Promise<LogEntry[]>;
  getLogEntriesByIds: (entryIds: number[]) => Promise<LogEntry[]>; // Add this line
  updateLogEntry: (id: number, updates: Partial<LogEntryData>) => Promise<boolean>;
  deleteLogEntry: (id: number) => Promise<boolean>;
  clearLogEntriesForLanguage: (languageId: number) => Promise<{ success: boolean; rowsAffected: number }>; // Add this line
  // Dialog/File operations
  showOpenDialog: () => Promise<string[] | null>; // Updated: Returns array of paths or null
  // Note Processing operations
  processNoteFiles: (filePaths: string[], languageId: number) => Promise<{success: boolean; message: string; added: number; reviewed: number }>; // Updated: Renamed, takes array
  // Source Note Processed operations
  addSourceNoteProcessed: (data: SourceNoteProcessedData) => Promise<number>;
  getSourceNotesProcessed: (languageId: number, options?: any) => Promise<SourceNoteProcessed[]>;
  // Review Item operations
  addReviewItem: (data: ReviewItemData) => Promise<number>;
  getReviewItems: (languageId: number, status?: ReviewStatus) => Promise<ReviewItem[]>;
  updateReviewItemStatus: (id: number, newStatus: ReviewStatus) => Promise<boolean>;
  deleteReviewItem: (id: number) => Promise<boolean>; // Add this line
  clearReviewItemsForLanguage: (languageId: number, status?: ReviewStatus) => Promise<{ success: boolean; rowsAffected: number }>; // Add this line
}

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: ElectronAPI = {
  // Basic IPC examples
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

  // --- Database Operations exposed to Renderer ---
  // Languages
  getLanguages: () => ipcRenderer.invoke('db:getLanguages'),
  addLanguage: (name: string, nativeName?: string) => ipcRenderer.invoke('db:addLanguage', name, nativeName),
  getLanguageIdByName: (name: string) => ipcRenderer.invoke('db:getLanguageIdByName', name),
  // Settings
  getSetting: (key: string) => ipcRenderer.invoke('db:getSetting', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('db:setSetting', key, value),
  // Log Entries
  addLogEntry: (data: LogEntryData) => ipcRenderer.invoke('db:addLogEntry', data),
  findLogEntryByTarget: (languageId: number, targetText: string) => ipcRenderer.invoke('db:findLogEntryByTarget', languageId, targetText),
  getLogEntries: (languageId: number, options?: any) => ipcRenderer.invoke('db:getLogEntries', languageId, options),
  getLogEntriesByIds: (entryIds: number[]) => ipcRenderer.invoke('db:getLogEntriesByIds', entryIds), // Add this line
  updateLogEntry: (id: number, updates: Partial<LogEntryData>) => ipcRenderer.invoke('db:updateLogEntry', id, updates),
  deleteLogEntry: (id: number) => ipcRenderer.invoke('db:deleteLogEntry', id),
  clearLogEntriesForLanguage: (languageId: number) => ipcRenderer.invoke('db:clearLogEntriesForLanguage', languageId), // Add this line

  // --- Dialog/File Operations ---
  showOpenDialog: () => ipcRenderer.invoke('dialog:showOpenDialog'),

  // --- Note Processing Operations ---
  processNoteFiles: (filePaths: string[], languageId: number) => ipcRenderer.invoke('notes:processFiles', filePaths, languageId), // Updated: Use new channel, pass array

  // --- Source Note Processed Operations ---
  addSourceNoteProcessed: (data: SourceNoteProcessedData) => ipcRenderer.invoke('db:addSourceNoteProcessed', data),
  getSourceNotesProcessed: (languageId: number, options?: any) => ipcRenderer.invoke('db:getSourceNotesProcessed', languageId, options),

  // --- Review Item Operations ---
  addReviewItem: (data: ReviewItemData) => ipcRenderer.invoke('db:addReviewItem', data),
  getReviewItems: (languageId: number, status?: ReviewStatus) => ipcRenderer.invoke('db:getReviewItems', languageId, status),
  updateReviewItemStatus: (id: number, newStatus: ReviewStatus) => ipcRenderer.invoke('db:updateReviewItemStatus', id, newStatus),
  deleteReviewItem: (id: number) => ipcRenderer.invoke('db:deleteReviewItem', id), // Add this line
  clearReviewItemsForLanguage: (languageId: number, status?: ReviewStatus) => ipcRenderer.invoke('db:clearReviewItemsForLanguage', languageId, status), // Add this line

  // --- Add more exposed functions for other DB/System operations here ---
};

contextBridge.exposeInMainWorld('electronAPI', api);

console.log('Preload script loaded and electronAPI exposed.');