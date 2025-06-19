import { type NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"

export async function GET(request: NextRequest, { params }: { params: { filename: string } }) {
  try {
    const filename = decodeURIComponent(params.filename)
    const filePath = path.join(process.cwd(), "translated_archives", filename)

    const fileBuffer = await fs.readFile(filePath)

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error("Error downloading archive:", error)
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { filename: string } }) {
  try {
    const filename = decodeURIComponent(params.filename)
    const filePath = path.join(process.cwd(), "translated_archives", filename)

    await fs.unlink(filePath)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting archive:", error)
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 })
  }
}
