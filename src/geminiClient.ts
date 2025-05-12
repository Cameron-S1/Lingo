import { getSetting } from './database'; // To retrieve the API key
import fetch from 'node-fetch'; // Use node-fetch for reliable fetch in Node
import log from 'electron-log/main'; // Import electron-log for logging

// Initialize in case this module loads independently, though config often inherits
// If issues arise, might need to call initialize explicitly from main after its setup
log.initialize({ preload: true }); // Add this

// Store the API key securely in memory
let apiKey: string | null = null;
let isKeyLoading: boolean = false; // Prevent concurrent loading attempts

// Define the structure expected from the AI
export interface ExtractedItem {
    date_context?: string | null;
    target_text: string;
    native_text?: string | null;
    category_guess?: string | null;
    notes?: string | null;
    example_sentence?: string | null;
    original_snippet?: string;
    // New fields for character-based languages
    kanji_form?: string | null;
    kana_form?: string | null;
    romanization?: string | null;
    writing_system_note?: string | null;
}

interface AnalysisResult {
    extractedItems: ExtractedItem[];
    error: string | null;
}

// Gemini API Configuration - UPDATED MODEL
const MODEL_NAME = 'gemini-2.5-flash-preview-04-17'; // Use the new flash model
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

export const loadApiKey = async (): Promise<string | null> => { // Return key or null
    // If key already loaded, return it. If currently loading, wait and return eventual result.
    if (apiKey) { return apiKey; }
    if (isKeyLoading) {
        // Wait for the ongoing load attempt to finish
        await new Promise(resolve => { const interval = setInterval(() => { if (!isKeyLoading) { clearInterval(interval); resolve(null); } }, 100); });
        return apiKey; // Return whatever the result was
    }

    isKeyLoading = true;
    log.info('Attempting to load Gemini API Key...'); // Use log
    try {
        apiKey = await getSetting('geminiApiKey');
        if (apiKey) { log.info('Gemini API Key loaded successfully.'); } // Use log
        else { log.warn('Gemini API Key not found in settings.'); apiKey = null; } // Ensure null if not found
    } catch (error) { log.error('Error loading Gemini API Key:', error); apiKey = null; } // Use log
    finally { isKeyLoading = false; }
    return apiKey; // Return the loaded key or null
};

