import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import os from "os"
import { exec } from "child_process"
import { promisify } from "util"
import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { EnhancedXMLTranslator } from "@/lib/enhanced-xml-translator"

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const provider = formData.get("provider") as string
    const apiKey = formData.get("apiKey") as string
    const model = formData.get("model") as string
    const ollamaUrl = formData.get("ollamaUrl") as string
    const targetLanguage = formData.get("targetLanguage") as string

    console.log("🔧 Translation request:", { provider, model, targetLanguage, hasFile: !!file })

    if (!file || !targetLanguage || !provider || !model) {
      console.error("❌ Missing required fields:", {
        file: !!file,
        targetLanguage: !!targetLanguage,
        provider: !!provider,
        model: !!model,
      })
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Проверка конфигурации в зависимости от провайдера
    if (provider === "openai" && !apiKey) {
      console.error("❌ OpenAI API key missing")
      return NextResponse.json({ error: "OpenAI API key required" }, { status: 400 })
    }

    if (provider === "ollama" && !ollamaUrl) {
      console.error("❌ Ollama URL missing")
      return NextResponse.json({ error: "Ollama URL required" }, { status: 400 })
    }

    // Create directories
    const originalDir = path.join(process.cwd(), "uploads", "original")
    const translatedDir = path.join(process.cwd(), "uploads", "translated")
    await fs.mkdir(originalDir, { recursive: true })
    await fs.mkdir(translatedDir, { recursive: true })

    // Save original file
    const buffer = Buffer.from(await file.arrayBuffer())
    const originalPath = path.join(originalDir, file.name)
    await fs.writeFile(originalPath, buffer)

    // Create temp directory for processing
    const tempDir = path.join(os.tmpdir(), `translation-${Date.now()}`)
    await fs.mkdir(tempDir, { recursive: true })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const startTime = Date.now()

          // Send initial log
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "log",
                message: `🚀 Starting translation with ${provider.toUpperCase()}...`,
                level: "info",
              })}\n\n`,
            ),
          )

          // Extract archive
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "progress",
                progress: { current: 0, total: 100, type: "html", message: "Extracting archive..." },
              })}\n\n`,
            ),
          )

          const extractDir = path.join(tempDir, "extracted")
          await fs.mkdir(extractDir, { recursive: true })

          try {
            if (file.name.endsWith(".tar.gz") || file.name.endsWith(".tgz")) {
              await execAsync(`tar -xzf "${originalPath}" -C "${extractDir}"`)
            } else if (file.name.endsWith(".tar")) {
              await execAsync(`tar -xf "${originalPath}" -C "${extractDir}"`)
            }

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: "✅ Archive extracted successfully",
                  level: "success",
                })}\n\n`,
              ),
            )
          } catch (extractError) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: `❌ Archive extraction failed: ${extractError}`,
                  level: "error",
                })}\n\n`,
              ),
            )
            throw new Error(`Failed to extract archive: ${extractError}`)
          }

          // Find files to translate
          const { htmlFiles, xmlFiles } = await countFiles(extractDir)
          const totalFiles = htmlFiles.length + xmlFiles.length

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "log",
                message: `📁 Found ${htmlFiles.length} HTML and ${xmlFiles.length} XML files to translate`,
                level: "info",
              })}\n\n`,
            ),
          )

          if (totalFiles === 0) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: "⚠️ No translatable files found",
                  level: "warning",
                })}\n\n`,
              ),
            )
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "complete",
                  elapsed: "0 seconds",
                  filename: `${targetLanguage}_${file.name}`,
                })}\n\n`,
              ),
            )
            controller.close()
            return
          }

          let processedFiles = 0

          // ИСПРАВЛЕННАЯ инициализация транслятора
          let xmlTranslator: EnhancedXMLTranslator

          if (provider === "openai") {
            xmlTranslator = new EnhancedXMLTranslator({
              provider: "openai",
              apiKey: apiKey,
              model: model,
            })
          } else {
            xmlTranslator = new EnhancedXMLTranslator({
              provider: "ollama",
              model: model,
              ollamaUrl: ollamaUrl,
            })
          }

          // Process HTML files
          for (const htmlFile of htmlFiles) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  progress: {
                    current: processedFiles,
                    total: totalFiles,
                    type: "html",
                    message: `Processing ${path.basename(htmlFile)}`,
                  },
                })}\n\n`,
              ),
            )

            const result = await translateHTMLFile(htmlFile, provider, apiKey, model, ollamaUrl, targetLanguage)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: `✓ Translated HTML: ${path.basename(htmlFile)} (${result.originalLength} -> ${result.translatedLength} chars)`,
                  level: "success",
                })}\n\n`,
              ),
            )
            processedFiles++
          }

          // Process XML files
          for (const xmlFile of xmlFiles) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "progress",
                  progress: {
                    current: processedFiles,
                    total: totalFiles,
                    type: "xml",
                    message: `Processing ${path.basename(xmlFile)}`,
                  },
                })}\n\n`,
              ),
            )

            try {
              const content = await fs.readFile(xmlFile, "utf-8")

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "log",
                    message: `🔍 Analyzing XML file: ${path.basename(xmlFile)} (${content.length} chars)`,
                    level: "info",
                  })}\n\n`,
                ),
              )

              const { translatedContent, translationsCount } = await xmlTranslator.translateXMLContent(
                content,
                targetLanguage,
              )

              await fs.writeFile(xmlFile, translatedContent, "utf-8")

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "log",
                    message: `✅ Translated XML: ${path.basename(xmlFile)} (${translationsCount} translations made)`,
                    level: "success",
                  })}\n\n`,
                ),
              )
            } catch (error) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    type: "log",
                    message: `⚠️ Failed to translate XML: ${path.basename(xmlFile)} - ${error}`,
                    level: "warning",
                  })}\n\n`,
                ),
              )
            }

            processedFiles++
          }

          // Create translated archive
          const translatedFilename = `${targetLanguage}_${file.name}`
          const translatedPath = path.join(translatedDir, translatedFilename)

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "progress",
                progress: {
                  current: totalFiles,
                  total: totalFiles,
                  type: "html",
                  message: "Creating translated archive...",
                },
              })}\n\n`,
            ),
          )

          try {
            await createArchiveWithFallback(extractDir, translatedPath)
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: `✅ Translated archive created: ${translatedFilename}`,
                  level: "success",
                })}\n\n`,
              ),
            )
          } catch (archiveError) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "log",
                  message: `❌ Archive creation failed: ${archiveError}`,
                  level: "error",
                })}\n\n`,
              ),
            )
            throw new Error(`Failed to create translated archive: ${archiveError}`)
          }

          const endTime = Date.now()
          const elapsed = ((endTime - startTime) / 1000).toFixed(3)

          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "log",
                message: `🎉 Translation completed in ${elapsed} seconds!`,
                level: "success",
              })}\n\n`,
            ),
          )

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

          // Cleanup
          await fs.rm(tempDir, { recursive: true, force: true })
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "log",
                message: `💥 Translation error: ${error}`,
                level: "error",
              })}\n\n`,
            ),
          )
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "error",
                message: error instanceof Error ? error.message : "Unknown error occurred during translation",
              })}\n\n`,
            ),
          )
          controller.close()

          // Cleanup on error
          try {
            await fs.rm(tempDir, { recursive: true, force: true })
          } catch (cleanupError) {
            console.error("🧹 Cleanup error:", cleanupError)
          }
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
    console.error("💥 Archive translation error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Translation failed",
      },
      { status: 500 },
    )
  }
}

// Остальные функции остаются без изменений...
async function createArchiveWithFallback(sourceDir: string, outputPath: string): Promise<void> {
  const isWindows = os.platform() === "win32"

  try {
    if (isWindows) {
      await execAsync(`tar -czf "${outputPath}" -C "${sourceDir}" .`, {
        windowsHide: true,
        timeout: 300000,
      })
    } else {
      await execAsync(`tar -czf "${outputPath}" -C "${sourceDir}" .`)
    }
    return
  } catch (tarError) {
    console.warn("⚠️ Tar method failed, trying alternative approach:", tarError)
  }

  try {
    const excludePatterns = ['--exclude=*"*"*', '--exclude=*" "*', "--exclude=*.tmp"]
    const excludeArgs = excludePatterns.join(" ")
    await execAsync(`tar -czf "${outputPath}" -C "${sourceDir}" ${excludeArgs} .`)
    return
  } catch (excludeError) {
    console.warn("⚠️ Exclude method failed:", excludeError)
  }

  try {
    const safeDir = path.join(path.dirname(outputPath), `safe-${Date.now()}`)
    await fs.mkdir(safeDir, { recursive: true })
    await copyDirectoryWithSafeNames(sourceDir, safeDir)
    await execAsync(`tar -czf "${outputPath}" -C "${safeDir}" .`)
    await fs.rm(safeDir, { recursive: true, force: true })
    return
  } catch (copyError) {
    console.warn("⚠️ Copy method failed:", copyError)
  }

  try {
    const translatedOnlyDir = path.join(path.dirname(outputPath), `translated-only-${Date.now()}`)
    await fs.mkdir(translatedOnlyDir, { recursive: true })
    await copyTranslatedFilesOnly(sourceDir, translatedOnlyDir)
    await execAsync(`tar -czf "${outputPath}" -C "${translatedOnlyDir}" .`)
    await fs.rm(translatedOnlyDir, { recursive: true, force: true })
    return
  } catch (finalError) {
    throw new Error(`Could not create archive: ${finalError}`)
  }
}

async function copyDirectoryWithSafeNames(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const safeName = entry.name.replace(/[<>:"|?*\s]/g, "_")
    const destPath = path.join(destination, safeName)

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await copyDirectoryWithSafeNames(sourcePath, destPath)
    } else {
      try {
        await fs.copyFile(sourcePath, destPath)
      } catch (copyError) {
        console.warn(`⚠️ Could not copy file ${entry.name}:`, copyError)
      }
    }
  }
}

async function copyTranslatedFilesOnly(source: string, destination: string): Promise<void> {
  const entries = await fs.readdir(source, { withFileTypes: true })

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name)
    const destPath = path.join(destination, entry.name)

    if (entry.isDirectory()) {
      await fs.mkdir(destPath, { recursive: true })
      await copyTranslatedFilesOnly(sourcePath, destPath)
    } else if (entry.name.endsWith(".xml") || entry.name.endsWith(".html")) {
      try {
        await fs.copyFile(sourcePath, destPath)
      } catch (copyError) {
        console.warn(`⚠️ Could not copy translated file ${entry.name}:`, copyError)
      }
    }
  }
}

async function countFiles(directory: string): Promise<{ htmlFiles: string[]; xmlFiles: string[] }> {
  const htmlFiles: string[] = []
  const xmlFiles: string[] = []

  const walkDir = async (dir: string) => {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await walkDir(fullPath)
        } else if (entry.isFile()) {
          if (entry.name.endsWith(".html")) {
            htmlFiles.push(fullPath)
          } else if (entry.name.endsWith(".xml")) {
            xmlFiles.push(fullPath)
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not read directory ${dir}:`, error)
    }
  }

  await walkDir(directory)
  return { htmlFiles, xmlFiles }
}

