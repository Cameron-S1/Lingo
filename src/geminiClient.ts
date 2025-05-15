import { getSetting } from './database'; 
import fetch from 'node-fetch'; 
import log from 'electron-log/main'; 

log.initialize({ preload: true });

let apiKey: string | null = null;
let isKeyLoading: boolean = false;

export interface FuriganaDetail {
  char: string;    // Should be a single Kanji character
  reading: string; // Its Hiragana reading
}

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
    furigana_details?: FuriganaDetail[] | null; // Array of details ONLY for Kanji
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
  "kanji_form": "If the target_text involves specific characters such as Japanese Kanji, Chinese Hanzi, Korean Hanja, or other primary ideographic/logographic/syllabic scripts, list the primary character form here (e.g., '交わる' for Japanese). This field is for the main script representation if distinct from a purely phonetic or romanized target_text. Optional.",
  "kana_form": "If the language uses a distinct phonetic script for reading or transcription (e.g., Japanese Kana, Hangul for Hanja readings, IPA for broader phonetics if relevant), provide the full phonetic representation here (e.g., 'まじわる' for Japanese '交わる'). This should correspond to the reading of the 'kanji_form' or 'target_text'. Optional.",
  "romanization": "Provide a standard romanization if applicable (e.g., Hepburn for Japanese 'majiwaru', Pinyin for Chinese). Specify system if non-obvious in notes. Optional.",
  "writing_system_note": "A brief note about the writing system if noteworthy (e.g., 'Kanji+Okurigana', 'Katakana only', 'Hanja with Hangul reading'). Optional.",
  "furigana_details": null /* Placeholder. See detailed furigana instructions below. */
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

- For Japanese entries containing Kanji:
  - Your primary goal for 'furigana_details' is to enable per-character ruby text display ONLY FOR KANJI CHARACTERS.
  - If 'kanji_form' is provided and contains Kanji characters, AND a corresponding 'kana_form' (full Hiragana reading of 'kanji_form') is also provided:
    - YOU MUST generate 'furigana_details' EXCLUSIVELY for the Kanji characters found within 'kanji_form'.
    - This involves identifying each Kanji character in 'kanji_form' and determining its Hiragana reading by aligning it with the 'kana_form'.
    - Populate 'furigana_details' as an array of objects. Each object MUST represent a SINGLE KANJI CHARACTER from 'kanji_form'.
      - 'char': The single Kanji character from 'kanji_form'.
      - 'reading': The corresponding Hiragana reading for that single Kanji character, inferred by aligning 'kanji_form' with 'kana_form'.
    - DO NOT include non-Kanji characters (like Hiragana or Katakana that are part of 'kanji_form', e.g., Okurigana) in the 'furigana_details' array. These will be rendered as plain text by the application.
    - The sequence of objects in 'furigana_details' must correspond to the sequence of KANJI CHARACTERS as they appear in 'kanji_form'.
    - Example 1: 'kanji_form': "食べ物", 'kana_form': "たべもの" -> Expected 'furigana_details': '[{"char": "食", "reading": "た"}, {"char": "物", "reading": "もの"}]' (Okurigana 'べ' is omitted)
    - Example 2: 'kanji_form': "日本語", 'kana_form': "にほんご" -> Expected 'furigana_details': '[{"char": "日", "reading": "に"}, {"char": "本", "reading": "ほん"}, {"char": "語", "reading": "ご"}]'
    - Example 3: 'kanji_form': "申込", 'kana_form': "もうしこみ" -> Expected 'furigana_details': '[{"char": "申", "reading": "もうし"}, {"char": "込", "reading": "こみ"}]'
    - Example 4: 'kanji_form': "静か", 'kana_form': "しずか" -> Expected 'furigana_details': '[{"char": "静", "reading": "しず"}]' (Okurigana 'か' is omitted)
    - Example 5: 'kanji_form': "歩いて", 'kana_form': "あるいて" -> Expected 'furigana_details': '[{"char": "歩", "reading": "ある"}]' (Okurigana 'いて' is omitted)
  - If 'kanji_form' contains Kanji but 'kana_form' is missing, attempt to provide 'furigana_details' (only for Kanji) based on common readings.
  - If 'kanji_form' is null or empty, but 'target_text' contains Japanese Kanji AND 'kana_form' is available for 'target_text': Apply the same generation logic using 'target_text' (its Kanji parts) and 'kana_form', providing details only for Kanji.
  - If 'kanji_form' (or 'target_text' if applicable) contains NO Kanji characters, or if you are genuinely unable to determine readings for the present Kanji, 'furigana_details' MUST BE null.
  - The main 'kana_form' field should always represent the complete Hiragana reading of the word/phrase.

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
                        log.warn(`Rate limit hit (status ${response.status}). Retrying attempt ${attempt}/${MAX_RETRIES} after ${delayMs}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                        continue; 
                    } else {
                        log.error(`Max retries (${MAX_RETRIES}) reached for rate limit error.`);
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
                log.warn(`Network or potentially transient error. Retrying attempt ${attempt}/${MAX_RETRIES} after ${currentExponentialBackoffMs}ms...`);
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