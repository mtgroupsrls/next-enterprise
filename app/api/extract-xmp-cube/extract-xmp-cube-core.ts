import sharp, { Matrix3x3 } from "sharp"
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
import {
  calculateProfileDigest,
  determineCameraProfile,
  determineProcessVersion,
  determineToneCurveName,
  determineVersion,
  determineWhiteBalance,
  generateXMPCRS,
  hasCrop,
} from "./metadata-analysis"
import { calculateClarity, calculateLuminanceSmoothing, calculateSharpness, calculateTexture } from "./quality-analysis"
import {
  calculateAllToneCurves,
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
  calculateSplitToningBalance,
  calculateSplitToningHighlightHue,
  calculateSplitToningHighlightSaturation,
  calculateSplitToningShadowHue,
  calculateSplitToningShadowSaturation,
  calculateToneMapStrength,
} from "./tone-analysis"
import { calculateHueSaturationMatrix, multiplyMatrices } from "../shared/image-utils"
import { ImageProperties, SharpChannel } from "../shared/types"

// Constants
const DEFAULT_TONE_CURVE: number[][] = [
  [0, 0],
  [255, 255],
]
const IDENTITY_MATRIX: Matrix3x3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
]
const LUT_SIZE = 32
const MAX_CONTRAST_FACTOR = 5.0
const EXPOSURE_RANGE = { MIN: -10, MAX: 10 }
const CONTRAST_RANGE = { MIN: -100, MAX: 100 }

// Types
interface ColorPoint {
  r: number
  g: number
  b: number
}

interface ProcessingFactors {
  exposure: number
  contrast: number
}

// Validation functions
function validateToneCurvePoints(points: number[][]): boolean {
  return points.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === "number" &&
      typeof point[1] === "number" &&
      !isNaN(point[0]) &&
      !isNaN(point[1])
  )
}

function validateImageProperties(properties: ImageProperties): void {
  if (!properties) throw new Error("Image properties are required")
  const requiredProps = ["exposure", "contrast", "toneCurveRed", "toneCurveGreen", "toneCurveBlue"]
  const missing = requiredProps.filter((prop) => !(prop in properties))
  if (missing.length > 0) {
    throw new Error(`Missing required properties: ${missing.join(", ")}`)
  }
}

// Color processing functions
function applyToneCurve(value: number, curve: number[][] | undefined): number {
  const toneCurve = curve && validateToneCurvePoints(curve) ? curve : DEFAULT_TONE_CURVE

  for (let i = 0; i < toneCurve.length - 1; i++) {
    const [x1, y1] = toneCurve[i] as [number, number]
    const [x2, y2] = toneCurve[i + 1] as [number, number]

    if (value >= x1 / 255 && value <= x2 / 255) {
      const t = (value - x1 / 255) / (x2 / 255 - x1 / 255)
      return y1 / 255 + t * (y2 / 255 - y1 / 255)
    }
  }
  return value
}

function applyColorMatrix(point: ColorPoint, matrix: Matrix3x3): ColorPoint {
  return {
    r: point.r * matrix[0][0] + point.g * matrix[0][1] + point.b * matrix[0][2],
    g: point.r * matrix[1][0] + point.g * matrix[1][1] + point.b * matrix[1][2],
    b: point.r * matrix[2][0] + point.g * matrix[2][1] + point.b * matrix[2][2],
  }
}

function applyToneCurves(point: ColorPoint, properties: ImageProperties): ColorPoint {
  return {
    r: applyToneCurve(point.r, properties.toneCurveRed),
    g: applyToneCurve(point.g, properties.toneCurveGreen),
    b: applyToneCurve(point.b, properties.toneCurveBlue),
  }
}

// Processing factor calculations
function calculateProcessingFactors(properties: ImageProperties): ProcessingFactors {
  const exposure = properties.exposure || 0
  const contrast = properties.contrast || 0

  const normalizedExposure = Math.max(EXPOSURE_RANGE.MIN, Math.min(EXPOSURE_RANGE.MAX, exposure))
  const normalizedContrast = Math.max(CONTRAST_RANGE.MIN, Math.min(CONTRAST_RANGE.MAX, contrast))

  return {
    exposure: Math.pow(2, normalizedExposure / 2),
    contrast: Math.min(MAX_CONTRAST_FACTOR, Math.tan(((normalizedContrast + 100) * Math.PI) / 400)),
  }
}

