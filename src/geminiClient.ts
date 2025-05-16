import { getSetting } from './database'; 
import fetch from 'node-fetch'; 
import log from 'electron-log/main'; 

log.initialize({ preload: true });

let apiKey: string | null = null;
let isKeyLoading: boolean = false;

// Renamed from FuriganaDetail and updated for v1.4
export interface ScriptAnnotationDetailGemini {
  base_character: string; // Formerly char, should be a single character like Kanji
  annotation_text: string; // Formerly reading, its phonetic reading (e.g., Hiragana)
  type: string; // e.g., 'reading', 'gloss' (AI will be instructed to provide 'reading' for now)
}

export interface ExtractedItem {
    date_context?: string | null;
    target_text: string;
    native_text?: string | null;
    category_guess?: string | null;
    notes?: string | null;
    example_sentence?: string | null;
    original_snippet?: string;
    character_form?: string | null; // formerly kanji_form
    reading_form?: string | null;   // formerly kana_form
    romanization?: string | null;
    writing_system_note?: string | null;
    script_annotations?: ScriptAnnotationDetailGemini[] | null; // formerly furigana_details
}

export interface AnalysisResult { 
    extractedItems: ExtractedItem[];
    error: string | null; 
    errorDetails?: any; 
}

const MODEL_NAME = 'gemini-2.5-flash-preview-04-17';
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; 
const MAX_BACKOFF_MS = 60000; 
const RATE_LIMIT_RETRY_DELAY_MS = 30000; 

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

const generateContent = async (noteContent: string, apiKeyToUse: string): Promise<any> => { 
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
  "character_form": "If the target_text involves specific characters such as Japanese Kanji, Chinese Hanzi, Korean Hanja, or other primary ideographic/logographic/syllabic scripts, list the primary character form here (e.g., '交わる' for Japanese). This field is for the main script representation if distinct from a purely phonetic or romanized target_text. Optional.",
  "reading_form": "This field is for phonetic representation. IF the language of 'target_text' uses a standard phonetic script (e.g., Japanese Kana like 'まじわる' for '交わる'; Korean Hangul for Hanja readings), provide that full script here. FOR ALL OTHER LANGUAGES (e.g., English, Spanish, French, German, etc.) that DO NOT use such a distinct phonetic script for common writing, you MUST generate an International Phonetic Alphabet (IPA) transcription (e.g., for English 'example', IPA: /ɪɡˈzæmpəl/; for Spanish 'hola', IPA: /ˈola/). This IPA transcription is a CRITICAL requirement for these languages. The content of 'reading_form' must correspond to the pronunciation of 'target_text' or 'character_form'. If, after a genuine attempt, accurate phonetic information (either script or IPA) cannot be provided (e.g., for very obscure terms or non-linguistic symbols), this field MUST BE null or an empty string. Do not guess wildly; accuracy is key. This field is vital for user pronunciation.",
  "romanization": "Provide a standard romanization. If the 'target_text' is already in a Roman-based script (like English, Spanish, French), then 'romanization' SHOULD typically be the SAME AS 'target_text' unless a specific, different romanization system is standard for that word or context. For non-Roman scripts (e.g., Japanese, Chinese, Arabic), provide a standard romanization (e.g., Hepburn for Japanese 'majiwaru', Pinyin for Chinese). Specify system if non-obvious in notes. This field is crucial for consistent display and search. Optional, but STRONGLY PREFERRED, especially if 'target_text' might contain non-Roman characters or if 'character_form' is used.",
  "writing_system_note": "A brief note about the writing system if noteworthy (e.g., 'Kanji+Okurigana', 'Katakana only', 'Hanja with Hangul reading'). Optional.",
  "script_annotations": null /* Placeholder. See detailed script annotation instructions below. */
}

- Focus only on explicit language learning content.
- Try to associate items with the most recent preceding date marker if applicable.
- Ignore metadata, timestamps (unless a date marker), markdown formatting characters (like *, !, [[ ]]), horizontal rules (---, ___), and irrelevant text unless part of an example.
- Be precise with 'target_text'. Try to identify the base form where appropriate (e.g., for verbs).
- IMPORTANT: Preserve all original characters, including accents (like Í, ó, á), diacritics, and punctuation, exactly as they appear in the source text within the extracted fields (target_text, native_text, notes, example_sentence, character_form, reading_form). Do not normalize or change them.
- If a line contains both target and native text separated by ' - ', ' : ', '=', '–' (em dash), or '—' (en dash), or within parentheses like 'target (native)', extract both.
- Treat lines starting with bullets (e.g., *, -, + followed by a space) or numbers (e.g., 1., 2)) as potentially distinct items to be extracted individually if they appear to be language learning entries.
- Interpret text that appears to be a header (e.g., lines starting with '#', '##', or in all caps followed by a colon or newline) as a potential introduction to a new set of related language items, or as a category/topic if appropriate. Strive to associate subsequent items with such headers if it makes contextual sense.
- For languages where a primary script form (like 'character_form') is provided, the 'target_text' should ideally be the same, or a dictionary/lemma form. The 'reading_form' (or equivalent phonetic script) should then represent the full reading of that primary script or target_text.

