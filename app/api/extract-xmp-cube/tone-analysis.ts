import { getChannelHistogram, Histogram } from "./histogram-analysis"
import { SharpChannel } from "./types"

export interface TonePoint {
  input: number
  output: number
  weight: number
}

function findSignificantTonePointsFromHistogram(histogram: Histogram): TonePoint[] {
  const points: TonePoint[] = []

  // Always include anchor points
  points.push({ input: 0, output: 0, weight: 1 })
  points.push({ input: 255, output: 255, weight: 1 })

  // Add points based on histogram peaks
  histogram.peaks.forEach((peak) => {
    const input = peak.position
    let output = input

    // Adjust output based on histogram characteristics
    if (input < 128) {
      // For darker tones, apply more aggressive shadow recovery
      const shadowRecovery = Math.max(0, (128 - input) * 0.3)
      output = Math.max(0, input + shadowRecovery * (1 - peak.height))
    } else {
      // For brighter tones, apply highlight recovery
      const highlightRecovery = Math.max(0, (input - 128) * 0.2)
      output = Math.min(255, input - highlightRecovery * (1 - peak.height))
    }

    points.push({
      input,
      output,
      weight: peak.height,
    })

    // Add shoulder points for smoother transitions
    const shoulderWidth = peak.width
    if (input - shoulderWidth > 0) {
      points.push({
        input: input - shoulderWidth,
        output: output - shoulderWidth,
        weight: peak.height * 0.5,
      })
    }
    if (input + shoulderWidth < 255) {
      points.push({
        input: input + shoulderWidth,
        output: output + shoulderWidth,
        weight: peak.height * 0.5,
      })
    }
  })

  // Sort points by input value
  return points.sort((a, b) => a.input - b.input)
}

export function smoothToneCurve(points: TonePoint[]): number[][] {
  const result: number[][] = []

  // Calculate image characteristics for adaptive S-curve
  const meanBrightness = points.reduce((sum, p) => sum + p.input, 0) / points.length
  const contrastFactor = points.reduce((sum, p) => sum + Math.abs(p.input - meanBrightness), 0) / points.length
  const dynamicRange = Math.max(...points.map((p) => p.input)) - Math.min(...points.map((p) => p.input))

  // Determine S-curve strength based on image characteristics
  const sCurveStrength = Math.min(
    0.8,
    Math.max(
      0.2,
      0.4 + // base strength
        (contrastFactor / 128) * 0.2 + // contrast contribution
        (1 - dynamicRange / 255) * 0.2 // dynamic range contribution
    )
  )

  // Calculate complexity based on peaks and their weights
  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0)
  const weightedPoints = points.filter((point) => point.weight > 0.1)

  // Dynamic control points based on complexity
  const basePoints = 5
  const complexityFactor = Math.min((weightedPoints.length * totalWeight) / points.length, 3)
  const numPoints = Math.min(20, Math.max(5, Math.round(basePoints + complexityFactor * 5)))

  // Add shoulder points for smoother transitions in highlights and shadows
  const shoulderPoints: TonePoint[] = []
  const shadowThreshold = 64
  const highlightThreshold = 192

  points.forEach((point) => {
    if (point.input < shadowThreshold) {
      // Add shadow shoulder point
      const shoulderPos = point.input + point.weight * shadowThreshold
      shoulderPoints.push({
        input: shoulderPos,
        output: shoulderPos + (point.output - point.input) * 0.5,
        weight: point.weight * 0.5,
      })
    } else if (point.input > highlightThreshold) {
      // Add highlight shoulder point
      const shoulderPos = point.input - (255 - point.input) * point.weight
      shoulderPoints.push({
        input: shoulderPos,
        output: shoulderPos + (point.output - point.input) * 0.5,
        weight: point.weight * 0.5,
      })
    }
  })

  // Combine original points with shoulder points
  const allPoints = [...points, ...shoulderPoints].sort((a, b) => a.input - b.input)

  // Generate curve points with adaptive spacing
  for (let i = 0; i < numPoints; i++) {
    const position = (i / (numPoints - 1)) * 255

    let weightedSum = 0
    let totalWeight = 0

    // Calculate weighted influence with adaptive width
    allPoints.forEach((point) => {
      const distance = Math.abs(position - point.input)
      const sigma = (255 / (numPoints * 2)) * (1 + point.weight) // Adaptive width based on point weight
      const influence = Math.exp((-distance * distance) / (2 * sigma * sigma))
      const weight = point.weight * influence

      weightedSum += (point.output - point.input) * weight
      totalWeight += weight
    })

    const adjustment = totalWeight > 0 ? weightedSum / totalWeight : 0

    // Apply adaptive S-curve
    const normalizedPos = position / 255
    const sCurve = normalizedPos + sCurveStrength * Math.sin(Math.PI * normalizedPos)

    // Blend linear and S-curve based on position (more S-curve in midtones)
    const blendFactor = 4 * normalizedPos * (1 - normalizedPos) // Parabolic blend
    const blendedCurve = normalizedPos * (1 - blendFactor) + sCurve * blendFactor

    // Combine base adjustment with S-curve
    const output = Math.max(0, Math.min(255, position + adjustment + (blendedCurve - normalizedPos) * 255 * 0.1))

    result.push([Math.round(position), Math.round(output)])
  }

  return result
}

