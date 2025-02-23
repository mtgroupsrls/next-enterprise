import { exiftool, Tags } from "exiftool-vendored"
import { XMLParser } from "fast-xml-parser"
import sharp from "sharp"
import { create } from "xmlbuilder2"
import { mkdtemp, rm, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import { calculateContrast } from "./tone-analysis"
import { ImageProperties, SharpChannel } from "./types"
import { XMPRoot } from "../shared/xml-parser"

// Private interfaces
interface ExifData {
  Make?: string
  Model?: string
  WhiteBalance?: string
  ISOSpeedRatings?: number
  ExposureTime?: number
  FNumber?: number
  FocalLength?: number
  OriginalWidth?: number
  OriginalHeight?: number
}

interface CameraProfileSet {
  default: string
  profiles: string[]
}

// Common camera profiles - private constant
const CAMERA_PROFILES: Record<string, CameraProfileSet> = {
  "NIKON CORPORATION": {
    default: "Camera Neutral",
    profiles: [
      "Camera Neutral",
      "Camera Vivid",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Flat",
      "Camera Standard",
      "Camera Monochrome",
    ],
  },
  CANON: {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Neutral",
      "Camera Faithful",
      "Camera Fine Detail",
      "Camera Monochrome",
    ],
  },
  SONY: {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Clear",
      "Camera Deep",
      "Camera Light",
      "Camera Vivid",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Night Scene",
      "Camera Sunset",
    ],
  },
  FUJIFILM: {
    default: "Camera Provia/Standard",
    profiles: [
      "Camera Provia/Standard",
      "Camera Velvia/Vivid",
      "Camera Astia/Soft",
      "Camera Classic Chrome",
      "Camera Pro Neg Hi",
      "Camera Pro Neg Std",
      "Camera Acros",
      "Camera Monochrome",
      "Camera Sepia",
    ],
  },
  OLYMPUS: {
    default: "Camera Natural",
    profiles: [
      "Camera Natural",
      "Camera Vivid",
      "Camera Muted",
      "Camera Portrait",
      "Camera Monotone",
      "Camera e-Portrait",
    ],
  },
  PANASONIC: {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Vivid",
      "Camera Natural",
      "Camera Scenery",
      "Camera Portrait",
      "Camera Monochrome",
      "Camera L.Monochrome",
    ],
  },
  PENTAX: {
    default: "Camera Natural",
    profiles: [
      "Camera Natural",
      "Camera Bright",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Vibrant",
      "Camera Radiant",
      "Camera Monochrome",
    ],
  },
  LEICA: {
    default: "Camera Standard",
    profiles: ["Camera Standard", "Camera Vivid", "Camera Natural", "Camera B&W Natural", "Camera B&W High Contrast"],
  },
  HASSELBLAD: {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Vivid",
      "Camera Natural",
      "Camera Portrait",
      "Camera Landscape",
      "Camera B&W",
    ],
  },
  "PHASE ONE": {
    default: "Camera Standard",
    profiles: [
      "Camera Standard",
      "Camera Vivid",
      "Camera Portrait",
      "Camera Landscape",
      "Camera Film Standard",
      "Camera Film High Contrast",
    ],
  },
}

export async function parseExifData(metadata: sharp.Metadata): Promise<ExifData> {
  const exif = metadata.exif
  if (!exif) {
    console.log("No EXIF data found in image")
    return {}
  }

  let tmpDir = ""
  try {
    const buffer = exif instanceof Buffer ? exif : Buffer.from(exif)
    tmpDir = await mkdtemp(path.join(os.tmpdir(), "exif-"))
    const tmpFile = path.join(tmpDir, "temp.jpg")
    await writeFile(tmpFile, buffer)

    const tags = (await exiftool.read(tmpFile)) as Tags
    console.log("Extracted EXIF tags:", Object.keys(tags).join(", "))

    return {
      Make: tags.Make,
      Model: tags.Model,
      WhiteBalance: tags.WhiteBalance,
      ISOSpeedRatings: typeof tags.ISO === "string" ? parseInt(tags.ISO, 10) : tags.ISO,
      ExposureTime: typeof tags.ExposureTime === "string" ? parseFloat(tags.ExposureTime) : tags.ExposureTime,
      FNumber: typeof tags.FNumber === "string" ? parseFloat(tags.FNumber) : tags.FNumber,
      FocalLength: typeof tags.FocalLength === "string" ? parseFloat(tags.FocalLength) : tags.FocalLength,
      OriginalWidth: tags.ImageWidth || metadata.width,
      OriginalHeight: tags.ImageHeight || metadata.height,
    }
  } catch (error) {
    console.error("Error parsing EXIF data:", error)
    if (error instanceof Error) {
      console.error("Error details:", error.message)
    }
    return {}
  } finally {
    if (tmpDir) {
      try {
        await rm(tmpDir, { recursive: true, force: true })
      } catch (cleanupError) {
        console.error("Error cleaning up temporary directory:", cleanupError)
      }
    }
  }
}

