import React, { useState, useEffect, FormEvent } from 'react';
import type { LogEntryData } from '../database'; // Assuming LogEntryData defines the structure
import { GRAMMAR_CATEGORIES } from '../constants'; // Import the shared categories
import { useUI } from '../contexts/UIContext'; // For translations

export interface ModalProps { // Exporting for potential use elsewhere, good practice
	isOpen: boolean;
	onClose: () => void;
	onSave: (data: Partial<LogEntryData>) => Promise<void>;
	initialData?: Partial<LogEntryData>;
	mode: 'add' | 'edit';
	isSubmitting?: boolean; // New prop
	submitError?: string | null; // New prop
}

const initialFormState: Partial<LogEntryData> = {
	target_text: '',
	native_text: '',
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
	zIndex: 1000,
};

const modalContentStyle: React.CSSProperties = {
	padding: '20px 30px',
	borderRadius: '5px',
	maxWidth: '600px',
	width: '90%',
	maxHeight: '80vh',
	overflowY: 'auto',
	position: 'relative',
	boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
};

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
};

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

const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  initialData, 
  mode, 
  isSubmitting: parentIsSubmitting, // Renamed to avoid conflict with potential internal state if needed
  submitError: parentSubmitError    // Renamed for clarity
}) => {
	const { t } = useUI(); 
	const [formData, setFormData] = useState<Partial<LogEntryData>>(initialFormState);
  // For client-side validation errors within the modal itself
  const [internalFormError, setInternalFormError] = useState<string | null>(null); 

	useEffect(() => {
		if (isOpen) {
            setInternalFormError(null); // Clear internal validation errors
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
    setInternalFormError(null); // Clear previous internal validation error

		if (!formData.target_text?.trim() && !formData.kanji_form?.trim()) {
      setInternalFormError(t('modal.validation.targetOrKanjiEmpty', { default: 'Target text or Kanji/Character form cannot both be empty.' }));
			return;
		}
		// onSave is an async function passed from GrammarLogView which handles its own try/catch
    // and updates parent's isSubmittingEntry and modalError states.
    // The Modal component itself no longer needs to manage 'isSaving' or re-set 'formError' from the save promise.
		await onSave({ ...formData }); 
	};

	if (!isOpen) {
		return null;
	}

	const title = mode === 'edit' ? t('modal.editTitle') : t('modal.addTitle');

	return (
		<div style={modalOverlayStyle} onClick={onClose}>
			<div style={modalContentStyle} className="log-entry-modal-content" onClick={e => e.stopPropagation()}>
				<button style={closeButtonStyle} onClick={onClose} title={t('buttons.close', { default: "Close" })}>&times;</button>
				<h2>{title}</h2>
				<hr style={{ margin: '15px 0' }} />

				<form onSubmit={handleSubmit}>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="target_text">{t('modal.targetLabel')}</label>
						<input style={inputStyle} type="text" id="target_text" name="target_text" value={formData.target_text ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="native_text">{t('modal.nativeLabel')}</label>
						<input style={inputStyle} type="text" id="native_text" name="native_text" value={formData.native_text ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="category">{t('modal.categoryLabel')}</label>
						<select style={inputStyle} id="category" name="category" value={formData.category ?? GRAMMAR_CATEGORIES[0]} onChange={handleChange}>
							{GRAMMAR_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
						</select>
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="notes">{t('modal.notesLabel')}</label>
						<textarea style={textareaStyle} id="notes" name="notes" value={formData.notes ?? ''} onChange={handleChange}></textarea>
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="example_sentence">{t('modal.exampleLabel')}</label>
						<textarea style={textareaStyle} id="example_sentence" name="example_sentence" value={formData.example_sentence ?? ''} onChange={handleChange}></textarea>
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="kanji_form">{t('modal.kanjiLabel')}</label>
						<input style={inputStyle} type="text" id="kanji_form" name="kanji_form" value={formData.kanji_form ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="kana_form">{t('modal.kanaLabel')}</label>
						<input style={inputStyle} type="text" id="kana_form" name="kana_form" value={formData.kana_form ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="romanization">{t('modal.romanizationLabel')}</label>
						<input style={inputStyle} type="text" id="romanization" name="romanization" value={formData.romanization ?? ''} onChange={handleChange} />
					</div>
					<div style={formRowStyle}>
						<label style={labelStyle} htmlFor="writing_system_note">{t('modal.writingSystemLabel')}</label>
						<input style={inputStyle} type="text" id="writing_system_note" name="writing_system_note" value={formData.writing_system_note ?? ''} onChange={handleChange} placeholder={t('modal.writingSystemPlaceholder')} />
					</div>

          {/* Display internal client-side validation error */}
          {internalFormError && <p style={{ color: 'red', marginTop: '10px', marginBottom: '0' }}>{internalFormError}</p>}
          {/* Display submission error from parent */}
          {parentSubmitError && <p style={{ color: 'red', marginTop: '10px', marginBottom: '0' }}>{parentSubmitError}</p>}

					<div style={buttonContainerStyle}>
						<button type="button" onClick={onClose} style={{ marginRight: '10px', padding: '8px 15px', cursor: 'pointer' }}>{t('buttons.cancel')}</button>
						<button type="submit" disabled={parentIsSubmitting} style={{ padding: '8px 15px', cursor: 'pointer', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px' }}>
							{parentIsSubmitting ? t('modal.saving', { default: 'Saving...'}) : (mode === 'edit' ? t('modal.updateButton') : t('modal.addButton'))}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default Modal;