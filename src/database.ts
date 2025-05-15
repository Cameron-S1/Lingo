import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron'; // Import app to get userData path
import fs from 'fs-extra'; // Using fs-extra for ensureDirSync

// --- Database Paths ---
const userDataPath = app.getPath('userData');
const baseLanguagesPath = path.join(userDataPath, 'languages'); // Base directory for all language DBs
const globalSettingsDbPath = path.join(userDataPath, 'global-settings.sqlite');
fs.ensureDirSync(baseLanguagesPath); // Ensure the main 'languages' directory exists

console.log(`User data path: ${userDataPath}`);
console.log(`Base languages path: ${baseLanguagesPath}`);
console.log(`Global settings database path: ${globalSettingsDbPath}`);

// --- Connection Management for Language DBs ---
const languageConnections = new Map<string, sqlite3.Database>();

// --- Global Settings Database ---
let globalSettingsDB: sqlite3.Database | null = null;

const promisifiedDbRun = (dbInstance: sqlite3.Database, sql: string, params: any[] = []): Promise<void> => {
    return new Promise((resolve, reject) => {
        dbInstance.run(sql, params, function(err) { // Use `function` for `this` context if needed, though not for DDL.
            if (err) {
                console.error(`Error running SQL: ${sql}`, params, err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    });
};


const initializeGlobalSettingsDB = (): Promise<sqlite3.Database> => {
  return new Promise((resolve, reject) => {
    if (globalSettingsDB) {
      resolve(globalSettingsDB);
      return;
    }
    const db = new sqlite3.Database(globalSettingsDbPath, (err) => {
      if (err) {
        console.error('Error opening global settings database', err.message);
        reject(err);
      } else {
        console.log('Connected to the global settings SQLite database.');
        promisifiedDbRun(db, 'PRAGMA foreign_keys = ON;')
          .then(() => initializeGlobalSettingsSchema(db))
          .then(() => {
            globalSettingsDB = db;
            resolve(db);
          })
          .catch(reject);
      }
    });
  });
};

const initializeGlobalSettingsSchema = async (dbInstance: sqlite3.Database): Promise<void> => {
    console.log('Initializing global settings database schema...');
    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      )
    `);
    console.log("'settings' table in global DB checked/created.");
};

initializeGlobalSettingsDB().catch(err => console.error("Failed to initialize global settings DB on startup:", err));

// --- Language-Specific Database Initialization ---
const initializeLanguageDBSchema = async (dbInstance: sqlite3.Database): Promise<void> => {
    console.log('Initializing schema for a language database...');
    // Log Entries Table (no language_id)
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("'log_entries' table checked/created.");

    await promisifiedDbRun(dbInstance, `
        CREATE TRIGGER IF NOT EXISTS update_log_entry_timestamp
        AFTER UPDATE ON log_entries
        FOR EACH ROW
        BEGIN
            UPDATE log_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `);
    console.log("'log_entries' update trigger checked/created.");

    await promisifiedDbRun(dbInstance, `
        CREATE INDEX IF NOT EXISTS idx_log_entries_target ON log_entries (target_text);
    `);
    console.log("Index on 'log_entries' checked/created.");

    // Source Notes Processed Table (no language_id)
    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS source_notes_processed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT,
        source_line_ref TEXT,
        date_context TEXT,
        original_snippet TEXT,
        log_entry_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL
      )
    `);
    console.log("'source_notes_processed' table checked/created.");

    // Review Items Table (no language_id)
    await promisifiedDbRun(dbInstance, `
      CREATE TABLE IF NOT EXISTS review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_type TEXT NOT NULL,
        target_text TEXT,
        native_text TEXT,
        original_snippet TEXT,
        ai_suggestion TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        source_note_processed_id INTEGER,
        related_log_entry_id INTEGER,
        ai_extracted_kanji_form TEXT,
        ai_extracted_kana_form TEXT,
        ai_extracted_romanization TEXT,
        ai_extracted_writing_system_note TEXT,
        category_guess TEXT,
        FOREIGN KEY (source_note_processed_id) REFERENCES source_notes_processed (id) ON DELETE SET NULL,
        FOREIGN KEY (related_log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL
      )
    `);
    console.log("'review_items' table checked/created.");
    
    console.log('Language database schema initialization process completed.');
  };

// --- Get Language DB Connection ---
const sanitizeLanguageNameForPath = (languageName: string): string => {
    return languageName.toLowerCase().replace(/[^a-z0-9-]/g, '_');
};

export const getDB = (languageName: string): Promise<sqlite3.Database> => {
  return new Promise(async (resolve, reject) => {
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    if (languageConnections.has(sanitizedName)) {
      const existingDb = languageConnections.get(sanitizedName)!;
      resolve(existingDb);
      return;
    }

    const languageDirPath = path.join(baseLanguagesPath, sanitizedName);
    const languageDbPath = path.join(languageDirPath, `${sanitizedName}.sqlite`);

    try {
      await fs.ensureDir(languageDirPath);
      console.log(`Directory ensured for ${sanitizedName} at ${languageDirPath}`);
    } catch (dirErr) {
      console.error(`Error ensuring directory for language ${sanitizedName}:`, dirErr);
      reject(dirErr);
      return;
    }
    
    const db = new sqlite3.Database(languageDbPath, async (err) => {
      if (err) {
        console.error(`Error opening database for language ${languageName} (Path: ${languageDbPath}):`, err.message);
        reject(err);
      } else {
        console.log(`Connected to SQLite database for language: ${languageName} (Path: ${languageDbPath})`);
        try {
          await promisifiedDbRun(db, 'PRAGMA foreign_keys = ON;');
          console.log(`Foreign key support enabled for ${languageName} DB.`);
          await initializeLanguageDBSchema(db); // This is now fully async
          languageConnections.set(sanitizedName, db);
          resolve(db);
        } catch (initErr) {
            console.error(`Error initializing schema or setting pragma for ${languageName}:`, initErr);
            db.close(closeErr => {
                if (closeErr) console.error(`Error closing DB for ${languageName} after init failure:`, closeErr);
            });
            reject(initErr);
        }
      }
    });
  });
};

// --- Closing Connections ---
export const closeLanguageDB = (languageName: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    const db = languageConnections.get(sanitizedName);
    if (db) {
      db.close((err) => {
        if (err) {
          console.error(`Error closing database for language ${languageName}:`, err.message);
          reject(err);
        } else {
          console.log(`Database connection closed for language: ${languageName}`);
          languageConnections.delete(sanitizedName);
          resolve();
        }
      });
    } else {
      resolve(); // No connection to close
    }
  });
};

