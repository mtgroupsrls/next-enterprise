import { Matrix3x3 } from "sharp"
import { LabColor } from "./types"

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

export function convertToneCurveToMatrix(curve: number[][] | undefined): [number, number, number] {
  if (!curve || curve.length < 2) {
    return [1, 0, 0] // Identity matrix for no adjustment
  }

  // Convert tone curve to a 3x3 matrix approximation
  // This is a simplified conversion - in reality, we'd need more complex curve fitting
  const firstPoint = curve[0]
  const lastPoint = curve[curve.length - 1]

  if (!firstPoint?.[0] || !firstPoint?.[1] || !lastPoint?.[0] || !lastPoint?.[1]) {
    return [1, 0, 0] // Identity matrix for invalid points
  }

  const avgSlope = (lastPoint[1] - firstPoint[1]) / (lastPoint[0] - firstPoint[0])
  return [avgSlope, 0, 0]
}

// Add shared matrix operations
export function createShadowHighlightMatrix(shadows: number, highlights: number): Matrix3x3 {
  // Create a matrix that enhances shadows and highlights separately
  const shadowGain = Math.pow(2, shadows / 100)
  const highlightGain = Math.pow(2, -highlights / 100)
  const midtoneBalance = 1 - (shadowGain + highlightGain) / 2

  return [
    [shadowGain, midtoneBalance, highlightGain],
    [shadowGain, midtoneBalance, highlightGain],
    [shadowGain, midtoneBalance, highlightGain],
  ]
}

export function calculateHueSaturationMatrix(hue: number, saturation: number): Matrix3x3 {
  // Convert hue to radians and calculate color rotation matrix
  const hueRad = (hue * Math.PI) / 180
  const cosH = Math.cos(hueRad)
  const sinH = Math.sin(hueRad)
  const satFactor = 1 + saturation / 100

  // Matrix that preserves luminance while adjusting hue and saturation
  return [
    [
      0.213 + cosH * 0.787 * satFactor,
      0.213 - cosH * 0.213 * satFactor + sinH * 0.143,
      0.213 - cosH * 0.213 * satFactor - sinH * 0.787,
    ],
    [
      0.715 - cosH * 0.715 * satFactor - sinH * 0.715,
      0.715 + cosH * 0.285 * satFactor,
      0.715 - cosH * 0.715 * satFactor + sinH * 0.715,
    ],
    [
      0.072 - cosH * 0.072 * satFactor + sinH * 0.928,
      0.072 - cosH * 0.072 * satFactor - sinH * 0.283,
      0.072 + cosH * 0.928 * satFactor,
    ],
  ]
}

export function multiplyMatrices(a: Matrix3x3, b: Matrix3x3): Matrix3x3 {
  return [
    [
      a[0][0] * b[0][0] + a[0][1] * b[1][0] + a[0][2] * b[2][0],
      a[0][0] * b[0][1] + a[0][1] * b[1][1] + a[0][2] * b[2][1],
      a[0][0] * b[0][2] + a[0][1] * b[1][2] + a[0][2] * b[2][2],
    ],
    [
      a[1][0] * b[0][0] + a[1][1] * b[1][0] + a[1][2] * b[2][0],
      a[1][0] * b[0][1] + a[1][1] * b[1][1] + a[1][2] * b[2][1],
      a[1][0] * b[0][2] + a[1][1] * b[1][2] + a[1][2] * b[2][2],
    ],
    [
      a[2][0] * b[0][0] + a[2][1] * b[1][0] + a[2][2] * b[2][0],
      a[2][0] * b[0][1] + a[2][1] * b[1][1] + a[2][2] * b[2][1],
      a[2][0] * b[0][2] + a[2][1] * b[1][2] + a[2][2] * b[2][2],
    ],
  ]
}

// Add shared color conversion functions
export function hueToRGB(hue: number): { r: number; g: number; b: number } {
  const h = (((hue % 360) + 360) % 360) / 60
  const c = 1 // Chroma
  const x = c * (1 - Math.abs((h % 2) - 1))

  let r = 0
  let g = 0
  let b = 0

  if (h >= 0 && h < 1) {
    r = c
    g = x
    b = 0
  } else if (h >= 1 && h < 2) {
    r = x
    g = c
    b = 0
  } else if (h >= 2 && h < 3) {
    r = 0
    g = c
    b = x
  } else if (h >= 3 && h < 4) {
    r = 0
    g = x
    b = c
  } else if (h >= 4 && h < 5) {
    r = x
    g = 0
    b = c
  } else if (h >= 5 && h <= 6) {
    r = c
    g = 0
    b = x
  }

  return { r, g, b }
}

// Add shared curve generation functions
export function createParametricCurve(adjustments: {
  parametricShadows?: number
  parametricDarks?: number
  parametricLights?: number
  parametricHighlights?: number
  parametricShadowSplit?: number
  parametricMidtoneSplit?: number
  parametricHighlightSplit?: number
}): number[][] {
  const {
    parametricShadows = 0,
    parametricDarks = 0,
    parametricLights = 0,
    parametricHighlights = 0,
    parametricShadowSplit = 25,
    parametricMidtoneSplit = 50,
    parametricHighlightSplit = 75,
  } = adjustments

  // Create a direct mapping function for the curve
  function mapValue(x: number): number {
    let y = x

    // Apply adjustments based on the region
    if (x <= parametricShadowSplit) {
      // Shadows region
      const strength = parametricShadows / 100
      y += x * strength
    } else if (x <= parametricMidtoneSplit) {
      // Darks region
      const t = (x - parametricShadowSplit) / (parametricMidtoneSplit - parametricShadowSplit)
      const strength = parametricDarks / 100
      y += x * strength * (1 - t)
    } else if (x <= parametricHighlightSplit) {
      // Lights region
      const t = (x - parametricMidtoneSplit) / (parametricHighlightSplit - parametricMidtoneSplit)
      const strength = parametricLights / 100
      y += x * strength * t
    } else {
      // Highlights region
      const strength = parametricHighlights / 100
      y += x * strength
    }

    // Ensure y stays within bounds
    return Math.max(0, Math.min(255, Math.round(y)))
  }

  // Create curve points at key positions
  return [
    [0, mapValue(0)],
    [parametricShadowSplit, mapValue(parametricShadowSplit)],
    [parametricMidtoneSplit, mapValue(parametricMidtoneSplit)],
    [parametricHighlightSplit, mapValue(parametricHighlightSplit)],
    [255, mapValue(255)],
  ]
}

// Add shared SVG generation functions
export function createVignetteSVG(
  width: number,
  height: number,
  amount: number,
  feather: number,
  midpoint: number
): string {
  return `
    <svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="vignette" cx="50%" cy="50%" r="${midpoint}%">
          <stop offset="0%" stop-color="white" stop-opacity="1"/>
          <stop offset="${feather}%" stop-color="black" stop-opacity="${Math.abs(amount) / 100}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#vignette)"/>
    </svg>
  `
}

export function createNoiseSVG(width: number, height: number, amount: number, size: number, frequency: number): string {
  return `
    <svg width="${width}" height="${height}">
      <filter id="noise">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="${frequency * 0.1}"
          numOctaves="${Math.round(size)}"
          seed="${Math.random() * 100}"
        />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" opacity="${amount}"/>
    </svg>
  `
}
