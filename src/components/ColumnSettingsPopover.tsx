import React from 'react';
import type { ColumnConfig } from './GrammarLogView'; // Assuming ColumnConfig is exported or moved

interface ColumnSettingsPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null; // For potential positioning
  allToggleableColumns: ColumnConfig[];
  currentVisibility: Record<string, boolean>;
  onVisibilityChange: (columnId: string, isVisible: boolean) => void;
  t: (key: string, options?: Record<string, string | number> | undefined) => string;
  theme: string; // To style popover based on theme
}

const ColumnSettingsPopover: React.FC<ColumnSettingsPopoverProps> = ({
  isOpen,
  onClose,
  // anchorEl, // Not used in this basic version
  allToggleableColumns,
  currentVisibility,
  onVisibilityChange,
  t,
  theme
}) => {
  if (!isOpen) {
    return null;
  }

  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50px', // Adjust as needed, or use anchorEl for better positioning
    right: '10px', // Adjust as needed
    backgroundColor: theme === 'dark' ? '#424242' : '#fff',
    border: theme === 'dark' ? '1px solid #555' : '1px solid #ccc',
    borderRadius: '4px',
    padding: '15px',
    zIndex: 1000,
    boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
    color: theme === 'dark' ? '#fff' : '#000',
  };

  const itemStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '8px',
  };

  const labelStyle: React.CSSProperties = {
    marginLeft: '8px',
  };

  return (
    <div style={popoverStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0 }}>{t('grammarLogView.columnSettings.title', { default: 'Column Visibility' })}</h4>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2em', cursor: 'pointer', color: theme === 'dark' ? '#fff' : '#000' }} title={t('buttons.close', { default: 'Close' })}>
          &times;
        </button>
      </div>
      {allToggleableColumns.map(col => (
        col.isDraggable && ( // Only show toggles for columns marked as draggable/toggleable
          <label key={col.id} style={itemStyle}>
            <input
              type="checkbox"
              checked={currentVisibility[col.id] !== false} // Default to true if not in map
              onChange={(e) => onVisibilityChange(col.id, e.target.checked)}
            />
            <span style={labelStyle}>{t(col.headerKey)}</span>
          </label>
        )
      ))}
    </div>
  );
};

export default ColumnSettingsPopover;