import sqlite3 from 'sqlite3';
import path from 'path';
import { app } from 'electron'; // Import app to get userData path

// --- Database Setup ---
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'grammar-log.sqlite');
console.log(`Database path: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err.message);
  } else {
    console.log('Connected to the SQLite database.');
    db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
      if (pragmaErr) {
        console.error('Failed to enable foreign key support:', pragmaErr.message);
      } else {
        console.log('Foreign key support enabled.');
        initializeDatabase();
      }
    });
  }
});

const initializeDatabase = () => {
  db.serialize(() => {
    console.log('Initializing database schema...');
    // Languages Table
    db.run(`
      CREATE TABLE IF NOT EXISTS languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        native_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => { if (err) console.error("Error creating 'languages' table:", err.message); else console.log("'languages' table checked/created."); });

    // Log Entries Table
    db.run(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id INTEGER NOT NULL,
        target_text TEXT NOT NULL,
        native_text TEXT,
        category TEXT,
        notes TEXT,
        example_sentence TEXT,
        kanji_form TEXT,          -- For Japanese Kanji, etc.
        kana_form TEXT,           -- For Japanese Kana reading (including okurigana)
        romanization TEXT,        -- For Hepburn, Pinyin, etc.
        writing_system_note TEXT, -- E.g., "Kanji+Okurigana", "Katakana"
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE CASCADE
      )
    `, (err) => { if (err) console.error("Error creating 'log_entries' table:", err.message); else console.log("'log_entries' table checked/created."); });

    // Trigger to update 'updated_at' timestamp on log_entries update
    db.run(`
        CREATE TRIGGER IF NOT EXISTS update_log_entry_timestamp
        AFTER UPDATE ON log_entries
        FOR EACH ROW
        BEGIN
            UPDATE log_entries SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
        END;
    `, (err) => { if (err) console.error("Error creating 'log_entries' update trigger:", err.message); else console.log("'log_entries' update trigger checked/created."); });

    // Index on log_entries
     db.run(`
        CREATE INDEX IF NOT EXISTS idx_log_entries_target_lang ON log_entries (language_id, target_text);
     `, (err) => { if (err) console.error("Error creating index on 'log_entries':", err.message); else console.log("Index on 'log_entries' checked/created."); });

    // Source Notes Processed Table
    db.run(`
      CREATE TABLE IF NOT EXISTS source_notes_processed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id INTEGER NOT NULL,
        source_file TEXT, -- Path or identifier of the source file
        source_line_ref TEXT, -- Line number or unique identifier within the source (optional)
        date_context TEXT,   -- Date associated with the note by AI/parser
        original_snippet TEXT, -- The raw text snippet processed
        log_entry_id INTEGER, -- Link to the created log entry (optional, could be many-to-many later)
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE CASCADE,
        FOREIGN KEY (log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL -- Keep source ref even if log entry deleted
      )
    `, (err) => { if (err) console.error("Error creating 'source_notes_processed' table:", err.message); else console.log("'source_notes_processed' table checked/created."); });

    // Review Items Table
    db.run(`
      CREATE TABLE IF NOT EXISTS review_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language_id INTEGER NOT NULL,
        review_type TEXT NOT NULL, -- 'duplicate', 'uncategorized', 'parsing_assist'
        target_text TEXT,          -- Target text involved (esp. for duplicates/uncategorized)
        native_text TEXT,          -- Conflicting native text (for duplicates)
        original_snippet TEXT,     -- Snippet needing parsing assistance or context
        ai_suggestion TEXT,        -- What the AI suggested (if applicable)
        status TEXT DEFAULT 'pending', -- 'pending', 'resolved', 'ignored'
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved_at DATETIME,
        source_note_processed_id INTEGER, -- Link back to source_notes_processed.id (optional)
        related_log_entry_id INTEGER, -- Existing entry ID for duplicates (optional)
        FOREIGN KEY (language_id) REFERENCES languages (id) ON DELETE CASCADE,
        FOREIGN KEY (source_note_processed_id) REFERENCES source_notes_processed (id) ON DELETE SET NULL, -- Changed source_note_ref to ID link
        FOREIGN KEY (related_log_entry_id) REFERENCES log_entries (id) ON DELETE SET NULL
      )
    `, (err) => { if (err) console.error("Error creating 'review_items' table:", err.message); else console.log("'review_items' table checked/created."); });

    // Settings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      )
    `, (err) => { if (err) console.error("Error creating 'settings' table:", err.message); else console.log("'settings' table checked/created."); });
    console.log('Database schema initialization process completed.');
  }); // End serialize
};

