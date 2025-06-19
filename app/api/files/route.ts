import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET() {
  try {
    const originalDir = path.join(process.cwd(), "uploads", "original")
    const translatedDir = path.join(process.cwd(), "uploads", "translated")

    // Ensure directories exist
    await fs.mkdir(originalDir, { recursive: true })
    await fs.mkdir(translatedDir, { recursive: true })

    const getFiles = async (dir: string) => {
      try {
        const files = await fs.readdir(dir)
        const fileStats = await Promise.all(
          files.map(async (file) => {
            const filePath = path.join(dir, file)
            const stats = await fs.stat(filePath)
            return {
              filename: file,
              modTime: stats.mtime.toISOString().slice(0, 16).replace("T", " "),
              size: stats.size,
            }
          }),
        )
        return fileStats.sort((a, b) => new Date(b.modTime).getTime() - new Date(a.modTime).getTime())
      } catch {
        return []
      }
    }

    const [original, translated] = await Promise.all([getFiles(originalDir), getFiles(translatedDir)])

    return NextResponse.json({ original, translated })
  } catch (error) {
    console.error("Error listing files:", error)
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 })
  }
}
