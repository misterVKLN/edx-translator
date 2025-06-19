import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

// ИСПРАВЛЕННАЯ логика перевода XML по образцу Streamlit версии
export class FixedXMLTranslator {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  // Извлечение текстов и атрибутов для перевода (как в Streamlit)
  private extractTextAndAttributes(content: string): Record<string, string> {
    const translations: Record<string, string> = {}

    // Извлекаем только безопасные атрибуты (как в Streamlit)
    const safeAttributes = ["display_name", "markdown"]

    for (const attr of safeAttributes) {
      const attributeRegex = new RegExp(`${attr}="([^"]+)"`, "g")
      let match
      while ((match = attributeRegex.exec(content)) !== null) {
        const value = match[1].trim()
        if (value && value.length > 2) {
          translations[value] = ""
        }
      }
    }

    // Извлекаем текстовые узлы (только значимые)
    const textNodeRegex = />([^<]+)</g
    let match
    while ((match = textNodeRegex.exec(content)) !== null) {
      const text = match[1].trim()
      if (
        text &&
        text.length > 2 &&
        !text.includes("=") &&
        !text.match(/^[a-f0-9]{32}$/) && // не MD5
        !text.match(/^[a-zA-Z0-9_-]+$/) && // не идентификатор
        !text.includes("://") && // не URL
        !text.startsWith("/") && // не путь
        !text.match(/^\d+(\.\d+)?$/) && // не число
        !text.match(/^(true|false)$/i) // не boolean
      ) {
        translations[text] = ""
      }
    }

    return translations
  }

  // Замена переведенных текстов обратно в контент (как в Streamlit)
  private replaceTextAndAttributes(content: string, translationMap: Record<string, string>): string {
    let result = content

    // Заменяем все переведенные тексты
    for (const [original, translated] of Object.entries(translationMap)) {
      if (translated && translated !== original) {
        // Экранируем специальные символы для регулярного выражения
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

        // Заменяем в атрибутах
        const attrRegex = new RegExp(`(display_name|markdown)="${escapedOriginal}"`, "g")
        result = result.replace(attrRegex, (match, attrName) => `${attrName}="${translated}"`)

        // Заменяем в текстовых узлах
        const textRegex = new RegExp(`>${escapedOriginal}<`, "g")
        result = result.replace(textRegex, `>${translated}<`)
      }
    }

    return result
  }

  // Основная функция перевода XML (как в Streamlit)
  async translateXMLContent(
    content: string,
    targetLanguage: string,
  ): Promise<{
    translatedContent: string
    translationsCount: number
  }> {
    // 1. Извлекаем все тексты для перевода
    const translationMap = this.extractTextAndAttributes(content)
    const textsToTranslate = Object.keys(translationMap)

    if (textsToTranslate.length === 0) {
      return { translatedContent: content, translationsCount: 0 }
    }

    console.log(`📝 Found ${textsToTranslate.length} texts to translate in XML`)

    // 2. Переводим каждый текст отдельно
    let translationsCount = 0
    const openai = createOpenAI({ apiKey: this.apiKey })

    for (const text of textsToTranslate) {
      try {
        const translatedText = await this.translateSingleText(text, targetLanguage, openai)
        if (translatedText && translatedText !== text) {
          translationMap[text] = translatedText
          translationsCount++
        }
      } catch (error) {
        console.error(`❌ Failed to translate: "${text}"`, error)
        translationMap[text] = text // Оставляем оригинал при ошибке
      }
    }

    // 3. Заменяем переведенные тексты обратно в оригинальную структуру
    const translatedContent = this.replaceTextAndAttributes(content, translationMap)

    return { translatedContent, translationsCount }
  }

  private async translateSingleText(text: string, targetLanguage: string, openai: any): Promise<string> {
    const prompt = `
You MUST translate the content strictly into ${targetLanguage}, and ONLY ${targetLanguage}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags.
If you are unsure, return the original content as-is.
You are a TRANSLATION TOOL ONLY. Do not act as an assistant or provide commentary.
NEVER add phrases like "Here is the translation" or "The translated content is".
NEVER mix languages in your response.
RETURN ONLY THE TRANSLATED CONTENT, NOTHING ELSE.

Translate this text into ${targetLanguage}:
${text}
`

    const { text: translatedText } = await generateText({
      model: openai(this.model),
      prompt,
      temperature: 0.1,
      maxTokens: 1000,
    })

    // Валидация и очистка ответа
    return this.validateAndCleanResponse(translatedText, text, targetLanguage)
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
}
