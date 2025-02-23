import sharp, { Matrix3x3 } from "sharp"
import {
  calculateHueSaturationMatrix,
  convertToneCurveToMatrix,
  createNoiseSVG,
  createParametricCurve,
  createShadowHighlightMatrix,
  createVignetteSVG,
  hueToRGB,
  multiplyMatrices,
} from "../shared/image-utils"
import { XMPAdjustments } from "../shared/types"
import { parseXMPAdjustments as parseXMP, parseXMPData } from "../shared/xml-parser"

export async function parseXMPString(xmpString: string): Promise<XMPAdjustments> {
  const xmpData = parseXMPData(xmpString)
  return parseXMP(xmpData)
}

export async function applyXMPToImage(
  inputBuffer: Buffer,
  xmpString: string
): Promise<{ outputBuffer: Buffer; appliedAdjustments: XMPAdjustments }> {
  const adjustments = await parseXMPString(xmpString)
  let image = sharp(inputBuffer)

  try {
    // Apply white balance (temperature and tint)
    if (adjustments.temperature || adjustments.tint) {
      const tempFactor = Math.pow(1.0075, adjustments.temperature)
      const tintFactor = Math.pow(1.0075, adjustments.tint)

      image = image.tint({
        r: tempFactor > 1 ? tempFactor : 1,
        g: tintFactor > 1 ? tintFactor : 1,
        b: tempFactor < 1 ? 1 / tempFactor : 1,
      })
    }

    // Apply exposure, contrast, and brightness
    const exposureFactor = Math.pow(2, adjustments.exposure / 100)
    const contrastFactor = 1 + adjustments.contrast / 100
    const brightnessFactor = 1 + adjustments.brightness / 100
    image = image.linear(exposureFactor * brightnessFactor, -(128 * (contrastFactor - 1)))

    // Apply shadows and highlights recovery
    if (adjustments.shadows || adjustments.highlights || adjustments.whites || adjustments.blacks) {
      const shadowMatrix = createShadowHighlightMatrix(
        adjustments.shadows + adjustments.blacks,
        adjustments.highlights + adjustments.whites
      )
      image = image.recomb(shadowMatrix)
    }

    // Apply saturation, vibrance, and shadow tint
    if (adjustments.saturation || adjustments.vibrance || adjustments.shadowTint) {
      const shadowTintFactor = adjustments.shadowTint / 100
      image = image.modulate({
        saturation: 1 + (adjustments.saturation / 100 + adjustments.vibrance / 200),
        hue: shadowTintFactor * 180, // Convert tint to hue shift
      })
    }

    // Apply clarity and texture
    if (adjustments.clarity || adjustments.texture) {
      const clarityRadius = Math.max(1, Math.round(adjustments.clarity / 10))

      // Create properly typed kernels
      const claritySize = clarityRadius * 2 + 1
      const clarityValue = 1 / (claritySize * claritySize)
      const clarityKernel = new Float32Array(claritySize * claritySize).fill(clarityValue)

      const textureKernel = new Float32Array([-1, -1, -1, -1, 9, -1, -1, -1, -1])

      image = image
        .convolve({
          width: claritySize,
          height: claritySize,
          kernel: clarityKernel,
        })
        .convolve({
          width: 3,
          height: 3,
          kernel: textureKernel,
        })
    }

    // Apply dehaze and tone map strength
    if (adjustments.dehaze || adjustments.toneMapStrength) {
      const dehazeStrength = adjustments.dehaze / 100
      const toneMapStrength = adjustments.toneMapStrength / 100
      image = image.linear(1 + dehazeStrength + toneMapStrength, -(dehazeStrength + toneMapStrength) * 128)
    }

    // Apply parametric adjustments
    if (
      adjustments.parametricShadows ||
      adjustments.parametricDarks ||
      adjustments.parametricLights ||
      adjustments.parametricHighlights
    ) {
      const parametricCurve = createParametricCurve(adjustments)
      const matrix = convertToneCurveToMatrix(parametricCurve)
      image = image.recomb([matrix, matrix, matrix] as Matrix3x3)
    }

    // Apply color adjustments
    const colorMatrix = calculateColorMatrix(adjustments)
    if (colorMatrix) {
      image = image.recomb(colorMatrix)
    }

    // Apply split toning
    if (
      adjustments.splitToningShadowHue ||
      adjustments.splitToningShadowSaturation ||
      adjustments.splitToningHighlightHue ||
      adjustments.splitToningHighlightSaturation
    ) {
      const splitToningMatrix = createSplitToningMatrix(
        adjustments.splitToningShadowHue,
        adjustments.splitToningShadowSaturation,
        adjustments.splitToningHighlightHue,
        adjustments.splitToningHighlightSaturation,
        adjustments.splitToningBalance
      )
      image = image.recomb(splitToningMatrix)
    }

    // Apply tone curves
    if (adjustments.toneCurve || adjustments.toneCurveRed || adjustments.toneCurveGreen || adjustments.toneCurveBlue) {
      const redMatrix = adjustments.toneCurveRed
        ? convertToneCurveToMatrix(adjustments.toneCurveRed)
        : convertToneCurveToMatrix(
            adjustments.toneCurve || [
              [0, 0],
              [255, 255],
            ]
          )
      const greenMatrix = adjustments.toneCurveGreen
        ? convertToneCurveToMatrix(adjustments.toneCurveGreen)
        : convertToneCurveToMatrix(
            adjustments.toneCurve || [
              [0, 0],
              [255, 255],
            ]
          )
      const blueMatrix = adjustments.toneCurveBlue
        ? convertToneCurveToMatrix(adjustments.toneCurveBlue)
        : convertToneCurveToMatrix(
            adjustments.toneCurve || [
              [0, 0],
              [255, 255],
            ]
          )

      image = image.recomb([redMatrix, greenMatrix, blueMatrix] as Matrix3x3)
    }

    // Apply sharpening and noise reduction
    if (adjustments.sharpness) {
      image = image.sharpen({
        sigma: adjustments.sharpness / 100,
        m1: 1,
        m2: 1,
        x1: 2,
        y2: 10,
        y3: 20,
      })
    }

    if (adjustments.luminanceSmoothing || adjustments.colorNoiseReduction) {
      const sigma = Math.max(adjustments.luminanceSmoothing, adjustments.colorNoiseReduction) / 100
      image = image.blur(sigma)
    }

    // Apply vignette
    if (adjustments.vignetteAmount) {
      const metadata = await sharp(inputBuffer).metadata()
      const { width = 0, height = 0 } = metadata
      const svg = createVignetteSVG(
        width,
        height,
        adjustments.vignetteAmount,
        adjustments.vignetteFeather || 50,
        adjustments.vignetteMidpoint || 50
      )
      const vignetteBuffer = await sharp(Buffer.from(svg)).toBuffer()
      image = image.composite([{ input: vignetteBuffer, blend: "multiply" }])
    }

    // Apply grain if specified
    if (adjustments.grainAmount) {
      const grainSize = adjustments.grainSize || 1
      const grainFrequency = adjustments.grainFrequency || 1
      const metadata = await sharp(inputBuffer).metadata()
      const { width = 0, height = 0 } = metadata

      // Create noise pattern
      const svg = createNoiseSVG(width, height, adjustments.grainAmount / 100, grainSize, grainFrequency)
      const noiseBuffer = await sharp(Buffer.from(svg)).toBuffer()
      image = image.composite([{ input: noiseBuffer, blend: "overlay" }])
    }

    // Process the image and return the result
    const outputBuffer = await image.toBuffer()
    return { outputBuffer, appliedAdjustments: adjustments }
  } catch (error) {
    console.error("Error applying XMP adjustments:", error)
    throw error
  }
}

