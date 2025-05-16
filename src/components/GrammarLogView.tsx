import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { useLanguage } from '../contexts/LanguageContext';
import type { LogEntry, LogEntryData, GetLogEntriesOptions, ScriptAnnotationDetail } from '../database'; // Updated FuriganaDetail to ScriptAnnotationDetail
import Modal from './Modal';
import { GRAMMAR_CATEGORIES } from '../constants';
import { useUI } from '../contexts/UIContext';

type DataSortableColumnKey = NonNullable<GetLogEntriesOptions['sortBy']>;

interface ColumnConfig {
  id: string; // Will match new field names like 'character_form'
  headerKey: string; 
  tooltipKey: string; 
  dataSortKey?: DataSortableColumnKey;
  isDraggable: boolean;
  minWidth?: string;
  className?: string; 
}

// Helper to check for Kanji characters (simplified range) - may need to be generalized later
const isKanji = (char: string): boolean => {
  if (!char || char.length !== 1) return false;
  const charCode = char.charCodeAt(0);
  return (charCode >= 0x4E00 && charCode <= 0x9FFF) || 
         (charCode >= 0x3400 && charCode <= 0x4DBF) || 
         (charCode >= 0xF900 && charCode <= 0xFAFF);   
};

// Renamed from RenderWithFurigana
const RenderWithAnnotations: React.FC<{ text: string | null | undefined, scriptAnnotations?: ScriptAnnotationDetail[] | null, theme: string }> = ({ text, scriptAnnotations, theme }) => {
  if (!text) return <>{''}</>;
  if (!scriptAnnotations || scriptAnnotations.length === 0) {
    return <>{text}</>;
  }

  const rubyWrapperStyle: React.CSSProperties = {
    position: 'relative', 
    display: 'inline-block', 
  };

  const rtBaseStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '100%', 
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '0.6em',
    transition: 'opacity 0.2s ease-in-out, visibility 0s linear 0.2s', 
    backgroundColor: theme === 'dark' ? 'rgba(50,50,50,0.95)' : 'rgba(240,240,240,0.95)',
    color: theme === 'dark' ? '#E0E0E0' : '#333333',
    padding: '1px 3px',
    borderRadius: '2px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none', 
    zIndex: 10,
  };

  const elements: React.ReactNode[] = [];
  const annotationMap = new Map<string, string>(); // Maps base_character to annotation_text
  if(scriptAnnotations){
      scriptAnnotations.forEach(detail => {
        // Assuming detail.type === 'reading' for now, as per AI prompt
        annotationMap.set(detail.base_character, detail.annotation_text);
      });
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    // The isKanji check could be made more generic based on language or annotation type in the future
    if (isKanji(char) && annotationMap.has(char)) { 
      elements.push(
        <ruby key={`ruby-${char}-${i}`} className="ruby-hover-wrapper" style={rubyWrapperStyle}>
          <span>{char}</span>
          <rt style={rtBaseStyle} className="ruby-text-hover">
            {annotationMap.get(char)}
          </rt>
        </ruby>
      );
    } else {
      elements.push(<span key={`char-${char}-${i}`}>{char}</span>);
    }
  }

  return <>{elements}</>;
};

interface SortableHeaderCellProps {
  config: ColumnConfig;
  onSortClick?: (columnName: DataSortableColumnKey) => void;
  currentSortOptions?: GetLogEntriesOptions;
  t: (key: string, options?: Record<string, string | number> | undefined) => string; 
}

const SortableHeaderCell: React.FC<SortableHeaderCellProps> = ({ config, onSortClick, currentSortOptions, t }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id, disabled: !config.isDraggable });
  const style: React.CSSProperties = { 
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    cursor: config.isDraggable ? 'grab' : (config.dataSortKey ? 'pointer' : 'default'),
    padding: '8px',
    minWidth: config.minWidth,
    touchAction: 'none', 
    userSelect: 'none', 
    position: 'relative',
  };

  const getSortIndicator = (columnNameToCheck: DataSortableColumnKey | undefined) => {
    if (!currentSortOptions || !columnNameToCheck || currentSortOptions.sortBy !== columnNameToCheck) return null;
    return currentSortOptions.sortOrder === 'ASC' ? ' ▲' : ' ▼';
  };

  const handleHeaderClick = () => { if (config.dataSortKey && onSortClick) onSortClick(config.dataSortKey); };
  // TODO: Use getFieldDisplayName from UIContext for config.headerKey for language-specific aliases
  return <th ref={setNodeRef} style={style} className={config.className} {...(config.isDraggable ? attributes : {})} {...(config.isDraggable ? listeners : {})} onClick={handleHeaderClick} title={t(config.tooltipKey)}>{t(config.headerKey)}{config.dataSortKey && getSortIndicator(config.dataSortKey)}</th>;
};

