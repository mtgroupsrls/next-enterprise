import sharp from "sharp"
import { COLOR_RANGES } from "./constants"
import { findHistogramPeaks, smoothArray } from "./histogram-analysis"
import { ColorChannel, ColorDistribution, ColorRange, LabColor, SharpChannel } from "./types"

// Helper function to convert RGB to Lab color space
export function rgbToLab(r: number, g: number, b: number): LabColor {
  // Normalize RGB values
  let rr = r / 255
  let gg = g / 255
  let bb = b / 255

  // Convert to XYZ color space
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92

  const x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) * 100
  const y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722) * 100
  const z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) * 100

  // Convert XYZ to Lab
  const xn = 95.047
  const yn = 100.0
  const zn = 108.883

  const xxx = x / xn
  const yyy = y / yn
  const zzz = z / zn

  const fx = xxx > 0.008856 ? Math.pow(xxx, 1 / 3) : 7.787 * xxx + 16 / 116
  const fy = yyy > 0.008856 ? Math.pow(yyy, 1 / 3) : 7.787 * yyy + 16 / 116
  const fz = zzz > 0.008856 ? Math.pow(zzz, 1 / 3) : 7.787 * zzz + 16 / 116

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  }
}

export async function analyzeColorDistribution(buffer: Buffer, range: ColorRange): Promise<ColorDistribution> {
  try {
    const channelData = await Promise.all([
      sharp(buffer).extractChannel(0).raw().toBuffer(),
      sharp(buffer).extractChannel(1).raw().toBuffer(),
      sharp(buffer).extractChannel(2).raw().toBuffer(),
    ])

    const pixels: LabColor[] = []
    const histogram = new Array(360).fill(0)

    // Convert each pixel to Lab color space and analyze
    for (let i = 0; i < channelData[0].length; i++) {
      const r = channelData[0][i]
      const g = channelData[1][i]
      const b = channelData[2][i]

      if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
        const lab = rgbToLab(r, g, b)
        const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI + 180

        // Check if the hue falls within our target range
        let inRange = false
        if (range.start > range.end) {
          inRange = hue >= range.start || hue <= range.end
        } else {
          inRange = hue >= range.start && hue <= range.end
        }

        if (inRange) {
          pixels.push(lab)
          histogram[Math.floor(hue)]++
        }
      }
    }

    if (pixels.length === 0) {
      return {
        mean: { l: 0, a: 0, b: 0 },
        peaks: [],
        histogram,
        weight: 0,
      }
    }

    // Calculate mean Lab values
    const mean = pixels.reduce(
      (acc, lab) => ({
        l: acc.l + lab.l,
        a: acc.a + lab.a,
        b: acc.b + lab.b,
      }),
      { l: 0, a: 0, b: 0 }
    )

    mean.l /= pixels.length
    mean.a /= pixels.length
    mean.b /= pixels.length

    // Find peaks in the color distribution
    const smoothedHistogram = smoothArray(histogram)
    const histogramPeaks = findHistogramPeaks(smoothedHistogram)
    const peaks = histogramPeaks.map((peak) => {
      // Find representative Lab values for this peak
      const peakPixels = pixels.filter((lab) => {
        const hue = (Math.atan2(lab.b, lab.a) * 180) / Math.PI + 180
        return Math.abs(hue - peak.position) < peak.width / 2
      })

      if (peakPixels.length === 0) return mean

      const peakMean = peakPixels.reduce(
        (acc, lab) => ({
          l: acc.l + lab.l,
          a: acc.a + lab.a,
          b: acc.b + lab.b,
        }),
        { l: 0, a: 0, b: 0 }
      )

      peakMean.l /= peakPixels.length
      peakMean.a /= peakPixels.length
      peakMean.b /= peakPixels.length

      return peakMean
    })

    // Calculate weight based on pixel count and color intensity
    const weight = pixels.length / channelData[0].length

    return {
      mean,
      peaks,
      histogram,
      weight,
    }
  } catch (error) {
    console.error("Error in analyzeColorDistribution:", error)
    return {
      mean: { l: 0, a: 0, b: 0 },
      peaks: [],
      histogram: new Array(360).fill(0),
      weight: 0,
    }
  }
}