function calculateToneCurveFromPoints(channelPoints: TonePoint[][], channels: SharpChannel[]): number[][] {
  const defaultCurve: number[][] = [
    [0, 0],
    [255, 255],
  ]

  if (channels.length < 3) {
    return defaultCurve
  }

  // Validate all channels exist and have required properties
  if (
    !channels.every(
      (channel) =>
        channel &&
        typeof channel.mean === "number" &&
        typeof channel.stdev === "number" &&
        typeof channel.min === "number" &&
        typeof channel.max === "number"
    )
  ) {
    return defaultCurve
  }

  // Calculate luminance-weighted average of channels
  const luminanceWeights = [0.299, 0.587, 0.114] // RGB to luminance weights

  const luminancePoints = channelPoints.reduce((acc, points, index) => {
    const weight = luminanceWeights[index] || 0
    const weightedPoints = points.map((point) => ({
      input: point.input,
      output: point.output,
      weight: point.weight * weight,
    }))
    return acc.concat(weightedPoints)
  }, [] as TonePoint[])

  return smoothToneCurve(luminancePoints)
}

function calculateChannelToneCurveFromPoints(points: TonePoint[]): number[][] {
  return smoothToneCurve(points)
}

export async function calculateAllToneCurves(
  channels: SharpChannel[],
  buffer: Buffer
): Promise<{
  toneCurve: number[][]
  toneCurveRed: number[][]
  toneCurveGreen: number[][]
  toneCurveBlue: number[][]
}> {
  // Calculate histograms once
  const histograms = await Promise.all([
    getChannelHistogram(buffer, 0),
    getChannelHistogram(buffer, 1),
    getChannelHistogram(buffer, 2),
  ])

  // Use cached histograms for all calculations
  const channelPoints = histograms.map((histogram) => findSignificantTonePointsFromHistogram(histogram))

  // Ensure all channel points are defined
  if (!channelPoints[0] || !channelPoints[1] || !channelPoints[2]) {
    return {
      toneCurve: [
        [0, 0],
        [255, 255],
      ],
      toneCurveRed: [
        [0, 0],
        [255, 255],
      ],
      toneCurveGreen: [
        [0, 0],
        [255, 255],
      ],
      toneCurveBlue: [
        [0, 0],
        [255, 255],
      ],
    }
  }

  // Calculate curves using the points
  const toneCurve = calculateToneCurveFromPoints(channelPoints, channels)
  const toneCurveRed = calculateChannelToneCurveFromPoints(channelPoints[0])
  const toneCurveGreen = calculateChannelToneCurveFromPoints(channelPoints[1])
  const toneCurveBlue = calculateChannelToneCurveFromPoints(channelPoints[2])

  return { toneCurve, toneCurveRed, toneCurveGreen, toneCurveBlue }
}

// Keep these for backward compatibility
export async function calculateToneCurve(channels: SharpChannel[], buffer: Buffer): Promise<number[][]> {
  const { toneCurve } = await calculateAllToneCurves(channels, buffer)
  return toneCurve
}

export async function calculateChannelToneCurve(
  channel: SharpChannel,
  channelIndex: 0 | 1 | 2,
  buffer: Buffer
): Promise<number[][]> {
  const histogram = await getChannelHistogram(buffer, channelIndex)
  const points = findSignificantTonePointsFromHistogram(histogram)
  return calculateChannelToneCurveFromPoints(points)
}

export function calculateExposure(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 0
  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  return ((meanLuminance - 128) / 128) * 5
}

export function calculateContrast(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.stdev || !g?.stdev || !b?.stdev) return 0
  const stdDev = (r.stdev + g.stdev + b.stdev) / 3
  return Math.round((stdDev / 128) * 50)
}

export function calculateBrightness(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 0
  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  return Math.round((meanLuminance / 255) * 100)
}

export function calculateShadows(channels: SharpChannel[]): number {
  const shadowThreshold = 64
  const shadowValues = channels.map((channel) => {
    if (channel.mean !== undefined) {
      return channel.mean < shadowThreshold ? (shadowThreshold - channel.mean) / shadowThreshold : 0
    }
    return 0
  })
  return Math.round(Math.max(...shadowValues) * 50)
}

export function calculateHighlights(channels: SharpChannel[]): number {
  const highlightThreshold = 192
  const highlightValues = channels.map((channel) => {
    if (channel.mean !== undefined) {
      return channel.mean > highlightThreshold ? (channel.mean - highlightThreshold) / (255 - highlightThreshold) : 0
    }
    return 0
  })
  return Math.round(Math.max(...highlightValues) * 50)
}

export function calculateDehaze(channels: SharpChannel[]): number {
  const luminanceVariation =
    channels.reduce((acc, channel) => {
      if (channel.stdev !== undefined) {
        return acc + channel.stdev
      }
      return acc
    }, 0) / channels.length
  return Math.round((1 - luminanceVariation / 128) * 30)
}

