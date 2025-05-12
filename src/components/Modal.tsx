import React, { useState, useEffect, FormEvent } from 'react';
import type { LogEntryData } from '../database'; // Assuming LogEntryData defines the structure
import { GRAMMAR_CATEGORIES } from '../constants'; // Import the shared categories

// Use the imported constant directly
// const userSelectableCategories = GRAMMAR_CATEGORIES.filter(cat => cat !== 'Needs Review'); // No longer needed as 'Needs Review' is excluded in constants.ts

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	onSave: (data: Partial<LogEntryData>) => void; // Callback for saving data (could be full or partial)
	initialData?: Partial<LogEntryData>; // Optional initial data for editing
	mode: 'add' | 'edit'; // Distinguish between adding and editing
	languageId: number; // Needed to associate entry with language
	// title?: string; // Optional title override? Or derive from mode?
	// children?: ReactNode; // Might not be needed if form is built-in
}

const initialFormState: Partial<LogEntryData> = {
	target_text: '',
	native_text: '',
	// Default to the first category from the imported list
	category: GRAMMAR_CATEGORIES[0],
	notes: '',
	example_sentence: '',
	kanji_form: '',
	kana_form: '',
	romanization: '',
	writing_system_note: ''
};

const modalOverlayStyle: React.CSSProperties = {
	position: 'fixed',
	top: 0,
	left: 0,
	right: 0,
	bottom: 0,
	backgroundColor: 'rgba(0, 0, 0, 0.6)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	zIndex: 1000, // Ensure it's on top
}; // Keep styles as they are...

const modalContentStyle: React.CSSProperties = {
	// backgroundColor: 'white', // Will be handled by CSS class
	padding: '20px 30px',
	borderRadius: '5px',
	maxWidth: '600px', // Adjust as needed
	width: '90%',
	maxHeight: '80vh', // Limit height
	overflowY: 'auto', // Allow scrolling inside modal
	position: 'relative',
	boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
}; // ...

const closeButtonStyle: React.CSSProperties = {
	position: 'absolute',
	top: '10px',
	right: '15px',
	background: 'none',
	border: 'none',
	fontSize: '1.5rem',
	cursor: 'pointer',
	lineHeight: '1',
	padding: '5px',
}; // ...

const formRowStyle: React.CSSProperties = {
	marginBottom: '15px',
	display: 'flex',
	flexDirection: 'column',
};

const labelStyle: React.CSSProperties = {
	marginBottom: '5px',
	fontWeight: 'bold',
};

const inputStyle: React.CSSProperties = {
	padding: '8px',
	border: '1px solid #ccc',
	borderRadius: '4px',
	fontSize: '1rem',
};

const textareaStyle: React.CSSProperties = {
	...inputStyle,
	minHeight: '80px',
	resize: 'vertical',
};

const buttonContainerStyle: React.CSSProperties = {
	display: 'flex',
	justifyContent: 'flex-end',
	marginTop: '20px',
	paddingTop: '15px',
	borderTop: '1px solid #eee'
};

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onSave, initialData, mode, languageId }) => {
	const [formData, setFormData] = useState<Partial<LogEntryData>>(initialFormState);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		// Reset form when initialData or mode changes (or modal opens)
		if (isOpen) {
			// Ensure the default category is set correctly when opening for 'add'
            const defaultState = { ...initialFormState, category: initialFormState.category ?? GRAMMAR_CATEGORIES[0] };
			setFormData(mode === 'edit' && initialData ? { ...defaultState, ...initialData } : defaultState);
		}
	}, [isOpen, initialData, mode]);

	const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
		const { name, value } = e.target;
		setFormData(prev => ({ ...prev, [name]: value }));
	};

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		if (!formData.target_text?.trim() && !formData.kanji_form?.trim()) { // Allow saving if at least one is present
			alert('Target text or Kanji/Character form cannot both be empty.');
			return;
		}
		setIsSaving(true);
		try {
			// Include languageId in the data being saved
			await onSave({ ...formData, language_id: languageId });
			// onClose(); // Let the parent decide if closing happens on successful save via onSave callback
		} catch (error) {
			console.error("Error during modal save:", error);
			alert("Failed to save entry. Check console for details."); // Show error feedback
		} finally {
			setIsSaving(false);
		}
	};

	if (!isOpen) {
		return null;
	}

	const title = mode === 'edit' ? 'Edit Log Entry' : 'Add New Log Entry';

	return (
		<div style={modalOverlayStyle} onClick={onClose}>
			<div style={modalContentStyle} className="log-entry-modal-content" onClick={e => e.stopPropagation()}>
				<button style={closeButtonStyle} onClick={onClose} title="Close">&times;</button>
				<h2>{title}</h2>
				<hr style={{ margin: '15px 0' }} />

				<form onSubmit={handleSubmit}>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="target_text">Target Text*</label>
						<input style={inputStyle} type="text" id="target_text" name="target_text" value={formData.target_text ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="native_text">Native Text</label>
						<input style={inputStyle} type="text" id="native_text" name="native_text" value={formData.native_text ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="category">Category</label>
						{/* Use the imported constant for dropdown options */}
						<select style={inputStyle} id="category" name="category" value={formData.category ?? GRAMMAR_CATEGORIES[0]} onChange={handleChange}>
							{GRAMMAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
						</select>
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="notes">Notes</label>
						<textarea style={textareaStyle} id="notes" name="notes" value={formData.notes ?? ''} onChange={handleChange}></textarea>
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="example_sentence">Example Sentence</label>
						<textarea style={textareaStyle} id="example_sentence" name="example_sentence" value={formData.example_sentence ?? ''} onChange={handleChange}></textarea>
					</div>
					{/* New Fields */}
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="kanji_form">Kanji/Character Form</label>
						<input style={inputStyle} type="text" id="kanji_form" name="kanji_form" value={formData.kanji_form ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="kana_form">Kana/Reading Form</label>
						<input style={inputStyle} type="text" id="kana_form" name="kana_form" value={formData.kana_form ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="romanization">Romanization (e.g., Hepburn)</label>
						<input style={inputStyle} type="text" id="romanization" name="romanization" value={formData.romanization ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="writing_system_note">Writing System Note</label>
						<input style={inputStyle} type="text" id="writing_system_note" name="writing_system_note" value={formData.writing_system_note ?? ''} onChange={handleChange} placeholder="e.g., Kanji+Okurigana, Katakana" />
					</div>

					<div style={buttonContainerStyle}>
						<button type="button" onClick={onClose} style={{ marginRight: '10px', padding: '8px 15px', cursor: 'pointer' }}>Cancel</button>
						<button type="submit" disabled={isSaving} style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
							{isSaving ? 'Saving...' : (mode === 'edit' ? 'Update Entry' : 'Add Entry')}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default Modal;