# Lingo

## Overview

Lingo is an Electron-based desktop application designed for language learners. Its primary purpose is to provide a structured, searchable, and efficient way for users to create and manage logs of grammar points, vocabulary, phrases, and example sentences for the languages they are studying.

The core innovation is leveraging AI (specifically Google's Gemini models via user-provided API keys) to automatically parse and categorize entries from user-provided notes (supporting .txt, .md, and .docx files), aiming to significantly reduce manual data entry.

## Key Features

*   **AI-Powered Note Parsing:** Automatically analyzes notes from .txt, .md, and .docx files to extract and categorize grammar points, vocabulary, and examples.
    *   **Enhanced Phonetic & Romanization Support (v1.5):**
        *   The AI attempts to generate International Phonetic Alphabet (IPA) transcriptions for the `reading_form` field, particularly for languages that don't use a distinct phonetic script (e.g., English, Spanish). This complements script-based readings (like Japanese Kana).
        *   Improved logic for populating the `romanization` field, including for languages already using Roman-based scripts.
*   **Customizable UI:** Defaults to dark mode. Supports light/dark themes and multiple interface languages (English, Japanese, French, German, Spanish, Portuguese, Russian - translations pending for non-English languages).
*   **Intelligent Duplicate Handling:** When importing notes, if an AI-extracted item matches an existing log entry by its target text:
    *   **Merging (v1.1):**  If the native translation is consistent, or if the existing entry's translation is empty, the system automatically attempts to merge additional new information (e.g., missing `character_form`, `reading_form`, notes, examples) into the existing entry. This enriches your log.
    *   **Homonym Detection (v1.3):** If the target text is the same but the AI proposes a *different native translation* than an already existing one, this potential homonym is flagged for user review to ensure distinct meanings are handled correctly.
    *   Pure duplicates offering no new data (and not identified as potential homonyms) are automatically ignored, reducing clutter.
*   **Manual Entry:** Allows users to add and edit log entries manually.
*   **Multi-Language Support:** Designed to manage logs for various target languages, with a generalized data structure.
*   **Per-Language Data Isolation (v1.3):** Each language's log is stored in a separate database file, improving data organization and allowing for complete log resets per language (by deleting the language's specific database file via the "Clear Log" function).
*   **Processed Note History:** Keeps a record of imported source note files.
*   **Refined Review System:** Focuses on content quality by flagging items needing attention. This includes potential homonym conflicts (same target word, different proposed translations), ambiguous AI interpretations (e.g., missing or unclear translations), content validation issues, or entries where the AI couldn't confidently categorize the data. (Note: Direct API processing errors are logged for debugging but generally do not create review items, keeping the review queue focused on content.)
*   **Search & Filter:** Provides capabilities to search and filter grammar log entries.
*   **Structured Log Entries (Language Agnostic):** Stores entries with fields for target text, native translation, category, notes, example sentences, and generalized fields for various writing systems including `character_form` (primary script, e.g., Kanji, Hanzi), `reading_form` (phonetic script, e.g., Kana, or AI-generated IPA), `script_annotations` (for character-level readings like Furigana), and `romanization`.
*   **Script Annotation Display on Hover (v1.3):** For entries with script annotations, hovering over `character_form` or `target_text` cells containing characters with annotations will display the corresponding `annotation_text` (e.g., Furigana, Pinyin) using HTML `<ruby>` tags, based on stored `script_annotations`.
*   **User-Configurable Column Visibility (v1.5):** A UI control in the Grammar Log view will allow users to show/hide specific data columns (e.g., Character Form, Reading Form, Romanization) to customize their view.

## Technologies Used

*   **Framework:** Electron
*   **Frontend:** React with TypeScript (Vite)
*   **Styling:** CSS (with dark mode support)
*   **State Management:** React Context
*   **AI Integration:** Google Gemini API (requires user's own API key). The application automatically retries API calls if transient issues occur (including for rate limits) and includes enhanced error detection for `MAX_TOKENS`. AI is utilized for parsing notes, generating `script_annotations` (like Furigana for Japanese Kanji), and attempting phonetic transcriptions (IPA).
*   **Database:** SQLite3 (per-language databases for logs, including structured `script_annotations` data; a global database for application settings)
*   **Internationalization (i18n):** Custom implementation using JSON locale files.

## Getting Started

### Prerequisites

*   Node.js and npm (or yarn) installed.
*   A Google Gemini API Key (you can obtain one from [Google AI Studio](https://aistudio.google.com/app/apikey)).

### Installation

1.  Clone the repository or download the source code.
2.  Navigate to the project directory in your terminal.
3.  Install dependencies:
    ```bash
    npm install
    ```
    (or `yarn install`)

### Running the Application

1.  **Development Mode:**
    To run the application in development mode with hot-reloading:
    ```bash
    npm run dev
    ```
2.  **Building for Production:**
    To build the application for production:
    ```bash
    npm run build
    ```
    This will create distributable files in the `dist-electron` and potentially `dist` directories.

### Configuration

*   **Gemini API Key:** Upon first launch or via the Settings menu, you will need to enter your Google Gemini API Key for the AI parsing features to work.
*   **Data Storage:** Language data is stored within the application's user data directory (the exact path is output to the terminal on startup). Inside a `languages` subfolder, each language has its own directory (e.g., `japanese`) containing its database file (e.g., `japanese.sqlite`). Global settings like your API key and theme preference are stored in a `global-settings.sqlite` file directly within the user data directory.

## Logging

The application uses `electron-log` for backend logging. Log files (e.g., `main.log`) can typically be found in the user's application data directory (the exact path is output to the terminal on startup). These logs are crucial for debugging, especially AI responses and processing errors (including details on merged entries).

## Future Development Ideas

*   **Dynamic AI-Assisted Flashcard Creation:** Leverage AI to generate various flashcard formats from log entries.
*   **AI-Powered Progress Analysis:** Provide insights and statistics on learning progress, vocabulary acquisition, and grammar point mastery.
*   **Spaced Repetition System (SRS) Integration:** Implement an SRS algorithm for optimized flashcard review scheduling.
*   **Advanced Search & Filtering:** Introduce more granular search criteria (e.g., by character forms, date ranges, review status).
*   **User-Defined Tags/Labels:** Allow users to add custom tags to log entries for personalized organization.
*   **Audio Pronunciation Support:** Integrate Text-to-Speech (TTS) or allow users to attach/record audio for entries.
*   **Enhanced Import/Export Capabilities:** Support more file formats and provide options to export data for use in other tools (e.g., Anki).
*   **Cloud Sync/Backup Options:** Offer functionality to synchronize or back up user data to a cloud service (with privacy considerations).
*   **Advanced Theme Customization:** Allow users more control over UI appearance.
*   **Plugin System/Extensibility:** Create an architecture that allows for community-developed plugins to extend application features.
*   **Robust MAX_TOKENS Handling:** Implement a file-splitting strategy for very large notes to prevent API response truncation.

## Contributing

Developer: Cameron Searcy (https://github.com/Cameron-S1)

## License

This project is licensed under the Mozilla Public License Version 2.0 (MPL 2.0). You may obtain a copy of the License at:

[https://mozilla.org/MPL/2.0/](https://mozilla.org/MPL/2.0/)

The full text of the license is also included in the `LICENSE` file in the root directory of this project.

---
*Version: 1.5.0 (As of May 15, 2025)*