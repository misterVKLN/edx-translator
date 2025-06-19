import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { OllamaTranslator } from "./ollama-translator"

// МАКСИМАЛЬНО ПОЛНЫЙ XML транслятор для OpenEdX
export class EnhancedXMLTranslator {
  private apiKey?: string
  private model: string
  private provider: "openai" | "gemini" | "ollama"
  private ollamaUrl?: string
  private ollamaTranslator?: OllamaTranslator

  constructor(config: {
    provider: "openai" | "gemini" | "ollama"
    apiKey?: string
    model: string
    ollamaUrl?: string
  }) {
    this.provider = config.provider
    this.apiKey = config.apiKey
    this.model = config.model
    this.ollamaUrl = config.ollamaUrl

    if (this.provider === "ollama" && this.ollamaUrl) {
      this.ollamaTranslator = new OllamaTranslator(this.ollamaUrl, this.model)
    }
  }

  // АБСОЛЮТНО ВСЁ извлекаем для перевода
  private extractTranslatableTexts(content: string): Record<string, string> {
    const translations: Record<string, string> = {}

    // 1. ВСЕ ВОЗМОЖНЫЕ АТРИБУТЫ
    const allAttributes = [
      "display_name",
      "markdown",
      "short_description",
      "description",
      "title",
      "label",
      "alt",
      "subtitle",
      "overview",
      "question_text",
      "explanation",
      "feedback",
      "hint",
      "correct",
      "incorrect",
      "start",
      "finish",
      "targetImgDescription",
      "imageDescription",
    ]

    for (const attr of allAttributes) {
      this.extractAttributeTexts(content, attr, translations)
    }

    // 2. ВСЕ ТЕКСТОВЫЕ УЗЛЫ
    const allTextTags = [
      "label",
      "description",
      "p",
      "choice",
      "option",
      "hint",
      "correcthint",
      "optionhint",
      "explanation",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "span",
      "strong",
      "em",
      "b",
      "i",
      "div",
      "li",
      "td",
      "th",
      "title",
      "header",
      "footer",
      "section",
    ]

    for (const tag of allTextTags) {
      this.extractTagTexts(content, tag, translations)
    }

    // 3. DRAG-AND-DROP JSON ДАННЫЕ
    this.extractDragDropData(content, translations)

    // 4. HTML ENTITIES И MARKDOWN
    this.extractEncodedTexts(content, translations)

    // 5. ДОПОЛНИТЕЛЬНЫЕ ПАТТЕРНЫ
    this.extractAdditionalPatterns(content, translations)

    console.log(`📝 Extracted ${Object.keys(translations).length} translatable texts`)
    return translations
  }

  // Извлечение атрибутов
  private extractAttributeTexts(content: string, attr: string, translations: Record<string, string>) {
    const attrRegex = new RegExp(`${attr}="([^"]+)"`, "g")
    let match
    while ((match = attrRegex.exec(content)) !== null) {
      const value = this.decodeHtmlEntities(match[1].trim())
      if (value && this.isTranslatableText(value)) {
        translations[value] = ""
      }
    }
  }

  // Извлечение текста из тегов
  private extractTagTexts(content: string, tag: string, translations: Record<string, string>) {
    // Обычные теги
    const tagRegex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, "gi")
    let match
    while ((match = tagRegex.exec(content)) !== null) {
      const text = this.decodeHtmlEntities(match[1].trim())
      if (text && this.isTranslatableText(text)) {
        translations[text] = ""
      }
    }

