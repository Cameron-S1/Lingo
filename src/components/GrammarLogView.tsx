import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext'; // Use the refactored context
import type { LogEntry, LogEntryData, GetLogEntriesOptions } from '../database'; // Import necessary types
import Modal from './Modal'; // Import the Modal component
import { GRAMMAR_CATEGORIES } from '../constants'; // Import shared categories
import { useUI } from '../contexts/UIContext'; // Import for translations

// Define type for sortable columns
type SortableColumn = NonNullable<GetLogEntriesOptions['sortBy']> | 'kanji_form' | 'kana_form' | 'romanization';


const GrammarLogView: React.FC = () => {
  const { selectedLanguageName, selectLanguage } = useLanguage(); // Use selectedLanguageName and selectLanguage
  const { t } = useUI(); // Use translations
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // Removed languageId state

  // State for Filters/Search/Sort
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortOptions, setSortOptions] = useState<GetLogEntriesOptions>({
      sortBy: 'created_at',
      sortOrder: 'DESC',
  });

  // State for Add/Edit Entry Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
	const [isSubmittingEntry, setIsSubmittingEntry] = useState<boolean>(false);
	const [modalError, setModalError] = useState<string | null>(null);

	// State for deleting log entry
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

	// State for clearing log (deleting DB file)
	const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
	const [isClearing, setIsClearing] = useState<boolean>(false);
	const [clearError, setClearError] = useState<string | null>(null);

  // Removed useEffect for fetching languageId

  // --- Log Entry Fetching (useEffect & useCallback) ---
  // Define fetch function using selectedLanguageName
  const fetchEntries = useCallback(async (options: GetLogEntriesOptions) => {
    // Check selectedLanguageName instead of languageId
    if (!selectedLanguageName) {
        setEntries([]);
        setError(null); // Clear error if no language is selected
        return;
    }
		setError(null); setDeleteError(null); setClearError(null);
    setIsLoading(true);
    console.log(`Fetching entries for language: ${selectedLanguageName} with options:`, options);
    try {
      if (window.electronAPI) {
        // Pass selectedLanguageName to getLogEntries
        const fetchedEntries = await window.electronAPI.getLogEntries(selectedLanguageName, options);
        setEntries(fetchedEntries);
        console.log(`Fetched ${fetchedEntries.length} entries matching criteria for ${selectedLanguageName}.`);
      } else { setError('Electron API not available.'); }
    } catch (err) {
        console.error(`Error fetching log entries for ${selectedLanguageName}:`, err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching entries.');
        setEntries([]); // Clear entries on error
    } finally {
        setIsLoading(false);
    }
  }, [selectedLanguageName]); // Depend on selectedLanguageName

  // useEffect hook to call fetchEntries whenever relevant state changes
  useEffect(() => {
    const options: GetLogEntriesOptions = {
        ...sortOptions,
        ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
        ...(selectedCategory && { category: selectedCategory })
    };
    // Fetch entries if a language is selected
    if (selectedLanguageName) {
        fetchEntries(options);
    } else {
        setEntries([]); // Clear entries if no language selected
    }
  }, [fetchEntries, selectedLanguageName, searchTerm, selectedCategory, sortOptions]);


  // --- Add/Edit/Delete Entry Handlers ---
	const handleModalSave = async (formDataFromModal: Partial<LogEntryData>) => {
 		setIsSubmittingEntry(true);
 		setModalError(null);

		// Check required fields
		if (!formDataFromModal.target_text?.trim() && !formDataFromModal.kanji_form?.trim()) {
			setModalError(t('modal.validation.targetOrKanjiEmpty', { default: "Target text or Kanji/Character form cannot both be empty."}));
			setIsSubmittingEntry(false);
			return;
		}
        // Check selectedLanguageName
		if (!selectedLanguageName) {
			setModalError(t('errors.languageNotSelected', { default: "Cannot submit entry: No language selected."}));
			setIsSubmittingEntry(false);
			return;
		}
		const finalTargetText = formDataFromModal.target_text?.trim() || formDataFromModal.kanji_form?.trim() || '';

 		const payload: LogEntryData = { // Type is now LogEntryData (no language_id)
			target_text: finalTargetText,
			native_text: formDataFromModal.native_text?.trim() || null,
			category: formDataFromModal.category?.trim() || null,
			notes: formDataFromModal.notes?.trim() || null,
			example_sentence: formDataFromModal.example_sentence?.trim() || null,
			kanji_form: formDataFromModal.kanji_form?.trim() || null,
			kana_form: formDataFromModal.kana_form?.trim() || null,
			romanization: formDataFromModal.romanization?.trim() || null,
			writing_system_note: formDataFromModal.writing_system_note?.trim() || null,
 		};

 		try {
 			if (!window.electronAPI) throw new Error('Electron API not available.');

 			if (editingEntry) {
 				console.log(`Updating log entry ID: ${editingEntry.id} for ${selectedLanguageName}`);
                 // Pass selectedLanguageName
 				const success = await window.electronAPI.updateLogEntry(selectedLanguageName, editingEntry.id, payload);
 				if (!success) throw new Error(t('errors.updateEntryNotFound', { default: 'Failed to update entry. It might have been deleted.'}));
 				console.log("Log entry updated successfully.");
 			} else {
                 // Pass selectedLanguageName
 				 const existingEntry = await window.electronAPI.findLogEntryByTarget(selectedLanguageName, payload.target_text);
 				 if (existingEntry) throw new Error(t('errors.addLogEntryExists', { targetText: payload.target_text, default: `Entry for "${payload.target_text}" already exists.` }));
                 // Pass selectedLanguageName, payload already correct type (no language_id)
 				 await window.electronAPI.addLogEntry(selectedLanguageName, payload);
 				 console.log("Log entry added successfully.");
 			}

 			closeEntryModal();
 			// Trigger refetch with current options
 			const currentOptions: GetLogEntriesOptions = {
 				...sortOptions,
 				...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
 				...(selectedCategory && { category: selectedCategory })
 			};
 			fetchEntries(currentOptions);

 		} catch (err) {
 			 const action = editingEntry ? 'updating' : 'adding';
 			 console.error(`Error ${action} log entry for ${selectedLanguageName}:`, err);
 			 setModalError(err instanceof Error ? err.message : `An unknown error occurred while ${action}.`);
 		} finally {
 			setIsSubmittingEntry(false);
 		}
 	};

  const handleDeleteEntry = async (id: number) => {
      if (!selectedLanguageName) {
          setDeleteError(t('errors.languageNotSelected', { default: "No language selected." }));
          return;
      }
      if (!window.confirm(t('deleteConfirm', {default: 'Are you sure you want to delete this entry? This cannot be undone.'}))) { return; }
      setIsDeleting(id); setDeleteError(null);
      try {
          if (!window.electronAPI) throw new Error('Electron API not available.');
          // Pass selectedLanguageName
          const success = await window.electronAPI.deleteLogEntry(selectedLanguageName, id);
          if (success) {
               console.log(`Log entry ${id} for ${selectedLanguageName} deleted successfully.`);
                const currentOptions: GetLogEntriesOptions = {
                    ...sortOptions,
                    ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
                    ...(selectedCategory && { category: selectedCategory })
                };
               fetchEntries(currentOptions);
            }
          else { throw new Error(t('errors.deleteEntryNotFound', { default: 'Entry not found or could not be deleted.'})); }
      } catch(err) {
          console.error(`Error deleting log entry ${id} for ${selectedLanguageName}:`, err);
          setDeleteError(err instanceof Error ? err.message : t('errors.deleteEntryError', { default: 'An unknown error occurred while deleting.'}));
      } finally {
          setIsDeleting(null);
      }
  };

  const openEntryModal = (entryToEdit: LogEntry | null = null) => {
        if (!selectedLanguageName) return; // Don't open modal if no language selected
        console.log(entryToEdit ? `Opening modal to edit entry ID: ${entryToEdit.id}` : "Opening modal to add new entry");
		setEditingEntry(entryToEdit);
		setModalError(null);
		setIsModalOpen(true);
  };

  const closeEntryModal = () => {
        setIsModalOpen(false);
		setEditingEntry(null);
  };

	// --- Clear Log Handlers (Now deletes DB file) ---
	const handleClearLogRequest = () => {
		if (entries.length === 0 && !error) return; // Allow clear even if fetch failed but maybe file exists
		if (!selectedLanguageName) return; // Need language selected
		setIsConfirmingClear(true);
		setClearError(null);
	};

	const handleCancelClear = () => {
		setIsConfirmingClear(false);
	};

	const handleConfirmClear = async () => {
		if (!selectedLanguageName) {
			setClearError(t('errors.languageNotSelected', { default: "Cannot clear log: No language selected."}));
			setIsConfirmingClear(false);
			return;
		}
		setIsClearing(true);
		setClearError(null);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
            // Call the new function to delete the DB file
			await window.electronAPI.deleteLanguageLog(selectedLanguageName);
			console.log(`Log file deleted for language ${selectedLanguageName}.`);
            // Success! Clear local state and navigate back to welcome screen
            setEntries([]);
            selectLanguage(null); // Deselect language to go back to Welcome Screen

		} catch (err) {
			console.error(`Error deleting log file for language ${selectedLanguageName}:`, err);
			setClearError(err instanceof Error ? err.message : t('errors.clearLogError', { default: 'An unknown error occurred while clearing the log.'}));
		} finally {
			setIsClearing(false);
			setIsConfirmingClear(false); // Hide confirmation either way
		}
	};

	// --- Filter/Sort Handlers (Unchanged) ---
	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(event.target.value);
	};

	const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedCategory(event.target.value);
	};

    const handleSortHeaderClick = (columnName: SortableColumn) => {
        const validSortCols: SortableColumn[] = ['id', 'created_at', 'updated_at', 'target_text', 'native_text', 'category', 'kanji_form', 'kana_form', 'romanization'];
        if (!validSortCols.includes(columnName)) {
            console.warn(`Attempted to sort by invalid column: ${columnName}`);
            return;
        }
        setSortOptions(prev => ({
            sortBy: columnName,
            sortOrder: prev.sortBy === columnName && prev.sortOrder === 'DESC' ? 'ASC' : 'DESC'
        }));
    };

     const getSortIndicator = (columnName: SortableColumn) => {
        if (sortOptions.sortBy !== columnName) return null;
        return sortOptions.sortOrder === 'ASC' ? ' ▲' : ' ▼';
    };

	// Helper to format date (Unchanged)
	const formatLocalDate = (dateString: string | null | undefined) => {
		if (!dateString) return 'N/A';
		try { return new Date(dateString + 'Z').toLocaleString(); }
        catch (e) { console.error("Error formatting date:", dateString, e); return dateString; }
	};

	// Helper to create title text for ID hover (Unchanged)
	const createTimestampTitle = (entry: LogEntry) => {
		return `Added: ${formatLocalDate(entry.created_at)}\nUpdated: ${formatLocalDate(entry.updated_at)}`;
	};

  // --- Render ---
  return (
		<div style={{ height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
			{/* Header Section - Display selectedLanguageName */}
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
				<h2 style={{ margin: 0 }}>{t('tabs.grammarLog')} {selectedLanguageName ? `(${selectedLanguageName})` : ''}</h2>
				<div>
                    {/* Disable clear log if no language is selected */}
					<button onClick={handleClearLogRequest} disabled={!selectedLanguageName || isClearing || isConfirmingClear} title={t('buttons.clearLog')} style={{ padding: '8px 12px', cursor: 'pointer', marginRight: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
						{t('buttons.clearLog')}
					</button>
                    {/* Disable add entry if no language is selected */}
					<button onClick={() => openEntryModal()} disabled={!selectedLanguageName} title={t('buttons.addEntry')} style={{ padding: '8px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' }}>
						{t('buttons.addEntry')}
					</button>
				</div>
			</div>

            {/* Filter/Search Controls - Disable if no language selected */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', padding: '10px', border: '1px solid #eee', borderRadius: '4px', alignItems: 'center' }}>
                 <label htmlFor="search-term" style={{whiteSpace: 'nowrap'}}>{t('grammarLogView.searchLabel')}</label>
                <input
                    id="search-term"
                    type="text"
                    placeholder={t('grammarLogView.searchPlaceholder')}
                    value={searchTerm}
                    onChange={handleSearchChange}
                    style={{ padding: '8px', flexGrow: 1 }}
                    disabled={!selectedLanguageName}
                />
                 <label htmlFor="category-filter" style={{whiteSpace: 'nowrap'}}>{t('grammarLogView.categoryLabel')}</label>
                <select id="category-filter" value={selectedCategory} onChange={handleCategoryChange} style={{ padding: '8px', minWidth: '150px' }} disabled={!selectedLanguageName}>
                    <option value="">{t('grammarLogView.allCategories')}</option>
                    {GRAMMAR_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

			{/* Clear Log Confirmation */}
			{isConfirmingClear && selectedLanguageName && ( // Check selectedLanguageName here too
				<div style={{ border: '1px solid orange', padding: '10px', marginBottom: '15px', backgroundColor: '#fff3e0' }}>
					{/* Use translation key with replacement */}
                    <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#212529' /* Explicit dark text */ }}>
                        {t('grammarLogView.clearLogConfirm', { language: selectedLanguageName, default: `Are you sure you want to delete the entire log file for ${selectedLanguageName}? This cannot be undone.`})}
                    </p>
					<button onClick={handleConfirmClear} disabled={isClearing} style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: '3px' }}>
						{isClearing ? t('clearing', { default: 'Clearing...'}) : t('buttons.confirmDelete')}
					</button>
					<button onClick={handleCancelClear} disabled={isClearing} style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px' }}>
						{t('buttons.cancel')}
					</button>
				</div>
			)}
			{clearError && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '10px' }}>{t('errors.clearLogErrorTitle', {default: 'Error clearing log:'})} {clearError}</p>}

      {/* Display Table */}
      {isLoading && <p>{t('loading', { default: 'Loading entries...'})}</p>}
      {deleteError && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '10px' }}>{t('errors.deleteEntryErrorTitle', {default: 'Error deleting entry:'})} {deleteError}</p>}
      {error && !isLoading && <p style={{ color: 'red' }}>{t('errors.loadTableError', { default: 'Error loading table:'})} {error}</p>}

      {/* Only render table if language selected, not loading, and no error */}
      {selectedLanguageName && !isLoading && !error && (
        <>
          {entries.length === 0 && !searchTerm && !selectedCategory ? (
             <p>{t('grammarLogView.noEntries')}</p>
           ) : entries.length === 0 && (searchTerm || selectedCategory) ? (
             <p>{t('grammarLogView.noEntriesMatch')}</p>
           ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                 <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
					   <th style={{ padding: '8px', width: '40px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('id')} title={t('grammarLogView.tooltips.sortById')}>
                           {t('grammarLogView.headers.id')}{getSortIndicator('id')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('target_text')} title={t('grammarLogView.tooltips.sortByTarget')}>
                           {t('grammarLogView.headers.target')}{getSortIndicator('target_text')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('native_text')} title={t('grammarLogView.tooltips.sortByNative')}>
                           {t('grammarLogView.headers.native')}{getSortIndicator('native_text')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('category')} title={t('grammarLogView.tooltips.sortByCategory')}>
                           {t('grammarLogView.headers.category')}{getSortIndicator('category')}
                       </th>
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('kanji_form')} title={t('grammarLogView.tooltips.sortByKanji')}>
                            {t('grammarLogView.headers.kanji')}{getSortIndicator('kanji_form')}
                        </th>
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('kana_form')} title={t('grammarLogView.tooltips.sortByReading')}>
                            {t('grammarLogView.headers.reading')}{getSortIndicator('kana_form')}
                        </th>
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('romanization')} title={t('grammarLogView.tooltips.sortByRomanization')}>
                            {t('grammarLogView.headers.romanization')}{getSortIndicator('romanization')}
                        </th>
					   <th style={{ padding: '8px' }}>{t('grammarLogView.headers.notes')}</th>
					   <th style={{ padding: '8px', width: '100px' }}>{t('grammarLogView.headers.actions')}</th>
                 </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #eee' }}>
					<td style={{ padding: '8px', fontSize: '0.9em', color: '#666' }}>
                        {/* Use translation key for tooltip */}
						<span title={t('grammarLogView.tooltips.id', { added: formatLocalDate(entry.created_at), updated: formatLocalDate(entry.updated_at)})} style={{cursor: 'help'}}>
							{entry.id}
						</span>
					</td>
					<td style={{ padding: '8px' }}>{entry.target_text}</td>
                    <td style={{ padding: '8px' }}>{entry.native_text ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.category ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.kanji_form ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.kana_form ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.romanization ?? ''}</td>
                    <td style={{ padding: '8px' }} title={entry.example_sentence ? `Example: ${entry.example_sentence}\nNote: ${entry.writing_system_note || 'N/A'}` : (entry.writing_system_note ? `Note: ${entry.writing_system_note}` : undefined)}>
						{entry.notes ?? ''}
                        {entry.example_sentence && <span style={{fontSize: '0.8em', color: 'gray', marginLeft: '5px'}}>{t('grammarLogView.notesMarkers.example', { default: '(Ex)'})}</span>}
                        {entry.writing_system_note && <span style={{fontSize: '0.8em', color: 'blue', marginLeft: '5px'}}>{t('grammarLogView.notesMarkers.system', { default: '(Sys)'})}</span>}
                    </td>
                    <td style={{ padding: '8px' }}>
                       <button onClick={() => handleDeleteEntry(entry.id)} disabled={isDeleting === entry.id} style={{ color: 'red', cursor: 'pointer', border: 'none', background: 'none', padding: '5px', marginRight: '10px'}} title={t('grammarLogView.tooltips.deleteEntry')} >
                           {isDeleting === entry.id ? t('deleting', {default: 'Deleting...'}) : t('buttons.delete')}
                       </button>
                       <button onClick={() => openEntryModal(entry)} disabled={isDeleting === entry.id} title={t('grammarLogView.tooltips.editEntry')} style={{ cursor: 'pointer', border: 'none', background: 'none', padding: '5px'}}>{t('buttons.edit')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

		{/* Add/Edit New Entry Modal - Remove languageId prop */}
		{isModalOpen && selectedLanguageName && (
			<Modal
				isOpen={isModalOpen}
				onClose={closeEntryModal}
				onSave={handleModalSave}
				initialData={editingEntry ? {
					target_text: editingEntry.target_text,
					native_text: editingEntry.native_text ?? undefined,
					category: editingEntry.category ?? undefined,
                    notes: editingEntry.notes ?? undefined,
                    example_sentence: editingEntry.example_sentence ?? undefined,
                    kanji_form: editingEntry.kanji_form ?? undefined,
                    kana_form: editingEntry.kana_form ?? undefined,
                    romanization: editingEntry.romanization ?? undefined,
                    writing_system_note: editingEntry.writing_system_note ?? undefined,
				} : undefined}
				mode={editingEntry ? 'edit' : 'add'}
				// languageId prop removed
			/>
		)}
	</div>
  );
};

export default GrammarLogView;