export const closeAllDatabases = async (): Promise<void> => {
  console.log("Attempting to close all database connections...");
  const closePromises: Promise<void>[] = [];
  const langKeys = Array.from(languageConnections.keys()); 
  langKeys.forEach(langNameKey => {
    closePromises.push(closeLanguageDB(langNameKey));
  });

  if (globalSettingsDB) {
    closePromises.push(new Promise((resolve, reject) => {
      globalSettingsDB!.close((err) => {
        if (err) {
          console.error('Error closing global settings database:', err.message);
          reject(err);
        } else {
          console.log('Global settings database connection closed.');
          globalSettingsDB = null;
          resolve();
        }
      });
    }));
  }
  try {
    await Promise.all(closePromises);
    console.log("All database connections have been processed for closing.");
  } catch (error) {
    console.error("Error during batch closing of databases:", error);
  }
};


// --- Operations for Global Settings ---
export const getSetting = (key: string): Promise<string | null> => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initializeGlobalSettingsDB();
      const sql = `SELECT value FROM settings WHERE key = ?`;
      db.get(sql, [key], (err, row: { value: string } | undefined) => {
        if (err) { console.error(`Error getting setting '${key}':`, err.message); reject(err); }
        else { resolve(row ? row.value : null); }
      });
    } catch (error) {
        console.error(`Failed to get global settings DB for key '${key}':`, error);
      reject(error);
    }
  });
};

