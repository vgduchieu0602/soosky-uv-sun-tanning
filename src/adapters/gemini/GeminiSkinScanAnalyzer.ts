import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import type {
    GroundingMetadata,
    SkinImage,
    SkinScanData,
    SkinScanError,
    SkinScanErrorCode,
    SkinScanResult,
} from "../../domain/entities/SkinScanResult.js";
import type SkinScanAnalyzer from "../../domain/repositories/ISkinScanAnalyzer.js";
import { SCAN_SKIN_INSTRUCTION } from "./instruction/scanSkin.js";
import skinScanSchema from "./output-structure/skin-scan-schema.json" with { type: "json" };

type GenerateContent = (request: unknown) => Promise<unknown>;

const SYSTEM_ERROR: SkinScanResult = {
    errmsg: {
        errorCode: "ERROR_SYSTEM",
        suggestion: "Please try again later.",
    },
};

const SKIN_TONES = new Set([
    "Very Fair Skin", "Fair Skin", "Medium Skin", "Olive Skin", "Brown Skin", "Dark Skin",
]);
const HYDRATIONS = new Set(["Critically Dry", "Dehydrated", "Hydrated", "Over-Hydrated"]);
const SKIN_TYPES = new Set([
    "Normal Skin", "Dry Skin", "Oily Skin", "Combination Skin", "Sensitive Skin",
]);
const ERROR_CODES = new Set<SkinScanErrorCode>([
    "ERROR_NON_SKIN",
    "ERROR_TOO_MANY_FACES",
    "ERROR_NO_FACE_DETECTED",
    "ERROR_IMAGE_BLURRY",
    "ERROR_IMAGE_GLARE",
    "ERROR_LIGHTING_POOR",
    "ERROR_SYSTEM",
]);

export default class GeminiSkinScanAnalyzer implements SkinScanAnalyzer {
    private readonly generateContent: GenerateContent;

    constructor (apiKey: string, private readonly model: string, generateContent?: GenerateContent) {
        const client = new GoogleGenAI({
            apiKey,
            httpOptions: { timeout: 30000 },
        });
        this.generateContent = generateContent ?? ((request) => client.models.generateContent(
            request as GenerateContentParameters,
        ));
    }

    async scanSkin (image: SkinImage): Promise<SkinScanResult> {
        try {
            const response = await this.generateContent({
                model: this.model,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: skinScanSchema,
                    systemInstruction: SCAN_SKIN_INSTRUCTION,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                    tools: [{ googleSearch: {} }],
                },
                contents: [{
                    role: "user",
                    parts: [{
                        inlineData: {
                            data: Buffer.from(image.bytes).toString("base64"),
                            mimeType: image.mimeType,
                        },
                    }],
                }],
            });
            const output = parseModelOutput(response);

            if (output === undefined) return SYSTEM_ERROR;
            if ("errmsg" in output) return { errmsg: output.errmsg };

            const grounding = extractGrounding(response);
            return grounding === undefined ? { data: output.data } : { data: output.data, grounding };
        } catch {
            return SYSTEM_ERROR;
        }
    }
}

function parseModelOutput (response: unknown): { data: SkinScanData } | { errmsg: SkinScanError } | undefined {
    if (!isRecord(response) || typeof response.text !== "string" || response.text.trim() === "") return undefined;

    let value: unknown;
    try {
        value = JSON.parse(response.text);
    } catch {
        return undefined;
    }

    if (!isRecord(value) || !hasOnlyKeys(value, ["data", "errmsg"])) return undefined;
    const hasData = Object.hasOwn(value, "data");
    const hasError = Object.hasOwn(value, "errmsg");
    if (hasData === hasError) return undefined;

    if (hasData) {
        const data = parseData(value.data);
        return data === undefined ? undefined : { data };
    }

    const errmsg = parseError(value.errmsg);
    return errmsg === undefined ? undefined : { errmsg };
}

function parseData (value: unknown): SkinScanData | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["skinTone", "skinAge", "hydration", "skinType"])) return undefined;
    if (
        typeof value.skinTone !== "string" || !SKIN_TONES.has(value.skinTone)
        || typeof value.skinAge !== "string"
        || typeof value.hydration !== "string" || !HYDRATIONS.has(value.hydration)
        || typeof value.skinType !== "string" || !SKIN_TYPES.has(value.skinType)
    ) return undefined;

    return {
        skinTone: value.skinTone as SkinScanData["skinTone"],
        skinAge: value.skinAge,
        hydration: value.hydration as SkinScanData["hydration"],
        skinType: value.skinType as SkinScanData["skinType"],
    };
}

function parseError (value: unknown): SkinScanError | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["errorCode", "suggestion"])) return undefined;
    if (typeof value.errorCode !== "string" || !ERROR_CODES.has(value.errorCode as SkinScanErrorCode)) return undefined;
    if (typeof value.suggestion !== "string") return undefined;

    return { errorCode: value.errorCode as SkinScanErrorCode, suggestion: value.suggestion };
}

function extractGrounding (response: unknown): GroundingMetadata | undefined {
    if (!isRecord(response) || !Array.isArray(response.candidates)) return undefined;
    const candidate = response.candidates[0];
    if (!isRecord(candidate) || !isRecord(candidate.groundingMetadata)) return undefined;

    const metadata = candidate.groundingMetadata;
    const sourceUris = new Set<string>();
    const sources = Array.isArray(metadata.groundingChunks)
        ? metadata.groundingChunks.flatMap((chunk) => {
            if (!isRecord(chunk) || !isRecord(chunk.web) || typeof chunk.web.uri !== "string") return [];
            const url = chunk.web.uri.trim();
            if (url === "" || sourceUris.has(url)) return [];
            sourceUris.add(url);
            return [{ title: typeof chunk.web.title === "string" && chunk.web.title !== "" ? chunk.web.title : url, url }];
        })
        : [];
    const searchQueries = Array.isArray(metadata.webSearchQueries)
        ? metadata.webSearchQueries.filter((query): query is string => typeof query === "string" && query !== "")
        : [];
    const searchSuggestionsHtml = isRecord(metadata.searchEntryPoint)
        && typeof metadata.searchEntryPoint.renderedContent === "string"
        ? metadata.searchEntryPoint.renderedContent
        : "";

    if (sources.length === 0 && searchQueries.length === 0 && searchSuggestionsHtml === "") return undefined;
    return { sources, searchQueries, searchSuggestionsHtml };
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys (value: Record<string, unknown>, keys: string[]): boolean {
    return Object.keys(value).every((key) => keys.includes(key));
}
