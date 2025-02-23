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

export interface ImageProperties {
  exposure: number
  temperature: number
  tint: number
  contrast: number
  saturation: number
  brightness: number
  sharpness: number
  clarity: number
  vibrance: number
  texture: number
  shadows: number
  highlights: number
  dehaze: number
  parametricShadows: number
  parametricDarks: number
  parametricLights: number
  parametricHighlights: number
  parametricShadowSplit: number
  parametricMidtoneSplit: number
  parametricHighlightSplit: number
  toneMapStrength: number
  luminanceSmoothing: number
  colorNoiseReduction: number
  vignetteAmount: number
  shadowTint: number
  redHue: number
  redSaturation: number
  orangeHue: number
  orangeSaturation: number
  yellowHue: number
  yellowSaturation: number
  greenHue: number
  greenSaturation: number
  aquaHue: number
  aquaSaturation: number
  blueHue: number
  blueSaturation: number
  purpleHue: number
  purpleSaturation: number
  magentaHue: number
  magentaSaturation: number
  splitToningShadowHue: number
  splitToningShadowSaturation: number
  splitToningHighlightHue: number
  splitToningHighlightSaturation: number
  splitToningBalance: number
  toneCurve?: number[][]
  toneCurveRed?: number[][]
  toneCurveGreen?: number[][]
  toneCurveBlue?: number[][]
  cameraProfile: string
  cameraProfileDigest: string
  hasSettings: boolean
  hasCrop: boolean
  alreadyApplied: boolean
  toneCurveName: string
  version: string
  processVersion: string
  whiteBalance: string
}

export interface XMPAdjustments {
  // Basic adjustments
  version?: string
  processVersion?: string
  exposure: number
  contrast: number
  brightness: number
  shadows: number
  highlights: number
  whites: number
  blacks: number
  temperature: number
  tint: number
  saturation: number
  vibrance: number
  texture: number
  clarity: number
  dehaze: number
  sharpness: number
  luminanceSmoothing: number
  colorNoiseReduction: number
  shadowTint: number
  toneMapStrength: number

  // Color adjustments
  redHue: number
  redSaturation: number
  orangeHue: number
  orangeSaturation: number
  yellowHue: number
  yellowSaturation: number
  greenHue: number
  greenSaturation: number
  aquaHue: number
  aquaSaturation: number
  blueHue: number
  blueSaturation: number
  purpleHue: number
  purpleSaturation: number
  magentaHue: number
  magentaSaturation: number

  // Split toning
  splitToningShadowHue: number
  splitToningShadowSaturation: number
  splitToningHighlightHue: number
  splitToningHighlightSaturation: number
  splitToningBalance: number

  // Parametric adjustments
  parametricShadows: number
  parametricDarks: number
  parametricLights: number
  parametricHighlights: number
  parametricShadowSplit: number
  parametricMidtoneSplit: number
  parametricHighlightSplit: number

  // Effects
  vignetteAmount: number
  vignetteFeather?: number
  vignetteMidpoint?: number
  grainAmount?: number
  grainSize?: number
  grainFrequency?: number

  // Tone curves
  toneCurve?: number[][]
  toneCurveRed?: number[][]
  toneCurveGreen?: number[][]
  toneCurveBlue?: number[][]
  toneCurveName?: string

  // Metadata
  cameraProfile?: string
  cameraProfileDigest?: string
  hasSettings?: boolean
  hasCrop?: boolean
  alreadyApplied?: boolean
  whiteBalance?: string
}

export const CRS_PROPERTY_MAP = {
  // Basic adjustments
  version: "crs:Version",
  processVersion: "crs:ProcessVersion",
  exposure: "crs:Exposure",
  contrast: "crs:Contrast",
  brightness: "crs:Brightness",
  shadows: "crs:Shadows",
  highlights: "crs:Highlights",
  whites: "crs:Whites",
  blacks: "crs:Blacks",
  temperature: "crs:Temperature",
  tint: "crs:Tint",
  saturation: "crs:Saturation",
  vibrance: "crs:Vibrance",
  texture: "crs:Texture",
  clarity: "crs:Clarity",
  dehaze: "crs:Dehaze",
  sharpness: "crs:Sharpness",
  luminanceSmoothing: "crs:LuminanceSmoothing",
  colorNoiseReduction: "crs:ColorNoiseReduction",
  shadowTint: "crs:ShadowTint",
  toneMapStrength: "crs:ToneMapStrength",

  // Color adjustments
  redHue: "crs:HueAdjustmentRed",
  redSaturation: "crs:SaturationAdjustmentRed",
  orangeHue: "crs:HueAdjustmentOrange",
  orangeSaturation: "crs:SaturationAdjustmentOrange",
  yellowHue: "crs:HueAdjustmentYellow",
  yellowSaturation: "crs:SaturationAdjustmentYellow",
  greenHue: "crs:HueAdjustmentGreen",
  greenSaturation: "crs:SaturationAdjustmentGreen",
  aquaHue: "crs:HueAdjustmentAqua",
  aquaSaturation: "crs:SaturationAdjustmentAqua",
  blueHue: "crs:HueAdjustmentBlue",
  blueSaturation: "crs:SaturationAdjustmentBlue",
  purpleHue: "crs:HueAdjustmentPurple",
  purpleSaturation: "crs:SaturationAdjustmentPurple",
  magentaHue: "crs:HueAdjustmentMagenta",
  magentaSaturation: "crs:SaturationAdjustmentMagenta",

  // Split toning
  splitToningShadowHue: "crs:SplitToningShadowHue",
  splitToningShadowSaturation: "crs:SplitToningShadowSaturation",
  splitToningHighlightHue: "crs:SplitToningHighlightHue",
  splitToningHighlightSaturation: "crs:SplitToningHighlightSaturation",
  splitToningBalance: "crs:SplitToningBalance",

  // Parametric adjustments
  parametricShadows: "crs:ParametricShadows",
  parametricDarks: "crs:ParametricDarks",
  parametricLights: "crs:ParametricLights",
  parametricHighlights: "crs:ParametricHighlights",
  parametricShadowSplit: "crs:ParametricShadowSplit",
  parametricMidtoneSplit: "crs:ParametricMidtoneSplit",
  parametricHighlightSplit: "crs:ParametricHighlightSplit",

  // Effects
  vignetteAmount: "crs:VignetteAmount",
  vignetteFeather: "crs:VignetteFeather",
  vignetteMidpoint: "crs:VignetteMidpoint",
  grainAmount: "crs:GrainAmount",
  grainSize: "crs:GrainSize",
  grainFrequency: "crs:GrainFrequency",

  // Tone curves
  toneCurve: "crs:ToneCurvePV2012",
  toneCurveRed: "crs:ToneCurvePV2012Red",
  toneCurveGreen: "crs:ToneCurvePV2012Green",
  toneCurveBlue: "crs:ToneCurvePV2012Blue",
  toneCurveName: "crs:ToneCurveName",

  // Metadata
  cameraProfile: "crs:CameraProfile",
  cameraProfileDigest: "crs:CameraProfileDigest",
  hasSettings: "crs:HasSettings",
  hasCrop: "crs:HasCrop",
  alreadyApplied: "crs:AlreadyApplied",
  whiteBalance: "crs:WhiteBalance",
} as const

export type CRSProperty = keyof typeof CRS_PROPERTY_MAP
export type CRSPropertyValue = (typeof CRS_PROPERTY_MAP)[CRSProperty]
