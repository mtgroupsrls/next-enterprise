import sharp from "sharp"
import type { BrushMask, BrushStroke, Circle, GradientMask, Point, RadialMask } from "./types"

export async function detectGradientAreas(buffer: Buffer): Promise<GradientMask[]> {
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0 } = metadata

  if (!width || !height) {
    return []
  }

  // Analyze image for potential gradient areas
  const gradients: GradientMask[] = []

  // Get luminance data
  const luminanceData = await sharp(buffer).greyscale().raw().toBuffer()

  // Analyze horizontal gradients
  const horizontalGradients = detectDirectionalGradients(luminanceData, width, height, "horizontal")
  gradients.push(...horizontalGradients)

  // Analyze vertical gradients
  const verticalGradients = detectDirectionalGradients(luminanceData, width, height, "vertical")
  gradients.push(...verticalGradients)

  return gradients
}

function detectDirectionalGradients(
  data: Buffer,
  width: number,
  height: number,
  direction: "horizontal" | "vertical"
): GradientMask[] {
  const gradients: GradientMask[] = []
  const samples = direction === "horizontal" ? width : height
  const sampleSize = direction === "horizontal" ? height : width

  // Analyze gradient strength in segments
  const segments = 10
  const segmentSize = Math.floor(samples / segments)

  for (let segment = 0; segment < segments; segment++) {
    const start = segment * segmentSize
    const end = start + segmentSize

    // Calculate average luminance for each position in the segment
    const luminanceProfile = new Array(segmentSize).fill(0)

    for (let pos = 0; pos < segmentSize; pos++) {
      let sum = 0
      for (let i = 0; i < sampleSize; i++) {
        const x = direction === "horizontal" ? start + pos : i
        const y = direction === "horizontal" ? i : start + pos
        const index = y * width + x
        const value = data[index]
        if (typeof value === "number") {
          sum += value
        }
      }
      luminanceProfile[pos] = sum / sampleSize
    }

    // Detect if there's a significant gradient
    const gradientStrength = calculateGradientStrength(luminanceProfile)
    if (gradientStrength > 0.2) {
      // Threshold for significant gradient
      const angle = direction === "horizontal" ? 0 : 90
      const startPoint = { x: direction === "horizontal" ? start : 0, y: direction === "horizontal" ? 0 : start }
      const endPoint = { x: direction === "horizontal" ? end : width, y: direction === "horizontal" ? height : end }

      gradients.push({
        type: "gradient",
        points: [startPoint, endPoint],
        feather: Math.floor(segmentSize * 0.2), // 20% feather
        opacity: gradientStrength,
        startPoint,
        endPoint,
        angle,
      })
    }
  }

  return gradients
}

function calculateGradientStrength(profile: number[]): number {
  // Calculate first derivative
  const derivatives = []
  for (let i = 1; i < profile.length; i++) {
    const current = profile[i]
    const previous = profile[i - 1]
    if (typeof current === "number" && typeof previous === "number") {
      derivatives.push(current - previous)
    }
  }

  if (derivatives.length === 0) return 0

  // Calculate average absolute derivative
  const avgDerivative = derivatives.reduce((sum, d) => sum + Math.abs(d), 0) / derivatives.length

  // Normalize to 0-1 range
  return Math.min(1, avgDerivative / 25.5) // Assuming 8-bit values (0-255)
}

export async function detectRadialAreas(buffer: Buffer): Promise<RadialMask[]> {
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0 } = metadata

  if (!width || !height) {
    return []
  }

  // Get edge data using Canny edge detection
  const edges = await sharp(buffer)
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    })
    .raw()
    .toBuffer()

  // Find circular patterns using a simplified Hough transform
  const circles = findCircularPatterns(edges, width, height)

  return circles.map(
    (circle): RadialMask => ({
      type: "radial",
      points: [], // Radial masks don't need points array
      feather: Math.floor(circle.radius * 0.2), // 20% feather
      opacity: circle.strength,
      center: circle.center,
      radius: circle.radius,
      aspectRatio: 1, // Default to circular
      angle: 0,
    })
  )
}