// Function to make the actual API call
// Update signature to accept apiKey
const generateContent = async (noteContent: string, apiKeyToUse: string): Promise<any> => {
     // No need to check module-level apiKey here, use the passed one
     const url = `${API_ENDPOINT}?key=${apiKeyToUse}`; // Use passed key
     const requestBody = {
         systemInstruction: {
            role: "system",
            parts: [{
                text: `You are an expert linguistic assistant helping a user parse their language learning notes. Analyze the provided **full note content** and extract distinct vocabulary terms, grammar rules, phrases, or example sentences found throughout the text. For each distinct item identified, provide its core details in a JSON object. The overall output should be a single JSON array containing these objects, ordered roughly as they appear in the text.

Each JSON object in the array MUST have the following structure. Provide null for optional fields if not applicable or not found:
{
  "target_text": "The word/phrase/sentence in the target language. This is the primary form, ideally the dictionary/base/lemma form (especially for inflected words like verbs), or the most common representation. Required.",
  "native_text": "The translation or equivalent in the user's native language. Optional.",
  "category_guess": "Your best guess for the grammatical category. CHOOSE FROM THE FOLLOWING LIST ONLY: ['Noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Determiner', 'Preposition', 'Postposition', 'Particle', 'Conjunction', 'Numeral', 'Interjection', 'Prefix', 'Suffix', 'Counter', 'Expression / Phrase', 'Grammar Point / Rule', 'Other']. If an item doesn't fit well into any specific category, use 'Other'. Do not use 'Needs Review'. Optional.",
  "notes": "Any additional contextual notes or explanations found *directly* associated with the item in the text. Optional.",
  "example_sentence": "If the item itself is a full example sentence, put it here. Optional.",
  "date_context": "If a date clearly associated with the learning entry (e.g., as a header or section marker like #YYYY-MM-DD, YYYY/MM/DD, MM/DD/YYYY, YYYY Month D, #YYYYMonthDD, 'Date: YYYY-MM-DD', etc.) precedes this item or seems to define its context, include the recognized date formatted as YYYY-MM-DD. Prioritize dates that appear to mark when content was learned or noted. Otherwise null. Optional.",
  "kanji_form": "If the target_text involves specific characters such as Japanese Kanji, Chinese Hanzi, Korean Hanja, or other primary ideographic/logographic/syllabic scripts, list the primary character form here (e.g., '交わる' for Japanese). This field is for the main script representation if distinct from a purely phonetic or romanized target_text. Optional.",
  "kana_form": "If the language uses a distinct phonetic script for reading or transcription (e.g., Japanese Kana, Hangul for Hanja readings, IPA for broader phonetics if relevant), provide the full phonetic representation here (e.g., 'まじわる' for Japanese '交わる'). This should correspond to the reading of the 'kanji_form' or 'target_text'. Optional.",
  "romanization": "Provide a standard romanization if applicable (e.g., Hepburn for Japanese 'majiwaru', Pinyin for Chinese). Specify system if non-obvious in notes. Optional.",
  "writing_system_note": "A brief note about the writing system if noteworthy (e.g., 'Kanji+Okurigana', 'Katakana only', 'Hanja with Hangul reading'). Optional."
}

- Focus only on explicit language learning content.
- Try to associate items with the most recent preceding date marker if applicable.
- Ignore metadata, timestamps (unless a date marker), markdown formatting characters (like *, !, [[ ]]), horizontal rules (---, ___), and irrelevant text unless part of an example.
- Be precise with 'target_text'. Try to identify the base form where appropriate (e.g., for verbs).
- IMPORTANT: Preserve all original characters, including accents (like Í, ó, á), diacritics, and punctuation, exactly as they appear in the source text within the extracted fields (target_text, native_text, notes, example_sentence, kanji_form, kana_form). Do not normalize or change them.
- If a line contains both target and native text separated by ' - ', ' : ', '=', '–' (em dash), or '—' (en dash), or within parentheses like 'target (native)', extract both.
- Treat lines starting with bullets (e.g., *, -, + followed by a space) or numbers (e.g., 1., 2)) as potentially distinct items to be extracted individually if they appear to be language learning entries.
- Interpret text that appears to be a header (e.g., lines starting with '#', '##', or in all caps followed by a colon or newline) as a potential introduction to a new set of related language items, or as a category/topic if appropriate. Strive to associate subsequent items with such headers if it makes contextual sense.
- For languages where a primary script form (like 'kanji_form') is provided, the 'target_text' should ideally be the same, or a dictionary/lemma form. The 'kana_form' (or equivalent phonetic script) should then represent the full reading of that primary script or target_text.
- Output ONLY the JSON array, nothing else before or after it.`
            }]
        },
         contents: [{
             parts: [{ text: noteContent }] // Pass the full content here
         }],
         generationConfig: {
             responseMimeType: "application/json",
             temperature: 0.2,
            // Consider adding maxOutputTokens if dealing with very large notes,
            // although Flash models usually have large context windows.
            // maxOutputTokens: 8192,
         }
     };

    const startTime = Date.now(); // Start timer
    log.info(`Calling Gemini API (${MODEL_NAME}) for full content analysis...`); // Use log
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            // Consider adding a timeout for long requests
            // signal: AbortSignal.timeout(60000) // 60 second timeout example
        });

        if (!response.ok) { /* ... (existing error handling) ... */
            const errorBody = await response.text();
            log.error(`Gemini API Error: ${response.status} ${response.statusText}`, errorBody); // Use log
            throw new Error(`API Error ${response.status}: ${response.statusText}. ${errorBody}`);
        }
        const data = await response.json();

        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
             const jsonText = data.candidates[0].content.parts[0].text;
             log.info(`<<< Gemini Raw Response Text (length: ${jsonText.length}):\n`, jsonText.substring(0, 500) + (jsonText.length > 500 ? '...' : '')); // Use log
             try {
                const parsedJson = JSON.parse(jsonText);
                if (Array.isArray(parsedJson)) { return parsedJson; }
                else { log.error("Gemini response was valid JSON but not an array:", parsedJson); throw new Error("AI response was not in the expected array format."); } // Use log
             } catch(parseError) { log.error("Failed to parse JSON response from Gemini:", parseError); log.error("Raw response text:", jsonText); throw new Error("AI response was not valid JSON."); } // Use log
        } else { log.error("Unexpected Gemini API response structure:", JSON.stringify(data, null, 2)); throw new Error('Unexpected API response structure.'); } // Use log

    } catch (error) { log.error('Network or fetch error calling Gemini API:', error); throw error; // Use log
    } finally { log.info(`Gemini API call duration: ${Date.now() - startTime} ms`); } // Use log
};

// Renamed function called by the main process note processing handler
export const analyzeNoteContent = async (noteContent: string): Promise<AnalysisResult> => {
    // Explicitly load/check the key right before analysis
    const currentApiKey = await loadApiKey(); // Await the load/check
    if (!currentApiKey) {
        log.warn("analyzeNoteContent called but API Key is missing or failed to load."); // Use log
        return { extractedItems: [], error: 'API_KEY_MISSING' };
    }

    try {
        log.info(`Starting analysis pipeline for content (${Math.round(noteContent.length / 1024)} KB)...`); // Use log
        // Pass the verified key to generateContent
        const extractedJsonArray = await generateContent(noteContent, currentApiKey);
        // Basic validation: ensure target_text exists. More specific validation for new fields might be added here or in main.ts later.
        const validatedItems = extractedJsonArray.filter((item: any) => item && typeof item.target_text === 'string' && item.target_text.trim().length > 0);
        log.info(`Gemini analysis successful. Extracted ${validatedItems.length} potential items.`); // Use log
        return { extractedItems: validatedItems, error: null };
    } catch (error) {
        log.error(`Error during Gemini analysis pipeline:`, error); // Use log
        return { extractedItems: [], error: error instanceof Error ? error.message : 'Unknown analysis error' };
    }
};

// Load key on module load - still useful for initial load attempt
// Start initial load, but don't block module execution
loadApiKey().catch(err => console.error("Initial background API key load failed:", err)); // Keep console error for this initial background load

// console.log(`Gemini Client module loaded (using model: ${MODEL_NAME}).`); // Maybe remove this console log
log.info(`Gemini Client module loaded (using model: ${MODEL_NAME}).`); // Use log