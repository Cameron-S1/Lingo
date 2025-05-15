import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ReviewItem, LogEntryData, ReviewStatus, LogEntry } from '../database';
import Modal from './Modal';
import { useUI } from '../contexts/UIContext'; // For translations

const ReviewView: React.FC = () => {
	const { selectedLanguageName } = useLanguage(); // Use selectedLanguageName
    const { t } = useUI(); // For translations
	const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
	const [relatedLogEntries, setRelatedLogEntries] = useState<Map<number, LogEntry>>(new Map());
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [actionItemId, setActionItemId] = useState<number | null>(null); // For disabling buttons during action
	const [isClearing, setIsClearing] = useState<boolean>(false);

	// State for editing modal
	const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
	const [editingItem, setEditingItem] = useState<ReviewItem | null>(null);
	const [editedItemData, setEditedItemData] = useState<Partial<LogEntryData> | null>(null);

	const formatLocalDate = (dateString: string | null | undefined) => {
		if (!dateString) return 'N/A';
		try { return new Date(dateString + 'Z').toLocaleString(); }
        catch (e) { console.error("Error formatting date:", dateString, e); return dateString; }
	};

	const fetchReviewItems = useCallback(async () => {
        // Use selectedLanguageName
		if (!selectedLanguageName) {
			setReviewItems([]);
			setRelatedLogEntries(new Map());
            setError(null); // Clear error when no language selected
			return;
		}
		setIsLoading(true);
		setError(null);
		setRelatedLogEntries(new Map());
		console.log(`Fetching PENDING review items for language: ${selectedLanguageName}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');

            // Pass selectedLanguageName
			const items = await window.electronAPI.getReviewItems(selectedLanguageName, 'pending');
			setReviewItems(items);
			console.log(`Fetched ${items.length} pending review items for ${selectedLanguageName}.`);

			const duplicateItemsWithRefs = items.filter(item => item.review_type === 'duplicate' && item.related_log_entry_id != null);
			const relatedEntryIds = duplicateItemsWithRefs.map(item => item.related_log_entry_id as number);

			if (relatedEntryIds.length > 0) {
				console.log(`Fetching related log entries for ${selectedLanguageName} (IDs: ${relatedEntryIds.join(', ')})`);
                // Pass selectedLanguageName
				const fetchedEntries = await window.electronAPI.getLogEntriesByIds(selectedLanguageName, relatedEntryIds);
				const entriesMap = new Map(fetchedEntries.map(entry => [entry.id, entry]));
				setRelatedLogEntries(entriesMap);
				console.log(`Fetched ${fetchedEntries.length} related log entries for ${selectedLanguageName}.`);
			}

		} catch (err) {
			console.error(`Error fetching review items for ${selectedLanguageName}:`, err);
			setError(err instanceof Error ? err.message : t('errors.fetchReviewItems'));
            setReviewItems([]); // Clear items on error
		} finally {
			setIsLoading(false);
		}
	}, [selectedLanguageName, t]); // Depend on selectedLanguageName and t

	useEffect(() => {
		fetchReviewItems();
	}, [fetchReviewItems]);

	const handleApprove = async (item: ReviewItem) => {
		if (!selectedLanguageName) { // Check selectedLanguageName
			setError(t('errors.languageNotSelected'));
			return;
		}
		setActionItemId(item.id);
		setError(null);
		console.log(`Attempting to approve review item ${item.id} for ${selectedLanguageName}`);

		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');

			let logData: LogEntryData; // No language_id here
			const wasJustEdited = editedItemData && editingItem?.id === item.id;

			if (wasJustEdited) {
				console.log(`Using edited data for approval of item ${item.id}`);
				logData = { // No language_id
					target_text: editedItemData.target_text ?? item.target_text ?? '',
					native_text: editedItemData.native_text ?? null,
					category: editedItemData.category ?? '',
					notes: editedItemData.notes ?? null,
					example_sentence: editedItemData.example_sentence ?? null,
					kanji_form: editedItemData.kanji_form ?? null,
					kana_form: editedItemData.kana_form ?? null,
					romanization: editedItemData.romanization ?? null,
					writing_system_note: editedItemData.writing_system_note ?? null,
				};
				if (!logData.category) console.warn(`Approving item ${item.id} without a category.`);
			} else {
				console.log(`Using original review item data for approval of item ${item.id}`);
                const relatedEntryForFallback = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;
				logData = { // No language_id
					target_text: item.target_text ?? '',
					native_text: item.native_text ?? (relatedEntryForFallback?.native_text ?? null),
                    category: item.category_guess ?? (relatedEntryForFallback?.category ?? 'Other'),
					notes: (item.original_snippet && item.original_snippet !== item.target_text ? item.original_snippet : undefined) ?? (relatedEntryForFallback?.notes ?? null),
					example_sentence: relatedEntryForFallback?.example_sentence ?? null,
					kanji_form: item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? null),
					kana_form: item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? null),
					romanization: item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? null),
					writing_system_note: item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? null),
				};
				if (!logData.target_text) { throw new Error("Cannot approve item with empty target text."); }
			}

			console.log(`Adding/Checking approved item ${item.id} in log entries for ${selectedLanguageName}...`);
            // Pass selectedLanguageName
			const existingEntry = await window.electronAPI.findLogEntryByTarget(selectedLanguageName, logData.target_text);
			const shouldSkipAdd = existingEntry && existingEntry.id !== item.related_log_entry_id;

			if (shouldSkipAdd) {
				console.log(`Entry for "${logData.target_text}" already exists (ID: ${existingEntry.id}) in ${selectedLanguageName}. Skipping add.`);
			} else {
                console.log(existingEntry ? `Related duplicate entry found (ID: ${existingEntry.id}). Will add approved data for ${selectedLanguageName}.` : `No existing entry found for "${logData.target_text}" in ${selectedLanguageName}. Adding new entry.`);
                // Pass selectedLanguageName
				await window.electronAPI.addLogEntry(selectedLanguageName, logData);
				console.log(`Item ${item.id} data added to log entries for ${selectedLanguageName} successfully.`);
			}

			console.log(`Deleting processed review item ${item.id} for ${selectedLanguageName}...`);
            // Pass selectedLanguageName
			const deleteSuccess = await window.electronAPI.deleteReviewItem(selectedLanguageName, item.id);
			if (!deleteSuccess) {
				console.error(`Failed to delete review item ${item.id} for ${selectedLanguageName} after approval.`);
				setError(t('reviewView.approveError', { id: item.id }));
			}

			if (wasJustEdited) {
				console.log(`Clearing editing state for item ${item.id}`);
				setEditingItem(null);
				setEditedItemData(null);
			}
			await fetchReviewItems();
		} catch (err) {
			console.error(`Error approving review item ${item.id} for ${selectedLanguageName}:`, err);
			setError(err instanceof Error ? err.message : t('errors.unknown'));
		} finally {
			setActionItemId(null);
		}
	};

	const handleDeleteItem = async (id: number) => {
        if (!selectedLanguageName) {
            setError(t('errors.languageNotSelected'));
            return;
        }
		if (!window.confirm(t('reviewView.deleteConfirm'))) return;

		setActionItemId(id);
		setError(null);
		console.log(`Attempting to delete review item ${id} for ${selectedLanguageName}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
            // Pass selectedLanguageName
			const success = await window.electronAPI.deleteReviewItem(selectedLanguageName, id);
			if (success) {
				console.log(`Review item ${id} for ${selectedLanguageName} deleted successfully.`);
				if (editingItem?.id === id) {
					setEditingItem(null);
					setEditedItemData(null);
				}
				await fetchReviewItems();
			} else {
				throw new Error(`Failed to delete review item ${id}.`);
			}
		} catch (err) {
			console.error(`Error deleting review item ${id} for ${selectedLanguageName}:`, err);
			setError(err instanceof Error ? err.message : t('errors.unknown'));
		} finally {
			setActionItemId(null);
		}
	};

	const handleClearPendingReviews = async () => {
		if (!selectedLanguageName || reviewItems.length === 0) return;
		if (!window.confirm(t('reviewView.clearAllConfirm', { count: reviewItems.length, language: selectedLanguageName }))) return;

		setIsClearing(true);
		setError(null);
		console.log(`Attempting to clear all pending review items for language: ${selectedLanguageName}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
            // Pass selectedLanguageName
			const result = await window.electronAPI.clearReviewItemsForLanguage(selectedLanguageName, 'pending');
			console.log(`Cleared ${result.rowsAffected} pending review items for ${selectedLanguageName}.`);
			setEditingItem(null);
			setEditedItemData(null);
			await fetchReviewItems();
		} catch (err) {
			console.error(`Error clearing pending review items for ${selectedLanguageName}:`, err);
			setError(err instanceof Error ? err.message : t('errors.unknown'));
		} finally {
			setIsClearing(false);
		}
	};

	const handleEditClick = (item: ReviewItem) => {
        if (!selectedLanguageName) return; // Should not happen if item is displayed
		console.log(`Opening edit modal for review item ID: ${item.id} for ${selectedLanguageName}`);
		setEditingItem(item);
        const relatedEntryForFallback = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;
        const prefillData = editedItemData && editingItem?.id === item.id ? editedItemData : {
            target_text: item.target_text ?? '',
            native_text: item.native_text ?? '',
            category: (item.category_guess ?? (relatedEntryForFallback?.category ?? undefined)) || '',
            notes: ((item.original_snippet && item.original_snippet !== item.target_text ? item.original_snippet : undefined) ?? (relatedEntryForFallback?.notes ?? undefined)) || '',
            example_sentence: relatedEntryForFallback?.example_sentence || '',
            kanji_form: (item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? undefined)) || '',
            kana_form: (item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? undefined)) || '',
            romanization: (item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? undefined)) || '',
            writing_system_note: (item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? undefined)) || '',
        };
		setEditedItemData(prefillData as Partial<LogEntryData>);
		setIsModalOpen(true);
	};

	const handleModalClose = () => setIsModalOpen(false);

	const handleModalSave = async (updatedData: Partial<LogEntryData>): Promise<void> => {
		console.log("Saving edited data from modal to component state for item:", editingItem?.id, updatedData);
		if (editingItem) setEditedItemData(updatedData);
        else console.error("Modal save called without an editing item set!");
		handleModalClose();
	};

	return (
		<div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
				<h2 style={{ margin: 0 }}>{t('reviewView.title', { language: selectedLanguageName || 'N/A' })}</h2>
				<button
					onClick={handleClearPendingReviews}
					disabled={!selectedLanguageName || reviewItems.length === 0 || isLoading || isClearing}
					title={t('reviewView.tooltips.clearAllPending')}
					style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#ffb300', color: 'black', border: 'none', borderRadius: '4px' }}
				>
					{isClearing ? t('clearing', {default: 'Clearing...'}) : t('buttons.clearAllPending')}
				</button>
			</div>
			<p>{t('reviewView.description')}</p>

			{isLoading && <p>{t('reviewView.loading')}</p>}
			{error && <p style={{ color: 'red', border: '1px solid red', padding: '10px' }}>Error: {error}</p>}
			{!selectedLanguageName && !isLoading && <p>{t('errors.selectLanguagePrompt', {default: 'Please select a language to review items.'})}</p>}
            {selectedLanguageName && !isLoading && !error && reviewItems.length === 0 && <p>{t('reviewView.noItems')}</p>}

			{selectedLanguageName && !isLoading && !error && reviewItems.length > 0 && (
				<ul style={{ listStyle: 'none', padding: 0 }}>
					{reviewItems.map((item) => {
						const existingEntry = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;
						const isEdited = editingItem?.id === item.id && editedItemData;
                        let displayData: Record<string, string | null> = {};
                        if (isEdited && editedItemData) {
                            displayData = {
                                target: editedItemData.target_text ?? item.target_text ?? 'N/A',
                                native: editedItemData.native_text ?? item.native_text ?? 'N/A',
                                category: editedItemData.category ?? item.category_guess ?? 'N/A',
                                notes: editedItemData.notes ?? item.original_snippet ?? 'N/A',
                                example: editedItemData.example_sentence ?? 'N/A',
                                kanji: editedItemData.kanji_form ?? item.ai_extracted_kanji_form ?? 'N/A',
                                kana: editedItemData.kana_form ?? item.ai_extracted_kana_form ?? 'N/A',
                                roman: editedItemData.romanization ?? item.ai_extracted_romanization ?? 'N/A',
                                sysNote: editedItemData.writing_system_note ?? item.ai_extracted_writing_system_note ?? 'N/A'
                            };
                        } else {
                             const relatedEntryForFallback = existingEntry;
                            displayData = {
                                target: item.target_text ?? 'N/A',
                                native: item.native_text ?? 'N/A',
                                category: item.category_guess ?? (relatedEntryForFallback?.category ?? 'N/A'),
                                notes: (item.original_snippet && item.original_snippet !== item.target_text ? `(Snippet: ${item.original_snippet.substring(0, 50)}...)` : (relatedEntryForFallback?.notes ?? 'N/A')),
                                example: relatedEntryForFallback?.example_sentence ?? 'N/A',
                                kanji: item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? 'N/A'),
                                kana: item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? 'N/A'),
                                roman: item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? 'N/A'),
                                sysNote: item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? 'N/A')
                            };
                        }
						return (
							<li key={item.id}
                                className="review-list-item"
                                style={{
                                    border: isEdited ? '2px solid #007bff' : '1px solid transparent',
                                    marginBottom: '10px', padding: '10px', borderRadius: '4px',
                                }}
                            >
								<div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
									<div style={{ flex: 1 }}>
										<strong>{t('reviewView.reviewItemHeader', {id: item.id})}</strong> {isEdited && <span style={{color: '#007bff', fontWeight:'bold'}}>{t('reviewView.editedMarker')}</span>}<br />
										<strong>{t('reviewView.fields.type')}</strong> {item.review_type} <br />
										<strong>{t('reviewView.fields.target')}</strong> {displayData.target} <br />
										<strong>{t('reviewView.fields.native')}</strong> {displayData.native} <br />
										<strong>{t('reviewView.fields.category')}</strong> {displayData.category} <br />
										<strong>{t('reviewView.fields.notes')}</strong> {displayData.notes} <br />
										<strong>{t('reviewView.fields.example')}</strong> {displayData.example} <br />
                                        <strong>{t('reviewView.fields.kanji')}</strong> {displayData.kanji} <br />
                                        <strong>{t('reviewView.fields.kana')}</strong> {displayData.kana} <br />
                                        <strong>{t('reviewView.fields.romanization')}</strong> {displayData.roman} <br />
                                        <strong>{t('reviewView.fields.writingSystemNote')}</strong> {displayData.sysNote} <br />
										{item.original_snippet && !displayData.notes?.startsWith('(Snippet:') && <><strong>{t('reviewView.fields.fullSnippet')}</strong> <pre className="review-snippet-pre" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>{item.original_snippet}</pre></>}
										{item.ai_suggestion && <><strong>{t('reviewView.fields.aiSuggestion')}</strong> {item.ai_suggestion} <br /></>}
										<strong>{t('reviewView.fields.status')}</strong> {item.status} <br />
										<small>{t('reviewView.fields.created')} {formatLocalDate(item.created_at)}</small>
									</div>
									{existingEntry && (
										<div style={{ flex: 1, borderLeft: '2px solid #aaa', paddingLeft: '15px' }}>
											<strong>{t('reviewView.existingEntryHeader', {id: existingEntry.id})}</strong><br />
											<strong>{t('reviewView.fields.target')}</strong> {existingEntry.target_text} <br />
											<strong>{t('reviewView.fields.native')}</strong> {existingEntry.native_text ?? 'N/A'} <br />
											<strong>{t('reviewView.fields.category')}</strong> {existingEntry.category ?? 'N/A'} <br />
											<strong>{t('reviewView.fields.notes')}</strong> {existingEntry.notes ?? 'N/A'} <br />
											<strong>{t('reviewView.fields.example')}</strong> {existingEntry.example_sentence ?? 'N/A'} <br />
                                            <strong>{t('reviewView.fields.kanji')}</strong> {existingEntry.kanji_form ?? 'N/A'} <br />
                                            <strong>{t('reviewView.fields.kana')}</strong> {existingEntry.kana_form ?? 'N/A'} <br />
                                            <strong>{t('reviewView.fields.romanization')}</strong> {existingEntry.romanization ?? 'N/A'} <br />
                                            <strong>{t('reviewView.fields.writingSystemNote')}</strong> {existingEntry.writing_system_note ?? 'N/A'} <br />
											<small>{t('reviewView.fields.added')} {formatLocalDate(existingEntry.created_at)}</small><br />
                      						<small>{t('reviewView.fields.updated')} {formatLocalDate(existingEntry.updated_at)}</small>
										</div>
									)}
								</div>
								<div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
									<button
										onClick={() => handleApprove(item)}
										disabled={actionItemId === item.id || isClearing}
										style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
										title={isEdited ? t('reviewView.tooltips.approveEdited') : t('reviewView.tooltips.approve')}
									>
										{(actionItemId === item.id && !isClearing) ? t('reviewView.approving') : t('buttons.approve')} {isEdited && '*'}
									</button>
									<button
										onClick={() => handleDeleteItem(item.id)}
										disabled={actionItemId === item.id || isClearing}
										style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
										title={t('reviewView.tooltips.delete')}
									>
										{(actionItemId === item.id && !isClearing) ? t('reviewView.deleting') : t('buttons.delete')}
									</button>
									<button
										onClick={() => handleEditClick(item)}
										disabled={actionItemId === item.id || isClearing}
										style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
										title={t('reviewView.tooltips.edit')}
									>
										{t('buttons.edit')}
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{isModalOpen && editingItem && editedItemData && (
				<Modal
					isOpen={isModalOpen}
					onClose={handleModalClose}
					onSave={handleModalSave}
					initialData={editedItemData}
					mode="edit"
					// languageId prop removed
				/>
			)}
		</div>
	);
};

export default ReviewView;