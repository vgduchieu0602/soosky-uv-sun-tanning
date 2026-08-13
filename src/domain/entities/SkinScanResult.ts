export interface SkinImage {
    bytes: Uint8Array;
    mimeType: "image/jpeg";
}

export type SkinTone =
    | "Very Fair Skin"
    | "Fair Skin"
    | "Medium Skin"
    | "Olive Skin"
    | "Brown Skin"
    | "Dark Skin";

export type Hydration =
    | "Critically Dry"
    | "Dehydrated"
    | "Hydrated"
    | "Over-Hydrated";

export type SkinType =
    | "Normal Skin"
    | "Dry Skin"
    | "Oily Skin"
    | "Combination Skin"
    | "Sensitive Skin";

export type SkinScanErrorCode =
    | "ERROR_NON_SKIN"
    | "ERROR_TOO_MANY_FACES"
    | "ERROR_NO_FACE_DETECTED"
    | "ERROR_IMAGE_BLURRY"
    | "ERROR_IMAGE_GLARE"
    | "ERROR_LIGHTING_POOR"
    | "ERROR_SYSTEM";

export interface SkinScanData {
    skinTone: SkinTone;
    skinAge: string;
    hydration: Hydration;
    skinType: SkinType;
}

export interface SkinScanError {
    errorCode: SkinScanErrorCode;
    suggestion: string;
}

export interface GroundingSource {
    title: string;
    url: string;
}

export interface GroundingMetadata {
    sources: GroundingSource[];
    searchQueries: string[];
    searchSuggestionsHtml: string;
}

export type SkinScanResult =
    | { data: SkinScanData; grounding?: GroundingMetadata; errmsg?: never }
    | { errmsg: SkinScanError; data?: never; grounding?: never };
