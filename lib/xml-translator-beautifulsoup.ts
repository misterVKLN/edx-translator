import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

// ТОЧНАЯ КОПИЯ логики Streamlit с BeautifulSoup-подобным подходом
export class BeautifulSoupXMLTranslator {
  private apiKey: string
  private model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  // ТОЧНАЯ КОПИЯ extract_text_and_attributes из Streamlit
  private extractTextAndAttributes(content: string, tags: string[]): Record<string, string> {
    const translations: Record<string, string> = {}

    // Создаем регулярные выражения для каждого тега
    for (const tag of tags) {
      // Извлекаем текстовые узлы для каждого тега
      const textNodeRegex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "g")
      let match
      while ((match = textNodeRegex.exec(content)) !== null) {
        const text = match[1].trim()
        if (text) {
          translations[text] = ""
        }
      }

      // Извлекаем самозакрывающиеся теги с текстом
      const selfClosingRegex = new RegExp(`<${tag}[^>]*>([^<]*?)(?=<|$)`, "g")
      let selfMatch
      while ((selfMatch = selfClosingRegex.exec(content)) !== null) {
        const text = selfMatch[1].trim()
        if (text && !text.includes("<")) {
          translations[text] = ""
        }
      }
    }

    // Извлекаем ВСЕ атрибуты display_name и markdown (как в Streamlit)
    const allAttributeRegex = /(display_name|markdown)="([^"]+)"/g
    let attrMatch
    while ((attrMatch = allAttributeRegex.exec(content)) !== null) {
      const value = attrMatch[2].trim()
      if (value) {
        translations[value] = ""
      }
    }

    // ДОБАВЛЯЕМ другие важные атрибуты, которые могли пропустить
    const otherAttrs = ["short_description", "description", "title", "label", "alt"]
    for (const attr of otherAttrs) {
      const attrRegex = new RegExp(`${attr}="([^"]+)"`, "g")
      let match
      while ((match = attrRegex.exec(content)) !== null) {
        const value = match[1].trim()
        if (value && value.length > 2) {
          translations[value] = ""
        }
      }
    }

    console.log(`📝 Extracted ${Object.keys(translations).length} texts for translation:`, Object.keys(translations))
    return translations
  }

  // ТОЧНАЯ КОПИЯ replace_text_and_attributes из Streamlit
  private replaceTextAndAttributes(content: string, tags: string[], translationMap: Record<string, string>): string {
    let result = content

    // Заменяем текстовые узлы для каждого тега
    for (const tag of tags) {
      for (const [original, translated] of Object.entries(translationMap)) {
        if (translated && translated !== original) {
          // Экранируем специальные символы
          const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

          // Заменяем в текстовых узлах
          const textRegex = new RegExp(`(<${tag}[^>]*>)${escapedOriginal}(</${tag}>)`, "g")
          result = result.replace(textRegex, `$1${translated}$2`)

          // Заменяем в самозакрывающихся тегах
          const selfClosingRegex = new RegExp(`(<${tag}[^>]*>)${escapedOriginal}(?=<|$)`, "g")
          result = result.replace(selfClosingRegex, `$1${translated}`)
        }
      }
    }

    // Заменяем ВСЕ атрибуты
    const allAttrs = ["display_name", "markdown", "short_description", "description", "title", "label", "alt"]
    for (const attr of allAttrs) {
      for (const [original, translated] of Object.entries(translationMap)) {
        if (translated && translated !== original) {
          const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
          const attrRegex = new RegExp(`(${attr}=")${escapedOriginal}(")`, "g")
          result = result.replace(attrRegex, `$1${translated}$2`)
        }
      }
    }

    return result
  }

  // ТОЧНАЯ КОПИЯ find_and_translate_xml из Streamlit
  async translateXMLContent(
    content: string,
    targetLanguage: string,
  ): Promise<{
    translatedContent: string
    translationsCount: number
  }> {
    // ТОЧНО ТЕ ЖЕ ТЕГИ, что в Streamlit
    const tags = ["problem", "label", "choice", "sequential", "vertical", "chapter", "html", "course"]

    // 1. Извлекаем все тексты для перевода (как в Streamlit)
    const translationMap = this.extractTextAndAttributes(content, tags)
    const textsToTranslate = Object.keys(translationMap).filter((text) => text.length > 0)

    if (textsToTranslate.length === 0) {
      console.log("📝 No texts found for translation in XML")
      return { translatedContent: content, translationsCount: 0 }
    }

    console.log(`📝 Found ${textsToTranslate.length} texts to translate in XML`)

    // 2. Переводим каждый текст отдельно (как в Streamlit)
    let translationsCount = 0
    const openai = createOpenAI({ apiKey: this.apiKey })

    for (const text of textsToTranslate) {
      try {
        console.log(`🔄 Translating: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`)
        const translatedText = await this.translateSingleText(text, targetLanguage, openai)
        if (translatedText && translatedText !== text) {
          translationMap[text] = translatedText
          translationsCount++
          console.log(
            `✅ Translated to: "${translatedText.substring(0, 50)}${translatedText.length > 50 ? "..." : ""}"`,
          )
        } else {
          console.log(`⚠️ No translation for: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`)
        }
      } catch (error) {
        console.error(`❌ Failed to translate: "${text}"`, error)
        translationMap[text] = text // Оставляем оригинал при ошибке
      }
    }

    // 3. Заменяем переведенные тексты обратно (как в Streamlit)
    const translatedContent = this.replaceTextAndAttributes(content, tags, translationMap)

    console.log(`🎉 XML translation completed: ${translationsCount} translations made`)
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