const GrammarLogView: React.FC = () => {
  const { selectedLanguageName, selectLanguage } = useLanguage();
  const { t, theme } = useUI(); // TODO: Later, get getFieldDisplayName from useUI
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortOptions, setSortOptions] = useState<GetLogEntriesOptions>({
      sortBy: 'created_at',
      sortOrder: 'DESC',
  });
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<LogEntry | null>(null);
	const [isSubmittingEntry, setIsSubmittingEntry] = useState<boolean>(false);
	const [modalError, setModalError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
	const [isConfirmingClear, setIsConfirmingClear] = useState<boolean>(false);
	const [isClearing, setIsClearing] = useState<boolean>(false);
	const [clearError, setClearError] = useState<string | null>(null);

  const ALL_COLUMN_CONFIGS: ColumnConfig[] = React.useMemo(() => [ 
    { id: 'id', headerKey: 'grammarLogView.headers.id', tooltipKey: 'grammarLogView.tooltips.sortById', dataSortKey: 'id', isDraggable: false, minWidth: '50px', className: 'col-id' },
    { id: 'target_text', headerKey: 'grammarLogView.headers.target', tooltipKey: 'grammarLogView.tooltips.sortByTarget', dataSortKey: 'target_text', isDraggable: true, className: 'col-target-text' },
    { id: 'native_text', headerKey: 'grammarLogView.headers.native', tooltipKey: 'grammarLogView.tooltips.sortByNative', dataSortKey: 'native_text', isDraggable: true, className: 'col-native-text' },
    { id: 'category', headerKey: 'grammarLogView.headers.category', tooltipKey: 'grammarLogView.tooltips.sortByCategory', dataSortKey: 'category', isDraggable: true, className: 'col-category' },
    { id: 'character_form', headerKey: 'grammarLogView.headers.character_form', tooltipKey: 'grammarLogView.tooltips.sortByCharacterForm', dataSortKey: 'character_form', isDraggable: true, className: 'col-character-form' }, // Updated
    { id: 'reading_form', headerKey: 'grammarLogView.headers.reading_form', tooltipKey: 'grammarLogView.tooltips.sortByReadingForm', dataSortKey: 'reading_form', isDraggable: true, className: 'col-reading-form' }, // Updated
    { id: 'romanization', headerKey: 'grammarLogView.headers.romanization', tooltipKey: 'grammarLogView.tooltips.sortByRomanization', dataSortKey: 'romanization', isDraggable: true, className: 'col-romanization' },
    { id: 'notes', headerKey: 'grammarLogView.headers.notes', tooltipKey: 'grammarLogView.tooltips.viewNotes', isDraggable: true, className: 'col-notes' }, // No dataSortKey for notes
    { id: 'actions', headerKey: 'grammarLogView.headers.actions', tooltipKey: 'grammarLogView.tooltips.actions', isDraggable: false, minWidth: '100px', className: 'col-actions' },
  ], [t]); // t dependency remains for now for tooltip strings

  const DEFAULT_DRAGGABLE_COLUMN_IDS = ['character_form', 'reading_form', 'romanization', 'native_text', 'category', 'notes']; // Updated
  const [orderedDraggableColumnIds, setOrderedDraggableColumnIds] = useState<string[]>(DEFAULT_DRAGGABLE_COLUMN_IDS);
  const fixedLeftColumnConfigs = ALL_COLUMN_CONFIGS.filter(c => !c.isDraggable && c.id === 'id'); // target_text is now draggable
  const fixedRightColumnConfigs = ALL_COLUMN_CONFIGS.filter(c => !c.isDraggable && c.id === 'actions');

  const currentDisplayColumnConfigs = React.useMemo(() => { 
      // TODO: Later, filter draggableConfigsInOrder based on isFieldVisible from UIContext for reading_form
      const draggableConfigsInOrder = orderedDraggableColumnIds
        .map(id => ALL_COLUMN_CONFIGS.find(c => c.id === id && c.isDraggable))
        .filter(Boolean) as ColumnConfig[];
      return [...fixedLeftColumnConfigs, ...draggableConfigsInOrder, ...fixedRightColumnConfigs];
  }, [orderedDraggableColumnIds, fixedLeftColumnConfigs, fixedRightColumnConfigs, ALL_COLUMN_CONFIGS]);

  const sensors = useSensors( 
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => { 
    if (selectedLanguageName && window.electronAPI?.getLanguageUISetting) {
      window.electronAPI.getLanguageUISetting(selectedLanguageName, 'grammar_log_column_order')
        .then((savedOrderJson: string | null) => {
          if (savedOrderJson) {
            try {
              const savedOrder = JSON.parse(savedOrderJson) as string[];
              const validDraggableIds = ALL_COLUMN_CONFIGS.filter(c => c.isDraggable).map(c => c.id);
              const filteredSavedOrder = savedOrder.filter((id: string) => validDraggableIds.includes(id));
              const defaultDraggableSet = new Set(DEFAULT_DRAGGABLE_COLUMN_IDS);
              const finalOrder = [...new Set([...filteredSavedOrder, ...DEFAULT_DRAGGABLE_COLUMN_IDS])]
                                    .filter(id => validDraggableIds.includes(id) || defaultDraggableSet.has(id));                
              setOrderedDraggableColumnIds(finalOrder);
            } catch (e) { 
                console.error("Error parsing saved column order:", e);
                setOrderedDraggableColumnIds(DEFAULT_DRAGGABLE_COLUMN_IDS); 
            }
          } else { setOrderedDraggableColumnIds(DEFAULT_DRAGGABLE_COLUMN_IDS); }
        })
        .catch((err: Error) => { 
            console.error("Error loading column order:", err);
            setOrderedDraggableColumnIds(DEFAULT_DRAGGABLE_COLUMN_IDS); 
        });
    } else { setOrderedDraggableColumnIds(DEFAULT_DRAGGABLE_COLUMN_IDS); }
  }, [selectedLanguageName, ALL_COLUMN_CONFIGS]); // ALL_COLUMN_CONFIGS dependency is important

  const handleDragEnd = (event: DragEndEvent) => { 
    const { active, over } = event;
    if (active.id !== over?.id && over) {
      setOrderedDraggableColumnIds((prev) => {
        const oldIndex = prev.indexOf(active.id as string);
        const newIndex = prev.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return prev; 
        const nextOrder = arrayMove(prev, oldIndex, newIndex);
        if (selectedLanguageName && window.electronAPI?.setLanguageUISetting) {
          window.electronAPI.setLanguageUISetting(selectedLanguageName, 'grammar_log_column_order', JSON.stringify(nextOrder))
            .catch((err: Error) => console.error("Error saving column order:", err));
        }
        return nextOrder;
      });
    }
  };

  const fetchEntries = useCallback(async (options: GetLogEntriesOptions) => { 
    if (!selectedLanguageName) {
        setEntries([]);
        setError(null);
        return;
    }
		setError(null); setDeleteError(null); setClearError(null);
    setIsLoading(true);
    try {
      if (window.electronAPI) {
        const fetchedEntries = await window.electronAPI.getLogEntries(selectedLanguageName, options);
        setEntries(fetchedEntries);
      } else { setError('Electron API not available.'); }
    } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching entries.');
        setEntries([]);
    } finally {
        setIsLoading(false);
    }
  }, [selectedLanguageName]);

  useEffect(() => { 
    const options: GetLogEntriesOptions = {
        ...sortOptions,
        ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
        ...(selectedCategory && { category: selectedCategory })
    };
    if (selectedLanguageName) {
        fetchEntries(options);
    } else {
        setEntries([]);
    }
  }, [fetchEntries, selectedLanguageName, searchTerm, selectedCategory, sortOptions]);

	const handleModalSave = async (formDataFromModal: Partial<LogEntryData>) => { 
 		setIsSubmittingEntry(true);
 		setModalError(null);
		if (!formDataFromModal.target_text?.trim() && !formDataFromModal.character_form?.trim()) { // Updated
			setModalError(t('modal.validation.targetOrCharacterEmpty', { default: "Target text or Character form cannot both be empty."})); // Key updated
			setIsSubmittingEntry(false);
			return;
		}
		if (!selectedLanguageName) {
			setModalError(t('errors.languageNotSelected', { default: "Cannot submit entry: No language selected."}));
			setIsSubmittingEntry(false);
			return;
		}
		// Target text population logic is now primarily handled in main.ts (IPC handler)
    // Frontend can still set it, but main.ts will enforce the fallback if empty.
    const payload: LogEntryData = {
			target_text: formDataFromModal.target_text || '', // Ensure it's a string
			native_text: formDataFromModal.native_text?.trim() || null,
			category: formDataFromModal.category?.trim() || null,
			notes: formDataFromModal.notes?.trim() || null,
			example_sentence: formDataFromModal.example_sentence?.trim() || null,
			character_form: formDataFromModal.character_form?.trim() || null, // Updated
			reading_form: formDataFromModal.reading_form?.trim() || null,   // Updated
			romanization: formDataFromModal.romanization?.trim() || null,
			writing_system_note: formDataFromModal.writing_system_note?.trim() || null,
      script_annotations: formDataFromModal.script_annotations || null, // Updated
 		};
 		try {
 			if (!window.electronAPI) throw new Error('Electron API not available.');
 			if (editingEntry) {
 				const success = await window.electronAPI.updateLogEntry(selectedLanguageName, editingEntry.id, payload);
 				if (!success) throw new Error(t('errors.updateEntryNotFound', { default: 'Failed to update entry. It might have been deleted.'}));
 			} else {
        // findLogEntryByTarget should still work with target_text from payload
 				 const existingEntry = await window.electronAPI.findLogEntryByTarget(selectedLanguageName, payload.target_text);
 				 if (existingEntry) throw new Error(t('errors.addLogEntryExists', { targetText: payload.target_text, default: `Entry for "${payload.target_text}" already exists.` }));
 				 await window.electronAPI.addLogEntry(selectedLanguageName, payload);
 			}
 			closeEntryModal();
        fetchEntries({ 
            ...sortOptions,
            ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
            ...(selectedCategory && { category: selectedCategory })
        });
 		} catch (err) {
 			 const action = editingEntry ? 'updating' : 'adding';
 			 setModalError(err instanceof Error ? err.message : `An unknown error occurred while ${action}.`);
 		} finally {
 			setIsSubmittingEntry(false);
 		}
  };

  const handleDeleteEntry = async (id: number) => { 
      if (!selectedLanguageName) { setDeleteError(t('errors.languageNotSelected')); return; }
      if (!window.confirm(t('deleteConfirm', {default: 'Are you sure you want to delete this entry? This cannot be undone.'}))) { return; }
      setIsDeleting(id); setDeleteError(null);
      try {
          if (!window.electronAPI) throw new Error('Electron API not available.');
          const success = await window.electronAPI.deleteLogEntry(selectedLanguageName, id);
          if (success) {
               fetchEntries({ 
                    ...sortOptions,
                    ...(searchTerm.trim() && { searchTerm: searchTerm.trim() }),
                    ...(selectedCategory && { category: selectedCategory })
                });
            }
          else { throw new Error(t('errors.deleteEntryNotFound', { default: 'Entry not found or could not be deleted.'})); }
      } catch(err) {
          setDeleteError(err instanceof Error ? err.message : t('errors.deleteEntryError', { default: 'An unknown error occurred while deleting.'}));
      } finally {
          setIsDeleting(null);
      }
  };

  const openEntryModal = (entryToEdit: LogEntry | null = null) => {
    if (!selectedLanguageName) return;
    setEditingEntry(entryToEdit);
    setModalError(null);
    setIsModalOpen(true);
  };
  const closeEntryModal = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };
	const handleClearLogRequest = () => {
    if (entries.length === 0 && !error) return;
    if (!selectedLanguageName) return;
    setIsConfirmingClear(true);
    setClearError(null);
  };
	const handleCancelClear = () => { setIsConfirmingClear(false); };
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
			await window.electronAPI.deleteLanguageLog(selectedLanguageName);
      setEntries([]);
      selectLanguage(null); 
		} catch (err) {
			setClearError(err instanceof Error ? err.message : t('errors.clearLogError', { default: 'An unknown error occurred while clearing the log.'}));
		} finally {
			setIsClearing(false);
			setIsConfirmingClear(false);
		}
  };
	const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => { setSearchTerm(event.target.value); };
	const handleCategoryChange = (event: React.ChangeEvent<HTMLSelectElement>) => { setSelectedCategory(event.target.value); };
  const handleDataSortHeaderClick = (columnName: DataSortableColumnKey) => { 
      setSortOptions(prev => ({
          sortBy: columnName,
          sortOrder: prev.sortBy === columnName && prev.sortOrder === 'DESC' ? 'ASC' : 'DESC'
      }));
  };
	const formatLocalDate = (dateString: string | null | undefined): string => { 
    if (!dateString) return 'N/A';
		try { return new Date(dateString + 'Z').toLocaleString(); } 
    catch (e) { return dateString; } 
  };
	const createTimestampTitle = (entry: LogEntry) => `Added: ${formatLocalDate(entry.created_at)}\nUpdated: ${formatLocalDate(entry.updated_at)}`;

  const renderCellContent = useCallback((entry: LogEntry, columnId: string) => { 
    switch (columnId) {
      case 'id': return <span title={createTimestampTitle(entry)} style={{cursor: 'help'}}>{entry.id}</span>;
      case 'target_text': 
        // If character_form is present and no script_annotations, just show target_text (which might be character_form or user input)
        // If script_annotations are present, use RenderWithAnnotations with target_text. This assumes target_text is the text to be annotated.
        // If character_form exists, target_text is often (but not always) the same as character_form.
        // The goal of RenderWithAnnotations is to show annotations *on* a given text.
        return (entry.script_annotations && entry.script_annotations.length > 0)
                 ? <RenderWithAnnotations text={entry.target_text} scriptAnnotations={entry.script_annotations} theme={theme} />
                 : <>{entry.target_text}</>;
      case 'native_text': return entry.native_text ?? '';
      case 'category': return entry.category ?? '';
      case 'character_form': // Updated
        // Render character_form. If script_annotations exist, apply them to character_form.
        return <RenderWithAnnotations text={entry.character_form} scriptAnnotations={entry.script_annotations} theme={theme} />;
      case 'reading_form': return entry.reading_form ?? ''; // Updated
      case 'romanization': return entry.romanization ?? '';
      case 'notes': {
        const exampleTooltip = entry.example_sentence 
          ? t('grammarLogView.notesMarkers.exampleFull', { example: entry.example_sentence, defaultValue: `Example: ${entry.example_sentence}` })
          : t('grammarLogView.notesMarkers.example', {defaultValue: '(Ex)'});
        const systemNoteTooltip = entry.writing_system_note
          ? t('grammarLogView.notesMarkers.systemFull', { note: entry.writing_system_note, defaultValue: `System Note: ${entry.writing_system_note}` })
          : t('grammarLogView.notesMarkers.system', {defaultValue: '(Sys)'});

        return (
          <div> 
            {entry.notes ?? ''}
            {entry.example_sentence && <span style={{fontSize: '0.8em', color: 'gray', marginLeft: '5px'}} title={exampleTooltip}>{t('grammarLogView.notesMarkers.example', { default: '(Ex)'})}</span>}
            {entry.writing_system_note && <span style={{fontSize: '0.8em', color: 'blue', marginLeft: '5px'}} title={systemNoteTooltip}>{t('grammarLogView.notesMarkers.system', { default: '(Sys)'})}</span>}
          </div>
        );
      }
      case 'actions':
        return (
          <>
            <button onClick={() => handleDeleteEntry(entry.id)} disabled={isDeleting === entry.id} style={{ color: 'red', cursor: 'pointer', border: 'none', background: 'none', padding: '5px', marginRight: '10px'}} title={t('grammarLogView.tooltips.deleteEntry')} >
                {isDeleting === entry.id ? t('deleting', {default: 'Deleting...'}) : t('buttons.delete')}
            </button>
            <button onClick={() => openEntryModal(entry)} disabled={isDeleting === entry.id} title={t('grammarLogView.tooltips.editEntry')} style={{ cursor: 'pointer', border: 'none', background: 'none', padding: '5px'}}>{t('buttons.edit')}</button>
          </>
        );
      default: return null;
    }
  }, [t, isDeleting, selectedLanguageName, theme, createTimestampTitle, openEntryModal, handleDeleteEntry]); 

  if (!selectedLanguageName) { return <div style={{ padding: '20px' }}>{t('errors.selectLanguagePrompt', {default: 'Please select a language to view the grammar log.'})}</div>; }

  return (
		<div style={{ height: 'calc(100vh - 100px)', overflowY: 'auto', padding: '10px' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
				<h2 style={{ margin: 0 }}>{t('tabs.grammarLog')} ({selectedLanguageName})</h2>
				<div>
					<button onClick={handleClearLogRequest} disabled={isClearing || isConfirmingClear} title={t('buttons.clearLog')} style={{ padding: '8px 12px', cursor: 'pointer', marginRight: '10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px' }}>
						{t('buttons.clearLog')}
					</button>
					<button onClick={() => openEntryModal()} title={t('buttons.addEntry')} style={{ padding: '8px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' }}>
						{t('buttons.addEntry')}
					</button>
				</div>
			</div>
      <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', padding: '10px', border: '1px solid #eee', borderRadius: '4px', alignItems: 'center' }}>
           <label htmlFor="search-term" style={{whiteSpace: 'nowrap'}}>{t('grammarLogView.searchLabel')}</label>
          <input id="search-term" type="text" placeholder={t('grammarLogView.searchPlaceholder')} value={searchTerm} onChange={handleSearchChange} style={{ padding: '8px', flexGrow: 1 }}/>
           <label htmlFor="category-filter" style={{whiteSpace: 'nowrap'}}>{t('grammarLogView.categoryLabel')}</label>
          <select id="category-filter" value={selectedCategory} onChange={handleCategoryChange} style={{ padding: '8px', minWidth: '150px' }} >
              <option value="">{t('grammarLogView.allCategories')}</option>
              {GRAMMAR_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}
          </select>
      </div>
			{isConfirmingClear && selectedLanguageName && ( 
        <div style={{ border: '1px solid orange', padding: '10px', marginBottom: '15px', backgroundColor: '#fff3e0' }}>
            <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#212529' }}>
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
      {isLoading && <p>{t('loading', { default: 'Loading entries...'})}</p>}
      {deleteError && <p style={{ color: 'red', border: '1px solid red', padding: '10px', marginBottom: '10px' }}>{t('errors.deleteEntryErrorTitle', {default: 'Error deleting entry:'})} {deleteError}</p>}
      {error && !isLoading && <p style={{ color: 'red' }}>{t('errors.loadTableError', { default: 'Error loading table:'})} {error}</p>}

      <style>{`
        .ruby-hover-wrapper .ruby-text-hover {
          visibility: hidden; 
          opacity: 0;
        }
        .ruby-hover-wrapper:hover .ruby-text-hover {
          visibility: visible;
          opacity: 1;
          transition: opacity 0.2s ease-in-out, visibility 0s linear 0s; 
        }
      `}</style>

      {!isLoading && !error && (
        <>
          {entries.length === 0 && !searchTerm && !selectedCategory ? (<p>{t('grammarLogView.noEntries')}</p>)
           : entries.length === 0 && (searchTerm || selectedCategory) ? (<p>{t('grammarLogView.noEntriesMatch')}</p>)
           : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="grammar-log-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                    <SortableContext items={orderedDraggableColumnIds} strategy={horizontalListSortingStrategy}>
                      {currentDisplayColumnConfigs.map(config => (
                          <SortableHeaderCell
                            key={config.id}
                            config={config}
                            onSortClick={config.dataSortKey ? handleDataSortHeaderClick : undefined} 
                            currentSortOptions={sortOptions}
                            t={t}
                          />
                      ))}
                    </SortableContext>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #eee' }}>
                      {currentDisplayColumnConfigs.map(config => (
                          <td key={config.id} style={{ padding: '8px', minWidth: config.minWidth }} className={config.className}>
                            {renderCellContent(entry, config.id)}
                          </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </DndContext>
          )}
        </>
      )}

			{isModalOpen && selectedLanguageName && ( 
        <Modal
					isOpen={isModalOpen}
					onClose={closeEntryModal}
					onSave={handleModalSave}
					initialData={editingEntry ? { // Updated to reflect LogEntryData structure
						...editingEntry, 
            script_annotations: editingEntry.script_annotations ?? undefined, 
					} : { script_annotations: undefined } as Partial<LogEntryData>} // Ensure default is also Partial<LogEntryData>
					mode={editingEntry ? 'edit' : 'add'}
          isSubmitting={isSubmittingEntry}
          submitError={modalError}
				/>
      )}
	</div>
  );
};

export default GrammarLogView;