function getLocalEdgeStrength(edges: Buffer, x: number, y: number, width: number): number {
  const radius = 5
  let sum = 0
  let count = 0

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const index = (y + dy) * width + (x + dx)
      if (index >= 0 && index < edges.length) {
        const value = edges[index]
        if (typeof value === "number") {
          sum += value
          count++
        }
      }
    }
  }

  return count > 0 ? sum / (count * 255) : 0
}

function testCirclePattern(
  edges: Buffer,
  centerX: number,
  centerY: number,
  radius: number,
  width: number,
  height: number
): number {
  const samples = Math.floor(2 * Math.PI * radius)
  let matches = 0

  for (let i = 0; i < samples; i++) {
    const angle = (2 * Math.PI * i) / samples
    const x = Math.floor(centerX + radius * Math.cos(angle))
    const y = Math.floor(centerY + radius * Math.sin(angle))

    if (x >= 0 && x < width && y >= 0 && y < height) {
      const index = y * width + x
      const value = edges[index]
      if (typeof value === "number" && value > 128) {
        // Edge detected
        matches++
      }
    }
  }

  return matches / samples
}

function findCircularPatterns(edges: Buffer, width: number, height: number): Circle[] {
  const circles: Circle[] = []
  const minRadius = Math.min(width, height) * 0.1
  const maxRadius = Math.min(width, height) * 0.4

  // Simplified circle detection
  for (let y = 0; y < height; y += 10) {
    for (let x = 0; x < width; x += 10) {
      const edgeStrength = getLocalEdgeStrength(edges, x, y, width)
      if (edgeStrength > 0.3) {
        // Threshold for significant edge
        // Test different radii
        for (let r = minRadius; r <= maxRadius; r += 10) {
          const circleStrength = testCirclePattern(edges, x, y, r, width, height)
          if (circleStrength > 0.4) {
            // Threshold for circle detection
            circles.push({
              center: { x, y },
              radius: r,
              strength: circleStrength,
            })
          }
        }
      }
    }
  }

  return mergeOverlappingCircles(circles)
}

function mergeOverlappingCircles(circles: Circle[]): Circle[] {
  const merged: Circle[] = []
  const used = new Set<number>()

  for (let i = 0; i < circles.length; i++) {
    if (used.has(i)) continue

    const currentCircle = circles[i]
    if (!currentCircle) continue

    let current = { ...currentCircle }
    used.add(i)

    // Find overlapping circles
    for (let j = i + 1; j < circles.length; j++) {
      if (used.has(j)) continue

      const otherCircle = circles[j]
      if (!otherCircle) continue

      const distance = Math.sqrt(
        Math.pow(current.center.x - otherCircle.center.x, 2) + Math.pow(current.center.y - otherCircle.center.y, 2)
      )

      if (distance < (current.radius + otherCircle.radius) * 0.5) {
        // Merge circles
        current = {
          center: {
            x: (current.center.x + otherCircle.center.x) / 2,
            y: (current.center.y + otherCircle.center.y) / 2,
          },
          radius: (current.radius + otherCircle.radius) / 2,
          strength: Math.max(current.strength, otherCircle.strength),
        }
        used.add(j)
      }
    }

    merged.push(current)
  }

  return merged
}

export async function detectBrushAreas(buffer: Buffer): Promise<BrushMask[]> {
  const metadata = await sharp(buffer).metadata()
  const { width = 0, height = 0 } = metadata

  if (!width || !height) {
    return []
  }

  // Get edge data for detecting brush-like patterns
  const edges = await sharp(buffer)
    .greyscale()
    .convolve({
      width: 3,
      height: 3,
      kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    })
    .raw()
    .toBuffer()

  return findBrushPatterns(edges, width, height)
}

function findBrushPatterns(edges: Buffer, width: number, height: number): BrushMask[] {
  const brushMasks: BrushMask[] = []
  const visited = new Set<number>()

  // Scan for potential brush strokes
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const value = edges[index]
      if (typeof value === "number" && value > 128 && !visited.has(index)) {
        const stroke = traceBrushStroke(edges, x, y, width, height, visited)
        if (stroke.points.length > 10) {
          // Minimum length for a brush stroke
          brushMasks.push({
            type: "brush",
            points: stroke.points,
            feather: 5, // Default feather
            opacity: stroke.pressure.reduce((a, b) => a + b, 0) / stroke.pressure.length,
            strokes: [stroke],
            size: estimateBrushSize(stroke, edges, width),
            flow: 0.8, // Default flow
            density: 0.8, // Default density
          })
        }
      }
    }
  }

  return mergeSimilarBrushMasks(brushMasks)
}

