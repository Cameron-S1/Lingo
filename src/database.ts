import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron'; 
import fs from 'fs-extra'; 

// --- Furigana Detail Type ---
export interface FuriganaDetail {
  char: string;
  reading: string;
}

// --- Database Paths ---
const userDataPath = app.getPath('userData');
const baseLanguagesPath = path.join(userDataPath, 'languages'); 
const globalSettingsDbPath = path.join(userDataPath, 'global-settings.sqlite');
fs.ensureDirSync(baseLanguagesPath); 

console.log(`User data path: ${userDataPath}`);
console.log(`Base languages path: ${baseLanguagesPath}`);
console.log(`Global settings database path: ${globalSettingsDbPath}`);

const languageConnections = new Map<string, sqlite3.Database>();
let globalSettingsDB: sqlite3.Database | null = null;

const promisifiedDbRun = (dbInstance: sqlite3.Database, sql: string, params: any[] = []): Promise<void> => {
    return new Promise((resolve, reject) => {
        dbInstance.run(sql, params, function(err) { 
            if (err) { console.error(`Error running SQL: ${sql}`, params, err.message); reject(err); } 
            else { resolve(); }
        });
    });
};

const promisifiedDbAll = <T>(dbInstance: sqlite3.Database, sql: string, params: any[] = []): Promise<T[]> => {
  return new Promise((resolve, reject) => {
    dbInstance.all(sql, params, (err, rows: T[]) => {
      if (err) { console.error(`Error running SQL (all): ${sql}`, params, err.message); reject(err); }
      else { resolve(rows); }
    });
  });
};

const initializeGlobalSettingsDB = (): Promise<sqlite3.Database> => { /* ... (same as before) ... */ 
  return new Promise((resolve, reject) => {
    if (globalSettingsDB) { resolve(globalSettingsDB); return; }
    const db = new sqlite3.Database(globalSettingsDbPath, (err) => {
      if (err) { console.error('Error opening global settings database', err.message); reject(err); } 
      else {
        console.log('Connected to the global settings SQLite database.');
        promisifiedDbRun(db, 'PRAGMA foreign_keys = ON;')
          .then(() => initializeGlobalSettingsSchema(db))
          .then(() => { globalSettingsDB = db; resolve(db); })
          .catch(reject);
      }
    });
  });
};

const initializeGlobalSettingsSchema = async (dbInstance: sqlite3.Database): Promise<void> => { /* ... (same as before) ... */ 
    await promisifiedDbRun(dbInstance, `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT)`);
    console.log("'settings' table in global DB checked/created.");
};

initializeGlobalSettingsDB().catch(err => console.error("Failed to initialize global settings DB on startup:", err));

const initializeLanguageDBSchema = async (dbInstance: sqlite3.Database): Promise<void> => {
    console.log('Initializing schema for a language database...');
    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_text TEXT NOT NULL,
        native_text TEXT,
        category TEXT,
        notes TEXT,
        example_sentence TEXT,
        kanji_form TEXT,
        kana_form TEXT,
        romanization TEXT,
        writing_system_note TEXT,
        -- furigana_details TEXT, -- Column will be added via ALTER TABLE if not exists
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("'log_entries' table checked/created.");

    // Migration: Add furigana_details column to log_entries if it doesn't exist
    try {
        const tableInfo = await promisifiedDbAll<{name: string}>(dbInstance, `PRAGMA table_info(log_entries);`);
        const hasFuriganaColumn = tableInfo.some(column => column.name === 'furigana_details');
        if (!hasFuriganaColumn) {
            await promisifiedDbRun(dbInstance, `ALTER TABLE log_entries ADD COLUMN furigana_details TEXT;`);
            console.log("Added 'furigana_details' column to 'log_entries' table.");
        } else {
            console.log("'furigana_details' column already exists in 'log_entries' table.");
        }
    } catch (migrationError) {
        console.error("Error during 'furigana_details' column migration for 'log_entries':", migrationError);
        // Depending on the error, might want to throw or handle differently
    }

    await promisifiedDbRun(dbInstance, `
        CREATE TRIGGER IF NOT EXISTS update_log_entry_timestamp
        AFTER UPDATE ON log_entries
        FOR EACH ROW
        BEGIN
            UPDATE log_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
    console.log("'log_entries' update trigger checked/created.");

    await promisifiedDbRun(dbInstance, `CREATE INDEX IF NOT EXISTS idx_log_entries_target ON log_entries (target_text);`);
    console.log("Index on 'log_entries' checked/created.");

    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS source_notes_processed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT, source_line_ref TEXT, date_context TEXT, original_snippet TEXT,
        log_entry_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL
      )`);
    console.log("'source_notes_processed' table checked/created.");

    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, review_type TEXT NOT NULL, target_text TEXT,
        native_text TEXT, original_snippet TEXT, ai_suggestion TEXT, status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME,
        source_note_processed_id INTEGER, related_log_entry_id INTEGER,
        ai_extracted_kanji_form TEXT, ai_extracted_kana_form TEXT, ai_extracted_romanization TEXT,
        ai_extracted_writing_system_note TEXT, category_guess TEXT,
        FOREIGN KEY (source_note_processed_id) REFERENCES source_notes_processed (id) ON DELETE SET NULL,
        FOREIGN KEY (related_log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL
      )`);
    console.log("'review_items' table checked/created.");

    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS language_ui_settings (
        key TEXT PRIMARY KEY NOT NULL, value TEXT
      )`);
    console.log("'language_ui_settings' table checked/created.");
    
    console.log('Language database schema initialization process completed.');
  };