export const setSetting = (key: string, value: string): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await initializeGlobalSettingsDB();
      const sql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`;
      db.run(sql, [key, value], (err) => {
        if (err) { console.error(`Error setting setting '${key}':`, err.message); reject(err); }
        else { console.log(`Setting '${key}' updated.`); resolve(); }
      });
    } catch (error) {
        console.error(`Failed to get global settings DB for key '${key}':`, error);
      reject(error);
    }
  });
};

// --- Data Types (Language Specific) ---
export interface LogEntry {
    id: number;
    target_text: string;
    native_text: string | null;
    category: string | null;
    notes: string | null;
    example_sentence: string | null;
    kanji_form: string | null;
    kana_form: string | null;
    romanization: string | null;
    writing_system_note: string | null;
    created_at: string;
    updated_at: string;
}
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
}
export interface SourceNoteProcessed {
    id: number;
    source_file: string | null;
    source_line_ref: string | null;
    date_context: string | null;
    original_snippet: string | null;
    log_entry_id: number | null;
    created_at: string;
}
export interface SourceNoteProcessedData {
    source_file?: string | null;
    source_line_ref?: string | null;
    date_context?: string | null;
    original_snippet?: string | null;
    log_entry_id?: number | null;
}
export type ReviewType = 'duplicate' | 'uncategorized' | 'parsing_assist';
export type ReviewStatus = 'pending' | 'resolved' | 'ignored';
export interface ReviewItem {
  id: number;
  review_type: ReviewType;
  target_text: string | null;
  native_text: string | null;
  original_snippet: string | null;
  ai_suggestion: string | null;
  status: ReviewStatus;
  created_at: string;
  resolved_at: string | null;
  source_note_processed_id: number | null;
  related_log_entry_id: number | null;
  ai_extracted_kanji_form?: string | null;
  ai_extracted_kana_form?: string | null;
  ai_extracted_romanization?: string | null;
  ai_extracted_writing_system_note?: string | null;
  category_guess?: string | null;
}
export interface ReviewItemData {
  review_type: ReviewType;
  target_text?: string | null;
  native_text?: string | null;
  original_snippet?: string | null;
  ai_suggestion?: string | null;
  source_note_processed_id?: number | null;
  related_log_entry_id?: number | null;
  ai_extracted_kanji_form?: string | null;
  ai_extracted_kana_form?: string | null;
  ai_extracted_romanization?: string | null;
  ai_extracted_writing_system_note?: string | null;
  category_guess?: string | null;
}
export interface GetLogEntriesOptions {
    category?: string;
    searchTerm?: string;
    sortBy?: 'id' | 'created_at' | 'updated_at' | 'target_text' | 'native_text' | 'category' | 'kanji_form' | 'kana_form' | 'romanization';
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
}

// --- CRUD Operations for Log Entries (Adapted) ---
export const addLogEntry = (languageName: string, data: LogEntryData): Promise<number> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `
                INSERT INTO log_entries (
                    target_text, native_text, category, notes, example_sentence,
                    kanji_form, kana_form, romanization, writing_system_note, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `;
            const params = [
                data.target_text, data.native_text ?? null, data.category ?? null,
                data.notes ?? null, data.example_sentence ?? null,
                data.kanji_form ?? null, data.kana_form ?? null, data.romanization ?? null, data.writing_system_note ?? null
            ];
            db.run(sql, params, function (err) {
                if (err) { console.error(`Error adding log entry for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Log entry added with ID: ${this.lastID} for ${languageName}`); resolve(this.lastID); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to add log entry:`, dbErr);
            reject(dbErr);
        }
    });
};

export const findLogEntryByTarget = (languageName: string, targetText: string): Promise<LogEntry | null> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `SELECT * FROM log_entries WHERE target_text = ?`;
            db.get(sql, [targetText], (err, row: LogEntry | undefined) => {
                 if (err) { console.error(`Error finding log entry for target '${targetText}' in ${languageName}:`, err.message); reject(err); }
                 else { resolve(row ?? null); }
            });
       } catch (dbErr) {
           console.error(`Failed to get DB for ${languageName} to find log entry:`, dbErr);
           reject(dbErr);
       }
    });
};

export const getLogEntries = (languageName: string, options: GetLogEntriesOptions = {}): Promise<LogEntry[]> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            let sql = `SELECT * FROM log_entries WHERE 1=1`;
            const params: (string | number)[] = [];

            if (options.category) {
                sql += ` AND category = ?`;
                params.push(options.category);
            }

            if (options.searchTerm) {
                sql += ` AND (target_text LIKE ? OR native_text LIKE ? OR notes LIKE ? OR example_sentence LIKE ? OR kanji_form LIKE ? OR kana_form LIKE ? OR romanization LIKE ?)`;
                const likeTerm = `%${options.searchTerm}%`;
                params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
            }

            const validSortColumns = ['id', 'created_at', 'updated_at', 'target_text', 'native_text', 'category', 'kanji_form', 'kana_form', 'romanization'];
            const sortBy = validSortColumns.includes(options.sortBy || '') ? options.sortBy : 'created_at';
            const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC';
            sql += ` ORDER BY ${sortBy} ${sortOrder}`;

            if (options.limit !== undefined) {
                sql += ` LIMIT ?`;
                params.push(options.limit);
            }
            if (options.offset !== undefined) {
                 sql += ` OFFSET ?`;
                 params.push(options.offset);
            }

            db.all(sql, params, (err, rows: LogEntry[]) => {
                if (err) { console.error(`Error fetching log entries for ${languageName}:`, err.message); reject(err); }
                else { resolve(rows); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to get log entries:`, dbErr);
            reject(dbErr);
        }
    });
};

export const getLogEntriesByIds = (languageName: string, entryIds: number[]): Promise<LogEntry[]> => {
	return new Promise(async (resolve, reject) => {
		if (!entryIds || entryIds.length === 0) {
			return resolve([]);
		}
		try {
            const db = await getDB(languageName);
		    const placeholders = entryIds.map(() => '?').join(',');
		    const sql = `SELECT * FROM log_entries WHERE id IN (${placeholders})`;

		    db.all(sql, entryIds, (err, rows: LogEntry[]) => {
			    if (err) { console.error(`Error fetching log entries by IDs for ${languageName}:`, err.message); reject(err); }
			    else { resolve(rows); }
		    });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to get log entries by IDs:`, dbErr);
            reject(dbErr);
        }
	});
};

