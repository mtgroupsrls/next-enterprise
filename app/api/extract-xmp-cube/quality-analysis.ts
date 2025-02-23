import sharp from "sharp"
import { SharpChannel } from "./types"

export function calculateSharpness(metadata: sharp.Metadata): number {
  return metadata.density ? Math.min(Math.round(metadata.density / 100), 100) : 40
}

export function calculateLuminanceSmoothing(channels: SharpChannel[]): number {
  const luminanceVariation =
    channels.reduce((acc, channel) => {
      if (channel.stdev !== undefined) {
        return acc + channel.stdev
      }
      return acc
    }, 0) / channels.length
  return Math.round((luminanceVariation / 128) * 50)
}

export function calculateClarity(channels: SharpChannel[]): number {
  const midtoneContrast =
    channels.reduce((acc, channel) => {
      if (channel.stdev !== undefined) {
        return acc + channel.stdev
      }
      return acc
    }, 0) / channels.length
  return Math.round((midtoneContrast / 128) * 30)
}

export function calculateTexture(channels: SharpChannel[]): number {
  const detailLevel =
    channels.reduce((acc, channel) => {
      if (channel.stdev !== undefined) {
        return acc + channel.stdev
      }
      return acc
    }, 0) / channels.length
  return Math.round((detailLevel / 128) * 40)
}