const sanitizeLanguageNameForPath = (languageName: string): string => languageName.toLowerCase().replace(/[^a-z0-9-]/g, '_');

export const getDB = (languageName: string): Promise<sqlite3.Database> => {
  return new Promise(async (resolve, reject) => {
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    if (languageConnections.has(sanitizedName)) {
      resolve(languageConnections.get(sanitizedName)!); return;
    }
    const languageDirPath = path.join(baseLanguagesPath, sanitizedName);
    const languageDbPath = path.join(languageDirPath, `${sanitizedName}.sqlite`);
    try { await fs.ensureDir(languageDirPath); } 
    catch (dirErr) { reject(dirErr); return; }
    
    const db = new sqlite3.Database(languageDbPath, async (err) => {
      if (err) { reject(err); } 
      else {
        try {
          await promisifiedDbRun(db, 'PRAGMA foreign_keys = ON;');
          await initializeLanguageDBSchema(db);
          languageConnections.set(sanitizedName, db);
          resolve(db);
        } catch (initErr) {
          db.close(closeErr => { if (closeErr) console.error(`Error closing DB for ${languageName} after init failure:`, closeErr); });
          reject(initErr);
        }
      }
    });
  });
};

export const closeLanguageDB = (languageName: string): Promise<void> => { /* ... (same as before) ... */ 
  return new Promise((resolve, reject) => {
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    const db = languageConnections.get(sanitizedName);
    if (db) {
      db.close((err) => {
        if (err) { reject(err); } 
        else { languageConnections.delete(sanitizedName); resolve(); }
      });
    } else { resolve(); }
  });
};

export const closeAllDatabases = async (): Promise<void> => { /* ... (same as before) ... */ 
  const closePromises = Array.from(languageConnections.keys()).map(key => closeLanguageDB(key));
  if (globalSettingsDB) {
    closePromises.push(new Promise((res, rej) => globalSettingsDB!.close(err => err ? rej(err) : (globalSettingsDB=null, res()))));
  }
  try { await Promise.all(closePromises); } catch (e) { console.error("Error closing DBs:", e); }
};

export const getSetting = (key: string): Promise<string | null> => { /* ... (same as before) ... */ 
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initializeGlobalSettingsDB();
      db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row: any) => {
        if (err) { reject(err); } else { resolve(row ? row.value : null); }
      });
    } catch (error) { reject(error); }
  });
};

export const setSetting = (key: string, value: string): Promise<void> => { /* ... (same as before) ... */ 
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initializeGlobalSettingsDB();
      db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value], (err) => {
        if (err) { reject(err); } else { resolve(); }
      });
    } catch (error) { reject(error); }
  });
};

// --- Data Types (Language Specific) ---
export interface LogEntryData {
    target_text: string;
    native_text?: string | null;
    category?: string | null;
    notes?: string | null;
    example_sentence?: string | null;
    kanji_form?: string | null;
    kana_form?: string | null;
    romanization?: string | null;
    writing_system_note?: string | null;
    furigana_details?: FuriganaDetail[] | null; 
}

export interface LogEntry extends LogEntryData {
    id: number;
    created_at: string;
    updated_at: string;
}

