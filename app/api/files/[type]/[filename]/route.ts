import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string; filename: string }> }) {
  try {
    const { type, filename } = await params // ИСПРАВЛЕНО: await params
    const decodedFilename = decodeURIComponent(filename)

    if (type !== "original" && type !== "translated") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), "uploads", type, decodedFilename)
    const fileBuffer = await fs.readFile(filePath)

    const contentType = decodedFilename.endsWith(".ipynb") ? "application/json" : "application/gzip"

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${decodedFilename}"`,
      },
    })
  } catch (error) {
    console.error("Error downloading file:", error)
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; filename: string }> },
) {
  try {
    const { type, filename } = await params // ИСПРАВЛЕНО: await params
    const decodedFilename = decodeURIComponent(filename)

    if (type !== "original" && type !== "translated") {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 })
    }

    const filePath = path.join(process.cwd(), "uploads", type, decodedFilename)
    await fs.unlink(filePath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting file:", error)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
