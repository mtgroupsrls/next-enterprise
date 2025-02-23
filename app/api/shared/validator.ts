import { z } from "zod"

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "image/heic",
  "image/heif",
] as const

export const ALLOWED_XMP_TYPES = ["application/xml", "text/xml", ".xmp"] as const

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_XMP_SIZE = 1 * 1024 * 1024 // 1MB

export const ImageFileSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().max(MAX_FILE_SIZE, {
    message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
  }),
})

export const XMPFileSchema = z.object({
  name: z.string().min(1).endsWith(".xmp"),
  type: z.enum(ALLOWED_XMP_TYPES),
  size: z.number().max(MAX_XMP_SIZE, {
    message: `XMP file size must not exceed ${MAX_XMP_SIZE / 1024 / 1024}MB`,
  }),
})

export type ValidationResult = {
  isValid: boolean
  error?: string
}

export function validateImageFile(file: File | null): ValidationResult {
  if (!file) {
    return { isValid: false, error: "No image file provided" }
  }

  const result = ImageFileSchema.safeParse(file)

  if (!result.success) {
    const issues = result.error.issues
    if (issues.length === 0) {
      return { isValid: false, error: "Invalid file format" }
    }

    // We know issues[0] exists because we checked length > 0
    const firstError = issues[0]!

    if (firstError.code === "invalid_enum_value") {
      return {
        isValid: false,
        error: `Unsupported image type: ${file.type}. Supported types: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
      }
    }
    if (firstError.code === "too_big") {
      return {
        isValid: false,
        error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum allowed size (${
          MAX_FILE_SIZE / 1024 / 1024
        }MB)`,
      }
    }
    return { isValid: false, error: firstError.message }
  }

  return { isValid: true }
}

export function validateXMPFile(file: File | null): ValidationResult {
  if (!file) {
    return { isValid: false, error: "No XMP file provided" }
  }

  const result = XMPFileSchema.safeParse(file)

  if (!result.success) {
    const issues = result.error.issues
    if (issues.length === 0) {
      return { isValid: false, error: "Invalid XMP file format" }
    }

    // We know issues[0] exists because we checked length > 0
    const firstError = issues[0]!

    if (firstError.code === "invalid_enum_value") {
      return {
        isValid: false,
        error: `Unsupported XMP type: ${file.type}. File must be an XML or XMP file.`,
      }
    }
    if (firstError.code === "too_big") {
      return {
        isValid: false,
        error: `File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds maximum allowed size (${
          MAX_XMP_SIZE / 1024 / 1024
        }MB)`,
      }
    }
    if (firstError.code === "invalid_string") {
      return { isValid: false, error: "File must have .xmp extension" }
    }
    return { isValid: false, error: firstError.message }
  }

  return { isValid: true }
}

export async function validateXMPContent(content: string): Promise<ValidationResult> {
  try {
    // Basic XML structure validation
    if (!content.includes("<?xml") || !content.includes("<x:xmpmeta")) {
      return { isValid: false, error: "Invalid XMP format: missing XML declaration or xmpmeta tag" }
    }

    // Check for required Camera Raw Settings namespace
    if (!content.includes("crs:")) {
      return { isValid: false, error: "Invalid XMP format: missing Camera Raw Settings namespace" }
    }

    // Check for basic required elements
    const requiredElements = ["ProcessVersion", "Version", "WhiteBalance"]
    const missingElements = requiredElements.filter((elem) => !content.includes(`crs:${elem}`))

    if (missingElements.length > 0) {
      return {
        isValid: false,
        error: `Invalid XMP format: missing required elements: ${missingElements.join(", ")}`,
      }
    }

    return { isValid: true }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Failed to validate XMP content",
    }
  }
}