export function parseToneCurve(curve: Record<string, unknown> | undefined): number[][] | undefined {
  if (!curve || !curve["rdf:Seq"] || typeof curve["rdf:Seq"] !== "object") return undefined

  const seq = curve["rdf:Seq"] as Record<string, unknown>
  const points = seq["rdf:li"]

  if (!points) return undefined

  const pointArray = Array.isArray(points) ? points : [points]

  const validPoints = pointArray
    .map((point) => {
      if (typeof point !== "string") return null
      const [x, y] = point.split(",").map((n) => {
        const num = parseFloat(n.trim())
        return isNaN(num) ? null : num
      })
      return x !== null && y !== null ? [x, y] : null
    })
    .filter((point): point is [number, number] => point !== null)

  return validPoints.length > 0 ? validPoints : undefined
}

export async function parseXMPData(
  metadata: sharp.Metadata
): Promise<Record<string, string | number | boolean | unknown>> {
  const xmp = metadata.xmp
  if (!xmp) return {}

  try {
    const xmpString = xmp instanceof Buffer ? xmp.toString() : xmp
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      textNodeName: "_text",
      parseAttributeValue: true,
      parseTagValue: true,
    })
    const result = parser.parse(xmpString) as XMPRoot
    const crs = result?.["x:xmpmeta"]?.["rdf:RDF"]?.["rdf:Description"] as Record<string, unknown>
    if (!crs) return {}

    // Map CRS properties to our format
    return {
      WhiteBalance: String(crs["crs:WhiteBalance"] || ""),
      Temperature: parseFloat(String(crs["crs:Temperature"] || "0")),
      Tint: parseFloat(String(crs["crs:Tint"] || "0")),
      Exposure: parseFloat(String(crs["crs:Exposure2012"] || "0")),
      Contrast: parseFloat(String(crs["crs:Contrast2012"] || "0")),
      Highlights: parseFloat(String(crs["crs:Highlights2012"] || "0")),
      Shadows: parseFloat(String(crs["crs:Shadows2012"] || "0")),
      Clarity: parseFloat(String(crs["crs:Clarity2012"] || "0")),
      Dehaze: parseFloat(String(crs["crs:Dehaze"] || "0")),
      Vibrance: parseFloat(String(crs["crs:Vibrance"] || "0")),
      Saturation: parseFloat(String(crs["crs:Saturation"] || "0")),
      ParametricShadows: parseFloat(String(crs["crs:ParametricShadows"] || "0")),
      ParametricDarks: parseFloat(String(crs["crs:ParametricDarks"] || "0")),
      ParametricLights: parseFloat(String(crs["crs:ParametricLights"] || "0")),
      ParametricHighlights: parseFloat(String(crs["crs:ParametricHighlights"] || "0")),
      ParametricShadowSplit: parseFloat(String(crs["crs:ParametricShadowSplit"] || "0")),
      ParametricMidtoneSplit: parseFloat(String(crs["crs:ParametricMidtoneSplit"] || "0")),
      ParametricHighlightSplit: parseFloat(String(crs["crs:ParametricHighlightSplit"] || "0")),
      Sharpness: parseFloat(String(crs["crs:Sharpness"] || "0")),
      LuminanceSmoothing: parseFloat(String(crs["crs:LuminanceSmoothing"] || "0")),
      ColorNoiseReduction: parseFloat(String(crs["crs:ColorNoiseReduction"] || "0")),
      HueAdjustmentRed: parseFloat(String(crs["crs:HueAdjustmentRed"] || "0")),
      HueAdjustmentOrange: parseFloat(String(crs["crs:HueAdjustmentOrange"] || "0")),
      HueAdjustmentYellow: parseFloat(String(crs["crs:HueAdjustmentYellow"] || "0")),
      HueAdjustmentGreen: parseFloat(String(crs["crs:HueAdjustmentGreen"] || "0")),
      HueAdjustmentAqua: parseFloat(String(crs["crs:HueAdjustmentAqua"] || "0")),
      HueAdjustmentBlue: parseFloat(String(crs["crs:HueAdjustmentBlue"] || "0")),
      HueAdjustmentPurple: parseFloat(String(crs["crs:HueAdjustmentPurple"] || "0")),
      HueAdjustmentMagenta: parseFloat(String(crs["crs:HueAdjustmentMagenta"] || "0")),
      SaturationAdjustmentRed: parseFloat(String(crs["crs:SaturationAdjustmentRed"] || "0")),
      SaturationAdjustmentOrange: parseFloat(String(crs["crs:SaturationAdjustmentOrange"] || "0")),
      SaturationAdjustmentYellow: parseFloat(String(crs["crs:SaturationAdjustmentYellow"] || "0")),
      SaturationAdjustmentGreen: parseFloat(String(crs["crs:SaturationAdjustmentGreen"] || "0")),
      SaturationAdjustmentAqua: parseFloat(String(crs["crs:SaturationAdjustmentAqua"] || "0")),
      SaturationAdjustmentBlue: parseFloat(String(crs["crs:SaturationAdjustmentBlue"] || "0")),
      SaturationAdjustmentPurple: parseFloat(String(crs["crs:SaturationAdjustmentPurple"] || "0")),
      SaturationAdjustmentMagenta: parseFloat(String(crs["crs:SaturationAdjustmentMagenta"] || "0")),
      HasCrop: String(crs["crs:HasCrop"]) === "True",
      CropTop: parseFloat(String(crs["crs:CropTop"] || "0")),
      CropLeft: parseFloat(String(crs["crs:CropLeft"] || "0")),
      CropBottom: parseFloat(String(crs["crs:CropBottom"] || "0")),
      CropRight: parseFloat(String(crs["crs:CropRight"] || "0")),
      CropAngle: parseFloat(String(crs["crs:CropAngle"] || "0")),
      CameraProfile: String(crs["crs:CameraProfile"] || ""),
      ToneCurvePV2012: parseToneCurve(crs["crs:ToneCurvePV2012"] as Record<string, unknown>),
      ToneCurvePV2012Red: parseToneCurve(crs["crs:ToneCurvePV2012Red"] as Record<string, unknown>),
      ToneCurvePV2012Green: parseToneCurve(crs["crs:ToneCurvePV2012Green"] as Record<string, unknown>),
      ToneCurvePV2012Blue: parseToneCurve(crs["crs:ToneCurvePV2012Blue"] as Record<string, unknown>),
    }
  } catch (error) {
    console.error("Error parsing XMP data:", error)
    return {}
  }
}