export async function calculateColorHue(color: ColorChannel, buffer: Buffer): Promise<number> {
  try {
    // Get full color distribution for this color range
    const colorRange = COLOR_RANGES[color]
    if (!colorRange) return 0

    const distribution = await analyzeColorDistribution(buffer, colorRange)

    if (distribution.weight === 0) return 0

    // Calculate weighted adjustment based on peaks and mean
    let totalAdjustment = 0
    let totalWeight = 0

    // Consider the mean
    const meanHue = (Math.atan2(distribution.mean.b, distribution.mean.a) * 180) / Math.PI + 180
    let meanHueDiff = meanHue - colorRange.center
    if (meanHueDiff > 180) meanHueDiff -= 360
    if (meanHueDiff < -180) meanHueDiff += 360

    const meanChroma = Math.sqrt(distribution.mean.a * distribution.mean.a + distribution.mean.b * distribution.mean.b)
    const meanWeight = Math.min(1, meanChroma / 128)

    totalAdjustment += meanHueDiff * meanWeight
    totalWeight += meanWeight

    // Consider each peak
    distribution.peaks.forEach((peak) => {
      const peakHue = (Math.atan2(peak.b, peak.a) * 180) / Math.PI + 180
      let peakHueDiff = peakHue - colorRange.center
      if (peakHueDiff > 180) peakHueDiff -= 360
      if (peakHueDiff < -180) peakHueDiff += 360

      const peakChroma = Math.sqrt(peak.a * peak.a + peak.b * peak.b)
      const peakWeight = Math.min(1, peakChroma / 128)

      totalAdjustment += peakHueDiff * peakWeight
      totalWeight += peakWeight
    })

    if (totalWeight === 0) return 0

    // Scale factor determines sensitivity of adjustment
    const scaleFactor = 0.75 * distribution.weight
    return Math.round((totalAdjustment / totalWeight) * scaleFactor)
  } catch (error) {
    console.error("Error in calculateColorHue:", error)
    return 0
  }
}

export async function calculateColorSaturation(color: ColorChannel, buffer: Buffer): Promise<number> {
  try {
    // Get full color distribution for this color range
    const colorRange = COLOR_RANGES[color]
    if (!colorRange) return 0

    const distribution = await analyzeColorDistribution(buffer, colorRange)

    if (distribution.weight === 0) return 0

    // Calculate weighted saturation adjustment based on peaks and mean
    let totalAdjustment = 0
    let totalWeight = 0

    // Consider the mean
    const meanChroma = Math.sqrt(distribution.mean.a * distribution.mean.a + distribution.mean.b * distribution.mean.b)
    const meanLuminanceWeight = 1 - Math.abs(distribution.mean.l - 50) / 50
    const meanWeight = meanLuminanceWeight * distribution.weight

    const targetChroma = 60
    const meanChromaDiff = meanChroma - targetChroma

    totalAdjustment += meanChromaDiff * meanWeight
    totalWeight += meanWeight

    // Consider each peak
    distribution.peaks.forEach((peak) => {
      const peakChroma = Math.sqrt(peak.a * peak.a + peak.b * peak.b)
      const peakLuminanceWeight = 1 - Math.abs(peak.l - 50) / 50
      const peakWeight = peakLuminanceWeight * distribution.weight

      const peakChromaDiff = peakChroma - targetChroma

      totalAdjustment += peakChromaDiff * peakWeight
      totalWeight += peakWeight
    })

    if (totalWeight === 0) return 0

    // Scale factor determines sensitivity of adjustment
    const scaleFactor = 1.25
    return Math.round((totalAdjustment / totalWeight) * scaleFactor)
  } catch (error) {
    console.error("Error in calculateColorSaturation:", error)
    return 0
  }
}

export function calculateColorTemperature(channels: SharpChannel[]): number {
  if (channels.length < 3) return 5500
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 5500
  const blueRatio = b.mean / ((r.mean + g.mean) / 2)
  return 5500 + (blueRatio - 1) * 1000
}

export function calculateTint(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 0
  const greenRatio = g.mean / ((r.mean + b.mean) / 2)
  return Math.round((greenRatio - 1) * 20)
}

export function calculateSaturation(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 0
  const maxChannel = Math.max(r.mean, g.mean, b.mean)
  const minChannel = Math.min(r.mean, g.mean, b.mean)
  return Math.round(((maxChannel - minChannel) / maxChannel) * 100)
}

export function calculateVibrance(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return 0
  const avgSaturation = calculateSaturation(channels)
  const maxChannel = Math.max(r.mean, g.mean, b.mean)
  const minChannel = Math.min(r.mean, g.mean, b.mean)
  const colorfulness = ((maxChannel - minChannel) / maxChannel) * 100
  return Math.round(colorfulness - avgSaturation)
}

export function calculateColorNoiseReduction(channels: SharpChannel[]): number {
  const colorNoise =
    channels.reduce((acc, channel) => {
      if (channel.stdev !== undefined) {
        return acc + channel.stdev
      }
      return acc
    }, 0) / channels.length
  return Math.round((colorNoise / 128) * 50)
}

export function calculateShadowTint(channels: SharpChannel[]): number {
  if (channels.length < 3) return 0
  const [r, g, b] = channels
  if (!r?.min || !g?.min || !b?.min) return 0
  const shadowColorBalance = (g.min / r.min + b.min / r.min) / 2
  return Math.round((shadowColorBalance - 1) * 20)
}

export function calculateVignetteAmount(channels: SharpChannel[]): number {
  const edgeDarkening =
    channels.reduce((acc, channel) => {
      if (channel.mean !== undefined && channel.min !== undefined) {
        const centerWeight = channel.mean
        const edgeWeight = channel.min
        return acc + (centerWeight - edgeWeight) / centerWeight
      }
      return acc
    }, 0) / channels.length
  return Math.round(edgeDarkening * 50)
}
