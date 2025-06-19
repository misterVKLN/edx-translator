import { NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET() {
  try {
    const archivesDir = path.join(process.cwd(), "translated_archives")

    try {
      await fs.access(archivesDir)
    } catch {
      // Directory doesn't exist, create it
      await fs.mkdir(archivesDir, { recursive: true })
      return NextResponse.json([])
    }

    const files = await fs.readdir(archivesDir)
    const archives = []

    for (const file of files) {
      if (file.endsWith(".tar.gz")) {
        const filePath = path.join(archivesDir, file)
        const stats = await fs.stat(filePath)

        archives.push({
          filename: file,
          modTime: stats.mtime.toISOString().slice(0, 16).replace("T", " "),
          size: stats.size,
        })
      }
    }

    // Sort by modification time (newest first)
    archives.sort((a, b) => new Date(b.modTime).getTime() - new Date(a.modTime).getTime())

    return NextResponse.json(archives)
  } catch (error) {
    console.error("Error listing archives:", error)
    return NextResponse.json({ error: "Failed to list archives" }, { status: 500 })
  }
}