export function determineCameraProfile(metadata: sharp.Metadata): string {
  // Extract make from metadata format field or default to empty string
  const makeMatch = metadata.format?.match(/^[A-Za-z\s]+/)
  const make = makeMatch ? makeMatch[0].toUpperCase().trim() : ""

  if (!make) {
    console.log("No camera make found in metadata, using Adobe Standard profile")
    return "Adobe Standard"
  }

  if (!CAMERA_PROFILES[make]) {
    console.log(`Unknown camera make "${make}", using Adobe Standard profile`)
    return "Adobe Standard"
  }

  console.log(`Using camera profile for make "${make}": ${CAMERA_PROFILES[make].default}`)
  return CAMERA_PROFILES[make].default
}

export function calculateProfileDigest(profile: string): string {
  const DEFAULT_DIGEST = "54650A341B5B5CCAE8442D0B43A92BCE" // Adobe Standard digest
  const PROFILE_DIGESTS: Record<string, string> = {
    "Adobe Standard": DEFAULT_DIGEST,
    "Camera Neutral": "E8A7C5C13C743E0E",
    "Camera Standard": "F46D5B1D6B136F71",
    "Camera Portrait": "DCB3D5C9F6C4484A",
    "Camera Landscape": "B369A84D84AA6A14",
    "Camera Vivid": "C3F59EC06A069315",
    "Camera Flat": "9357A4E45E4B5F6C",
    "Camera Monochrome": "7A4E2B8F1C9D3A5E",
    "Camera Clear": "2D8F4E7B1A6C9D3E",
    "Camera Deep": "5F8A2E4D7C1B9E3A",
    "Camera Light": "1E9D4A7F2B5C8E3D",
    "Camera Provia/Standard": "4B7F2E8A1D5C9E3A",
    "Camera Velvia/Vivid": "8E2D5F7A4B1C9E3A",
    "Camera Astia/Soft": "3A7E2D8F4B5C1E9A",
    "Camera Classic Chrome": "7F4E2A8B5C1D9E3A",
    "Camera Natural": "2E8F4A7B1C5D9E3A",
    "Camera Bright": "9F4E2A8B5C1D3E7A",
    "Camera Film Standard": "4E7F2A8B5C1D9E3A",
    "Camera Film High Contrast": "8F4E2A7B5C1D9E3A",
  }

  return PROFILE_DIGESTS[profile] || DEFAULT_DIGEST
}

