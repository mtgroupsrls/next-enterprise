import { z } from "zod"

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
  "image/heic",
  "image/heif",
] as const

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export const ImageFileSchema = z.object({
  name: z.string().min(1),
  type: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().max(MAX_FILE_SIZE, {
    message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
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
