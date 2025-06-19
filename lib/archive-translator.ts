import { promises as fs } from "fs"
import path from "path"
import { XMLTranslator, HTMLTranslator } from "./translators"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

type ProgressCallback = (progress: {
  current: number
  total: number
  type: "html" | "xml"
  message: string
}) => void

export class ArchiveTranslator {
  private xmlTranslator: XMLTranslator
  private htmlTranslator: HTMLTranslator

  constructor(apiKey: string, model: string) {
    console.log("Initializing ArchiveTranslator with model:", model)
    this.xmlTranslator = new XMLTranslator(apiKey, model)
    this.htmlTranslator = new HTMLTranslator(apiKey, model)
  }

  async processArchive(inputPath: string, outputPath: string, targetLanguage: string, onProgress?: ProgressCallback) {
    console.log("Processing archive:", { inputPath, outputPath, targetLanguage })

    // Extract archive to temporary directory
    const extractDir = path.join(path.dirname(inputPath), "extracted")
    console.log("Extract directory:", extractDir)
    await fs.mkdir(extractDir, { recursive: true })

    try {
      // Extract the archive using system tar command
      console.log("Extracting archive...")
      if (inputPath.endsWith(".tar.gz") || inputPath.endsWith(".tgz")) {
        await execAsync(`tar -xzf "${inputPath}" -C "${extractDir}"`)
      } else if (inputPath.endsWith(".tar")) {
        await execAsync(`tar -xf "${inputPath}" -C "${extractDir}"`)
      } else {
        throw new Error("Unsupported archive format")
      }
      console.log("Archive extracted successfully")

      // Count files for progress tracking
      const { htmlFiles, xmlFiles } = await this.countFiles(extractDir)
      const totalFiles = htmlFiles.length + xmlFiles.length
      console.log(`Found ${htmlFiles.length} HTML files and ${xmlFiles.length} XML files`)

      if (totalFiles === 0) {
        console.warn("No translatable files found in archive")
        if (onProgress) {
          onProgress({
            current: 0,
            total: 1,
            type: "html",
            message: "No translatable files found",
          })
        }
        // Just copy the original archive
        await fs.copyFile(inputPath, outputPath)
        return
      }

      let processedFiles = 0

      // Process HTML files
      for (const htmlFile of htmlFiles) {
        if (onProgress) {
          onProgress({
            current: processedFiles,
            total: totalFiles,
            type: "html",
            message: `Processing ${path.basename(htmlFile)}`,
          })
        }

        console.log("Translating HTML file:", htmlFile)
        await this.htmlTranslator.translateFile(htmlFile, htmlFile, targetLanguage)
        processedFiles++
      }

      // Process XML files
      for (const xmlFile of xmlFiles) {
        if (onProgress) {
          onProgress({
            current: processedFiles,
            total: totalFiles,
            type: "xml",
            message: `Processing ${path.basename(xmlFile)}`,
          })
        }

        console.log("Translating XML file:", xmlFile)
        await this.xmlTranslator.translateFile(xmlFile, xmlFile, targetLanguage)
        processedFiles++
      }

      // Create new archive using system tar command
      console.log("Creating new archive...")
      await execAsync(`tar -czf "${outputPath}" -C "${extractDir}" .`)
      console.log("New archive created:", outputPath)

      if (onProgress) {
        onProgress({
          current: totalFiles,
          total: totalFiles,
          type: "html",
          message: "Translation completed!",
        })
      }
    } catch (error) {
      console.error("Error processing archive:", error)
      throw error
    } finally {
      // Cleanup
      console.log("Cleaning up extract directory...")
      try {
        await fs.rm(extractDir, { recursive: true, force: true })
      } catch (cleanupError) {
        console.error("Cleanup error:", cleanupError)
      }
    }
  }

  private async countFiles(directory: string): Promise<{
    htmlFiles: string[]
    xmlFiles: string[]
  }> {
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
        console.error("Error walking directory:", dir, error)
      }
    }

    await walkDir(directory)
    return { htmlFiles, xmlFiles }
  }
}