const closeDatabase = () => {
  db.close((err) => {
    if (err) console.error('Error closing database', err.message);
    else console.log('Database connection closed.');
  });
};

// --- CRUD Operations for Languages ---
interface Language { id: number; name: string; native_name: string | null; created_at: string; }
const addLanguage = (name: string, nativeName?: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const sql = `INSERT INTO languages (name, native_name) VALUES (?, ?)`;
    db.run(sql, [name, nativeName ?? null], function(err) {
      if (err) { console.error(`Error adding language '${name}':`, err.message); reject(err); }
      else { console.log(`Language '${name}' added with ID: ${this.lastID}`); resolve(this.lastID); }
    });
  });
};
const getLanguages = (): Promise<Language[]> => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT id, name, native_name, created_at FROM languages ORDER BY name ASC`;
    db.all(sql, [], (err, rows: Language[]) => {
      if (err) { console.error('Error fetching languages:', err.message); reject(err); }
      else { resolve(rows); }
    });
  });
};
const getLanguageIdByName = (name: string): Promise<number | null> => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT id FROM languages WHERE name = ?`;
        db.get(sql, [name], (err, row: { id: number } | undefined ) => {
            if (err) { console.error(`Error fetching language ID for '${name}':`, err.message); reject(err); }
            else { resolve(row ? row.id : null); }
        });
    });
};

// --- CRUD Operations for Settings ---
const getSetting = (key: string): Promise<string | null> => {
  return new Promise((resolve, reject) => {
    const sql = `SELECT value FROM settings WHERE key = ?`;
    db.get(sql, [key], (err, row: { value: string } | undefined) => {
      if (err) { console.error(`Error getting setting '${key}':`, err.message); reject(err); }
      else { resolve(row ? row.value : null); }
    });
  });
};
const setSetting = (key: string, value: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const sql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`;
    db.run(sql, [key, value], (err) => {
      if (err) { console.error(`Error setting setting '${key}':`, err.message); reject(err); }
      else { console.log(`Setting '${key}' updated.`); resolve(); }
    });
  });
};

// --- CRUD Operations for Log Entries ---
interface LogEntry {
    id: number;
    language_id: number;
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
interface LogEntryData {
    language_id: number;
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
const addLogEntry = (data: LogEntryData): Promise<number> => {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO log_entries (
                language_id, target_text, native_text, category, notes, example_sentence,
                kanji_form, kana_form, romanization, writing_system_note, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        const params = [
            data.language_id, data.target_text, data.native_text ?? null, data.category ?? null,
            data.notes ?? null, data.example_sentence ?? null,
            data.kanji_form ?? null, data.kana_form ?? null, data.romanization ?? null, data.writing_system_note ?? null
        ];
        db.run(sql, params, function (err) {
            if (err) { console.error('Error adding log entry:', err.message); reject(err); }
            else { console.log(`Log entry added with ID: ${this.lastID}`); resolve(this.lastID); }
        });
    });
};
const findLogEntryByTarget = (languageId: number, targetText: string): Promise<LogEntry | null> => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM log_entries WHERE language_id = ? AND target_text = ?`;
        db.get(sql, [languageId, targetText], (err, row: LogEntry | undefined) => {
             if (err) { console.error(`Error finding log entry for target '${targetText}' in lang ${languageId}:`, err.message); reject(err); }
             else { resolve(row ?? null); }
        });
    });
};

