import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

interface NotebookCell {
  cell_type: string
  source: string | string[]
  [key: string]: any
}

interface Notebook {
  cells: NotebookCell[]
  [key: string]: any
}

type ProgressCallback = (progress: {
  current: number
  total: number
  type: "ipynb"
  message: string
}) => void

export class NotebookTranslator {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  async translateNotebook(content: string, targetLanguage: string, onProgress?: ProgressCallback): Promise<string> {
    const notebook: Notebook = JSON.parse(content)
    const markdownCells = notebook.cells.filter((cell) => cell.cell_type === "markdown")
    const totalCells = markdownCells.length

    for (let i = 0; i < markdownCells.length; i++) {
      const cell = markdownCells[i]

      if (onProgress) {
        onProgress({
          current: i,
          total: totalCells,
          type: "ipynb",
          message: `Translating cell ${i + 1}/${totalCells}`,
        })
      }

      try {
        const sourceText = Array.isArray(cell.source) ? cell.source.join("") : cell.source

        if (sourceText.trim()) {
          const translatedText = await this.translateText(sourceText, targetLanguage)
          cell.source = translatedText
        }
      } catch (error) {
        console.error(`Failed to translate cell ${i + 1}:`, error)
      }
    }

    if (onProgress) {
      onProgress({
        current: totalCells,
        total: totalCells,
        type: "ipynb",
        message: "Translation completed!",
      })
    }

    return JSON.stringify(notebook, null, 2)
  }

  private async translateText(inputText: string, targetLanguage: string): Promise<string> {
    const prompt = `
You MUST translate the content strictly into ${targetLanguage}, and ONLY ${targetLanguage}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags (including HTML/XML or markdown).
If you are unsure, return the original content as-is.
You are a TRANSLATION TOOL ONLY. Do not act as an assistant or provide commentary.
NEVER add phrases like "Here is the translation" or "The translated content is".
NEVER mix languages in your response.
RETURN ONLY THE TRANSLATED CONTENT, NOTHING ELSE.

Translate markdown cells in the following Jupyter notebook into ${targetLanguage}.
Keep all structure, formatting, and code blocks. Do NOT skip any cell. Do NOT return empty cells.
CRITICAL: Return ONLY the translated content, no additional text or explanations.

Original notebook content:
${inputText}
`

    try {
      const { text } = await generateText({
        model: openai(this.apiKey)(this.model),
        prompt,
        temperature: 0.1,
        maxTokens: 4000,
      })

      const cleanedText = this.validateAndCleanResponse(text, inputText, targetLanguage)

      if (!cleanedText || cleanedText.trim().length === 0) {
        console.warn("[TRANSLATION WARNING] Empty translation received. Keeping original.")
        return inputText
      }

      return cleanedText
    } catch (error) {
      console.error("[TRANSLATION ERROR]", error)
      return inputText
    }
  }

  private validateAndCleanResponse(response: string, originalText: string, targetLanguage: string): string {
    if (!response) return originalText

    const unwantedPhrases = [
      "Here is the translation",
      "The translated content is",
      "Here's the translated",
      "Translation:",
      "Translated version:",
      "Here is the",
      "The translation of",
      "Вот перевод",
      "Переведенный контент",
      "Перевод:",
    ]

    let cleaned = response.trim()

    for (const phrase of unwantedPhrases) {
      const regex = new RegExp(`^${phrase}[:\\s]*`, "i")
      cleaned = cleaned.replace(regex, "")
    }

    const assistantIndicators = [
      "I cannot",
      "I'm unable",
      "As an AI",
      "I apologize",
      "Sorry, but",
      "I can't",
      "Я не могу",
      "Извините",
      "К сожалению",
    ]

    for (const indicator of assistantIndicators) {
      if (cleaned.toLowerCase().includes(indicator.toLowerCase())) {
        console.warn("[VALIDATION WARNING] AI assistant response detected. Keeping original.")
        return originalText
      }
    }

    return cleaned
  }
}
