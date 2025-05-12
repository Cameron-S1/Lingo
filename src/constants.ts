// Defines shared constants for the application

// Standardized list of grammatical categories
// Note: 'Needs Review' is typically for system use, not user selection in forms.
export const GRAMMAR_CATEGORIES = [
  'Noun',
  'Verb',
  'Adjective',
  'Adverb',
  'Pronoun',
  'Determiner',
  'Preposition',
  'Postposition',
  'Particle',
  'Conjunction',
  'Numeral',
  'Interjection',
  'Prefix',
  'Suffix',
  'Counter',
  'Expression / Phrase',
  'Grammar Point / Rule',
  'Other',
  // 'Needs Review' // Usually excluded from user-selectable lists
] as const; // Use 'as const' for stricter typing

// Type derived from the constant array if needed elsewhere
export type GrammarCategory = typeof GRAMMAR_CATEGORIES[number];

// Potentially add other constants here later (e.g., default settings, API endpoints if not env-based)