// Define type for the options parameter
interface GetLogEntriesOptions {
    category?: string;
    searchTerm?: string;
    sortBy?: 'id' | 'created_at' | 'updated_at' | 'target_text' | 'native_text' | 'category' | 'kanji_form' | 'kana_form' | 'romanization'; // Expanded sort options
    sortOrder?: 'ASC' | 'DESC';
    limit?: number;
    offset?: number;
}

const getLogEntries = (languageId: number, options: GetLogEntriesOptions = {}): Promise<LogEntry[]> => {
    return new Promise((resolve, reject) => {
        let sql = `SELECT * FROM log_entries WHERE language_id = ?`;
        const params: (string | number)[] = [languageId];

        if (options.category) {
            sql += ` AND category = ?`;
            params.push(options.category);
        }

        if (options.searchTerm) {
            sql += ` AND (target_text LIKE ? OR native_text LIKE ? OR notes LIKE ? OR example_sentence LIKE ? OR kanji_form LIKE ? OR kana_form LIKE ? OR romanization LIKE ?)`;
            const likeTerm = `%${options.searchTerm}%`;
            params.push(likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm);
        }

        const validSortColumns = ['id', 'created_at', 'updated_at', 'target_text', 'native_text', 'category', 'kanji_form', 'kana_form', 'romanization']; // Updated valid columns
        const sortBy = validSortColumns.includes(options.sortBy || '') ? options.sortBy : 'created_at'; // Default sort
        const sortOrder = options.sortOrder === 'ASC' ? 'ASC' : 'DESC'; // Default DESC
        sql += ` ORDER BY ${sortBy} ${sortOrder}`; // Use safe column name and direction

        if (options.limit !== undefined) {
            sql += ` LIMIT ?`;
            params.push(options.limit);
        }
        if (options.offset !== undefined) {
             sql += ` OFFSET ?`;
             params.push(options.offset);
        }

        db.all(sql, params, (err, rows: LogEntry[]) => {
            if (err) { console.error('Error fetching log entries:', err.message); reject(err); }
            else { resolve(rows); }
        });
    });
};
const getLogEntriesByIds = (entryIds: number[]): Promise<LogEntry[]> => {
	return new Promise((resolve, reject) => {
		if (!entryIds || entryIds.length === 0) {
			return resolve([]); // Return empty if no IDs provided
		}
		const placeholders = entryIds.map(() => '?').join(',');
		const sql = `SELECT * FROM log_entries WHERE id IN (${placeholders})`;

		db.all(sql, entryIds, (err, rows: LogEntry[]) => {
			if (err) { console.error('Error fetching log entries by IDs:', err.message); reject(err); }
			else { resolve(rows); }
		});
	});
};
const updateLogEntry = (id: number, updates: Partial<LogEntryData>): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        // Fields that can be updated
       const allowedFields: (keyof LogEntryData)[] = [
           'target_text', 'native_text', 'category', 'notes', 'example_sentence',
           'kanji_form', 'kana_form', 'romanization', 'writing_system_note'
       ];
       const fields = (Object.keys(updates) as (keyof LogEntryData)[])
           .filter(key => allowedFields.includes(key) && updates[key] !== undefined);

        if (fields.length === 0) { return resolve(false); } // Nothing to update

        const setClause = fields.map(field => `${field} = ?`).join(', ');
       // Also update the 'updated_at' timestamp
       const sql = `UPDATE log_entries SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
       const values = fields.map(field => updates[field]);
        const params = [...values, id];
        db.run(sql, params, function(err) {
            if (err) { console.error(`Error updating log entry ${id}:`, err.message); reject(err); }
            else { console.log(`Log entry ${id} updated. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
        });
    });
};
const deleteLogEntry = (id: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM log_entries WHERE id = ?`;
        db.run(sql, [id], function(err) {
            if (err) { console.error(`Error deleting log entry ${id}:`, err.message); reject(err); }
            else { console.log(`Log entry ${id} deleted. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
        });
    });
};
const clearLogEntriesForLanguage = (languageId: number): Promise<number> => {
	return new Promise((resolve, reject) => {
		const sql = `DELETE FROM log_entries WHERE language_id = ?`;
		db.run(sql, [languageId], function (err) {
			if (err) { console.error(`Error clearing log entries for language ${languageId}:`, err.message); reject(err); }
			else { console.log(`Cleared log entries for language ${languageId}. Rows affected: ${this.changes}`); resolve(this.changes); }
		});
	});
};


