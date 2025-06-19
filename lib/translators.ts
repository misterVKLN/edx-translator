import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { promises as fs } from "fs"

export class BaseTranslator {
  protected apiKey: string
  protected model: string

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  protected async translateText(
    inputText: string,
    fileType: "xml" | "html" | "ipynb",
    targetLanguage: string,
  ): Promise<string> {
    const commonRules = `
You MUST translate the content strictly into ${targetLanguage}, and ONLY ${targetLanguage}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags (including HTML/XML or markdown).
If you are unsure, return the original content as-is.
You are a TRANSLATION TOOL ONLY. Do not act as an assistant or provide commentary.
NEVER add phrases like "Here is the translation" or "The translated content is".
NEVER mix languages in your response.
RETURN ONLY THE TRANSLATED CONTENT, NOTHING ELSE.
`

    const prompts = {
      xml: `${commonRules}

Translate the following XML content. Only translate text nodes and attribute values (like display_name, markdown).
Do NOT modify tag names or structure. Do NOT return empty. Do NOT reformat. Only translate real visible text.
CRITICAL: Return ONLY the translated XML, no additional text or explanations.

Original XML content:
${inputText}`,

      html: `${commonRules}

Translate the following HTML content. Only translate visible text and attribute values (e.g. alt, title, display_name, markdown).
Keep all tags and structure 100% as-is. Do NOT merge blocks. Do NOT skip content. Do NOT add anything.
Return valid HTML with all structure and styles preserved.
CRITICAL: Return ONLY the translated HTML, no additional text or explanations.

Original HTML content:
${inputText}`,

      ipynb: `${commonRules}

Translate markdown cells in the following Jupyter notebook into ${targetLanguage}.
Keep all structure, formatting, and code blocks. Do NOT skip any cell. Do NOT return empty cells.
CRITICAL: Return ONLY the translated content, no additional text or explanations.

Original notebook content:
${inputText}`,
    }

    try {
      const { text } = await generateText({
        model: openai(this.apiKey)(this.model),
        prompt: prompts[fileType],
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

    if (targetLanguage.toLowerCase() === "ukrainian") {
      const englishWords = cleaned.match(/\b[a-zA-Z]+\b/g) || []
      const totalWords = cleaned.split(/\s+/).length
      const englishRatio = englishWords.length / totalWords

      if (englishRatio > 0.7 && totalWords > 10) {
        console.warn("[VALIDATION WARNING] Suspicious language mixing detected. Keeping original.")
        return originalText
      }
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
        console.warn("[VALIDATION WARNING] AI assistant response detected. Keeping original.")
        return originalText
      }
    }

    return cleaned
  }
}

export class XMLTranslator extends BaseTranslator {
  async translateFile(inputPath: string, outputPath: string, targetLanguage: string) {
    const content = await fs.readFile(inputPath, "utf-8")
    const translatedContent = await this.translateXMLContent(content, targetLanguage)
    await fs.writeFile(outputPath, translatedContent, "utf-8")
  }

  private async translateXMLContent(content: string, targetLanguage: string): Promise<string> {
    // Simple regex-based approach instead of JSDOM
    const textNodeRegex = />([^<]+)</g
    const attributeRegex = /(display_name|markdown)="([^"]+)"/g

    let translatedContent = content

    // Translate text nodes
    const textMatches = content.match(textNodeRegex)
    if (textMatches) {
      for (const match of textMatches) {
        const text = match.slice(1, -1).trim()
        if (text && text.length > 0) {
          const translatedText = await this.translateText(text, "xml", targetLanguage)
          translatedContent = translatedContent.replace(match, `>${translatedText}<`)
        }
      }
    }

    // Translate attributes
    const attrMatches = content.match(attributeRegex)
    if (attrMatches) {
      for (const match of attrMatches) {
        const [, attrName, attrValue] = match.match(/(display_name|markdown)="([^"]+)"/) || []
        if (attrValue && attrValue.trim()) {
          const translatedValue = await this.translateText(attrValue, "xml", targetLanguage)
          translatedContent = translatedContent.replace(match, `${attrName}="${translatedValue}"`)
        }
      }
    }

    return translatedContent
  }
}

export class HTMLTranslator extends BaseTranslator {
  async translateFile(inputPath: string, outputPath: string, targetLanguage: string) {
    const content = await fs.readFile(inputPath, "utf-8")
    const translatedContent = await this.translateHTMLContent(content, targetLanguage)
    await fs.writeFile(outputPath, translatedContent, "utf-8")
  }

  private async translateHTMLContent(content: string, targetLanguage: string): Promise<string> {
    // Simple approach - translate content between common HTML tags
    const tagRegex = /<(p|h[1-6]|li|td|th|div|span|strong|em|b|i)[^>]*>([^<]+)<\/\1>/gi
    let translatedContent = content

    const matches = content.match(tagRegex)
    if (matches) {
      for (const match of matches) {
        const textMatch = match.match(/>([^<]+)</)
        if (textMatch && textMatch[1].trim()) {
          const originalText = textMatch[1].trim()
          const translatedText = await this.translateText(originalText, "html", targetLanguage)
          translatedContent = translatedContent.replace(match, match.replace(originalText, translatedText))
        }
      }
    }

    return translatedContent
  }
}