export interface SourceNoteProcessed { /* ... (same as before) ... */ 
    id: number; source_file: string | null; source_line_ref: string | null; date_context: string | null;
    original_snippet: string | null; log_entry_id: number | null; created_at: string;
}
export interface SourceNoteProcessedData { /* ... (same as before) ... */ 
    source_file?: string | null; source_line_ref?: string | null; date_context?: string | null;
    original_snippet?: string | null; log_entry_id?: number | null;
}
export type ReviewType = 'duplicate' | 'uncategorized' | 'parsing_assist';
export type ReviewStatus = 'pending' | 'resolved' | 'ignored';
export interface ReviewItem { /* ... (same as before) ... */ 
  id: number; review_type: ReviewType; target_text: string | null; native_text: string | null;
  original_snippet: string | null; ai_suggestion: string | null; status: ReviewStatus; created_at: string;
  resolved_at: string | null; source_note_processed_id: number | null; related_log_entry_id: number | null;
  ai_extracted_kanji_form?: string | null; ai_extracted_kana_form?: string | null;
  ai_extracted_romanization?: string | null; ai_extracted_writing_system_note?: string | null;
  category_guess?: string | null;
}
export interface ReviewItemData { /* ... (same as before) ... */ 
  review_type: ReviewType; target_text?: string | null; native_text?: string | null;
  original_snippet?: string | null; ai_suggestion?: string | null; source_note_processed_id?: number | null;
  related_log_entry_id?: number | null; ai_extracted_kanji_form?: string | null;
  ai_extracted_kana_form?: string | null; ai_extracted_romanization?: string | null;
  ai_extracted_writing_system_note?: string | null; category_guess?: string | null;
}
export interface GetLogEntriesOptions { /* ... (same as before) ... */ 
    category?: string; searchTerm?: string;
    sortBy?: 'id' | 'created_at' | 'updated_at' | 'target_text' | 'native_text' | 'category' | 'kanji_form' | 'kana_form' | 'romanization';
    sortOrder?: 'ASC' | 'DESC'; limit?: number; offset?: number;
}

const parseFuriganaDetails = (row: any): FuriganaDetail[] | null => {
  if (row && row.furigana_details && typeof row.furigana_details === 'string') {
    try { return JSON.parse(row.furigana_details); } 
    catch (e) { console.error('Failed to parse furigana_details from DB:', e, "Raw:", row.furigana_details); return null; }
  }
  return null;
};

export const addLogEntry = (languageName: string, data: LogEntryData): Promise<number> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `
                INSERT INTO log_entries (
                    target_text, native_text, category, notes, example_sentence,
                    kanji_form, kana_form, romanization, writing_system_note, furigana_details, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) 
            `;
            const params = [
                data.target_text, data.native_text ?? null, data.category ?? null,
                data.notes ?? null, data.example_sentence ?? null,
                data.kanji_form ?? null, data.kana_form ?? null, data.romanization ?? null, 
                data.writing_system_note ?? null,
                data.furigana_details ? JSON.stringify(data.furigana_details) : null 
            ];
            db.run(sql, params, function (err) {
                if (err) { console.error(`Error adding log entry for ${languageName}:`, err.message, "SQL:", sql, "Params:", params); reject(err); } // Added more log details
                else { resolve(this.lastID); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const findLogEntryByTarget = (languageName: string, targetText: string): Promise<LogEntry | null> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            db.get(`SELECT * FROM log_entries WHERE target_text = ?`, [targetText], (err, row: any) => {
                 if (err) { reject(err); }
                 else { 
                    if (row) { row.furigana_details = parseFuriganaDetails(row); }
                    resolve(row as LogEntry ?? null); 
                 }
            });
       } catch (dbErr) { reject(dbErr); }
    });
};