// --- CRUD Operations for Source Notes Processed ---
interface SourceNoteProcessed { id: number; language_id: number; source_file: string | null; source_line_ref: string | null; date_context: string | null; original_snippet: string | null; log_entry_id: number | null; created_at: string; }
interface SourceNoteProcessedData { language_id: number; source_file?: string | null; source_line_ref?: string | null; date_context?: string | null; original_snippet?: string | null; log_entry_id?: number | null; }
const addSourceNoteProcessed = (data: SourceNoteProcessedData): Promise<number> => {
    return new Promise((resolve, reject) => {
        const sql = `INSERT INTO source_notes_processed (language_id, source_file, source_line_ref, date_context, original_snippet, log_entry_id) VALUES (?, ?, ?, ?, ?, ?)`;
        const params = [ data.language_id, data.source_file ?? null, data.source_line_ref ?? null, data.date_context ?? null, data.original_snippet ?? null, data.log_entry_id ?? null ];
        db.run(sql, params, function (err) {
            if (err) { console.error('Error adding source note processed:', err.message); reject(err); }
            else { console.log(`Source note processed added with ID: ${this.lastID}`); resolve(this.lastID); }
        });
    });
};
const getSourceNotesProcessed = (languageId: number, options: { limit?: number; offset?: number; sourceFile?: string } = {}): Promise<SourceNoteProcessed[]> => {
     return new Promise((resolve, reject) => {
         let sql = `SELECT * FROM source_notes_processed WHERE language_id = ?`;
         const params: (string | number)[] = [languageId];
         if (options.sourceFile) { sql += ' AND source_file = ?'; params.push(options.sourceFile); }
         sql += ` ORDER BY created_at DESC`;
         if (options.limit !== undefined) { sql += ` LIMIT ?`; params.push(options.limit); }
         if (options.offset !== undefined) { sql += ` OFFSET ?`; params.push(options.offset); }
         db.all(sql, params, (err, rows: SourceNoteProcessed[]) => { if (err) { console.error('Error fetching source notes processed:', err.message); reject(err); } else { resolve(rows); } });
     });
};

