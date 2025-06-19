import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const apiKey = formData.get("apiKey") as string
    const model = formData.get("model") as string
    const targetLanguage = formData.get("targetLanguage") as string

    if (!file || !apiKey || !targetLanguage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create directories
    const originalDir = path.join(process.cwd(), "uploads", "original")
    const translatedDir = path.join(process.cwd(), "uploads", "translated")
    await fs.mkdir(originalDir, { recursive: true })
    await fs.mkdir(translatedDir, { recursive: true })

    // Save original file
    const content = await file.text()
    const originalPath = path.join(originalDir, file.name)
    await fs.writeFile(originalPath, content, "utf-8")

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const startTime = Date.now()
          const notebook = JSON.parse(content)
          const markdownCells = notebook.cells.filter((cell: any) => cell.cell_type === "markdown")
          const totalCells = markdownCells.length

          // ИСПРАВЛЕНО: правильный синтаксис для AI SDK с API ключом
          const openai = createOpenAI({
            apiKey: apiKey,
          })

          for (let i = 0; i < markdownCells.length; i++) {
            const cell = markdownCells[i]

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  progress: {
                    current: i,
                    total: totalCells,
                    type: "ipynb",
                    message: `Translating cell ${i + 1}/${totalCells}`,
                  },
                })}\n\n`,
              ),
            )

            const sourceText = Array.isArray(cell.source) ? cell.source.join("") : cell.source

            if (sourceText.trim()) {
              try {
                const { text: translatedText } = await generateText({
                  model: openai(model),
                  prompt: `
You MUST translate the content strictly into ${targetLanguage}, and ONLY ${targetLanguage}.
You MUST NOT add any explanations, disclaimers, general knowledge, or other languages.
You MUST preserve the original formatting, structure, and tags (including HTML/XML or markdown).
If you are unsure, return the original content as-is.
RETURN ONLY THE TRANSLATED CONTENT, NOTHING ELSE.

Translate markdown cells in the following Jupyter notebook into ${targetLanguage}.
Keep all structure, formatting, and code blocks.

Original content:
${sourceText}`,
                  temperature: 0.1,
                  maxTokens: 4000,
                })

                cell.source = translatedText || sourceText
                console.log(`✅ Translated notebook cell ${i + 1}/${totalCells}`)
              } catch (error) {
                console.error(`Error translating cell ${i + 1}:`, error)
                // Keep original content on error
              }
            }
          }

          // Save translated notebook
          const translatedFilename = `${targetLanguage}_${file.name}`
          const translatedPath = path.join(translatedDir, translatedFilename)
          await fs.writeFile(translatedPath, JSON.stringify(notebook, null, 2), "utf-8")

          const endTime = Date.now()
          const elapsed = ((endTime - startTime) / 1000).toFixed(3)

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "complete",
                elapsed: `${elapsed} seconds`,
                filename: translatedFilename,
              })}\n\n`,
            ),
          )

          controller.close()
        } catch (error) {
          console.error("Notebook translation error:", error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: error instanceof Error ? error.message : "Unknown error",
              })}\n\n`,
            ),
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error) {
    console.error("Notebook translation error:", error)
    return NextResponse.json({ error: "Translation failed" }, { status: 500 })
  }
}