export const updateLogEntry = (languageName: string, id: number, updates: Partial<LogEntryData>): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
       try {
            const db = await getDB(languageName);
            const allowedFields: (keyof LogEntryData)[] = [
               'target_text', 'native_text', 'category', 'notes', 'example_sentence',
               'kanji_form', 'kana_form', 'romanization', 'writing_system_note'
           ];
           const fields = (Object.keys(updates) as (keyof LogEntryData)[])
               .filter(key => allowedFields.includes(key) && updates[key] !== undefined);

            if (fields.length === 0) { return resolve(false); }

            const setClause = fields.map(field => `${field} = ?`).join(', ');
           const sql = `UPDATE log_entries SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
           const values = fields.map(field => updates[field]);
            const params = [...values, id];
            db.run(sql, params, function(err) {
                if (err) { console.error(`Error updating log entry ${id} for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Log entry ${id} for ${languageName} updated. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to update log entry:`, dbErr);
            reject(dbErr);
        }
    });
};

export const deleteLogEntry = (languageName: string, id: number): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `DELETE FROM log_entries WHERE id = ?`;
            db.run(sql, [id], function(err) {
                if (err) { console.error(`Error deleting log entry ${id} for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Log entry ${id} for ${languageName} deleted. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to delete log entry:`, dbErr);
            reject(dbErr);
        }
    });
};

export const clearLogEntriesForLanguage = (languageName: string): Promise<number> => {
	return new Promise(async (resolve, reject) => {
		try {
            const db = await getDB(languageName);
		    const sql = `DELETE FROM log_entries`; 
		    db.run(sql, [], function (err) {
			    if (err) { console.error(`Error clearing log entries for language ${languageName}:`, err.message); reject(err); }
			    else { console.log(`Cleared log entries for language ${languageName}. Rows affected: ${this.changes}`); resolve(this.changes); }
		    });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to clear log entries:`, dbErr);
            reject(dbErr);
        }
	});
};


// --- CRUD Operations for Source Notes Processed (Adapted) ---
export const addSourceNoteProcessed = (languageName: string, data: SourceNoteProcessedData): Promise<number> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `INSERT INTO source_notes_processed (source_file, source_line_ref, date_context, original_snippet, log_entry_id) VALUES (?, ?, ?, ?, ?)`;
            const params = [ data.source_file ?? null, data.source_line_ref ?? null, data.date_context ?? null, data.original_snippet ?? null, data.log_entry_id ?? null ];
            db.run(sql, params, function (err) {
                if (err) { console.error(`Error adding source note processed for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Source note processed added with ID: ${this.lastID} for ${languageName}`); resolve(this.lastID); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to add source note:`, dbErr);
            reject(dbErr);
        }
    });
};

export const getSourceNotesProcessed = (languageName: string, options: { limit?: number; offset?: number; sourceFile?: string } = {}): Promise<SourceNoteProcessed[]> => {
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
                if (err) { console.error(`Error fetching source notes processed for ${languageName}:`, err.message); reject(err); }
                else { resolve(rows); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to get source notes:`, dbErr);
            reject(dbErr);
        }
     });
};


// --- CRUD Operations for Review Items (Adapted) ---
export const addReviewItem = (languageName: string, data: ReviewItemData): Promise<number> => {
     return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `INSERT INTO review_items (
                review_type, target_text, native_text, original_snippet, ai_suggestion,
                source_note_processed_id, related_log_entry_id,
                ai_extracted_kanji_form, ai_extracted_kana_form, ai_extracted_romanization,
                ai_extracted_writing_system_note, category_guess
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            const params = [
                data.review_type, data.target_text ?? null, data.native_text ?? null,
                data.original_snippet ?? null, data.ai_suggestion ?? null,
                data.source_note_processed_id ?? null, data.related_log_entry_id ?? null,
                data.ai_extracted_kanji_form ?? null, data.ai_extracted_kana_form ?? null,
                data.ai_extracted_romanization ?? null, data.ai_extracted_writing_system_note ?? null,
                data.category_guess ?? null
            ];
             db.run(sql, params, function (err) {
                if (err) { console.error(`Error adding review item for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Review item added with ID: ${this.lastID} (Type: ${data.review_type}) for ${languageName}`); resolve(this.lastID); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to add review item:`, dbErr);
            reject(dbErr);
        }
     });
};

