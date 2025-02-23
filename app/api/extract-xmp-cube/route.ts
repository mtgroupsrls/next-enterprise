import { NextResponse } from "next/server"
import { extractXMPCubeFromImage } from "./extract-xmp-cube-core"
import { validateImageFile } from "./validator"
import { cleanupTempFiles, saveUploadedImage, saveXMPFile } from "../shared/file-manager"

export async function POST(request: Request) {
  let tmpDir: string | undefined

  try {
    const formData = await request.formData()
    const image = formData.get("image")

    // Validate the uploaded file
    const validation = validateImageFile(image instanceof File ? image : null)
    if (!validation.isValid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // At this point we know image is a valid File
    const validatedImage = image as File

    // Save the uploaded file and get paths
    const { imagePath, xmpPath, tmpDir: tempDir } = await saveUploadedImage(validatedImage)
    tmpDir = tempDir

    // Convert image to buffer for analysis
    const buffer = Buffer.from(await validatedImage.arrayBuffer())

    // Generate XMP content and analyze image
    const { xmpContent, imageProperties } = await extractXMPCubeFromImage(buffer, imagePath)

    // Save XMP file
    await saveXMPFile(xmpPath, xmpContent)

    return NextResponse.json({
      message: "Image analyzed successfully",
      xmpPath,
      properties: imageProperties,
    })
  } catch (error) {
    console.error("Error processing image:", error)
    return NextResponse.json({ error: "Failed to process image" }, { status: 500 })
  } finally {
    // Clean up temporary files
    if (tmpDir) {
      await cleanupTempFiles(tmpDir)
    }
  }
}
