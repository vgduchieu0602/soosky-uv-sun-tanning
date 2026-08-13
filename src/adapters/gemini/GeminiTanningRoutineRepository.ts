import { GoogleGenAI, ThinkingLevel, type GenerateContentParameters } from "@google/genai";
import type { GroundingMetadata } from "../../domain/entities/SkinScanResult.js";
import type {
    TanningRoutineData,
    TanningRoutineError,
    TanningRoutineQuery,
    TanningRoutineResult,
} from "../../domain/entities/TanningRoutine.js";
import type TanningRoutineRepository from "../../domain/repositories/ITanningRoutineRepository.js";
import { TANNING_ROUTINE_INSTRUCTION } from "./instruction/tanningRoutine.js";
import tanningRoutineSchema from "./output-structure/tanning-routine-schema.json" with { type: "json" };

type GenerateContent = (request: unknown) => Promise<unknown>;

const SYSTEM_ERROR: TanningRoutineResult = {
    errmsg: { errorCode: "ERR-01", suggestion: "Please try again later." },
};

export default class GeminiTanningRoutineRepository implements TanningRoutineRepository {
    private readonly generateContent: GenerateContent;

    constructor (apiKey: string, private readonly model: string, generateContent?: GenerateContent) {
        const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 30000 } });
        this.generateContent = generateContent ?? ((request) => client.models.generateContent(
            request as GenerateContentParameters,
        ));
    }

    async createRoutine (query: TanningRoutineQuery): Promise<TanningRoutineResult> {
        try {
            const response = await this.generateContent({
                model: this.model,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: tanningRoutineSchema,
                    systemInstruction: TANNING_ROUTINE_INSTRUCTION,
                    thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
                    tools: [{ googleSearch: {} }],
                },
                contents: [{ role: "user", parts: [{ text: JSON.stringify(query) }] }],
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

function parseModelOutput (response: unknown): { data: TanningRoutineData } | { errmsg: TanningRoutineError } | undefined {
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

function parseData (value: unknown): TanningRoutineData | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["routineName", "totalDays", "targetGoal", "dailySchedule"])) return undefined;
    const totalDays = value.totalDays;
    if (
        typeof value.routineName !== "string" || value.routineName.trim() === ""
        || typeof totalDays !== "number" || !Number.isSafeInteger(totalDays) || totalDays <= 0
        || typeof value.targetGoal !== "string" || value.targetGoal.trim() === ""
        || !Array.isArray(value.dailySchedule) || value.dailySchedule.length !== totalDays
    ) return undefined;

    const dailySchedule = value.dailySchedule.map(parseDay);
    if (dailySchedule.some((day) => day === undefined)) return undefined;
    const days = dailySchedule as TanningRoutineData["dailySchedule"];
    if (days.some((entry, index) => entry.day !== index + 1)) return undefined;

    return { routineName: value.routineName, totalDays, targetGoal: value.targetGoal, dailySchedule: days };
}

function parseDay (value: unknown): TanningRoutineData["dailySchedule"][number] | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["day", "phase", "activities"])) return undefined;
    const day = value.day;
    if (
        typeof day !== "number" || !Number.isSafeInteger(day) || day <= 0
        || typeof value.phase !== "string" || value.phase.trim() === "" || value.phase.trim().split(/\s+/).length > 7
        || !Array.isArray(value.activities) || value.activities.length === 0
        || !value.activities.every((activity) => typeof activity === "string" && activity.trim() !== "")
    ) return undefined;

    return { day, phase: value.phase, activities: value.activities };
}

function parseError (value: unknown): TanningRoutineError | undefined {
    if (!isRecord(value) || !hasOnlyKeys(value, ["errorCode", "suggestion"])) return undefined;
    if ((value.errorCode !== "ERR-01" && value.errorCode !== "ERR-99") || typeof value.suggestion !== "string") return undefined;
    return { errorCode: value.errorCode, suggestion: value.suggestion };
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