export const getReviewItems = (languageName: string, status: ReviewStatus = 'pending'): Promise<ReviewItem[]> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `SELECT * FROM review_items WHERE status = ? ORDER BY created_at ASC`;
            db.all(sql, [status], (err, rows: ReviewItem[]) => {
                 if (err) { console.error(`Error fetching review items (status: ${status}) for ${languageName}:`, err.message); reject(err); }
                 else { resolve(rows); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to get review items:`, dbErr);
            reject(dbErr);
        }
    });
};

export const updateReviewItemStatus = (languageName: string, id: number, newStatus: ReviewStatus): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `UPDATE review_items SET status = ?, resolved_at = ? WHERE id = ?`;
            const resolvedTime = (newStatus === 'resolved' || newStatus === 'ignored') ? new Date().toISOString() : null;
            db.run(sql, [newStatus, resolvedTime, id], function(err) {
                 if (err) { console.error(`Error updating review item ${id} status to ${newStatus} for ${languageName}:`, err.message); reject(err); }
                 else { console.log(`Review item ${id} status updated to ${newStatus} for ${languageName}. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to update review item status:`, dbErr);
            reject(dbErr);
        }
    });
};

export const deleteReviewItem = (languageName: string, id: number): Promise<boolean> => {
    return new Promise(async (resolve, reject) => {
        try {
            const db = await getDB(languageName);
            const sql = `DELETE FROM review_items WHERE id = ?`;
            db.run(sql, [id], function(err) {
                if (err) { console.error(`Error deleting review item ${id} for ${languageName}:`, err.message); reject(err); }
                else { console.log(`Review item ${id} for ${languageName} deleted. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
            });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to delete review item:`, dbErr);
            reject(dbErr);
        }
    });
};

export const clearReviewItemsForLanguage = (languageName: string, status: ReviewStatus = 'pending'): Promise<number> => {
	return new Promise(async (resolve, reject) => {
		try {
            const db = await getDB(languageName);
            const sql = `DELETE FROM review_items WHERE status = ?`; 
            db.run(sql, [status], function (err) {
			    if (err) { console.error(`Error clearing ${status} review items for language ${languageName}:`, err.message); reject(err); }
			    else { console.log(`Cleared ${status} review items for language ${languageName}. Rows affected: ${this.changes}`); resolve(this.changes); }
		    });
        } catch (dbErr) {
            console.error(`Failed to get DB for ${languageName} to clear review items:`, dbErr);
            reject(dbErr);
        }
	});
};


// --- Management functions for language folders/dbs (NEW) ---
export const listAvailableLanguages = async (): Promise<string[]> => {
    try {
        const entries = await fs.readdir(baseLanguagesPath, { withFileTypes: true });
        const directories = entries
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        return directories;
    } catch (error) {
        console.error('Error listing available language directories:', error);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
};

export const createLanguage = async (originalLanguageName: string): Promise<void> => {
    console.log(`Attempting to "create" language: ${originalLanguageName}`);
    try {
        await getDB(originalLanguageName);
        console.log(`Language ${originalLanguageName} setup complete.`);
    } catch (error) {
        console.error(`Error creating/initializing database for language ${originalLanguageName}:`, error);
        throw error;
    }
};

export const deleteLanguageLog = async (languageName: string): Promise<void> => {
    const sanitizedName = sanitizeLanguageNameForPath(languageName);
    const languageDbPath = path.join(baseLanguagesPath, sanitizedName, `${sanitizedName}.sqlite`);
    console.log(`Attempting to delete database file for language ${languageName} at ${languageDbPath}`);

    await closeLanguageDB(languageName);

    try {
        await fs.remove(languageDbPath);
        console.log(`Successfully deleted database file: ${languageDbPath}`);
    } catch (error) {
        console.error(`Error deleting database file ${languageDbPath}:`, error);
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.warn(`Database file ${languageDbPath} not found, considering it deleted.`);
            return;
        }
        throw error;
    }
};

// No need for a large empty export block