function calculateColorMatrix(adjustments: XMPAdjustments): Matrix3x3 | null {
  const hasColorAdjustments =
    adjustments.redHue ||
    adjustments.redSaturation ||
    adjustments.orangeHue ||
    adjustments.orangeSaturation ||
    adjustments.yellowHue ||
    adjustments.yellowSaturation ||
    adjustments.greenHue ||
    adjustments.greenSaturation ||
    adjustments.aquaHue ||
    adjustments.aquaSaturation ||
    adjustments.blueHue ||
    adjustments.blueSaturation ||
    adjustments.purpleHue ||
    adjustments.purpleSaturation ||
    adjustments.magentaHue ||
    adjustments.magentaSaturation

  if (!hasColorAdjustments) return null

  // Define color ranges in degrees
  const colorRanges = [
    { name: "red", hue: 0, width: 30 },
    { name: "orange", hue: 30, width: 30 },
    { name: "yellow", hue: 60, width: 30 },
    { name: "green", hue: 120, width: 60 },
    { name: "aqua", hue: 180, width: 30 },
    { name: "blue", hue: 240, width: 60 },
    { name: "purple", hue: 300, width: 30 },
    { name: "magenta", hue: 330, width: 30 },
  ]

  // Create matrices for each color adjustment and combine them
  let resultMatrix: Matrix3x3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]

  colorRanges.forEach((range) => {
    const hueKey = `${range.name}Hue` as keyof XMPAdjustments
    const satKey = `${range.name}Saturation` as keyof XMPAdjustments
    const hue = adjustments[hueKey] as number
    const saturation = adjustments[satKey] as number

    if (hue || saturation) {
      const colorMatrix = calculateHueSaturationMatrix(hue, saturation)
      resultMatrix = multiplyMatrices(resultMatrix, colorMatrix)
    }
  })

  return resultMatrix
}

function createSplitToningMatrix(
  shadowHue: number,
  shadowSaturation: number,
  highlightHue: number,
  highlightSaturation: number,
  balance: number
): Matrix3x3 {
  // Convert hues to RGB colors
  const shadowColor = hueToRGB(shadowHue)
  const highlightColor = hueToRGB(highlightHue)

  // Adjust for saturation and balance
  const shadowStrength = (shadowSaturation / 100) * ((100 - balance) / 100)
  const highlightStrength = (highlightSaturation / 100) * (balance / 100)

  // Create matrix that applies shadows to dark areas and highlights to bright areas
  return [
    [
      1 + shadowColor.r * shadowStrength + highlightColor.r * highlightStrength,
      shadowColor.g * shadowStrength + highlightColor.g * highlightStrength,
      shadowColor.b * shadowStrength + highlightColor.b * highlightStrength,
    ],
    [
      shadowColor.r * shadowStrength + highlightColor.r * highlightStrength,
      1 + shadowColor.g * shadowStrength + highlightColor.g * highlightStrength,
      shadowColor.b * shadowStrength + highlightColor.b * highlightStrength,
    ],
    [
      shadowColor.r * shadowStrength + highlightColor.r * highlightStrength,
      shadowColor.g * shadowStrength + highlightColor.g * highlightStrength,
      1 + shadowColor.b * shadowStrength + highlightColor.b * highlightStrength,
    ],
  ]
}