- For Japanese entries containing Kanji (and adaptable for similar character-based languages needing phonetic annotations):
  - Your primary goal for 'script_annotations' is to enable per-character ruby text display ONLY FOR CHARACTERS IN THE PRIMARY SCRIPT (e.g., Kanji).
  - If 'character_form' is provided and contains such characters, AND a corresponding 'reading_form' (full phonetic reading of 'character_form') is also provided:
    - YOU MUST generate 'script_annotations' EXCLUSIVELY for the relevant characters found within 'character_form'.
    - This involves identifying each relevant character in 'character_form' and determining its phonetic reading by aligning it with the 'reading_form'.
    - Populate 'script_annotations' as an array of objects. Each object MUST represent a SINGLE RELEVANT CHARACTER from 'character_form'.
      - 'base_character': The single character from 'character_form'.
      - 'annotation_text': The corresponding phonetic reading for that single character, inferred by aligning 'character_form' with 'reading_form'.
      - 'type': Set this to 'reading'.
    - DO NOT include non-annotated characters (like Hiragana or Katakana that are part of 'character_form', e.g., Okurigana in Japanese) in the 'script_annotations' array. These will be rendered as plain text by the application.
    - The sequence of objects in 'script_annotations' must correspond to the sequence of RELEVANT CHARACTERS as they appear in 'character_form'.
    - Example 1 (Japanese): 'character_form': "食べ物", 'reading_form': "たべもの" -> Expected 'script_annotations': '[{"base_character": "食", "annotation_text": "た", "type": "reading"}, {"base_character": "物", "annotation_text": "もの", "type": "reading"}]'
    - Example 2 (Japanese): 'character_form': "日本語", 'reading_form': "にほんご" -> Expected 'script_annotations': '[{"base_character": "日", "annotation_text": "に", "type": "reading"}, {"base_character": "本", "annotation_text": "ほん", "type": "reading"}, {"base_character": "語", "annotation_text": "ご", "type": "reading"}]'
    - Example 3 (Japanese): 'character_form': "申込", 'reading_form': "もうしこみ" -> Expected 'script_annotations': '[{"base_character": "申", "annotation_text": "もうし", "type": "reading"}, {"base_character": "込", "annotation_text": "こみ", "type": "reading"}]'
    - Example 4 (Japanese): 'character_form': "静か", 'reading_form': "しずか" -> Expected 'script_annotations': '[{"base_character": "静", "annotation_text": "しず", "type": "reading"}]'
    - Example 5 (Japanese): 'character_form': "歩いて", 'reading_form': "あるいて" -> Expected 'script_annotations': '[{"base_character": "歩", "annotation_text": "ある", "type": "reading"}]'
  - If 'character_form' contains relevant characters but 'reading_form' is missing, attempt to provide 'script_annotations' based on common readings.
  - If 'character_form' is null or empty, but 'target_text' contains relevant characters (e.g., Japanese Kanji) AND 'reading_form' is available for 'target_text': Apply the same generation logic using 'target_text' (its relevant character parts) and 'reading_form', providing details only for those characters.
  - If 'character_form' (or 'target_text' if applicable) contains NO characters needing annotation, or if you are genuinely unable to determine readings for the present characters, 'script_annotations' MUST BE null.
  - The main 'reading_form' field should always represent the complete phonetic reading of the word/phrase.