function traceBrushStroke(
  edges: Buffer,
  startX: number,
  startY: number,
  width: number,
  height: number,
  visited: Set<number>
): BrushStroke {
  const points: Point[] = []
  const pressure: number[] = []
  const queue: [number, number][] = [[startX, startY]]

  while (queue.length > 0) {
    const [x, y] = queue.shift()!
    const index = y * width + x

    if (visited.has(index)) continue
    visited.add(index)

    points.push({ x, y })
    const value = edges[index]
    pressure.push(typeof value === "number" ? value / 255 : 0)

    // Check 8-connected neighbors
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue

        const nx = x + dx
        const ny = y + dy

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nIndex = ny * width + nx
          const nValue = edges[nIndex]
          if (typeof nValue === "number" && nValue > 128 && !visited.has(nIndex)) {
            queue.push([nx, ny])
          }
        }
      }
    }
  }

  return { points, pressure }
}

function estimateBrushSize(stroke: BrushStroke, edges: Buffer, width: number): number {
  let maxWidth = 0

  // Sample points along the stroke
  for (let i = 0; i < stroke.points.length; i += 5) {
    const point = stroke.points[i]
    if (!point) continue

    let localWidth = 0

    // Scan perpendicular to stroke direction
    const prevPoint = i > 0 ? stroke.points[i - 1] : null
    const dx = prevPoint ? point.x - prevPoint.x : 0
    const dy = prevPoint ? point.y - prevPoint.y : 1
    const perpX = -dy
    const perpY = dx

    // Normalize perpendicular vector
    const length = Math.sqrt(perpX * perpX + perpY * perpY)
    const normX = perpX / length
    const normY = perpY / length

    // Scan in both directions
    for (let d = 1; d < 20; d++) {
      const x = Math.floor(point.x + d * normX)
      const y = Math.floor(point.y + d * normY)
      const index = y * width + x
      const value = edges[index]
      if (typeof value === "number" && value < 128) {
        localWidth = d
        break
      }
    }

    maxWidth = Math.max(maxWidth, localWidth * 2) // Both sides
  }

  return maxWidth
}

function mergeSimilarBrushMasks(masks: BrushMask[]): BrushMask[] {
  const merged: BrushMask[] = []
  const used = new Set<number>()

  for (let i = 0; i < masks.length; i++) {
    if (used.has(i)) continue

    const currentMask = masks[i]
    if (!currentMask) continue

    let current = { ...currentMask }
    used.add(i)

    // Find similar brush masks
    for (let j = i + 1; j < masks.length; j++) {
      if (used.has(j)) continue

      const otherMask = masks[j]
      if (!otherMask) continue

      if (areBrushMasksSimilar(current, otherMask)) {
        // Merge masks
        current = mergeBrushMasks(current, otherMask)
        used.add(j)
      }
    }

    merged.push(current)
  }

  return merged
}

function areBrushMasksSimilar(a: BrushMask, b: BrushMask): boolean {
  // Check if brush sizes are similar
  if (Math.abs(a.size - b.size) > 5) return false

  // Check if any points are close
  for (const strokeA of a.strokes) {
    for (const strokeB of b.strokes) {
      for (const pointA of strokeA.points) {
        for (const pointB of strokeB.points) {
          const distance = Math.sqrt(Math.pow(pointA.x - pointB.x, 2) + Math.pow(pointA.y - pointB.y, 2))
          if (distance < a.size * 2) return true
        }
      }
    }
  }

  return false
}

function mergeBrushMasks(a: BrushMask, b: BrushMask): BrushMask {
  return {
    type: "brush",
    points: [...a.points, ...b.points],
    feather: Math.max(a.feather, b.feather),
    opacity: Math.max(a.opacity, b.opacity),
    strokes: [...a.strokes, ...b.strokes],
    size: Math.max(a.size, b.size),
    flow: Math.max(a.flow, b.flow),
    density: Math.max(a.density, b.density),
  }
}