export function calculateParametricShadows(channels: SharpChannel[]): number {
  const shadowIntensity =
    channels.reduce((acc, channel) => {
      if (channel.mean !== undefined) {
        return acc + (channel.mean < 64 ? channel.mean / 64 : 1)
      }
      return acc
    }, 0) / channels.length
  return Math.round((1 - shadowIntensity) * 25)
}

export function calculateParametricDarks(channels: SharpChannel[]): number {
  const darkIntensity =
    channels.reduce((acc, channel) => {
      if (channel.mean !== undefined) {
        return acc + (channel.mean < 96 ? channel.mean / 96 : 1)
      }
      return acc
    }, 0) / channels.length
  return Math.round((1 - darkIntensity) * 25)
}

export function calculateParametricLights(channels: SharpChannel[]): number {
  const lightIntensity =
    channels.reduce((acc, channel) => {
      if (channel.mean !== undefined) {
        return acc + (channel.mean > 160 ? (255 - channel.mean) / 95 : 1)
      }
      return acc
    }, 0) / channels.length
  return Math.round((1 - lightIntensity) * 25)
}

export function calculateParametricHighlights(channels: SharpChannel[]): number {
  const highlightIntensity =
    channels.reduce((acc, channel) => {
      if (channel.mean !== undefined) {
        return acc + (channel.mean > 192 ? (255 - channel.mean) / 63 : 1)
      }
      return acc
    }, 0) / channels.length
  return Math.round((1 - highlightIntensity) * 25)
}

export function calculateParametricShadowSplit(channels: SharpChannel[]): number {
  if (channels.length < 3) return 25
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 25
  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  // Adjust shadow split based on average luminance, range 15-35
  return Math.round(25 + (meanLuminance / 255 - 0.5) * 20)
}

export function calculateParametricMidtoneSplit(channels: SharpChannel[]): number {
  if (channels.length < 3) return 50
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 50
  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  // Adjust midtone split based on average luminance, range 40-60
  return Math.round(50 + (meanLuminance / 255 - 0.5) * 20)
}

export function calculateParametricHighlightSplit(channels: SharpChannel[]): number {
  if (channels.length < 3) return 75
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 75
  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  // Adjust highlight split based on average luminance, range 65-85
  return Math.round(75 + (meanLuminance / 255 - 0.5) * 20)
}

export function calculateToneMapStrength(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (
    !r?.mean ||
    !g?.mean ||
    !b?.mean ||
    !r?.max ||
    !g?.max ||
    !b?.max ||
    !r?.min ||
    !g?.min ||
    !b?.min ||
    !r?.stdev ||
    !g?.stdev ||
    !b?.stdev
  )
    return 0

  // Calculate dynamic range
  const maxLum = Math.max(r.max, g.max, b.max)
  const minLum = Math.min(r.min, g.min, b.min)
  const dynamicRange = maxLum - minLum

  // Calculate contrast variation
  const contrastVar = (r.stdev + g.stdev + b.stdev) / 3

  // Combine dynamic range and contrast for tone mapping strength
  // Scale to 0-100 range, higher for high dynamic range or high contrast images
  const strength = Math.round((dynamicRange / 255 + contrastVar / 128) * 50)

  return Math.min(Math.max(strength, 0), 100)
}

export function calculateSplitToningShadowHue(channels: SharpChannel[]): number {
  const shadowColors = channels.map((channel) => channel.min || 0)
  const dominantShadowChannel = shadowColors.indexOf(Math.max(...shadowColors))
  return Math.round((dominantShadowChannel / 3) * 360)
}

export function calculateSplitToningShadowSaturation(channels: SharpChannel[]): number {
  const shadowColors = channels.map((channel) => channel.min || 0)
  const maxShadow = Math.max(...shadowColors)
  const minShadow = Math.min(...shadowColors)
  return Math.round(((maxShadow - minShadow) / maxShadow) * 100)
}

export function calculateSplitToningHighlightHue(channels: SharpChannel[]): number {
  const highlightColors = channels.map((channel) => channel.max || 0)
  const dominantHighlightChannel = highlightColors.indexOf(Math.max(...highlightColors))
  return Math.round((dominantHighlightChannel / 3) * 360)
}

export function calculateSplitToningHighlightSaturation(channels: SharpChannel[]): number {
  const highlightColors = channels.map((channel) => channel.max || 0)
  const maxHighlight = Math.max(...highlightColors)
  const minHighlight = Math.min(...highlightColors)
  return Math.round(((maxHighlight - minHighlight) / maxHighlight) * 100)
}

export function calculateSplitToningBalance(channels: SharpChannel[]): number {
  const avgShadow = channels.reduce((acc, channel) => acc + (channel.min || 0), 0) / channels.length
  const avgHighlight = channels.reduce((acc, channel) => acc + (channel.max || 0), 0) / channels.length
  return Math.round(((avgHighlight - avgShadow) / 255) * 100)
}
