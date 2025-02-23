import { Channels, Matrix3x3, Metadata } from "sharp"
import { calculateProfileDigest, determineCameraProfile } from "./camera-profiles"
import {
  calculateColorHue,
  calculateColorNoiseReduction,
  calculateColorSaturation,
  calculateColorTemperature,
  calculateSaturation,
  calculateShadowTint,
  calculateTint,
  calculateVibrance,
  calculateVignetteAmount,
} from "./color-analysis"
import { calculateClarity, calculateLuminanceSmoothing, calculateSharpness, calculateTexture } from "./quality-analysis"
import {
  calculateSplitToningBalance,
  calculateSplitToningHighlightHue,
  calculateSplitToningHighlightSaturation,
  calculateSplitToningShadowHue,
  calculateSplitToningShadowSaturation,
} from "./split-toning-analysis"
import {
  calculateBrightness,
  calculateContrast,
  calculateDehaze,
  calculateExposure,
  calculateHighlights,
  calculateParametricDarks,
  calculateParametricHighlights,
  calculateParametricHighlightSplit,
  calculateParametricLights,
  calculateParametricMidtoneSplit,
  calculateParametricShadows,
  calculateParametricShadowSplit,
  calculateShadows,
  calculateToneMapStrength,
} from "./tone-analysis"
import { calculateChannelToneCurve, calculateToneCurve } from "./tone-curve-analysis"
import { ImageProperties, SharpChannel } from "../shared/types"

type _ColorChannel = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta"

interface ImageInfo {
  make: string
  channels: SharpChannel[]
  metadata: Record<string, unknown>
  buffer: Buffer
}

// Helper function to convert ImageInfo to Metadata
function toMetadata(info: ImageInfo): Metadata {
  return {
    ...info.metadata,
    channels: info.channels as unknown as Channels,
  }
}

export async function extractImageProperties(imageInfo: ImageInfo): Promise<ImageProperties> {
  const { channels, make, metadata, buffer } = imageInfo
  const metadataForSharp = toMetadata(imageInfo)

  // Extract basic properties
  const cameraProfile = determineCameraProfile(make)
  const hasCropValue = await checkForCrop(metadata)

  // Calculate color adjustments
  const [
    redHue,
    redSat,
    orangeHue,
    orangeSat,
    yellowHue,
    yellowSat,
    greenHue,
    greenSat,
    aquaHue,
    aquaSat,
    blueHue,
    blueSat,
    purpleHue,
    purpleSat,
    magentaHue,
    magentaSat,
  ] = await Promise.all([
    calculateColorHue("red", buffer),
    calculateColorSaturation("red", buffer),
    calculateColorHue("orange", buffer),
    calculateColorSaturation("orange", buffer),
    calculateColorHue("yellow", buffer),
    calculateColorSaturation("yellow", buffer),
    calculateColorHue("green", buffer),
    calculateColorSaturation("green", buffer),
    calculateColorHue("aqua", buffer),
    calculateColorSaturation("aqua", buffer),
    calculateColorHue("blue", buffer),
    calculateColorSaturation("blue", buffer),
    calculateColorHue("purple", buffer),
    calculateColorSaturation("purple", buffer),
    calculateColorHue("magenta", buffer),
    calculateColorSaturation("magenta", buffer),
  ])

  // Calculate all properties
  const properties: ImageProperties = {
    exposure: calculateExposure(channels),
    temperature: calculateColorTemperature(channels),
    tint: calculateTint(channels),
    contrast: calculateContrast(channels),
    saturation: calculateSaturation(channels),
    brightness: calculateBrightness(channels),
    sharpness: calculateSharpness(metadataForSharp),
    clarity: calculateClarity(channels),
    vibrance: calculateVibrance(channels),
    texture: calculateTexture(channels),
    shadows: calculateShadows(channels),
    highlights: calculateHighlights(channels),
    dehaze: calculateDehaze(channels),
    parametricShadows: calculateParametricShadows(channels),
    parametricDarks: calculateParametricDarks(channels),
    parametricLights: calculateParametricLights(channels),
    parametricHighlights: calculateParametricHighlights(channels),
    parametricShadowSplit: calculateParametricShadowSplit(channels),
    parametricMidtoneSplit: calculateParametricMidtoneSplit(channels),
    parametricHighlightSplit: calculateParametricHighlightSplit(channels),
    toneMapStrength: calculateToneMapStrength(channels),
    luminanceSmoothing: calculateLuminanceSmoothing(channels),
    colorNoiseReduction: calculateColorNoiseReduction(channels),
    vignetteAmount: calculateVignetteAmount(channels),
    shadowTint: calculateShadowTint(channels),
    splitToningShadowHue: calculateSplitToningShadowHue(channels),
    splitToningShadowSaturation: calculateSplitToningShadowSaturation(channels),
    splitToningHighlightHue: calculateSplitToningHighlightHue(channels),
    splitToningHighlightSaturation: calculateSplitToningHighlightSaturation(channels),
    splitToningBalance: calculateSplitToningBalance(channels),

    // Camera and processing info
    cameraProfile,
    cameraProfileDigest: calculateProfileDigest(cameraProfile),
    hasSettings: true,
    hasCrop: hasCropValue,
    alreadyApplied: false,
    toneCurveName: determineToneCurveName(channels),
    version: determineVersion(metadata),
    processVersion: determineProcessVersion(metadata),
    whiteBalance: await determineWhiteBalance(metadata),

    // Color adjustments
    redHue,
    redSaturation: redSat,
    orangeHue,
    orangeSaturation: orangeSat,
    yellowHue,
    yellowSaturation: yellowSat,
    greenHue,
    greenSaturation: greenSat,
    aquaHue,
    aquaSaturation: aquaSat,
    blueHue,
    blueSaturation: blueSat,
    purpleHue,
    purpleSaturation: purpleSat,
    magentaHue,
    magentaSaturation: magentaSat,

    // Tone curves
    toneCurve: await calculateToneCurve(channels),
    toneCurveRed: await calculateChannelToneCurve(channels, "red"),
    toneCurveGreen: await calculateChannelToneCurve(channels, "green"),
    toneCurveBlue: await calculateChannelToneCurve(channels, "blue"),
  }

  return properties
}

async function checkForCrop(metadata: Record<string, unknown>): Promise<boolean> {
  if (!metadata) return false

  const cropFields = ["CropLeft", "CropTop", "CropRight", "CropBottom"]
  return cropFields.some((field) => metadata[field] !== undefined && metadata[field] !== 0)
}

// Helper functions for determining metadata values
function determineToneCurveName(_channels: SharpChannel[]): string {
  // Implement tone curve name determination logic
  return "Custom"
}

function determineVersion(metadata: Record<string, unknown>): string {
  return (metadata?.Version as string) || "15.0"
}

function determineProcessVersion(metadata: Record<string, unknown>): string {
  return (metadata?.ProcessVersion as string) || "11.0"
}

async function determineWhiteBalance(metadata: Record<string, unknown>): Promise<string> {
  return (metadata?.WhiteBalance as string) || "As Shot"
}

// Default color matrix for when calculation fails
const DEFAULT_COLOR_MATRIX: Matrix3x3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]

function _calculateColorMatrix(_channels: SharpChannel[]): Matrix3x3 {
  try {
    // Implement color matrix calculation
    return DEFAULT_COLOR_MATRIX
  } catch (error) {
    console.warn("Failed to calculate color matrix, using default", error)
    return DEFAULT_COLOR_MATRIX
  }
}
