import assert from "node:assert/strict";
import test from "node:test";
import GeminiTanningRoutineRepository from "../src/adapters/gemini/GeminiTanningRoutineRepository.js";

const QUERY = {
    currentSkin: {
        skinTone: "Very Fair Skin" as const,
        skinAge: "25-30",
        hydration: "Hydrated" as const,
        skinType: "Oily Skin" as const,
    },
    desiredSkin: "Medium Skin" as const,
};

const DATA = {
    routineName: "Gradual glow",
    totalDays: 2,
    targetGoal: {
        title: "Protected gradual glow",
        targetText: "Build color gradually with protected exposure.",
    },
    dailySchedule: [
        { day: 1, phase: "Prep", activities: ["Use SPF 50+"] },
        { day: 2, phase: "Rest", activities: ["No sun exposure."] },
    ],
};

test("sends a structured routine query and maps Google Search grounding", async () => {
    let capturedRequest: unknown;
    const repository = new GeminiTanningRoutineRepository("key", "chosen-model", async (request) => {
        capturedRequest = request;
        return {
            text: JSON.stringify({ data: DATA }),
            candidates: [{
                groundingMetadata: {
                    webSearchQueries: ["safe tanning guidance"],
                    groundingChunks: [{ web: { title: "Source", uri: "https://source.example" } }],
                },
            }],
        };
    });

    assert.deepEqual(await repository.createRoutine(QUERY), {
        data: DATA,
        grounding: {
            sources: [{ title: "Source", url: "https://source.example" }],
            searchQueries: ["safe tanning guidance"],
            searchSuggestionsHtml: "",
        },
    });

    const request = capturedRequest as {
        model?: unknown;
        config?: {
            responseMimeType?: unknown;
            responseSchema?: unknown;
            thinkingConfig?: { thinkingLevel?: unknown };
            tools?: unknown;
        };
        contents?: unknown;
    };
    assert.equal(request.model, "chosen-model");
    assert.equal(request.config?.responseMimeType, "application/json");
    assert.equal(typeof request.config?.responseSchema, "object");
    assert.equal(request.config?.thinkingConfig?.thinkingLevel, "MINIMAL");
    assert.deepEqual(request.config?.tools, [{ googleSearch: {} }]);
    assert.deepEqual(request.contents, [{ role: "user", parts: [{ text: JSON.stringify(QUERY) }] }]);
});

test("rejects a routine that skips a day", async () => {
    const repository = new GeminiTanningRoutineRepository("key", "model", async () => ({
        text: JSON.stringify({
            data: { ...DATA, dailySchedule: [{ day: 2, phase: "Skipped", activities: ["No sun exposure."] }, { day: 3, phase: "Rest", activities: ["Hydrate."] }] },
        }),
    }));

    assert.deepEqual(await repository.createRoutine(QUERY), {
        errmsg: { errorCode: "ERR-01", suggestion: "Please try again later." },
    });
});

test("rejects a routine with an oversized goal text", async () => {
    const repository = new GeminiTanningRoutineRepository("key", "model", async () => ({
        text: JSON.stringify({
            data: {
                ...DATA,
                targetGoal: {
                    ...DATA.targetGoal,
                    targetText: "A".repeat(66),
                },
            },
        }),
    }));

    assert.deepEqual(await repository.createRoutine(QUERY), {
        errmsg: { errorCode: "ERR-01", suggestion: "Please try again later." },
    });
});

test("rejects a routine with a phase longer than 32 characters", async () => {
    const repository = new GeminiTanningRoutineRepository("key", "model", async () => ({
        text: JSON.stringify({
            data: {
                ...DATA,
                dailySchedule: [
                    { ...DATA.dailySchedule[0], phase: "A".repeat(33) },
                    DATA.dailySchedule[1],
                ],
            },
        }),
    }));

    assert.deepEqual(await repository.createRoutine(QUERY), {
        errmsg: { errorCode: "ERR-01", suggestion: "Please try again later." },
    });
});