export const getLogEntries = (languageName: string, options: GetLogEntriesOptions = {}): Promise<LogEntry[]> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            let sql = `SELECT * FROM log_entries WHERE 1=1`;
            const params: (string | number)[] = [];
            if (options.category) { sql += ` AND category = ?`; params.push(options.category); }
            if (options.searchTerm) {
                sql += ` AND (target_text LIKE ? OR native_text LIKE ? OR notes LIKE ? OR example_sentence LIKE ? OR kanji_form LIKE ? OR kana_form LIKE ? OR romanization LIKE ?)`;
                const likeTerm = `%${options.searchTerm}%`;
                params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            }
            const validSortColumns = ['id', 'created_at', 'updated_at', 'target_text', 'native_text', 'category', 'kanji_form', 'kana_form', 'romanization'];
            const sortBy = validSortColumns.includes(options.sortBy || '') ? options.sortBy : 'created_at';
            const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';
            sql += ` ORDER BY ${sortBy} ${sortOrder}`;
            if (options.limit !== undefined) { sql += ` LIMIT ?`; params.push(options.limit); }
            if (options.offset !== undefined) { sql += ` OFFSET ?`; params.push(options.offset); }

            db.all(sql, params, (err, rows: any[]) => {
                if (err) { reject(err); }
                else { 
                    rows.forEach(row => { row.furigana_details = parseFuriganaDetails(row); });
                    resolve(rows as LogEntry[]); 
                }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const getLogEntriesByIds = (languageName: string, entryIds: number[]): Promise<LogEntry[]> => {
	return new Promise(async (resolve, reject) => {
		if (!entryIds || entryIds.length === 0) { return resolve([]); }
		try {
            const db = await getDB(languageName);
		    const placeholders = entryIds.map(() => '?').join(',');
		    const sql = `SELECT * FROM log_entries WHERE id IN (${placeholders})`;
		    db.all(sql, entryIds, (err, rows: any[]) => {
			    if (err) { reject(err); }
			    else { 
            rows.forEach(row => { row.furigana_details = parseFuriganaDetails(row); });
            resolve(rows as LogEntry[]); 
          }
		    });
        } catch (dbErr) { reject(dbErr); }
	});
};

export const updateLogEntry = (languageName: string, id: number, updates: Partial<LogEntryData>): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
       try {
            const db = await getDB(languageName);
            const allowedFields: (keyof LogEntryData)[] = [
               'target_text', 'native_text', 'category', 'notes', 'example_sentence',
               'kanji_form', 'kana_form', 'romanization', 'writing_system_note', 'furigana_details'
           ];
           const fieldsToUpdate: string[] = [];
           const valuesToUpdate: any[] = [];

           (Object.keys(updates) as (keyof LogEntryData)[]).forEach(key => {
               if (allowedFields.includes(key) && updates[key] !== undefined) { // Ensure undefined is handled, null is a valid value to set
                   fieldsToUpdate.push(`${key} = ?`);
                   if (key === 'furigana_details') {
                       valuesToUpdate.push(updates.furigana_details ? JSON.stringify(updates.furigana_details) : null);
                   } else {
                       valuesToUpdate.push(updates[key]);
                   }
               }
           });

            if (fieldsToUpdate.length === 0) { return resolve(false); }

            const setClause = fieldsToUpdate.join(', ');
            const sql = `UPDATE log_entries SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
            const params = [...valuesToUpdate, id];

            db.run(sql, params, function(err) {
                if (err) { console.error(`Error updating log entry ${id} for ${languageName}:`, err.message, "SQL:", sql, "Params:", params); reject(err); } // Added more log details
                else { resolve(this.changes > 0); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const deleteLogEntry = (languageName: string, id: number): Promise<boolean> => { /* ... as before ... */ 
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            db.run(`DELETE FROM log_entries WHERE id = ?`, [id], function(err) {
                if (err) { reject(err); } else { resolve(this.changes > 0); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const clearLogEntriesForLanguage = (languageName: string): Promise<number> => { /* ... as before ... */ 
	return new Promise(async (resolve, reject) => {
		try {
            const db = await getDB(languageName);
		    db.run(`DELETE FROM log_entries`, [], function (err) {
			    if (err) { reject(err); } else { resolve(this.changes); }
		    });
        } catch (dbErr) { reject(dbErr); }
	});
};

export const addSourceNoteProcessed = (languageName: string, data: SourceNoteProcessedData): Promise<number> => { /* ... as before ... */ 
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `INSERT INTO source_notes_processed (source_file, source_line_ref, date_context, original_snippet, log_entry_id) VALUES (?, ?, ?, ?, ?)`;
            const params = [ data.source_file ?? null, data.source_line_ref ?? null, data.date_context ?? null, data.original_snippet ?? null, data.log_entry_id ?? null ];
            db.run(sql, params, function (err) {
                if (err) { reject(err); } else { resolve(this.lastID); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const getSourceNotesProcessed = (languageName: string, options: { limit?: number; offset?: number; sourceFile?: string } = {}): Promise<SourceNoteProcessed[]> => { /* ... as before ... */ 
     return new Promise(async (resolve, reject) => {
         try {
            const db = await getDB(languageName);
            let sql = `SELECT * FROM source_notes_processed WHERE 1=1`;
            const params: (string | number)[] = [];
            if (options.sourceFile) { sql += ' AND source_file = ?'; params.push(options.sourceFile); }
            sql += ` ORDER BY created_at DESC`;
            if (options.limit !== undefined) { sql += ` LIMIT ?`; params.push(options.limit); }
            if (options.offset !== undefined) { sql += ` OFFSET ?`; params.push(options.offset); }
            db.all(sql, params, (err, rows: SourceNoteProcessed[]) => {
                if (err) { reject(err); } else { resolve(rows); }
            });
        } catch (dbErr) { reject(dbErr); }
     });
};

export const addReviewItem = (languageName: string, data: ReviewItemData): Promise<number> => { /* ... as before ... */ 
     return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `INSERT INTO review_items (review_type, target_text, native_text, original_snippet, ai_suggestion, source_note_processed_id, related_log_entry_id, ai_extracted_kanji_form, ai_extracted_kana_form, ai_extracted_romanization, ai_extracted_writing_system_note, category_guess) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const params = [ data.review_type, data.target_text ?? null, data.native_text ?? null, data.original_snippet ?? null, data.ai_suggestion ?? null, data.source_note_processed_id ?? null, data.related_log_entry_id ?? null, data.ai_extracted_kanji_form ?? null, data.ai_extracted_kana_form ?? null, data.ai_extracted_romanization ?? null, data.ai_extracted_writing_system_note ?? null, data.category_guess ?? null ];
             db.run(sql, params, function (err) {
                if (err) { reject(err); } else { resolve(this.lastID); }
            });
        } catch (dbErr) { reject(dbErr); }
     });
};

