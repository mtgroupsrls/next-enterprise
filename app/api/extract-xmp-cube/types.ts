import { ImageProperties } from "../shared/types"

export interface LabColor {
  l: number
  a: number
  b: number
}

export interface SharpChannel {
  mean?: number
  stdev?: number
  min?: number
  max?: number
}

export type ColorChannel = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta"

export interface ColorRange {
  start: number // Hue range start (0-360)
  end: number // Hue range end (0-360)
  center: number // Center hue value
}

export interface Point {
  x: number
  y: number
}

export interface LocalAdjustment {
  type: "gradient" | "radial" | "brush"
  mask: Mask
  adjustments: Record<string, number>
}

export interface Mask {
  points: Point[]
  feather: number
  opacity: number
}

export interface GradientMask extends Mask {
  type: "gradient"
  startPoint: Point
  endPoint: Point
  angle: number
}

export interface RadialMask extends Mask {
  type: "radial"
  center: Point
  radius: number
  aspectRatio: number
  angle: number
}

export interface BrushMask extends Mask {
  type: "brush"
  strokes: BrushStroke[]
  size: number
  flow: number
  density: number
}

export interface BrushStroke {
  points: Point[]
  pressure: number[]
}

export interface Circle {
  center: Point
  radius: number
  strength: number
}

export interface ColorDistribution {
  mean: LabColor
  peaks: LabColor[]
  histogram: number[]
  weight: number
}

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

export interface TonePoint {
  input: number
  output: number
  weight: number
}

// Re-export ImageProperties from shared/types
export type { ImageProperties }