async function translateHTMLFile(
  filePath: string,
  provider: string,
  apiKey: string,
  model: string,
  ollamaUrl: string,
  targetLanguage: string,
) {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const originalLength = content.length
    const tagRegex = /<(p|h[1-6]|li|td|th|div|span|strong|em|b|i|title)[^>]*>([^<]+)<\/\1>/gi
    let translatedContent = content

    const matches = content.match(tagRegex)
    if (matches) {
      for (const match of matches) {
        const textMatch = match.match(/>([^<]+)</)
        if (textMatch && textMatch[1].trim()) {
          const originalText = textMatch[1].trim()
          if (originalText.length > 3) {
            try {
              let translatedText: string

              if (provider === "openai") {
                const openai = createOpenAI({ apiKey })
                const { text } = await generateText({
                  model: openai(model),
                  prompt: `Translate this text to ${targetLanguage}: ${originalText}`,
                  temperature: 0.1,
                  maxTokens: 1000,
                })
                translatedText = text
              } else {
                // Ollama translation
                const response = await fetch(`${ollamaUrl}/api/generate`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    model: model,
                    prompt: `Translate this text to ${targetLanguage}: ${originalText}`,
                    stream: false,
                    options: { temperature: 0.1 },
                  }),
                })
                const data = await response.json()
                translatedText = data.response
              }

              if (translatedText && translatedText.trim()) {
                translatedContent = translatedContent.replace(match, match.replace(originalText, translatedText.trim()))
              }
            } catch (error) {
              console.error(`Failed to translate HTML text: ${originalText}`, error)
            }
          }
        }
      }
    }

    await fs.writeFile(filePath, translatedContent, "utf-8")
    return {
      originalLength,
      translatedLength: translatedContent.length,
    }
  } catch (error) {
    console.error(`Error translating HTML file ${filePath}:`, error)
    return { originalLength: 0, translatedLength: 0 }
  }
}