export const getReviewItems = (languageName: string, status: ReviewStatus = 'pending'): Promise<ReviewItem[]> => { /* ... as before ... */ 
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            db.all(`SELECT * FROM review_items WHERE status = ? ORDER BY created_at ASC`, [status], (err, rows: ReviewItem[]) => {
                 if (err) { reject(err); } else { resolve(rows); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const updateReviewItemStatus = (languageName: string, id: number, newStatus: ReviewStatus): Promise<boolean> => { /* ... as before ... */ 
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const resolvedTime = (newStatus === 'resolved' || newStatus === 'ignored') ? new Date().toISOString() : null;
            db.run(`UPDATE review_items SET status = ?, resolved_at = ? WHERE id = ?`, [newStatus, resolvedTime, id], function(err) {
                 if (err) { reject(err); } else { resolve(this.changes > 0); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const deleteReviewItem = (languageName: string, id: number): Promise<boolean> => { /* ... as before ... */ 
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            db.run(`DELETE FROM review_items WHERE id = ?`, [id], function(err) {
                if (err) { reject(err); } else { resolve(this.changes > 0); }
            });
        } catch (dbErr) { reject(dbErr); }
    });
};

export const clearReviewItemsForLanguage = (languageName: string, status: ReviewStatus = 'pending'): Promise<number> => { /* ... as before ... */ 
	return new Promise(async (resolve, reject) => {
		try {
            const db = await getDB(languageName);
		    db.run(`DELETE FROM review_items WHERE status = ?`, [status], function (err) {
			    if (err) { reject(err); } else { resolve(this.changes); }
		    });
        } catch (dbErr) { reject(dbErr); }
	});
};

export const getLanguageUISetting = (languageName: string, key: string): Promise<string | null> => { /* ... as before ... */ 
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB(languageName);
      db.get(`SELECT value FROM language_ui_settings WHERE key = ?`, [key], (err, row: any) => {
        if (err) { reject(err); } else { resolve(row ? row.value : null); }
      });
    } catch (dbErr) { reject(dbErr); }
  });
};

export const setLanguageUISetting = (languageName: string, key: string, value: string): Promise<void> => { /* ... as before ... */ 
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB(languageName);
      db.run(`INSERT OR REPLACE INTO language_ui_settings (key, value) VALUES (?, ?)`, [key, value], (err) => {
        if (err) { reject(err); } else { resolve(); }
      });
    } catch (dbErr) { reject(dbErr); }
  });
};

export const listAvailableLanguages = async (): Promise<string[]> => { /* ... as before ... */ 
    try {
        const entries = await fs.readdir(baseLanguagesPath, { withFileTypes: true });
        return entries.filter(dirent => dirent.isDirectory()).map(dirent => dirent.name);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
};

export const createLanguage = async (originalLanguageName: string): Promise<void> => { /* ... as before ... */ 
    try { await getDB(originalLanguageName); } 
    catch (error) { throw error; }
};

export const deleteLanguageLog = async (languageName: string): Promise<void> => { /* ... as before ... */ 
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    const languageDbPath = path.join(baseLanguagesPath, sanitizedName, `${sanitizedName}.sqlite`);
    await closeLanguageDB(languageName);
    try { await fs.remove(languageDbPath); } 
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
        throw error;
    }
};