export function determineToneCurveName(channels: SharpChannel[]): string {
  if (channels.length < 3) return "Linear"
  const [r, g, b] = channels
  if (!r?.mean || !g?.mean || !b?.mean) return "Linear"

  const meanLuminance = (r.mean + g.mean + b.mean) / 3
  const contrast = calculateContrast(channels)

  if (meanLuminance < 96 && contrast > 30) return "Medium Contrast"
  if (meanLuminance < 96) return "Medium High"
  if (meanLuminance > 160) return "Light"
  if (contrast > 40) return "Strong Contrast"
  return "Medium"
}

export function determineVersion(_metadata: sharp.Metadata): string {
  return "15.0"
}

export function determineProcessVersion(_metadata: sharp.Metadata): string {
  return "15.0"
}

export async function determineWhiteBalance(metadata: sharp.Metadata): Promise<string> {
  const xmpData = await parseXMPData(metadata)
  const exifData = await parseExifData(metadata)

  // First check if there's an existing white balance setting in XMP
  if (typeof xmpData.WhiteBalance === "string" && xmpData.WhiteBalance) {
    console.log(`Using white balance from XMP: ${xmpData.WhiteBalance}`)
    return xmpData.WhiteBalance
  }

  // Then check EXIF data
  if (exifData.WhiteBalance) {
    // Map EXIF white balance values to Lightroom values
    const WB_MAP: Record<string, string> = {
      "0": "Auto",
      "1": "Daylight",
      "2": "Cloudy",
      "3": "Tungsten",
      "4": "Fluorescent",
      "5": "Flash",
      "6": "Custom",
      "255": "As Shot",
    }
    const wb = WB_MAP[exifData.WhiteBalance] || "As Shot"
    console.log(`Using white balance from EXIF: ${wb} (original value: ${exifData.WhiteBalance})`)
    return wb
  }

  console.log("No white balance information found, using 'As Shot'")
  return "As Shot"
}

export async function hasCrop(metadata: sharp.Metadata): Promise<boolean> {
  const exifData = await parseExifData(metadata)

  // Check if original dimensions are available and different from current
  if (exifData.OriginalWidth && exifData.OriginalHeight) {
    const hasCropValue = exifData.OriginalWidth !== metadata.width || exifData.OriginalHeight !== metadata.height
    if (hasCropValue) {
      console.log(
        `Crop detected from dimensions: Original ${exifData.OriginalWidth}x${exifData.OriginalHeight}, Current ${metadata.width}x${metadata.height}`
      )
    }
    return hasCropValue
  }

  // Check XMP data for crop information
  const xmpData = await parseXMPData(metadata)
  const hasCropValue = Boolean(xmpData.HasCrop)
  if (hasCropValue) {
    console.log("Crop detected from XMP data")
  }
  return hasCropValue
}