function applyFactors(point: ColorPoint, factors: ProcessingFactors): ColorPoint {
  const applyFactor = (value: number) => Math.max(0, Math.min(1, value * factors.exposure * factors.contrast))

  return {
    r: applyFactor(point.r),
    g: applyFactor(point.g),
    b: applyFactor(point.b),
  }
}

// CUBE file generation
function generateCUBEHeader(filename: string): string {
  return `#Created by NE-Presets
#Copyright 2024
#Source Image: ${filename}
TITLE "NE-Presets LUT"
DOMAIN_MIN 0 0 0
DOMAIN_MAX 1 1 1
LUT_3D_SIZE ${LUT_SIZE}

`
}

function formatLUTPoint(point: ColorPoint): string {
  return `${point.r.toFixed(6)} ${point.g.toFixed(6)} ${point.b.toFixed(6)}\n`
}

// Main LUT generation function
function generateCUBELUT(properties: ImageProperties, filename: string): string {
  validateImageProperties(properties)

  let content = generateCUBEHeader(filename)
  const step = 1 / (LUT_SIZE - 1)

  // Pre-calculate matrices and factors
  const colorMatrix = calculateColorMatrixFromProperties(properties)
  if (!colorMatrix) {
    console.warn("Failed to calculate color matrix, using identity matrix")
  }
  const finalColorMatrix = colorMatrix || IDENTITY_MATRIX
  const factors = calculateProcessingFactors(properties)

  // Generate LUT points
  for (let b = 0; b < LUT_SIZE; b++) {
    for (let g = 0; g < LUT_SIZE; g++) {
      for (let r = 0; r < LUT_SIZE; r++) {
        // Create initial color point
        let point: ColorPoint = {
          r: r * step,
          g: g * step,
          b: b * step,
        }

        // Apply transformations in sequence
        point = applyColorMatrix(point, finalColorMatrix)
        point = applyToneCurves(point, properties)
        point = applyFactors(point, factors)

        content += formatLUTPoint(point)
      }
    }
  }

  return content
}

// Helper function to calculate color matrix from image properties
function calculateColorMatrixFromProperties(properties: ImageProperties): Matrix3x3 {
  // Create matrices for each color adjustment and combine them
  let resultMatrix: Matrix3x3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]

  // Define color ranges in degrees
  const colorRanges = [
    { name: "red", hue: properties.redHue, saturation: properties.redSaturation },
    { name: "orange", hue: properties.orangeHue, saturation: properties.orangeSaturation },
    { name: "yellow", hue: properties.yellowHue, saturation: properties.yellowSaturation },
    { name: "green", hue: properties.greenHue, saturation: properties.greenSaturation },
    { name: "aqua", hue: properties.aquaHue, saturation: properties.aquaSaturation },
    { name: "blue", hue: properties.blueHue, saturation: properties.blueSaturation },
    { name: "purple", hue: properties.purpleHue, saturation: properties.purpleSaturation },
    { name: "magenta", hue: properties.magentaHue, saturation: properties.magentaSaturation },
  ]

  colorRanges.forEach(({ hue, saturation }) => {
    if (hue || saturation) {
      const colorMatrix = calculateHueSaturationMatrix(hue || 0, saturation || 0)
      resultMatrix = multiplyMatrices(resultMatrix, colorMatrix)
    }
  })

  return resultMatrix
}

