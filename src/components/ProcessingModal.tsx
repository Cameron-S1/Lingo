import React from 'react';

interface ProcessingModalProps {
  isOpen: boolean;
  message: string;
  onCancel: () => void; // Callback when cancel is clicked
}

// Reusing styles similar to the main Modal for consistency
const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)', // Keep overlay semi-transparent
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1050, // Ensure it's on top of other UI, maybe slightly higher than main modal
};

// Style for the content box, now WITHOUT background color
const modalContentBaseStyle: React.CSSProperties = {
  padding: '30px 40px', // Make it slightly roomier
  borderRadius: '5px',
  maxWidth: '400px', // Smaller width for status indication
  width: '80%',
  textAlign: 'center',
  position: 'relative',
  boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
};

const buttonStyle: React.CSSProperties = {
    marginTop: '20px',
    padding: '8px 15px',
    cursor: 'pointer',
    border: '1px solid #ccc',
    borderRadius: '4px',
    backgroundColor: '#eee' // Keep default button color for now
};


const ProcessingModal: React.FC<ProcessingModalProps> = ({ isOpen, message, onCancel }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div style={modalOverlayStyle}>
      {/* Add className and apply base style */}
      <div style={modalContentBaseStyle} className="processing-modal-content">
        <h3>Processing...</h3>
        <p>{message}</p>
        {/* Basic Spinner Example */}
        <div style={{
            border: '4px solid #f3f3f3', /* Light grey - might need dark mode adjustment later */
            borderTop: '4px solid #3498db', /* Blue */
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            animation: 'spin 1s linear infinite',
            margin: '20px auto'
         }}></div>
         {/* Add CSS animation for spin if not already global */}
         <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
         `}</style>
        <button style={buttonStyle} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default ProcessingModal;