- Output ONLY the JSON array, nothing else before or after it.`
            }]
        },
         contents: [{
             parts: [{ text: noteContent }]
         }],
         generationConfig: {
             responseMimeType: "application/json",
             temperature: 0.15, 
         }
    };

    let attempt = 0;
    let currentExponentialBackoffMs = INITIAL_BACKOFF_MS; 

    while (attempt <= MAX_RETRIES) {
        const startTime = Date.now();
        log.info(`Calling Gemini API (${MODEL_NAME}), attempt ${attempt + 1}/${MAX_RETRIES +1}...`);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (response.ok) {
                const data = await response.json();
                log.info(`Gemini API call duration: ${Date.now() - startTime} ms`);
                if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    const jsonText = data.candidates[0].content.parts[0].text;
                    log.info(`<<< Gemini Raw Response Text (length: ${jsonText.length}):\n`, jsonText.substring(0, 1000) + (jsonText.length > 1000 ? '...' : ''));
                    try {
                        const parsedJson = JSON.parse(jsonText);
                        if (Array.isArray(parsedJson)) { return parsedJson; }
                        else { log.error("Gemini response was valid JSON but not an array:", parsedJson); throw new Error("AI response was not in the expected array format."); }
                    } catch(parseError) { log.error("Failed to parse JSON response from Gemini:", parseError, "Raw text:", jsonText); throw new Error("AI response was not valid JSON."); }
                } else if (data?.candidates?.[0]?.finishReason === "MAX_TOKENS") {
                    log.error("Gemini API Error: MAX_TOKENS. The response was too long and was truncated.");
                    throw new Error("MAX_TOKENS_EXCEEDED"); 
                } else { 
                    log.error("Unexpected Gemini API response structure or empty parts:", JSON.stringify(data, null, 2)); 
                    throw new Error('Unexpected API response structure or empty parts.'); 
                }
            } else { 
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
                        const delayMs = RATE_LIMIT_RETRY_DELAY_MS; 
                        log.warn(`Rate limit hit (status ${response.status}). Retrying attempt ${attempt +1}/${MAX_RETRIES +1} after ${delayMs}ms...`); // Corrected retry log
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue; 
                    } else {
                        log.error(`Max retries (${MAX_RETRIES +1}) reached for rate limit error.`); // Corrected retry log
                        const rateLimitError = new Error("API_RATE_LIMIT_EXCEEDED");
                        (rateLimitError as any).details = errorJson || errorBodyText;
                        throw rateLimitError;
                    }
                }
                const apiError = new Error(`API Error ${response.status}: ${response.statusText}`);
                (apiError as any).details = errorJson || errorBodyText;
                throw apiError;
            }
        } catch (error: any) { 
            log.error(`Error during Gemini API call attempt ${attempt + 1}:`, error);
            log.info(`Gemini API call attempt ${attempt + 1} duration: ${Date.now() - startTime} ms`);
            if (error.message === "MAX_TOKENS_EXCEEDED") { 
                log.warn('MAX_TOKENS_EXCEEDED caught, not retrying for this error type.');
                throw error;
            }
            const isRetryableNetworkError = (error.name !== 'AbortError' && (error.code === 'ECONNRESET' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT' || error.type === 'system' && error.errno === 'ETIMEDOUT' ));
            if (error.message === "API_RATE_LIMIT_EXCEEDED" || (isRetryableNetworkError && attempt < MAX_RETRIES)) {
                 if (error.message === "API_RATE_LIMIT_EXCEEDED") { 
                    log.warn('API_RATE_LIMIT_EXCEEDED caught for final throw.');
                    throw error; 
                 }
                attempt++;
                log.warn(`Network or potentially transient error. Retrying attempt ${attempt +1}/${MAX_RETRIES +1} after ${currentExponentialBackoffMs}ms...`); // Corrected retry log
                await new Promise(resolve => setTimeout(resolve, currentExponentialBackoffMs));
                currentExponentialBackoffMs = Math.min(currentExponentialBackoffMs * 2, MAX_BACKOFF_MS);
                continue;
            }
            throw error; 
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
        const validatedItems = extractedJsonArray.filter((item: any) => item && typeof item.target_text === 'string' && item.target_text.trim().length > 0);
        log.info(`Gemini analysis successful. Extracted and initially validated ${validatedItems.length} items.`);
        return { extractedItems: validatedItems, error: null };
    } catch (error: any) {
        log.error(`Error during Gemini analysis pipeline:`, error);
        if (error.message === "API_RATE_LIMIT_EXCEEDED") {
            return { extractedItems: [], error: "RATE_LIMIT_EXCEEDED", errorDetails: error.details || "API rate limit was hit after multiple retries." };
        }
        if (error.message === "MAX_TOKENS_EXCEEDED") {
            return { extractedItems: [], error: "MAX_TOKENS_EXCEEDED", errorDetails: "The AI's response was too long and was truncated." };
        }
        return { extractedItems: [], error: error.message || 'Unknown analysis error', errorDetails: error.details || error };
    }
};

loadApiKey().catch(err => console.error("Initial background API key load failed:", err));
log.info(`Gemini Client module loaded (using model: ${MODEL_NAME}).`);