export async function extractXMPCubeFromImage(
  buffer: Buffer,
  filename: string
): Promise<{ xmpContent: string; cubeContent: string; imageProperties: ImageProperties }> {
  try {
    // Analyze image using sharp
    const imageInfo = (await sharp(buffer).metadata()) as sharp.Metadata
    console.log("Image metadata:", {
      format: imageInfo.format,
      width: imageInfo.width,
      height: imageInfo.height,
      space: imageInfo.space,
      channels: imageInfo.channels,
      hasProfile: !!imageInfo.icc,
      hasExif: !!imageInfo.exif,
      hasXmp: !!imageInfo.xmp,
    })

    const stats = await sharp(buffer).stats()

    if (!stats.channels || stats.channels.length < 3) {
      throw new Error("Invalid image: requires RGB channels")
    }

    // Ensure channels are defined
    const channels = stats.channels as SharpChannel[]
    console.log(
      "Channel statistics:",
      channels.map((c, i) => ({
        channel: i,
        mean: c.mean,
        stdev: c.stdev,
        min: c.min,
        max: c.max,
      }))
    )

    // Calculate color adjustments first since they're async
    const [
      redHue,
      orangeHue,
      yellowHue,
      greenHue,
      aquaHue,
      blueHue,
      purpleHue,
      magentaHue,
      redSaturation,
      orangeSaturation,
      yellowSaturation,
      greenSaturation,
      aquaSaturation,
      blueSaturation,
      purpleSaturation,
      magentaSaturation,
    ] = await Promise.all([
      calculateColorHue("red", buffer),
      calculateColorHue("orange", buffer),
      calculateColorHue("yellow", buffer),
      calculateColorHue("green", buffer),
      calculateColorHue("aqua", buffer),
      calculateColorHue("blue", buffer),
      calculateColorHue("purple", buffer),
      calculateColorHue("magenta", buffer),
      calculateColorSaturation("red", buffer),
      calculateColorSaturation("orange", buffer),
      calculateColorSaturation("yellow", buffer),
      calculateColorSaturation("green", buffer),
      calculateColorSaturation("aqua", buffer),
      calculateColorSaturation("blue", buffer),
      calculateColorSaturation("purple", buffer),
      calculateColorSaturation("magenta", buffer),
    ])

    // Calculate tone curves using optimized function
    const { toneCurve, toneCurveRed, toneCurveGreen, toneCurveBlue } = await calculateAllToneCurves(channels, buffer)

    // Extract image properties
    const imageProperties: ImageProperties = {
      exposure: calculateExposure(channels),
      temperature: calculateColorTemperature(channels),
      tint: calculateTint(channels),
      contrast: calculateContrast(channels),
      saturation: calculateSaturation(channels),
      brightness: calculateBrightness(channels),
      sharpness: calculateSharpness(imageInfo),
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
      cameraProfile: determineCameraProfile(imageInfo),
      cameraProfileDigest: calculateProfileDigest(determineCameraProfile(imageInfo)),
      hasSettings: true,
      hasCrop: await hasCrop(imageInfo),
      alreadyApplied: false,
      toneCurveName: determineToneCurveName(channels),
      version: determineVersion(imageInfo),
      processVersion: determineProcessVersion(imageInfo),
      whiteBalance: await determineWhiteBalance(imageInfo),
      colorNoiseReduction: calculateColorNoiseReduction(channels),
      vignetteAmount: calculateVignetteAmount(channels),
      shadowTint: calculateShadowTint(channels),
      redHue,
      redSaturation,
      orangeHue,
      orangeSaturation,
      yellowHue,
      yellowSaturation,
      greenHue,
      greenSaturation,
      aquaHue,
      aquaSaturation,
      blueHue,
      blueSaturation,
      purpleHue,
      purpleSaturation,
      magentaHue,
      magentaSaturation,
      splitToningShadowHue: calculateSplitToningShadowHue(channels),
      splitToningShadowSaturation: calculateSplitToningShadowSaturation(channels),
      splitToningHighlightHue: calculateSplitToningHighlightHue(channels),
      splitToningHighlightSaturation: calculateSplitToningHighlightSaturation(channels),
      splitToningBalance: calculateSplitToningBalance(channels),
      toneCurve,
      toneCurveRed,
      toneCurveGreen,
      toneCurveBlue,
    }

    // Generate XMP-CRS content
    const xmpContent = generateXMPCRS(filename, imageProperties)

    // Generate CUBE LUT content
    const cubeContent = generateCUBELUT(imageProperties, filename)

    return { xmpContent, cubeContent, imageProperties }
  } catch (error) {
    console.error("Error in analyzeImageAndGenerateXMP:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message)
      console.error("Error stack:", error.stack)
    }
    throw error // Re-throw to be handled by the route handler
  }
}