// --- CRUD Operations for Review Items ---
type ReviewType = 'duplicate' | 'uncategorized' | 'parsing_assist';
type ReviewStatus = 'pending' | 'resolved' | 'ignored';
interface ReviewItem {
  id: number;
  language_id: number;
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
  // Optional fields for AI's extracted data, matching ReviewItemData
  ai_extracted_kanji_form?: string | null;
  ai_extracted_kana_form?: string | null;
  ai_extracted_romanization?: string | null;
  ai_extracted_writing_system_note?: string | null;
  category_guess?: string | null;
}
interface ReviewItemData {
  language_id: number;
  review_type: ReviewType;
  target_text?: string | null;
  native_text?: string | null;
  original_snippet?: string | null;
  ai_suggestion?: string | null;
  source_note_processed_id?: number | null;
  related_log_entry_id?: number | null;
  // Fields to store AI's version of data for 'duplicate' review_type
  ai_extracted_kanji_form?: string | null;
  ai_extracted_kana_form?: string | null;
  ai_extracted_romanization?: string | null;
  ai_extracted_writing_system_note?: string | null;
  category_guess?: string | null; // AI's category guess for the duplicate item
}
const addReviewItem = (data: ReviewItemData): Promise<number> => {
     return new Promise((resolve, reject) => {
        const sql = `INSERT INTO review_items (language_id, review_type, target_text, native_text, original_snippet, ai_suggestion, source_note_processed_id, related_log_entry_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const params = [ data.language_id, data.review_type, data.target_text ?? null, data.native_text ?? null, data.original_snippet ?? null, data.ai_suggestion ?? null, data.source_note_processed_id ?? null, data.related_log_entry_id ?? null ];
         db.run(sql, params, function (err) {
            if (err) { console.error('Error adding review item:', err.message); reject(err); }
            else { console.log(`Review item added with ID: ${this.lastID} (Type: ${data.review_type})`); resolve(this.lastID); }
        });
     });
};
const getReviewItems = (languageId: number, status: ReviewStatus = 'pending'): Promise<ReviewItem[]> => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT * FROM review_items WHERE language_id = ? AND status = ? ORDER BY created_at ASC`;
        db.all(sql, [languageId, status], (err, rows: ReviewItem[]) => {
             if (err) { console.error(`Error fetching review items (status: ${status}):`, err.message); reject(err); }
             else { resolve(rows); }
        });
    });
};
const updateReviewItemStatus = (id: number, newStatus: ReviewStatus): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const sql = `UPDATE review_items SET status = ?, resolved_at = ? WHERE id = ?`;
        const resolvedTime = (newStatus === 'resolved' || newStatus === 'ignored') ? new Date().toISOString() : null;
        db.run(sql, [newStatus, resolvedTime, id], function(err) {
             if (err) { console.error(`Error updating review item ${id} status to ${newStatus}:`, err.message); reject(err); }
             else { console.log(`Review item ${id} status updated to ${newStatus}. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
        });
    });
};
const deleteReviewItem = (id: number): Promise<boolean> => {
    return new Promise((resolve, reject) => {
        const sql = `DELETE FROM review_items WHERE id = ?`;
        db.run(sql, [id], function(err) {
            if (err) { console.error(`Error deleting review item ${id}:`, err.message); reject(err); }
            else { console.log(`Review item ${id} deleted. Rows affected: ${this.changes}`); resolve(this.changes > 0); }
        });
    });
};
// Function to clear all PENDING review items for a language
const clearReviewItemsForLanguage = (languageId: number, status: ReviewStatus = 'pending'): Promise<number> => {
	return new Promise((resolve, reject) => {
		// Default to clearing only 'pending' items unless another status is specified
		const sql = `DELETE FROM review_items WHERE language_id = ? AND status = ?`;
		db.run(sql, [languageId, status], function (err) {
			if (err) { console.error(`Error clearing ${status} review items for language ${languageId}:`, err.message); reject(err); }
			else { console.log(`Cleared ${status} review items for language ${languageId}. Rows affected: ${this.changes}`); resolve(this.changes); }
		});
	});
};

// Single export block for all necessary elements
export {
  db,
  closeDatabase,
  type Language,
  addLanguage,
  getLanguages,
  getLanguageIdByName,
  getSetting,
  setSetting,
  type LogEntry,
  type LogEntryData,
  addLogEntry,
  findLogEntryByTarget,
  type GetLogEntriesOptions, // Export the options type
  getLogEntries, // Make sure GetLogEntriesOptions is updated here too if necessary
  getLogEntriesByIds, // Export the new function
  updateLogEntry,
  deleteLogEntry,
  clearLogEntriesForLanguage, // Export the new function
  type SourceNoteProcessed,
  type SourceNoteProcessedData,
  addSourceNoteProcessed,
  getSourceNotesProcessed,
  type ReviewItem,
  type ReviewType,
  type ReviewStatus,
  type ReviewItemData,
  addReviewItem,
  getReviewItems,
  updateReviewItemStatus,
  deleteReviewItem, // Export the new function
  clearReviewItemsForLanguage // Export the new function
};