export function generateXMPCRS(filename: string, properties: ImageProperties): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" })

  // Add XMP packet wrapper
  const xmp = doc.ele("x:xmpmeta", {
    xmlns: "adobe:ns:meta/",
    "x:xmptk": "Adobe XMP Core 5.6-c140 79.160451, 2017/05/06-01:08:21",
  })

  // Add RDF description
  const rdf = xmp.ele("rdf:RDF", { xmlns: "http://www.w3.org/1999/02/22-rdf-syntax-ns#" })
  const desc = rdf.ele("rdf:Description", {
    "rdf:about": filename,
    xmlns: "http://ns.adobe.com/camera-raw-settings/1.0/",
  })

  // Add all simple properties
  const simpleProps = {
    "crs:Version": properties.version,
    "crs:ProcessVersion": properties.processVersion,
    "crs:WhiteBalance": properties.whiteBalance,
    "crs:Temperature": properties.temperature,
    "crs:Tint": properties.tint,
    "crs:Exposure": properties.exposure,
    "crs:Shadows": properties.shadows,
    "crs:Highlights": properties.highlights,
    "crs:Contrast": properties.contrast,
    "crs:Saturation": properties.saturation,
    "crs:Sharpness": properties.sharpness,
    "crs:LuminanceSmoothing": properties.luminanceSmoothing,
    "crs:ColorNoiseReduction": properties.colorNoiseReduction,
    "crs:VignetteAmount": properties.vignetteAmount,
    "crs:ShadowTint": properties.shadowTint,
    "crs:HueAdjustmentRed": properties.redHue,
    "crs:SaturationAdjustmentRed": properties.redSaturation,
    "crs:HueAdjustmentOrange": properties.orangeHue,
    "crs:SaturationAdjustmentOrange": properties.orangeSaturation,
    "crs:HueAdjustmentYellow": properties.yellowHue,
    "crs:SaturationAdjustmentYellow": properties.yellowSaturation,
    "crs:HueAdjustmentGreen": properties.greenHue,
    "crs:SaturationAdjustmentGreen": properties.greenSaturation,
    "crs:HueAdjustmentAqua": properties.aquaHue,
    "crs:SaturationAdjustmentAqua": properties.aquaSaturation,
    "crs:HueAdjustmentBlue": properties.blueHue,
    "crs:SaturationAdjustmentBlue": properties.blueSaturation,
    "crs:HueAdjustmentPurple": properties.purpleHue,
    "crs:SaturationAdjustmentPurple": properties.purpleSaturation,
    "crs:HueAdjustmentMagenta": properties.magentaHue,
    "crs:SaturationAdjustmentMagenta": properties.magentaSaturation,
    "crs:SplitToningShadowHue": properties.splitToningShadowHue,
    "crs:SplitToningShadowSaturation": properties.splitToningShadowSaturation,
    "crs:SplitToningHighlightHue": properties.splitToningHighlightHue,
    "crs:SplitToningHighlightSaturation": properties.splitToningHighlightSaturation,
    "crs:SplitToningBalance": properties.splitToningBalance,
    "crs:Clarity": properties.clarity,
    "crs:Dehaze": properties.dehaze,
    "crs:Vibrance": properties.vibrance,
    "crs:ParametricShadows": properties.parametricShadows,
    "crs:ParametricDarks": properties.parametricDarks,
    "crs:ParametricLights": properties.parametricLights,
    "crs:ParametricHighlights": properties.parametricHighlights,
    "crs:ParametricShadowSplit": properties.parametricShadowSplit,
    "crs:ParametricMidtoneSplit": properties.parametricMidtoneSplit,
    "crs:ParametricHighlightSplit": properties.parametricHighlightSplit,
    "crs:Texture": properties.texture,
    "crs:ToneMapStrength": properties.toneMapStrength,
    "crs:CameraProfile": properties.cameraProfile,
    "crs:CameraProfileDigest": properties.cameraProfileDigest,
    "crs:HasSettings": properties.hasSettings,
    "crs:HasCrop": properties.hasCrop,
    "crs:AlreadyApplied": properties.alreadyApplied,
    "crs:ToneCurveName": properties.toneCurveName,
  }

  // Add all simple properties
  Object.entries(simpleProps).forEach(([key, value]) => {
    desc.ele(key).txt(String(value))
  })

  // Add tone curves
  const addToneCurve = (name: string, points: number[][] | undefined) => {
    if (!points) return
    const curveEle = desc.ele(name).ele("rdf:Seq")
    points.forEach(([x, y]) => {
      curveEle.ele("rdf:li").txt(`${x}, ${y}`)
    })
  }

  addToneCurve("crs:ToneCurvePV2012", properties.toneCurve)
  addToneCurve("crs:ToneCurvePV2012Red", properties.toneCurveRed)
  addToneCurve("crs:ToneCurvePV2012Green", properties.toneCurveGreen)
  addToneCurve("crs:ToneCurvePV2012Blue", properties.toneCurveBlue)

  // Add XMP packet wrapper and end document
  return doc.end({ prettyPrint: true, headless: true })
}
