import { getSetting } from './database'; // To retrieve the API key
import fetch from 'node-fetch'; // Use node-fetch for reliable fetch in Node
import log from 'electron-log/main'; // Import electron-log for logging

log.initialize({ preload: true });

let apiKey: string | null = null;
let isKeyLoading: boolean = false;

export interface ExtractedItem {
    date_context?: string | null;
    target_text: string;
    native_text?: string | null;
    category_guess?: string | null;
    notes?: string | null;
    example_sentence?: string | null;
    original_snippet?: string;
    kanji_form?: string | null;
    kana_form?: string | null;
    romanization?: string | null;
    writing_system_note?: string | null;
}

export interface AnalysisResult { // Exporting this as it's used as a return type
    extractedItems: ExtractedItem[];
    error: string | null; // Can be 'API_KEY_MISSING', 'RATE_LIMIT_EXCEEDED', or other error messages
    errorDetails?: any; // To pass along raw error details if needed
}

const MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; 
const MAX_BACKOFF_MS = 60000; // Max 1 minute backoff for non-429 retryable errors
const RATE_LIMIT_RETRY_DELAY_MS = 30000; // Fixed 30 seconds for 429 errors

export const loadApiKey = async (): Promise<string | null> => {
    if (apiKey) { return apiKey; }
    if (isKeyLoading) {
        await new Promise(resolve => { const interval = setInterval(() => { if (!isKeyLoading) { clearInterval(interval); resolve(null); } }, 100); });
        return apiKey;
    }
    isKeyLoading = true;
    log.info('Attempting to load Gemini API Key...');
    try {
        apiKey = await getSetting('geminiApiKey');
        if (apiKey) { log.info('Gemini API Key loaded successfully.'); }
        else { log.warn('Gemini API Key not found in settings.'); apiKey = null; }
    } catch (error) { log.error('Error loading Gemini API Key:', error); apiKey = null; }
    finally { isKeyLoading = false; }
    return apiKey;
};

