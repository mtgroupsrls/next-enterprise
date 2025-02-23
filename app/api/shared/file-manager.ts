import { mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"

export interface ProcessedFiles {
  imagePath: string
  xmpPath: string
  tmpDir: string
}

export async function saveUploadedImage(image: File): Promise<ProcessedFiles> {
  // Create a temporary directory for processing
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "image-analysis-"))

  // Save the uploaded image
  const bytes = await image.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const imagePath = path.join(tmpDir, image.name)
  await writeFile(imagePath, buffer)

  // Define XMP path
  const xmpPath = path.join(tmpDir, `${path.parse(image.name).name}.xmp`)

  return { imagePath, xmpPath, tmpDir }
}

export async function saveXMPFile(xmpPath: string, xmpContent: string): Promise<void> {
  await writeFile(xmpPath, xmpContent)
}

export async function cleanupTempFiles(tmpDir: string): Promise<void> {
  try {
    await rm(tmpDir, { recursive: true, force: true })
  } catch (error) {
    console.error("Error cleaning up temporary directory:", error)
  }
}
