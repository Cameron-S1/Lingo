import React, { useState, useEffect, useCallback } from 'react'; // Removed useMemo as it wasn't used
import { useLanguage } from '../contexts/LanguageContext';
import type { LogEntry, LogEntryData, GetLogEntriesOptions } from '../database'; // Import necessary types
import Modal from './Modal'; // Import the Modal component
import { GRAMMAR_CATEGORIES } from '../constants'; // Import shared categories

// Define shape for form data (can be new or existing)
type EntryFormData = Omit<LogEntryData, 'language_id'>;
// Define type for sortable columns - Ensure this matches GetLogEntriesOptions['sortBy']
type SortableColumn = NonNullable<GetLogEntriesOptions['sortBy']> | 'kanji_form' | 'kana_form' | 'romanization';


const GrammarLogView: React.FC = () => {
  const { activeLanguage } = useLanguage();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [languageId, setLanguageId] = useState<number | null>(null);
  // Removed distinctCategories state: const [distinctCategories, setDistinctCategories] = useState<string[]>([]);

  // State for Filters/Search/Sort
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortOptions, setSortOptions] = useState<GetLogEntriesOptions>({
      sortBy: 'created_at', // Default sort
      sortOrder: 'DESC',
  });

  // State for Add/Edit Entry Modal
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
	// const [entryFormData, setEntryFormData] = useState<EntryFormData>({ // No longer needed here, handled in Modal
	// 	target_text: '', native_text: '', category: '', notes: '', example_sentence: ''
	// });
	const [isSubmittingEntry, setIsSubmittingEntry] = useState<boolean>(false); // Keep for tracking save operation
	const [modalError, setModalError] = useState<string | null>(null); // For errors during save operation from modal

	// State for deleting log entry
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

	// State for clearing log
	const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
	const [isClearing, setIsClearing] = useState<boolean>(false);
	const [clearError, setClearError] = useState<string | null>(null);


  // --- Language ID Fetching (useEffect) ---
  useEffect(() => {
    const fetchLanguageId = async () => {
         if (activeLanguage && window.electronAPI) {
            try {
                 const id = await window.electronAPI.getLanguageIdByName(activeLanguage);
                 setLanguageId(id);
                 // Reset filters when language changes
                 setSearchTerm('');
                 setSelectedCategory('');
                 setSortOptions({ sortBy: 'created_at', sortOrder: 'DESC' });
            } catch (err) {
                console.error(`Error fetching language ID for ${activeLanguage}:`, err);
                setError(`Failed to get ID for language: ${activeLanguage}`);
                setLanguageId(null);
            }
        } else {
            setLanguageId(null);
             // Clear filters if language is deselected
            setSearchTerm('');
            setSelectedCategory('');
            setSortOptions({ sortBy: 'created_at', sortOrder: 'DESC' });
        }
    };
    fetchLanguageId();
  }, [activeLanguage]);

  // --- Log Entry Fetching (useEffect & useCallback) ---
  // Define fetch function
  const fetchEntries = useCallback(async (options: GetLogEntriesOptions) => {
    if (languageId === null) { setEntries([]); /* Removed setDistinctCategories */ return; }
		setError(null); setDeleteError(null); setClearError(null);
    setIsLoading(true);
    console.log(`Fetching entries for language ID: ${languageId} with options:`, options);
    try {
      if (window.electronAPI) {
        const fetchedEntries = await window.electronAPI.getLogEntries(languageId, options);
        setEntries(fetchedEntries);

        // Removed logic for setting distinctCategories
        // if (!options.category) {
        //      const categories = [...new Set(fetchedEntries.map(entry => entry.category).filter(cat => cat != null))] as string[];
        //      setDistinctCategories(categories.sort());
        // } else {
        //     // If filtering, keep the broader list of categories available in the dropdown
        //     // To get the *full* list even when filtered, we'd need another fetch or cache mechanism
        // }
        console.log(`Fetched ${fetchedEntries.length} entries matching criteria.`);
      } else { setError('Electron API not available.'); }
    } catch (err) { console.error('Error fetching log entries:', err); setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching entries.');
    } finally { setIsLoading(false); }
  }, [languageId]); // Only depends on languageId now

  // useEffect hook to call fetchEntries whenever relevant state changes
  useEffect(() => {
    const options: GetLogEntriesOptions = {
        ...sortOptions,
        // Include new fields in search
        ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }), // Existing search, getLogEntries in DB was already updated
        ...(selectedCategory && { category: selectedCategory })
    };
    fetchEntries(options);
  }, [fetchEntries, languageId, searchTerm, selectedCategory, sortOptions]); // Add all dependencies here


  // --- Add/Edit/Delete Entry Handlers ---
	// Renamed/Refactored from handleEntryFormSubmit to handle data from Modal's onSave
	const handleModalSave = async (formDataFromModal: Partial<LogEntryData>) => {
 		setIsSubmittingEntry(true);
 		setModalError(null);

		// Ensure required fields are present from modal data (Modal should handle this, but double-check)
		if (!formDataFromModal.target_text?.trim() && !formDataFromModal.kanji_form?.trim()) { // Target or Kanji form required
			setModalError("Target text or Kanji/Character form cannot both be empty.");
			setIsSubmittingEntry(false);
			return;
		}
		if (languageId === null) {
			setModalError("Cannot submit entry: Language ID not found.");
			setIsSubmittingEntry(false);
			return;
		}
		// Ensure target_text has a value if kanji_form is empty. The DB might require target_text.
		const finalTargetText = formDataFromModal.target_text?.trim() || formDataFromModal.kanji_form?.trim() || '';


 		const payload: Omit<LogEntryData, 'language_id'> = {
			target_text: finalTargetText, // Use the determined finalTargetText
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
 				console.log(`Updating log entry ID: ${editingEntry.id}`);
 				const success = await window.electronAPI.updateLogEntry(editingEntry.id, payload);
 				if (!success) throw new Error('Failed to update entry. It might have been deleted.');
 				console.log("Log entry updated successfully.");
 			} else {
 				 const entryDataForAdd: LogEntryData = { language_id: languageId, ...payload };
 				 const existingEntry = await window.electronAPI.findLogEntryByTarget(languageId, entryDataForAdd.target_text);
 				 if (existingEntry) throw new Error(`Entry for "${entryDataForAdd.target_text}" already exists.`);
 				 await window.electronAPI.addLogEntry(entryDataForAdd);
 				 console.log("Log entry added successfully.");
 			}

 			closeEntryModal();
 			// Manually trigger refetch with current options after add/edit
 			const currentOptions: GetLogEntriesOptions = {
 				...sortOptions,
 				...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
 				...(selectedCategory && { category: selectedCategory })
 			};
 			fetchEntries(currentOptions);

 		} catch (err) {
 			 const action = editingEntry ? 'updating' : 'adding';
 			 console.error(`Error ${action} log entry:`, err);
 			 setModalError(err instanceof Error ? err.message : `An unknown error occurred while ${action}.`);
 		} finally {
 			setIsSubmittingEntry(false);
 		}
 	};

  const handleDeleteEntry = async (id: number) => {
      if (!window.confirm('Are you sure you want to delete this entry? This cannot be undone.')) { return; }
      setIsDeleting(id); setDeleteError(null);
      try {
          if (!window.electronAPI) throw new Error('Electron API not available.');
          const success = await window.electronAPI.deleteLogEntry(id);
          if (success) {
               console.log(`Log entry ${id} deleted successfully.`);
               // Manually trigger refetch with current options
                const currentOptions: GetLogEntriesOptions = {
                    ...sortOptions,
                    ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
                    ...(selectedCategory && { category: selectedCategory })
                };
               fetchEntries(currentOptions);
            }
          else { throw new Error('Entry not found or could not be deleted.'); }
      } catch(err) { console.error(`Error deleting log entry ${id}:`, err); setDeleteError(err instanceof Error ? err.message : 'An unknown error occurred while deleting.');
      } finally { setIsDeleting(null); }
  };

  const openEntryModal = (entryToEdit: LogEntry | null = null) => {
        console.log(entryToEdit ? `Opening modal to edit entry ID: ${entryToEdit.id}` : "Opening modal to add new entry");
		setEditingEntry(entryToEdit); // Set the entry being edited (or null for adding)
		setModalError(null); // Clear any previous modal errors
		setIsModalOpen(true); // Open the modal
  };

  const closeEntryModal = () => {
        setIsModalOpen(false);
		setEditingEntry(null); // Clear editing state on close
  };

	// --- Clear Log Handlers ---
	const handleClearLogRequest = () => {
		if (entries.length === 0) return;
		setIsConfirmingClear(true);
		setClearError(null);
	};

	const handleCancelClear = () => {
		setIsConfirmingClear(false);
	};

	const handleConfirmClear = async () => {
		if (languageId === null) {
			setClearError("Cannot clear log: Language ID not found.");
			setIsConfirmingClear(false);
			return;
		}
		setIsClearing(true);
		setClearError(null);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
			const result = await window.electronAPI.clearLogEntriesForLanguage(languageId);
			console.log(`Log cleared for language ${languageId}. Rows affected: ${result.rowsAffected}`);
            // Manually trigger refetch with current options
            const currentOptions: GetLogEntriesOptions = {
                ...sortOptions,
                ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
                ...(selectedCategory && { category: selectedCategory })
            };
            fetchEntries(currentOptions);
		} catch (err) {
			console.error(`Error clearing log entries for language ${languageId}:`, err);
			setClearError(err instanceof Error ? err.message : 'An unknown error occurred while clearing the log.');
		} finally {
			setIsClearing(false);
			setIsConfirmingClear(false);
		}
	};

	// --- Filter/Sort Handlers ---
	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(event.target.value);
	};

	const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedCategory(event.target.value);
	};

    const handleSortHeaderClick = (columnName: SortableColumn) => {
        // Extended sortable columns
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


	// Helper to format date, assuming DB stores UTC without explicit timezone marker
	const formatLocalDate = (dateString: string | null | undefined) => {
		if (!dateString) return 'N/A';
		try {
			return new Date(dateString + 'Z').toLocaleString();
		} catch (e) {
			console.error("Error formatting date:", dateString, e);
			return dateString;
		}
	};

	// Helper to create title text for ID hover
	const createTimestampTitle = (entry: LogEntry) => {
		return `Added: ${formatLocalDate(entry.created_at)}\nUpdated: ${formatLocalDate(entry.updated_at)}`;
	};

  // --- Render ---
  return (
		<div style={{ height: 'calc(100vh - 100px)', overflowY: 'auto' }}>
			{/* Header Section */}
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
				<h2 style={{ margin: 0 }}>Grammar Log {activeLanguage ? `(${activeLanguage})` : ''}</h2>
				<div>
					<button onClick={handleClearLogRequest} disabled={entries.length === 0 || isClearing || isConfirmingClear} title="Clear All Entries" style={{ padding: '8px 12px', cursor: 'pointer', marginRight: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
						Clear Log
					</button>
					<button onClick={() => openEntryModal()} title="Add New Entry" style={{ padding: '8px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' }}>
						+ Add Entry
					</button>
				</div>
			</div>

            {/* Filter/Search Controls */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', padding: '10px', border: '1px solid #eee', borderRadius: '4px', alignItems: 'center' }}>
                 <label htmlFor="search-term" style={{whiteSpace: 'nowrap'}}>Search:</label>
                <input
                    id="search-term"
                    type="text"
                    placeholder="Target/Native/Notes..."
                    value={searchTerm}
                    onChange={handleSearchChange}
                    style={{ padding: '8px', flexGrow: 1 }}
                />
                 <label htmlFor="category-filter" style={{whiteSpace: 'nowrap'}}>Category:</label>
                <select id="category-filter" value={selectedCategory} onChange={handleCategoryChange} style={{ padding: '8px', minWidth: '150px' }}>
                    <option value="">All Categories</option>
                    {/* Use shared GRAMMAR_CATEGORIES for options */}
                    {GRAMMAR_CATEGORIES.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

			{/* Clear Log Confirmation */}
			{isConfirmingClear && (
				<div style={{ border: '1px solid orange', padding: '10px', marginBottom: '15px', backgroundColor: '#fff3e0' }}>
					<p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>Are you sure you want to delete ALL entries for {activeLanguage}? This cannot be undone.</p>
					<button onClick={handleConfirmClear} disabled={isClearing} style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#d32f2f', color: 'white', border: 'none', borderRadius: '3px' }}>
						{isClearing ? 'Clearing...' : 'Yes, Delete All'}
					</button>
					<button onClick={handleCancelClear} disabled={isClearing} style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px' }}>
						Cancel
					</button>
				</div>
			)}
			{clearError && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '10px' }}>Error clearing log: {clearError}</p>}

      {/* Display Table */}
      {isLoading && <p>Loading entries...</p>}
      {deleteError && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '10px' }}>Error deleting entry: {deleteError}</p>}
      {error && !isLoading && <p style={{ color: 'red' }}>Error loading table: {error}</p>}

      {!isLoading && !error && (
        <>
          {entries.length === 0 && !searchTerm && !selectedCategory ? (
            <p>No log entries found for this language. Click '+ Add Entry' or 'Clear Log' above.</p>
           ) : entries.length === 0 && (searchTerm || selectedCategory) ? (
             <p>No log entries match the current search/filter criteria.</p>
           ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
              <thead>
                 {/* Make headers clickable for sorting */}
                 <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
					   <th style={{ padding: '8px', width: '40px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('id')} title="Sort by ID">
                           ID{getSortIndicator('id')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('target_text')} title="Sort by Target">
                           Target{getSortIndicator('target_text')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('native_text')} title="Sort by Native">
                           Native{getSortIndicator('native_text')}
                       </th>
					   <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('category')} title="Sort by Category">
                           Category{getSortIndicator('category')}
                       </th>
                        {/* New Columns for Character-based Languages */}
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('kanji_form')} title="Sort by Kanji/Character Form">
                            Kanji{getSortIndicator('kanji_form')}
                        </th>
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('kana_form')} title="Sort by Kana/Reading Form">
                            Reading{getSortIndicator('kana_form')}
                        </th>
                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSortHeaderClick('romanization')} title="Sort by Romanization">
                            Romanization{getSortIndicator('romanization')}
                        </th>
					   <th style={{ padding: '8px' }}>Notes</th> {/* Notes not easily sortable */}
					   <th style={{ padding: '8px', width: '100px' }}>Actions</th>
                 </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} style={{ borderBottom: '1px solid #eee' }}>
					<td style={{ padding: '8px', fontSize: '0.9em', color: '#666' }}>
						<span title={createTimestampTitle(entry)} style={{cursor: 'help'}}>
							{entry.id}
						</span>
					</td>
					<td style={{ padding: '8px' }}>{entry.target_text}</td>
                    <td style={{ padding: '8px' }}>{entry.native_text ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.category ?? ''}</td>
                     {/* Display new fields */}
                    <td style={{ padding: '8px' }}>{entry.kanji_form ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.kana_form ?? ''}</td>
                    <td style={{ padding: '8px' }}>{entry.romanization ?? ''}</td>
                    <td style={{ padding: '8px' }} title={entry.example_sentence ? `Example: ${entry.example_sentence}\nNote: ${entry.writing_system_note || 'N/A'}` : (entry.writing_system_note ? `Note: ${entry.writing_system_note}` : undefined)}>
						{entry.notes ?? ''}
                        {entry.example_sentence && <span style={{fontSize: '0.8em', color: 'gray', marginLeft: '5px'}}>(Ex)</span>}
                        {entry.writing_system_note && <span style={{fontSize: '0.8em', color: 'blue', marginLeft: '5px'}}>(Sys)</span>}
                    </td>
                    <td style={{ padding: '8px' }}>
                       <button onClick={() => handleDeleteEntry(entry.id)} disabled={isDeleting === entry.id} style={{ color: 'red', cursor: 'pointer', border: 'none', background: 'none', padding: '5px', marginRight: '10px'}} title="Delete Entry" >
                           {isDeleting === entry.id ? 'Deleting...' : 'Delete'}
                       </button>
                       <button onClick={() => openEntryModal(entry)} disabled={isDeleting === entry.id} title="Edit Entry" style={{ cursor: 'pointer', border: 'none', background: 'none', padding: '5px'}}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

		{/* Add/Edit New Entry Modal */}
		{isModalOpen && languageId !== null && ( // Ensure languageId is available before rendering
			<Modal
				isOpen={isModalOpen}
				onClose={closeEntryModal}
				onSave={handleModalSave} // Use the new handler
				initialData={editingEntry ? { // Pass existing data if editing
					target_text: editingEntry.target_text,
					native_text: editingEntry.native_text ?? undefined, // Use undefined if null
					category: editingEntry.category ?? undefined,
                    notes: editingEntry.notes ?? undefined,
                    example_sentence: editingEntry.example_sentence ?? undefined,
                    kanji_form: editingEntry.kanji_form ?? undefined,
                    kana_form: editingEntry.kana_form ?? undefined,
                    romanization: editingEntry.romanization ?? undefined,
                    writing_system_note: editingEntry.writing_system_note ?? undefined,
				} : undefined} // Pass undefined if adding
				mode={editingEntry ? 'edit' : 'add'} // Set mode correctly
				languageId={languageId} // Pass language ID
			/>
			// We can add {modalError && <p style={{ color: 'red' }}>{modalError}</p>} outside the modal if needed
		)}
	</div>
  );
};

export default GrammarLogView;