    // Теги с вложенным HTML
    const complexTagRegex = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "gis")
    let complexMatch
    while ((complexMatch = complexTagRegex.exec(content)) !== null) {
      const innerContent = complexMatch[1]
      // Извлекаем текст из вложенного HTML
      this.extractTextFromHTML(innerContent, translations)
    }
  }

  // Извлечение текста из HTML
  private extractTextFromHTML(html: string, translations: Record<string, string>) {
    // Убираем теги и извлекаем чистый текст
    const textRegex = />([^<]+)</g
    let match
    while ((match = textRegex.exec(html)) !== null) {
      const text = this.decodeHtmlEntities(match[1].trim())
      if (text && this.isTranslatableText(text)) {
        translations[text] = ""
      }
    }
  }

  // Извлечение данных Drag-and-Drop
  private extractDragDropData(content: string, translations: Record<string, string>) {
    const dataRegex = /data="([^"]+)"/g
    let match
    while ((match = dataRegex.exec(content)) !== null) {
      try {
        const decodedData = this.decodeHtmlEntities(match[1])
        const jsonData = JSON.parse(decodedData)
        this.extractFromDragDropJson(jsonData, translations)
      } catch (error) {
        console.warn("Could not parse drag-drop JSON:", error)
      }
    }
  }

  // Извлечение из JSON структуры drag-and-drop
  private extractFromDragDropJson(obj: any, translations: Record<string, string>) {
    if (typeof obj === "string") {
      // Убираем HTML теги из строк
      const cleanText = obj.replace(/<[^>]*>/g, "").trim()
      if (cleanText && this.isTranslatableText(cleanText)) {
        translations[cleanText] = ""
      }
      // Также сохраняем оригинальную строку с HTML
      if (obj !== cleanText && this.isTranslatableText(obj)) {
        translations[obj] = ""
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => this.extractFromDragDropJson(item, translations))
    } else if (typeof obj === "object" && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        this.extractFromDragDropJson(value, translations)
      }
    }
  }

  // Извлечение закодированных HTML текстов
  private extractEncodedTexts(content: string, translations: Record<string, string>) {
    // Markdown атрибуты с закодированным содержимым
    const markdownRegex = /markdown="([^"]+)"/g
    let match
    while ((match = markdownRegex.exec(content)) !== null) {
      const decoded = this.decodeHtmlEntities(match[1])

      // Различные паттерны в markdown
      const patterns = [
        />>([^|<]+)(?:\|\||<<)/g, // >>текст|| или >>текст<<
        /\|\|([^<]+)<<|$/g, // ||текст<<
        /=\s*([^{=\n]+)(?:\{|$)/g, // = ответ
        /<[^>]+>([^<]+)<\/[^>]+>/g, // HTML теги
      ]

      for (const pattern of patterns) {
        let textMatch
        while ((textMatch = pattern.exec(decoded)) !== null) {
          const text = textMatch[1].trim()
          if (text && this.isTranslatableText(text)) {
            translations[text] = ""
          }
        }
      }
    }
  }

  // Дополнительные паттерны
  private extractAdditionalPatterns(content: string, translations: Record<string, string>) {
    // Текст в кавычках
    const quotedRegex = /"([^"]{3,})"/g
    let match
    while ((match = quotedRegex.exec(content)) !== null) {
      const text = match[1].trim()
      if (this.isTranslatableText(text)) {
        translations[text] = ""
      }
    }

    // Текст после двоеточия
    const colonRegex = /:\s*"?([^"\n,}]{3,})"?/g
    let colonMatch
    while ((colonMatch = colonRegex.exec(content)) !== null) {
      const text = colonMatch[1].trim()
      if (this.isTranslatableText(text)) {
        translations[text] = ""
      }
    }
  }

  // Декодирование HTML entities
  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&#10;/g, "\n")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
  }

  // Кодирование обратно в HTML entities
  private encodeHtmlEntities(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "&#10;")
      .replace(/'/g, "&#39;")
  }

  // РАСШИРЕННАЯ проверка переводимости
  private isTranslatableText(text: string): boolean {
    if (!text || text.length < 2) return false

    // Исключаем технические значения
    if (text.match(/^[a-f0-9]{32}$/)) return false // MD5
    if (text.match(/^[a-zA-Z0-9_-]+$/)) return false // простые идентификаторы
    if (text.includes("://")) return false // URLs
    if (text.startsWith("/static/")) return false // пути к файлам
    if (text.match(/^\d+(\.\d+)?$/)) return false // только числа
    if (text.match(/^(true|false)$/i)) return false // boolean
    if (text.match(/^[=[\](){}]+$/)) return false // символы разметки
    if (text.includes("rgba(") || text.includes("rgb(")) return false // CSS
    if (text.match(/^\d+px$|^\d+%$/)) return false // размеры CSS
    if (text.match(/^[A-Z_]+$/)) return false // константы
    if (text.match(/^block-v1:/)) return false // OpenEdX блоки

    // Проверяем наличие букв (не только цифры и символы)
    if (!text.match(/[a-zA-Zа-яА-ЯёЁ\u4e00-\u9fff\u0600-\u06ff]/)) return false

    return true
  }

  // МАКСИМАЛЬНО ПОЛНАЯ замена
  private replaceTranslatedTexts(content: string, translationMap: Record<string, string>): string {
    let result = content

    for (const [original, translated] of Object.entries(translationMap)) {
      if (translated && translated !== original) {
        const escapedOriginal = this.escapeRegex(original)
        const encodedOriginal = this.escapeRegex(this.encodeHtmlEntities(original))

        // 1. Замена в атрибутах (точная)
        const attrPattern = `(="[^"]*?)${escapedOriginal}([^"]*?")`
        result = result.replace(new RegExp(attrPattern, "g"), `$1${translated}$2`)

        // 2. Замена в закодированных атрибутах
        const encodedAttrPattern = `(="[^"]*?)${encodedOriginal}([^"]*?")`
        result = result.replace(new RegExp(encodedAttrPattern, "g"), `$1${this.encodeHtmlEntities(translated)}$2`)

        // 3. Замена в текстовых узлах
        const textPattern = `(>\\s*)${escapedOriginal}(\\s*<)`
        result = result.replace(new RegExp(textPattern, "g"), `$1${translated}$2`)

        // 4. Замена в JSON данных
        result = this.replaceDragDropJson(result, original, translated)

        // 5. Замена в кавычках
        const quotedPattern = `("${escapedOriginal}")`
        result = result.replace(new RegExp(quotedPattern, "g"), `"${translated}"`)
      }
    }

    return result
  }

  // Замена в JSON данных drag-and-drop
  private replaceDragDropJson(content: string, original: string, translated: string): string {
    const dataRegex = /(data=")([^"]+)(")/g

    return content.replace(dataRegex, (match, prefix, data, suffix) => {
      try {
        const decodedData = this.decodeHtmlEntities(data)
        const jsonData = JSON.parse(decodedData)
        const updatedJson = this.replaceInJsonObject(jsonData, original, translated)
        const encodedJson = this.encodeHtmlEntities(JSON.stringify(updatedJson))
        return prefix + encodedJson + suffix
      } catch (error) {
        console.warn("Could not update drag-drop JSON:", error)
        return match
      }
    })
  }

  // Рекурсивная замена в JSON объекте
  private replaceInJsonObject(obj: any, original: string, translated: string): any {
    if (typeof obj === "string") {
      // Замена в строках с HTML тегами
      if (obj.includes(original)) {
        return obj.replace(new RegExp(this.escapeRegex(original), "g"), translated)
      }
      return obj
    } else if (Array.isArray(obj)) {
      return obj.map((item) => this.replaceInJsonObject(item, original, translated))
    } else if (typeof obj === "object" && obj !== null) {
      const result: any = {}
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.replaceInJsonObject(value, original, translated)
      }
      return result
    }
    return obj
  }

  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  async translateXMLContent(
    content: string,
    targetLanguage: string,
  ): Promise<{
    translatedContent: string
    translationsCount: number
  }> {
    const translationMap = this.extractTranslatableTexts(content)
    const textsToTranslate = Object.keys(translationMap).filter((text) => text.length > 0)

    if (textsToTranslate.length === 0) {
      return { translatedContent: content, translationsCount: 0 }
    }

    console.log(`📝 Found ${textsToTranslate.length} texts to translate`)
    console.log("Sample texts:", textsToTranslate.slice(0, 5))

    let translationsCount = 0

    for (const text of textsToTranslate) {
      try {
        console.log(`🔄 Translating: "${text.substring(0, 80)}${text.length > 80 ? "..." : ""}"`)

        let translatedText: string
        if (this.provider === "ollama" && this.ollamaTranslator) {
          translatedText = await this.translateWithOllama(text, targetLanguage)
        } else if (this.provider === "openai" && this.apiKey) {
          translatedText = await this.translateWithOpenAI(text, targetLanguage)
        } else {
          throw new Error("Invalid configuration")
        }

        if (translatedText && translatedText !== text) {
          translationMap[text] = translatedText
          translationsCount++
          console.log(
            `✅ Translated to: "${translatedText.substring(0, 80)}${translatedText.length > 80 ? "..." : ""}"`,
          )
        }
      } catch (error) {
        console.error(`❌ Failed to translate: "${text}"`, error)
        translationMap[text] = text
      }
    }

    const translatedContent = this.replaceTranslatedTexts(content, translationMap)

    console.log(`🎉 Translation completed: ${translationsCount} translations made`)
    return { translatedContent, translationsCount }
  }

  private async translateWithOllama(text: string, targetLanguage: string): Promise<string> {
    if (!this.ollamaTranslator) throw new Error("Ollama translator not initialized")

    const prompt = `TRANSLATE ONLY. NO EXPLANATIONS.

Text: "${text}"
Target: ${targetLanguage}

Rules:
- Return ONLY the translated text
- NO explanations or commentary
- Preserve HTML tags and formatting exactly
- If unsure, return original

Translation:`

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.1,
            top_p: 0.9,
            stop: ["\n", "Note:", "Translation:", "Here", "Explanation:", "Rules:"],
          },
        }),
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`)
      }

      const data = await response.json()
      return this.cleanOllamaResponse(data.response, text)
    } catch (error) {
      console.error("Ollama translation error:", error)
      return text
    }
  }

  private cleanOllamaResponse(response: string, originalText: string): string {
    if (!response) return originalText

    let cleaned = response.trim()

    // Убираем все возможные фразы-мусор
    const unwantedPhrases = [
      "Here is the translation",
      "Translation:",
      "The translated text is",
      "Here's the translated",
      "Translated version:",
      "Note:",
      "Here",
      "Explanation:",
      "Rules:",
      "Вот перевод",
      "Переведенный текст",
      "Перевод:",
    ]

    for (const phrase of unwantedPhrases) {
      const regex = new RegExp(`^${phrase}[:\\s]*`, "i")
      cleaned = cleaned.replace(regex, "")
    }

    // Убираем кавычки если они обрамляют весь текст
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1)
    }

    // Берем только первую строку если нет HTML
    if (!cleaned.includes("<") && !cleaned.includes(">")) {
      cleaned = cleaned.split("\n")[0].trim()
    }

    return cleaned || originalText
  }

  private async translateWithOpenAI(text: string, targetLanguage: string): Promise<string> {
    if (!this.apiKey) throw new Error("OpenAI API key not provided")

    const openai = createOpenAI({ apiKey: this.apiKey })

    const prompt = `Translate this text to ${targetLanguage}. Preserve all HTML tags and formatting exactly. Return ONLY the translation:

${text}`

    const { text: translatedText } = await generateText({
      model: openai(this.model),
      prompt,
      temperature: 0.1,
      maxTokens: 2000,
    })

    return translatedText?.trim() || text
  }
}
