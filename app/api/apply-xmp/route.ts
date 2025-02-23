import { NextResponse } from "next/server"
import { applyXMPToImage } from "./apply-xmp-core"
import { cleanupTempFiles, saveUploadedImage } from "../shared/file-manager"
import { validateImageFile, validateXMPContent, validateXMPFile } from "../shared/validator"

export async function POST(request: Request) {
  let tmpDir: string | undefined

  try {
    const formData = await request.formData()
    const image = formData.get("image")
    const xmpFile = formData.get("xmp")

    // Validate the uploaded image
    const imageValidation = validateImageFile(image instanceof File ? image : null)
    if (!imageValidation.isValid) {
      return NextResponse.json({ error: imageValidation.error }, { status: 400 })
    }

    // Validate XMP file
    const xmpValidation = validateXMPFile(xmpFile instanceof File ? xmpFile : null)
    if (!xmpValidation.isValid) {
      return NextResponse.json({ error: xmpValidation.error }, { status: 400 })
    }

    // Convert files to buffers and validate XMP content
    const imageBuffer = Buffer.from(await (image as File).arrayBuffer())
    const xmpString = await (xmpFile as File).text()

    const xmpContentValidation = await validateXMPContent(xmpString)
    if (!xmpContentValidation.isValid) {
      return NextResponse.json({ error: xmpContentValidation.error }, { status: 400 })
    }

    // Save files and get paths
    const { tmpDir: tempDir } = await saveUploadedImage(image as File)
    tmpDir = tempDir

    // Apply XMP adjustments to image
    const { outputBuffer, appliedAdjustments } = await applyXMPToImage(imageBuffer, xmpString)

    // Return the processed image as a response
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="processed_${(image as File).name}"`,
        "X-Applied-Adjustments": JSON.stringify(appliedAdjustments),
      },
    })
  } catch (error) {
    console.error("Error processing image:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process image" },
      { status: 500 }
    )
  } finally {
    // Clean up temporary files
    if (tmpDir) {
      await cleanupTempFiles(tmpDir)
    }
  }
}

// Configure the maximum file size for the route
export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
    responseLimit: false, // No response size limit
  },
}
