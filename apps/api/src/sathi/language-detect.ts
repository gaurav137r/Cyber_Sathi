export type DetectedLanguage = "en" | "hi" | "hinglish"

const DEVANAGARI_RANGE = /[\u0900-\u097F]/

const HINGLISH_COMMON_WORDS = new Set([
  "hai",
  "hain",
  "hoon",
  "hun",
  "tha",
  "thi",
  "the",
  "kar",
  "karna",
  "karo",
  "kiya",
  "ki",
  "ke",
  "ka",
  "ko",
  "se",
  "mein",
  "par",
  "pe",
  "aur",
  "ya",
  "lekin",
  "magar",
  "to",
  "toh",
  "ab",
  "abhi",
  "phir",
  "bhi",
  "nahi",
  "nahin",
  "nhi",
  "ni",
  "mat",
  "matlab",
  "samajh",
  "samjh",
  "pata",
  "pataa",
  "jaanta",
  "jaanti",
  "jaante",
  "chahiye",
  "chahta",
  "chahti",
  "chahte",
  "kya",
  "kyun",
  "kyu",
  "kaise",
  "kaisa",
  "kaisi",
  "kitna",
  "kitni",
  "kitne",
  "kahan",
  "kab",
  "kaun",
  "kon",
  "jo",
  "wo",
  "wohi",
  "yeh",
  "ye",
  "woh",
  "main",
  "mein",
  "hum",
  "ham",
  "aap",
  "tum",
  "tu",
  "tera",
  "teri",
  "tere",
  "mera",
  "meri",
  "mere",
  "apna",
  "apni",
  "apne",
  "uska",
  "uski",
  "uske",
  "iska",
  "iski",
  "iske",
  "hua",
  "hui",
  "hue",
  "gaya",
  "gayi",
  "gaye",
  "aaya",
  "aayi",
  "aaye",
  "kya",
  "haan",
  "han",
  "ji",
  "theek",
  "thik",
  "achha",
  "accha",
  "ok",
  "okay",
  "chalo",
  "chaliye",
  "chalte",
  "ruk",
  "ruko",
  "suno",
  "suni",
  "bolo",
  "boliye",
  "batao",
  "bataiye",
  "pucho",
  "puchiye",
  "jawab",
  "sawal",
  "galat",
  "sahi",
  "bilkul",
  "zaroor",
  "zarur",
  "shayad",
  "shayed",
  "pakka",
  "sure",
  "problem",
  "issue",
  "help",
  "madad",
  "thank",
  "thanks",
  "dhanyawad",
  "shukriya",
  "sorry",
  "maaf",
  "mafi",
])

function countHinglishWords(text: string): number {
  const words = text.toLowerCase().split(/[\s\.,!?;:]+/)
  let count = 0
  for (const word of words) {
    if (HINGLISH_COMMON_WORDS.has(word)) count++
  }
  return count
}

export function detectLanguage(text: string): DetectedLanguage {
  const trimmed = text.trim()
  if (!trimmed) return "en"

  // Check for Devanagari script (Hindi)
  if (DEVANAGARI_RANGE.test(trimmed)) {
    return "hi"
  }

  // Check for Hinglish (Roman script with Hindi words)
  const hinglishCount = countHinglishWords(trimmed)
  const totalWords = trimmed.split(/\s+/).length
  const hinglishRatio = totalWords > 0 ? hinglishCount / totalWords : 0

  // If more than 20% of words are common Hinglish words, treat as Hinglish
  if (hinglishRatio > 0.2 || hinglishCount >= 2) {
    return "hinglish"
  }

  // Default to English
  return "en"
}

export function mapToModelLanguage(detected: DetectedLanguage): string {
  switch (detected) {
    case "hi":
      return "hi"
    case "hinglish":
      return "hinglish"
    case "en":
    default:
      return "en"
  }
}