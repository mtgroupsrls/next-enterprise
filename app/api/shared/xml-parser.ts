import { XMLParser } from "fast-xml-parser"
import { CRS_PROPERTY_MAP, CRSProperty, XMPAdjustments } from "./types"

export interface XMPNode {
  "rdf:Seq"?: {
    "rdf:li"?: string | string[]
  }
}

export interface XMPDescription {
  [key: string]: string | number | boolean | XMPNode | undefined
  "crs:ToneCurvePV2012"?: XMPNode
  "crs:ToneCurvePV2012Red"?: XMPNode
  "crs:ToneCurvePV2012Green"?: XMPNode
  "crs:ToneCurvePV2012Blue"?: XMPNode
}

export interface XMPRoot {
  "x:xmpmeta"?: {
    "rdf:RDF"?: {
      "rdf:Description"?: XMPDescription
    }
  }
}

function parseCRSValue(value: unknown, type: "number" | "boolean" | "string" = "number"): number | boolean | string {
  if (value === undefined || value === null) return type === "number" ? 0 : type === "boolean" ? false : ""

  if (type === "boolean") {
    return String(value) === "True"
  }

  if (type === "number") {
    const num = parseFloat(String(value))
    return isNaN(num) ? 0 : num
  }

  return String(value)
}

export function parseXMPData(xmpString: string): Record<string, unknown> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "_text",
    parseAttributeValue: true,
    parseTagValue: true,
  })

  const result = parser.parse(xmpString) as XMPRoot
  const crs = result?.["x:xmpmeta"]?.["rdf:RDF"]?.["rdf:Description"]
  if (!crs) {
    throw new Error("Invalid XMP format: missing Camera Raw Settings")
  }

  return crs
}

export function parseXMPAdjustments(crs: Record<string, unknown>): XMPAdjustments {
  const adjustments: Partial<XMPAdjustments> = {}

  // Parse all properties using our CRS_PROPERTY_MAP
  Object.entries(CRS_PROPERTY_MAP).forEach(([key, crsKey]) => {
    const prop = key as CRSProperty
    const value = crs[crsKey]

    // Handle special cases
    if (prop === "hasCrop" || prop === "hasSettings" || prop === "alreadyApplied") {
      adjustments[prop] = parseCRSValue(value, "boolean") as boolean
    } else if (
      prop === "whiteBalance" ||
      prop === "cameraProfile" ||
      prop === "cameraProfileDigest" ||
      prop === "processVersion" ||
      prop === "toneCurveName"
    ) {
      adjustments[prop] = parseCRSValue(value, "string") as string
    } else if (
      prop === "toneCurve" ||
      prop === "toneCurveRed" ||
      prop === "toneCurveGreen" ||
      prop === "toneCurveBlue"
    ) {
      adjustments[prop] = parseToneCurve(value as XMPNode)
    } else {
      // All other properties are numbers
      adjustments[prop] = parseCRSValue(value, "number") as number
    }
  })

  return adjustments as XMPAdjustments
}

export function parseToneCurve(curve: XMPNode | undefined): number[][] | undefined {
  if (!curve?.["rdf:Seq"]?.["rdf:li"]) return undefined

  const points = Array.isArray(curve["rdf:Seq"]["rdf:li"]) ? curve["rdf:Seq"]["rdf:li"] : [curve["rdf:Seq"]["rdf:li"]]

  const validPoints = points
    .map((point: string) => {
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
