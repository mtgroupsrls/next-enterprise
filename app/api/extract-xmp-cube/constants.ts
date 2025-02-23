import { ColorChannel, ColorRange } from "./types"

export const COLOR_RANGES: Record<ColorChannel, ColorRange> = {
  red: { start: 345, end: 15, center: 0 },
  orange: { start: 15, end: 45, center: 30 },
  yellow: { start: 45, end: 75, center: 60 },
  green: { start: 75, end: 165, center: 120 },
  aqua: { start: 165, end: 195, center: 180 },
  blue: { start: 195, end: 255, center: 225 },
  purple: { start: 255, end: 285, center: 270 },
  magenta: { start: 285, end: 345, center: 315 },
}
