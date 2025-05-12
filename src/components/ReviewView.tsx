import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import type { ReviewItem, LogEntryData, ReviewStatus, LogEntry } from '../database'; // Import LogEntry
import Modal from './Modal'; // Import the Modal component

const ReviewView: React.FC = () => {
	const { activeLanguage, activeLanguageId } = useLanguage();
	const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
	const [relatedLogEntries, setRelatedLogEntries] = useState<Map<number, LogEntry>>(new Map()); // Store related entries for duplicates
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [actionItemId, setActionItemId] = useState<number | null>(null);
	const [isClearing, setIsClearing] = useState<boolean>(false);

	// State for editing modal
	const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
	const [editingItem, setEditingItem] = useState<ReviewItem | null>(null); // The original item being edited
	const [editedItemData, setEditedItemData] = useState<Partial<LogEntryData> | null>(null); // Holds changes from the modal

	// Helper to format date, assuming DB stores UTC without explicit timezone marker
	const formatLocalDate = (dateString: string | null | undefined) => {
		if (!dateString) return 'N/A';
		try {
			// Append 'Z' to indicate UTC before converting to local string
			return new Date(dateString + 'Z').toLocaleString();
		} catch (e) {
			console.error("Error formatting date:", dateString, e);
			return dateString; // Fallback to original string if parsing fails
		}
	};


	const fetchReviewItems = useCallback(async () => {
		if (!activeLanguageId) {
			setReviewItems([]);
			setRelatedLogEntries(new Map()); // Clear related entries too
			return;
		}
		setIsLoading(true);
		setError(null);
		setRelatedLogEntries(new Map()); // Clear previous related entries
		console.log(`Fetching PENDING review items for language ID: ${activeLanguageId}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');

			// Fetch pending review items
			const items = await window.electronAPI.getReviewItems(activeLanguageId, 'pending');
			setReviewItems(items);
			console.log(`Fetched ${items.length} pending review items.`);

			// Fetch related log entries for duplicates
			const duplicateItemsWithRefs = items.filter(item => item.review_type === 'duplicate' && item.related_log_entry_id != null);
			const relatedEntryIds = duplicateItemsWithRefs.map(item => item.related_log_entry_id as number);

			if (relatedEntryIds.length > 0) {
				console.log(`Fetching related log entries for duplicate checks (IDs: ${relatedEntryIds.join(', ')})`);
				const fetchedEntries = await window.electronAPI.getLogEntriesByIds(relatedEntryIds);
				const entriesMap = new Map(fetchedEntries.map(entry => [entry.id, entry]));
				setRelatedLogEntries(entriesMap); // Just set the new map
				console.log(`Fetched ${fetchedEntries.length} related log entries.`);
			}

		} catch (err) {
			console.error('Error fetching review items or related entries:', err);
			setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching review items.');
		} finally {
			setIsLoading(false);
		}
	}, [activeLanguageId]);

	useEffect(() => {
		fetchReviewItems();
	}, [fetchReviewItems]);

	// Handler for Approve
	const handleApprove = async (item: ReviewItem) => {
		if (!activeLanguageId) {
			setError("Cannot approve item: Language ID not found.");
			return;
		}
		setActionItemId(item.id);
		setError(null);
		console.log(`Attempting to approve review item ${item.id}`);

		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
			if (!activeLanguageId) throw new Error("Language ID missing."); // Re-check just in case

			// 1. Prepare data for the log entry
			let logData: LogEntryData;
			// Check if the currently stored edited data corresponds to the item being approved
			const wasJustEdited = editedItemData && editingItem?.id === item.id;

			if (wasJustEdited) {
				console.log(`Using edited data for approval of item ${item.id}`);
				// Use data from the editedItemData state, providing fallbacks just in case
				logData = {
					language_id: activeLanguageId,
					target_text: editedItemData.target_text ?? item.target_text ?? '', // Ensure target isn't empty
					native_text: editedItemData.native_text ?? null,
					category: editedItemData.category ?? '', // Category should ideally be set during edit
					notes: editedItemData.notes ?? null,
					example_sentence: editedItemData.example_sentence ?? null,
					// Add new fields from edited data
					kanji_form: editedItemData.kanji_form ?? null,
					kana_form: editedItemData.kana_form ?? null,
					romanization: editedItemData.romanization ?? null,
					writing_system_note: editedItemData.writing_system_note ?? null,
				};
				if (!logData.category) {
					console.warn(`Approving item ${item.id} without a category set during edit.`);
					// Consider adding validation or defaulting logic here if needed
				}
			} else {
				console.log(`Using original review item data for approval of item ${item.id} (auto-filled from AI/existing)`);
                // Use original item data, trying AI extracted fields first, then related entry, then defaults
                const relatedEntryForFallback = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;

				logData = {
					language_id: activeLanguageId,
					target_text: item.target_text ?? '', // Should always exist if validation passed
					native_text: item.native_text ?? (relatedEntryForFallback?.native_text ?? null),
					// Prioritize AI's guess, then related, then 'Other'
                    category: item.category_guess ?? (relatedEntryForFallback?.category ?? 'Other'),
					// Prioritize snippet, then related, then null
					notes: (item.original_snippet && item.original_snippet !== item.target_text ? item.original_snippet : undefined) ?? (relatedEntryForFallback?.notes ?? null),
					// Prioritize AI extracted, then related, then null
					example_sentence: relatedEntryForFallback?.example_sentence ?? null, // No direct AI field for this one
					kanji_form: item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? null),
					kana_form: item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? null),
					romanization: item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? null),
					writing_system_note: item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? null),
				};
				if (!logData.target_text) { throw new Error("Cannot approve item with empty target text."); }
			}

			// 2. Add to main log_entries table (checking for existing carefully)
			console.log(`Adding/Checking approved item ${item.id} in log entries...`);
			const existingEntry = await window.electronAPI.findLogEntryByTarget(activeLanguageId, logData.target_text);

			// Only skip adding if an entry exists *and* it's not the original entry linked in a duplicate review
			const shouldSkipAdd = existingEntry && existingEntry.id !== item.related_log_entry_id;

			if (shouldSkipAdd) {
				console.log(`Entry for "${logData.target_text}" already exists (ID: ${existingEntry.id}) and is not the related duplicate entry. Skipping add.`);
			} else {
                // If it's the original duplicate entry or doesn't exist, add it.
                // Note: This could overwrite the original duplicate if its data changed during review/edit.
                // Consider adding logic for "Merge" later if needed.
                console.log(existingEntry ? `Related duplicate entry found (ID: ${existingEntry.id}). Will add approved data.` : `No existing entry found for "${logData.target_text}". Adding new entry.`);
				await window.electronAPI.addLogEntry(logData);
				console.log(`Item ${item.id} data added to log entries successfully.`);
			}

			// 3. Delete the review item now that it's processed
			console.log(`Deleting processed review item ${item.id}...`);
			const deleteSuccess = await window.electronAPI.deleteReviewItem(item.id);
			if (!deleteSuccess) {
				// Log error but continue, as the main goal (approval) might be done
				console.error(`Failed to delete review item ${item.id} after successful approval/check.`);
				setError(`Approved item ${item.id} but failed to remove it from review list. Manual cleanup might be needed.`);
			}

			// 4. Clear editing state if this specific item was the one being edited
			if (wasJustEdited) {
				console.log(`Clearing editing state for item ${item.id}`);
				setEditingItem(null);
				setEditedItemData(null);
			}

			// 5. Refresh the review list to show changes
			await fetchReviewItems();

		} catch (err) {
			console.error(`Error approving review item ${item.id}:`, err);
			setError(err instanceof Error ? err.message : 'An unknown error occurred during approval.');
		} finally {
			// Ensure button disabling is reset even if errors occurred
			setActionItemId(null);
		}
	};

	// Handler for Delete Single Item
	const handleDeleteItem = async (id: number) => {
		if (!window.confirm('Are you sure you want to permanently delete this review item?')) {
			return;
		}
		setActionItemId(id); // Disable buttons for this item
		setError(null);
		console.log(`Attempting to delete review item ${id}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
			const success = await window.electronAPI.deleteReviewItem(id);
			if (success) {
				console.log(`Review item ${id} deleted successfully.`);
				// If the deleted item was the one being edited, clear the edit state
				if (editingItem?.id === id) {
					setEditingItem(null);
					setEditedItemData(null);
				}
				await fetchReviewItems(); // Refresh the list
			} else {
				throw new Error(`Failed to delete review item ${id}.`);
			}
		} catch (err) {
			console.error(`Error deleting review item ${id}:`, err);
			setError(err instanceof Error ? err.message : 'An unknown error occurred during deletion.');
		} finally {
			setActionItemId(null); // Re-enable buttons
		}
	};

	// Handler for Clear All Pending Reviews
	const handleClearPendingReviews = async () => {
		if (!activeLanguageId || reviewItems.length === 0) return;
		if (!window.confirm(`Are you sure you want to delete ALL ${reviewItems.length} pending review items for ${activeLanguage}? This cannot be undone.`)) {
			return;
		}
		setIsClearing(true); // Disable buttons globally
		setError(null);
		console.log(`Attempting to clear all pending review items for language ID: ${activeLanguageId}`);
		try {
			if (!window.electronAPI) throw new Error('Electron API not available.');
			const result = await window.electronAPI.clearReviewItemsForLanguage(activeLanguageId, 'pending');
			console.log(`Cleared ${result.rowsAffected} pending review items.`);
			// Clear any potential lingering edit state after mass deletion
			setEditingItem(null);
			setEditedItemData(null);
			await fetchReviewItems(); // Refresh the list
		} catch (err) {
			console.error(`Error clearing pending review items:`, err);
			setError(err instanceof Error ? err.message : 'An unknown error occurred while clearing reviews.');
		} finally {
			setIsClearing(false); // Re-enable buttons
		}
	};

	// --- Modal Handlers ---

	const handleEditClick = (item: ReviewItem) => {
		console.log(`Opening edit modal for review item ID: ${item.id}`);
		setEditingItem(item); // Track which item is being edited

        // Check if we already have edited data for this item, otherwise populate from original
        // ** PRIORITIZE item's own AI extracted fields for prefill **
        const relatedEntryForFallback = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;

        const prefillData = editedItemData && editingItem?.id === item.id ? editedItemData : {
            target_text: item.target_text ?? '',
            native_text: item.native_text ?? '', // Use item's native if present, else empty
            category: (item.category_guess ?? (relatedEntryForFallback?.category ?? undefined)) || '', // AI guess > Related > Empty
            notes: ((item.original_snippet && item.original_snippet !== item.target_text ? item.original_snippet : undefined) ?? (relatedEntryForFallback?.notes ?? undefined)) || '', // Snippet > Related > Empty
            example_sentence: relatedEntryForFallback?.example_sentence || '', // Only from related for now > Empty
            kanji_form: (item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? undefined)) || '', // AI > Related > Empty
            kana_form: (item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? undefined)) || '', // AI > Related > Empty
            romanization: (item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? undefined)) || '', // AI > Related > Empty
            writing_system_note: (item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? undefined)) || '', // AI > Related > Empty
        };

		setEditedItemData(prefillData as Partial<LogEntryData>); // Store the data for the modal
		setIsModalOpen(true);
	};

	const handleModalClose = () => {
		setIsModalOpen(false);
		// Don't clear editingItem or editedItemData here - allow reopening the modal
		// with the same item and its last edited state until approved/deleted/cleared.
	};

	const handleModalSave = (updatedData: Partial<LogEntryData>) => {
		console.log("Saving edited data from modal to component state for item:", editingItem?.id, updatedData);
		// Update the temporary state ONLY if an item is being edited
		if (editingItem) {
			setEditedItemData(updatedData); // Persist changes in state until approval
		} else {
			 console.error("Modal save called without an editing item set!");
		}
		handleModalClose(); // Close the modal after saving state
	};


	return (
		<div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
				<h2 style={{ margin: 0 }}>Review Pending Items {activeLanguage ? `(${activeLanguage})` : ''}</h2>
				<button
					onClick={handleClearPendingReviews}
					disabled={reviewItems.length === 0 || isLoading || isClearing}
					title="Delete all items currently in the pending review list"
					style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#ffb300', color: 'black', border: 'none', borderRadius: '4px' }}
				>
					{isClearing ? 'Clearing...' : 'Clear All Pending'}
				</button>
			</div>
			<p>Items flagged during import (duplicates, errors) appear here. Approve (adds to log), Delete, or Edit them.</p>

			{isLoading && <p>Loading review items...</p>}
			{error && <p style={{ color: 'red', border: '1px solid red', padding: '10px' }}>Error: {error}</p>}
			{!isLoading && !error && reviewItems.length === 0 && <p>No pending items to review for this language.</p>}

			{!isLoading && !error && reviewItems.length > 0 && (
				<ul style={{ listStyle: 'none', padding: 0 }}>
					{reviewItems.map((item) => {
						// Find the related log entry if this is a duplicate
						const existingEntry = (item.review_type === 'duplicate' && item.related_log_entry_id) ? relatedLogEntries.get(item.related_log_entry_id) : null;

						// Check if this specific item has stored edited data matching the `editingItem` state
						const isEdited = editingItem?.id === item.id && editedItemData;

                        // --- START Updated Display Logic ---
                        // Determine what data to display initially or if edited
                        let displayData: Record<string, string | null> = {};

                        if (isEdited && editedItemData) {
                            // If actively being edited, use the latest edited data
                            displayData = {
                                target: editedItemData.target_text ?? item.target_text ?? 'N/A',
                                native: editedItemData.native_text ?? item.native_text ?? 'N/A',
                                category: editedItemData.category ?? item.category_guess ?? 'N/A', // Fallback to guess if edit removes it
                                notes: editedItemData.notes ?? item.original_snippet ?? 'N/A',
                                example: editedItemData.example_sentence ?? 'N/A',
                                kanji: editedItemData.kanji_form ?? item.ai_extracted_kanji_form ?? 'N/A',
                                kana: editedItemData.kana_form ?? item.ai_extracted_kana_form ?? 'N/A',
                                roman: editedItemData.romanization ?? item.ai_extracted_romanization ?? 'N/A',
                                sysNote: editedItemData.writing_system_note ?? item.ai_extracted_writing_system_note ?? 'N/A'
                            };
                        } else {
                            // If not actively edited, display initial data prioritizing AI extractions
                             const relatedEntryForFallback = existingEntry; // Already fetched

                            displayData = {
                                target: item.target_text ?? 'N/A',
                                native: item.native_text ?? 'N/A', // Show native text if provided in review item
                                category: item.category_guess ?? (relatedEntryForFallback?.category ?? 'N/A'), // Prioritize AI guess
                                notes: (item.original_snippet && item.original_snippet !== item.target_text ? `(Snippet: ${item.original_snippet.substring(0, 50)}...)` : (relatedEntryForFallback?.notes ?? 'N/A')),
                                example: relatedEntryForFallback?.example_sentence ?? 'N/A', // No direct AI field
                                kanji: item.ai_extracted_kanji_form ?? (relatedEntryForFallback?.kanji_form ?? 'N/A'), // Prioritize AI
                                kana: item.ai_extracted_kana_form ?? (relatedEntryForFallback?.kana_form ?? 'N/A'), // Prioritize AI
                                roman: item.ai_extracted_romanization ?? (relatedEntryForFallback?.romanization ?? 'N/A'), // Prioritize AI
                                sysNote: item.ai_extracted_writing_system_note ?? (relatedEntryForFallback?.writing_system_note ?? 'N/A') // Prioritize AI
                            };
                        }
                        // --- END Updated Display Logic ---

						return (
							// Add className, remove background/border from inline style, keep dynamic border
							<li key={item.id}
                                className="review-list-item" // Add class name
                                style={{
                                    border: isEdited ? '2px solid #007bff' : '1px solid transparent', // Dynamic border color/width
                                    marginBottom: '10px',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    // backgroundColor removed
                                }}
                            >
								<div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
									{/* Column for the review item details */}
									<div style={{ flex: 1 }}>
										<strong>Review Item (ID: {item.id})</strong> {isEdited && <span style={{color: '#007bff', fontWeight:'bold'}}>(Edited)</span>}<br />
										<strong>Type:</strong> {item.review_type} <br />
										<strong>Target:</strong> {displayData.target} <br />
										<strong>Native:</strong> {displayData.native} <br />
										<strong>Category:</strong> {displayData.category} <br />
										<strong>Notes:</strong> {displayData.notes} <br />
										<strong>Example:</strong> {displayData.example} <br />
                                        <strong>Kanji/Character:</strong> {displayData.kanji} <br />
                                        <strong>Kana/Reading:</strong> {displayData.kana} <br />
                                        <strong>Romanization:</strong> {displayData.roman} <br />
                                        <strong>Writing System Note:</strong> {displayData.sysNote} <br />

										{item.original_snippet && !displayData.notes?.startsWith('(Snippet:') && <><strong>Full Snippet:</strong> <pre className="review-snippet-pre" style={{ whiteSpace: 'pre-wrap', maxHeight: '100px', overflowY: 'auto' }}>{item.original_snippet}</pre></>}
										{item.ai_suggestion && <><strong>AI Suggestion/Error:</strong> {item.ai_suggestion} <br /></>}
										<strong>Status:</strong> {item.status} <br />
										<small>Created: {formatLocalDate(item.created_at)}</small>
									</div>

									{/* Column for the existing entry details (if duplicate) */}
									{existingEntry && (
										<div style={{ flex: 1, borderLeft: '2px solid #aaa', paddingLeft: '15px' }}>
											<strong>Existing Entry (ID: {existingEntry.id})</strong><br />
											<strong>Target:</strong> {existingEntry.target_text} <br />
											<strong>Native:</strong> {existingEntry.native_text ?? 'N/A'} <br />
											<strong>Category:</strong> {existingEntry.category ?? 'N/A'} <br />
											<strong>Notes:</strong> {existingEntry.notes ?? 'N/A'} <br />
											<strong>Example:</strong> {existingEntry.example_sentence ?? 'N/A'} <br />
                                            <strong>Kanji/Character:</strong> {existingEntry.kanji_form ?? 'N/A'} <br />
                                            <strong>Kana/Reading:</strong> {existingEntry.kana_form ?? 'N/A'} <br />
                                            <strong>Romanization:</strong> {existingEntry.romanization ?? 'N/A'} <br />
                                            <strong>Writing System Note:</strong> {existingEntry.writing_system_note ?? 'N/A'} <br />
											<small>Added: {formatLocalDate(existingEntry.created_at)}</small><br />
                      						<small>Updated: {formatLocalDate(existingEntry.updated_at)}</small>
										</div>
									)}
								</div>
								{/* Action buttons */}
								<div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #eee' }}>
									<button
										onClick={() => handleApprove(item)}
										disabled={actionItemId === item.id || isClearing} // Disable if any item action or clear is in progress
										style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
										title={isEdited ? "Approve with edited data" : "Approve this item and add it to the Grammar Log (if not already present)"}
									>
										{/* Indicate if approving edited data */}
										{(actionItemId === item.id && !isClearing) ? 'Approving...' : 'Approve'} {isEdited && '*'}
									</button>
									<button
										onClick={() => handleDeleteItem(item.id)}
										disabled={actionItemId === item.id || isClearing} // Disable if any item action or clear is in progress
										style={{ marginRight: '10px', padding: '5px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
										title="Permanently delete this review item"
									>
										{(actionItemId === item.id && !isClearing) ? 'Deleting...' : 'Delete'}
									</button>
									<button
										onClick={() => handleEditClick(item)}
										disabled={actionItemId === item.id || isClearing} // Enable button, disable if any item action or clear is in progress
										style={{ padding: '5px 10px', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
										title="Edit this item before approving"
									>
										Edit
									</button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			{/* Edit Modal - Render only when isModalOpen is true and editingItem is set */}
			{isModalOpen && editingItem && editedItemData && (
				<Modal
					isOpen={isModalOpen}
					onClose={handleModalClose}
					onSave={handleModalSave} // Saves data to editedItemData state
					// Pass the current editedItemData state as initial data for the modal
					initialData={editedItemData}
					mode="edit" // Indicate we are editing
					languageId={activeLanguageId ?? -1} // Pass language ID
				/>
			)}
		</div>
	);
};

export default ReviewView;