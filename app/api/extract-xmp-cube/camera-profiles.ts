// Types
export interface CameraProfileSet {
  default: string
  profiles: string[]
}

// Camera profile definitions
export const CAMERA_PROFILES: Record<string, CameraProfileSet> = {
  "NIKON CORPORATION": {
    default: "Camera Neutral",
    profiles: [
      "Camera Neutral",
      "Camera Vivid",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Flat",
      "Camera Standard",
      "Camera Monochrome",
    ],
  },
  CANON: {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Neutral",
      "Camera Faithful",
      "Camera Fine Detail",
      "Camera Monochrome",
    ],
  },
  // ... existing camera profiles ...
}

// Profile digest mapping
const PROFILE_DIGESTS: Record<string, string> = {
  "Adobe Standard": "54650A341B5B5CCAE8442D0B43A92BCE",
  "Camera Neutral": "E8A7C5C13C743E0E",
  "Camera Standard": "F46D5B1D6B136F71",
  "Camera Portrait": "DCB3D5C9F6C4484A",
  "Camera Landscape": "B369A84D84AA6A14",
  "Camera Vivid": "C3F59EC06A069315",
  "Camera Flat": "9357A4E45E4B5F6C",
  "Camera Monochrome": "7A4E2B8F1C9D3A5E",
  "Camera Clear": "2D8F4E7B1A6C9D3E",
  "Camera Deep": "5F8A2E4D7C1B9E3A",
  "Camera Light": "1E9D4A7F2B5C8E3D",
  "Camera Provia/Standard": "4B7F2E8A1D5C9E3A",
  "Camera Velvia/Vivid": "8E2D5F7A4B1C9E3A",
  "Camera Astia/Soft": "3A7E2D8F4B5C1E9A",
  "Camera Classic Chrome": "7F4E2A8B5C1D9E3A",
}

export function determineCameraProfile(make: string): string {
  const normalizedMake = make.toUpperCase().trim()

  if (!normalizedMake || !CAMERA_PROFILES[normalizedMake]) {
    console.log(`Unknown or missing camera make "${make}", using Adobe Standard profile`)
    return "Adobe Standard"
  }

  const profile = CAMERA_PROFILES[normalizedMake].default
  console.log(`Using camera profile for make "${make}": ${profile}`)
  return profile
}

export function calculateProfileDigest(profile: string): string {
  const DEFAULT_DIGEST = PROFILE_DIGESTS["Adobe Standard"]!
  if (!profile || !(profile in PROFILE_DIGESTS)) {
    return DEFAULT_DIGEST
  }
  return PROFILE_DIGESTS[profile]!
}

export function getAvailableProfiles(make: string): string[] {
  const normalizedMake = make.toUpperCase().trim()
  return CAMERA_PROFILES[normalizedMake]?.profiles || ["Adobe Standard"]
}
