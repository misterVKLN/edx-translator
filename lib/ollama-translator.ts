// Ollama API интеграция
export class OllamaTranslator {
  private baseUrl: string
  private model: string

  constructor(baseUrl: string, model = "llama3") {
    this.baseUrl = baseUrl.replace(/\/$/, "") // убираем слэш в конце
    this.model = model
  }

  async translateText(inputText: string, targetLanguage: string): Promise<string> {
    const prompt = `
You MUST translate the content strictly into ${targetLanguage}, and ONLY ${targetLanguage}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags (including HTML/XML or markdown).
You MUST preserve all indentation, line breaks, and whitespace exactly as in the original.
If you are unsure, return the original content as-is.
You are a TRANSLATION TOOL ONLY. Do not act as an assistant or provide commentary.
NEVER add phrases like "Here is the translation" or "The translated content is".
NEVER mix languages in your response.
RETURN ONLY THE TRANSLATED CONTENT, NOTHING ELSE.

Translate this text into ${targetLanguage}:
${inputText}
`

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return this.validateAndCleanResponse(data.response, inputText, targetLanguage)
    } catch (error) {
      console.error("Ollama translation error:", error)
      return inputText // возвращаем оригинал при ошибке
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
      "Вот перевод",
      "Переведенный контент",
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
    ]

    for (const indicator of assistantIndicators) {
      if (cleaned.toLowerCase().includes(indicator.toLowerCase())) {
        return originalText
      }
    }

    return cleaned || originalText
  }

  // Проверка доступности Ollama
  async checkConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      return response.ok
    } catch {
      return false
    }
  }

  // Получение списка доступных моделей
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`)
      if (!response.ok) return []

      const data = await response.json()
      return data.models?.map((model: any) => model.name) || []
    } catch {
      return []
    }
  }
}
