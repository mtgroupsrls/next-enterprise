import sharp from "sharp"

export interface HistogramPeak {
  position: number
  height: number
  width: number
}

export interface Histogram {
  counts: number[]
  total: number
  mean: number
  stdev: number
  peaks: HistogramPeak[]
}

export interface HistogramStats {
  mean: number
  stdev: number
  min: number
  max: number
  peaks: HistogramPeak[]
}

export function smoothArray(arr: number[], sigma: number = 2): number[] {
  const windowSize = Math.ceil(sigma * 6)
  const result = new Array(arr.length).fill(0)

  for (let i = 0; i < arr.length; i++) {
    let sum = 0
    let weightSum = 0

    for (let j = Math.max(0, i - windowSize); j <= Math.min(arr.length - 1, i + windowSize); j++) {
      const value = arr[j]
      if (typeof value === "number" && !isNaN(value)) {
        const distance = i - j
        const weight = Math.exp(-(distance * distance) / (2 * sigma * sigma))
        sum += value * weight
        weightSum += weight
      }
    }

    result[i] = weightSum > 0 ? sum / weightSum : 0
  }

  return result
}

export function findHistogramPeaks(histogram: number[], mean?: number, stdev?: number): HistogramPeak[] {
  const peaks: HistogramPeak[] = []
  const validHistogram = histogram.filter((h): h is number => typeof h === "number" && !isNaN(h))
  const maxHeight = Math.max(...validHistogram)
  const minPeakHeight = maxHeight * 0.01 // 1% of max height threshold

  // If mean and stdev are provided, use derivative analysis
  if (typeof mean === "number" && typeof stdev === "number") {
    // Calculate first and second derivatives
    const firstDerivative = new Array(histogram.length - 1)
    const secondDerivative = new Array(histogram.length - 2)

    for (let i = 0; i < histogram.length - 1; i++) {
      const current = histogram[i]
      const next = histogram[i + 1]
      firstDerivative[i] = typeof current === "number" && typeof next === "number" ? next - current : 0
    }

    for (let i = 0; i < histogram.length - 2; i++) {
      const current = firstDerivative[i]
      const next = firstDerivative[i + 1]
      secondDerivative[i] = typeof current === "number" && typeof next === "number" ? next - current : 0
    }

    // Find peaks using derivative analysis
    for (let i = 1; i < histogram.length - 1; i++) {
      const current = histogram[i]
      if (
        typeof current === "number" &&
        !isNaN(current) &&
        current > minPeakHeight &&
        typeof firstDerivative[i - 1] === "number" &&
        typeof firstDerivative[i] === "number" &&
        firstDerivative[i - 1] > 0 &&
        firstDerivative[i] < 0
      ) {
        // Calculate peak width using zero crossings of second derivative
        let leftWidth = 0
        let rightWidth = 0

        for (let j = i - 1; j >= 0; j--) {
          if (typeof secondDerivative[j] === "number" && secondDerivative[j] > 0) {
            leftWidth = i - j
            break
          }
        }

        for (let j = i; j < secondDerivative.length; j++) {
          if (typeof secondDerivative[j] === "number" && secondDerivative[j] > 0) {
            rightWidth = j - i
            break
          }
        }

        const width = Math.max(leftWidth, rightWidth) * 2

        // Calculate significance based on distance from mean
        const distanceFromMean = Math.abs(i - mean)
        const significance = (current / maxHeight) * Math.exp(-0.5 * Math.pow(distanceFromMean / stdev, 2))

        if (significance > 0.1) {
          // Only include significant peaks
          peaks.push({
            position: i,
            height: current / maxHeight,
            width: width,
          })
        }
      }
    }
  } else {
    // Use simpler peak detection for cases without mean/stdev
    for (let i = 1; i < histogram.length - 1; i++) {
      const current = histogram[i]
      const prev = histogram[i - 1]
      const next = histogram[i + 1]

      if (
        typeof current === "number" &&
        typeof prev === "number" &&
        typeof next === "number" &&
        !isNaN(current) &&
        !isNaN(prev) &&
        !isNaN(next) &&
        current > minPeakHeight &&
        current > prev &&
        current > next
      ) {
        // Calculate peak width using standard deviation of local region
        let localSum = 0
        let localCount = 0
        const localWindow = 10

        for (let j = Math.max(0, i - localWindow); j <= Math.min(histogram.length - 1, i + localWindow); j++) {
          const value = histogram[j]
          if (typeof value === "number" && !isNaN(value)) {
            localSum += j * value
            localCount += value
          }
        }

        if (localCount > 0) {
          const localMean = localSum / localCount
          let localVariance = 0

          for (let j = Math.max(0, i - localWindow); j <= Math.min(histogram.length - 1, i + localWindow); j++) {
            const value = histogram[j]
            if (typeof value === "number" && !isNaN(value)) {
              localVariance += value * Math.pow(j - localMean, 2)
            }
          }

          const peakWidth = Math.sqrt(localVariance / localCount)

          peaks.push({
            position: i,
            height: current / maxHeight,
            width: peakWidth,
          })
        }
      }
    }
  }

  return peaks
}

export function calculateHistogramStats(histogram: number[]): HistogramStats {
  let sum = 0
  let count = 0
  let min = Infinity
  let max = -Infinity

  // Calculate basic statistics
  histogram.forEach((value) => {
    if (typeof value === "number" && !isNaN(value)) {
      sum += value
      count++
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  })

  const mean = count > 0 ? sum / count : 0

  // Calculate standard deviation
  let variance = 0
  histogram.forEach((value) => {
    if (typeof value === "number" && !isNaN(value)) {
      variance += Math.pow(value - mean, 2)
    }
  })
  const stdev = count > 0 ? Math.sqrt(variance / count) : 0

  return {
    mean,
    stdev,
    min: min === Infinity ? 0 : min,
    max: max === -Infinity ? 0 : max,
    peaks: findHistogramPeaks(histogram),
  }
}

export async function getChannelHistogram(buffer: Buffer, channelIndex: 0 | 1 | 2): Promise<Histogram> {
  // Get channel statistics from sharp
  const stats = await sharp(buffer).stats()

  if (!stats.channels || stats.channels.length <= channelIndex) {
    throw new Error(`Invalid channel index: ${channelIndex}`)
  }

  const channelStats = stats.channels[channelIndex]
  if (!channelStats) {
    throw new Error(`No statistics available for channel ${channelIndex}`)
  }

  // Extract raw channel data for detailed histogram
  const channelData = await sharp(buffer).extractChannel(channelIndex).raw().toBuffer()

  const counts = new Array(256).fill(0)
  let sum = 0
  let sumSquares = 0
  const total = channelData.length

  // Build histogram and calculate statistics
  for (let i = 0; i < channelData.length; i++) {
    const value = channelData[i]
    if (typeof value === "number" && value >= 0 && value < 256) {
      counts[value]++
      sum += value
      sumSquares += value * value
    }
  }

  // Use sharp's statistics for more accurate mean and standard deviation
  const mean = typeof channelStats.mean === "number" ? channelStats.mean : sum / total
  const stdev =
    typeof channelStats.stdev === "number" ? channelStats.stdev : Math.sqrt(sumSquares / total - mean * mean)

  // Smooth histogram for peak detection
  const smoothedCounts = smoothArray(counts)

  // Find peaks using smoothed histogram
  const peaks = findHistogramPeaks(smoothedCounts, mean, stdev)

  return {
    counts,
    total,
    mean,
    stdev,
    peaks: peaks.sort((a, b) => b.height - a.height), // Sort by height descending
  }
}