// Function to make the actual API call with retry logic
const generateContent = async (noteContent: string, apiKeyToUse: string): Promise<any> => { // Returns parsed JSON array or throws
    const url = `${API_ENDPOINT}?key=${apiKeyToUse}`;
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
             parts: [{ text: noteContent }]
         }],
         generationConfig: {
             responseMimeType: "application/json",
             temperature: 0.2,
         }
    };

    let attempt = 0;
    let currentExponentialBackoffMs = INITIAL_BACKOFF_MS; // For non-429 retryable errors

    while (attempt <= MAX_RETRIES) {
        const startTime = Date.now();
        log.info(`Calling Gemini API (${MODEL_NAME}), attempt ${attempt + 1}/${MAX_RETRIES +1}...`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
                // Removed AbortSignal.timeout
            });

            if (response.ok) {
                const data = await response.json();
                log.info(`Gemini API call duration: ${Date.now() - startTime} ms`);
                if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const jsonText = data.candidates[0].content.parts[0].text;
                    log.info(`<<< Gemini Raw Response Text (length: ${jsonText.length}):\n`, jsonText.substring(0, 500) + (jsonText.length > 500 ? '...' : ''));
                    try {
                        const parsedJson = JSON.parse(jsonText);
                        if (Array.isArray(parsedJson)) { return parsedJson; }
                        else { log.error("Gemini response was valid JSON but not an array:", parsedJson); throw new Error("AI response was not in the expected array format."); }
                    } catch(parseError) { log.error("Failed to parse JSON response from Gemini:", parseError); log.error("Raw response text:", jsonText); throw new Error("AI response was not valid JSON."); }
                } else { log.error("Unexpected Gemini API response structure:", JSON.stringify(data, null, 2)); throw new Error('Unexpected API response structure.'); }
            } else { // !response.ok
                let errorBodyText = 'Could not retrieve error body.';
                let errorJson: any = null;
                try {
                    errorBodyText = await response.text(); 
                    errorJson = JSON.parse(errorBodyText); 
                } catch (e) {
                     log.warn('Could not parse error body as JSON, using raw text.', e);
                }

                log.error(`Gemini API Error: ${response.status} ${response.statusText}`, errorBodyText);

                if (response.status === 429 || (errorJson?.error?.code === 429 && errorJson?.error?.status === "RESOURCE_EXHAUSTED")) {
                    if (attempt < MAX_RETRIES) {
                        attempt++;
                        const delayMs = RATE_LIMIT_RETRY_DELAY_MS; // Use fixed 30-second delay
                        log.warn(`Rate limit hit (status ${response.status}). Retrying attempt ${attempt}/${MAX_RETRIES} after ${delayMs}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue; // Retry the loop
                    } else {
                        log.error(`Max retries (${MAX_RETRIES}) reached for rate limit error.`);
                        const rateLimitError = new Error("API_RATE_LIMIT_EXCEEDED");
                        (rateLimitError as any).details = errorJson || errorBodyText;
                        throw rateLimitError;
                    }
                }
                // For other non-429 errors, throw immediately
                const apiError = new Error(`API Error ${response.status}: ${response.statusText}`);
                (apiError as any).details = errorJson || errorBodyText;
                throw apiError;
            }
        } catch (error: any) { // Catch network errors or other thrown errors
            log.error(`Error during Gemini API call attempt ${attempt + 1}:`, error);
            log.info(`Gemini API call attempt ${attempt + 1} duration: ${Date.now() - startTime} ms`);
            
            // Check if it's a potentially retryable network error (but not our client-side AbortError, which is removed)
            // or an explicitly thrown API_RATE_LIMIT_EXCEEDED
            const isRetryableNetworkError = (error.name !== 'AbortError' && // AbortError from external source not our timeout
                                            (error.code === 'ECONNRESET' || 
                                             error.code === 'ECONNABORTED' || 
                                             error.code === 'ETIMEDOUT' || // Network timeout, not API response timeout
                                             error.type === 'system' && error.errno === 'ETIMEDOUT' )
                                            );

            if (error.message === "API_RATE_LIMIT_EXCEEDED" || (isRetryableNetworkError && attempt < MAX_RETRIES)) {
                 if (error.message === "API_RATE_LIMIT_EXCEEDED") { // This was already thrown by the 429 handler
                    log.warn('API_RATE_LIMIT_EXCEEDED caught for final throw.');
                    throw error; 
                 }

                // For other retryable errors (like network issues)
                attempt++;
                log.warn(`Network or potentially transient error. Retrying attempt ${attempt}/${MAX_RETRIES} after ${currentExponentialBackoffMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, currentExponentialBackoffMs));
                currentExponentialBackoffMs = Math.min(currentExponentialBackoffMs * 2, MAX_BACKOFF_MS);
                continue;
            }
            throw error; // For non-retryable errors or if max retries exceeded
        }
    }
    log.error('generateContent exhausted retries or encountered unhandled state.');
    throw new Error("Failed to generate content after multiple attempts.");
};

export const analyzeNoteContent = async (noteContent: string): Promise<AnalysisResult> => {
    const currentApiKey = await loadApiKey();
    if (!currentApiKey) {
        log.warn("analyzeNoteContent called but API Key is missing or failed to load.");
        return { extractedItems: [], error: 'API_KEY_MISSING', errorDetails: 'API Key not found in settings.' };
    }

    try {
        log.info(`Starting analysis pipeline for content (${Math.round(noteContent.length / 1024)} KB)...`);
        const extractedJsonArray = await generateContent(noteContent, currentApiKey);
        // Basic validation: ensure target_text exists and is a non-empty string.
        const validatedItems = extractedJsonArray.filter((item: any) => item && typeof item.target_text === 'string' && item.target_text.trim().length > 0);
        log.info(`Gemini analysis successful. Extracted and initially validated ${validatedItems.length} items.`);
        return { extractedItems: validatedItems, error: null };
    } catch (error: any) {
        log.error(`Error during Gemini analysis pipeline:`, error);
        if (error.message === "API_RATE_LIMIT_EXCEEDED") {
            return { extractedItems: [], error: "RATE_LIMIT_EXCEEDED", errorDetails: error.details || "API rate limit was hit after multiple retries." };
        }
        // For any other error from generateContent (network, other API errors not retried, parsing errors)
        return { extractedItems: [], error: error.message || 'Unknown analysis error', errorDetails: error.details || error };
    }
};

loadApiKey().catch(err => console.error("Initial background API key load failed:", err));
log.info(`Gemini Client module loaded (using model: ${MODEL_NAME}).`);