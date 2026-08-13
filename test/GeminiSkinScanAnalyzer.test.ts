import assert from "node:assert/strict";
import test from "node:test";
import GeminiSkinScanAnalyzer from "../src/adapters/gemini/GeminiSkinScanAnalyzer.js";

const IMAGE = {
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: "image/jpeg" as const,
};

const SYSTEM_ERROR = {
    errmsg: {
        errorCode: "ERROR_SYSTEM",
        suggestion: "Please try again later.",
    },
};

test("maps structured data and deduplicated grounding sources", async () => {
    const analyzer = new GeminiSkinScanAnalyzer("key", "gemini-3.1-flash-lite", async () => ({
        text: JSON.stringify({
            data: {
                skinTone: "Fair Skin",
                skinAge: "20-25",
                hydration: "Hydrated",
                skinType: "Normal Skin",
            },
        }),
        candidates: [{
            groundingMetadata: {
                webSearchQueries: ["facial skin hydration"],
                groundingChunks: [
                    { web: { title: "A", uri: "https://a.example" } },
                    { web: { title: "A duplicate", uri: "https://a.example" } },
                ],
                searchEntryPoint: { renderedContent: "<div>Search</div>" },
            },
        }],
    }));

    const result = await analyzer.scanSkin(IMAGE);

    assert.deepEqual(result, {
        data: {
            skinTone: "Fair Skin",
            skinAge: "20-25",
            hydration: "Hydrated",
            skinType: "Normal Skin",
        },
        grounding: {
            sources: [{ title: "A", url: "https://a.example" }],
            searchQueries: ["facial skin hydration"],
            searchSuggestionsHtml: "<div>Search</div>",
        },
    });
});

test("preserves a valid model error", async () => {
    const analyzer = createAnalyzer({
        errmsg: {
            errorCode: "ERROR_IMAGE_BLURRY",
            suggestion: "Use a sharper photo.",
        },
    });

    assert.deepEqual(await analyzer.scanSkin(IMAGE), {
        errmsg: {
            errorCode: "ERROR_IMAGE_BLURRY",
            suggestion: "Use a sharper photo.",
        },
    });
});

test("rejects a model result containing both data and errmsg", async () => {
    const analyzer = createAnalyzer({
        data: validData(),
        errmsg: {
            errorCode: "ERROR_NON_SKIN",
            suggestion: "Upload a face photo.",
        },
    });

    assert.deepEqual(await analyzer.scanSkin(IMAGE), SYSTEM_ERROR);
});

test("converts a generator exception to the system error", async () => {
    const analyzer = new GeminiSkinScanAnalyzer("key", "model", async () => {
        throw new Error("upstream unavailable");
    });

    assert.deepEqual(await analyzer.scanSkin(IMAGE), SYSTEM_ERROR);
});

test("sends the configured model and one base64 inline image", async () => {
    let capturedRequest: unknown;
    const analyzer = new GeminiSkinScanAnalyzer("key", "chosen-model", async (request) => {
        capturedRequest = request;
        return { text: JSON.stringify({ data: validData() }) };
    });

    await analyzer.scanSkin(IMAGE);

    const request = capturedRequest as {
        model?: unknown;
        config?: {
            responseMimeType?: unknown;
            responseSchema?: unknown;
            systemInstruction?: unknown;
            thinkingConfig?: { thinkingLevel?: unknown };
            tools?: unknown;
        };
        contents?: unknown;
    };
    assert.equal(request.model, "chosen-model");
    assert.equal(request.config?.responseMimeType, "application/json");
    assert.equal(typeof request.config?.responseSchema, "object");
    assert.equal(typeof request.config?.systemInstruction, "string");
    assert.equal(request.config?.thinkingConfig?.thinkingLevel, "MINIMAL");
    assert.deepEqual(request.config?.tools, [{ googleSearch: {} }]);
    assert.deepEqual(request.contents, [{
        role: "user",
        parts: [{
            inlineData: {
                data: "AQID",
                mimeType: "image/jpeg",
            },
        }],
    }]);
});

test("defaults a missing grounding title to its URI", async () => {
    const analyzer = createAnalyzer(
        { data: validData() },
        {
            groundingChunks: [
                { web: { uri: "https://untitled.example" } },
                { web: { title: "No URI" } },
                { web: { uri: "   " } },
            ],
        },
    );

    assert.deepEqual(await analyzer.scanSkin(IMAGE), {
        data: validData(),
        grounding: {
            sources: [{
                title: "https://untitled.example",
                url: "https://untitled.example",
            }],
            searchQueries: [],
            searchSuggestionsHtml: "",
        },
    });
});

test("omits grounding when all metadata fields are empty", async () => {
    const analyzer = createAnalyzer(
        { data: validData() },
        {
            webSearchQueries: [],
            groundingChunks: [{ web: { uri: "" } }],
            searchEntryPoint: { renderedContent: "" },
        },
    );

    assert.deepEqual(await analyzer.scanSkin(IMAGE), { data: validData() });
});

test("converts invalid model output to the system error", async (t) => {
    const invalidOutputs: Array<{ name: string; response: unknown }> = [
        { name: "missing text", response: {} },
        { name: "blank text", response: { text: "   " } },
        { name: "non-string text", response: { text: 42 } },
        { name: "invalid JSON", response: { text: "{" } },
        { name: "JSON null", response: { text: "null" } },
        { name: "neither state", response: { text: "{}" } },
        { name: "unknown skin tone", response: modelResponse({ data: { ...validData(), skinTone: "Pink Skin" } }) },
        { name: "unknown hydration", response: modelResponse({ data: { ...validData(), hydration: "Wet" } }) },
        { name: "unknown skin type", response: modelResponse({ data: { ...validData(), skinType: "Mixed" } }) },
        { name: "missing skin age", response: modelResponse({ data: withoutKey(validData(), "skinAge") }) },
        { name: "non-string skin age", response: modelResponse({ data: { ...validData(), skinAge: 25 } }) },
        { name: "unknown error code", response: modelResponse({ errmsg: { errorCode: "ERROR_OTHER", suggestion: "Retry." } }) },
        { name: "missing error suggestion", response: modelResponse({ errmsg: { errorCode: "ERROR_SYSTEM" } }) },
        { name: "non-string error suggestion", response: modelResponse({ errmsg: { errorCode: "ERROR_SYSTEM", suggestion: 1 } }) },
        { name: "extra top-level field", response: modelResponse({ data: validData(), unexpected: true }) },
        { name: "extra data field", response: modelResponse({ data: { ...validData(), confidence: 0.9 } }) },
    ];

    for (const invalidOutput of invalidOutputs) {
        await t.test(invalidOutput.name, async () => {
            const analyzer = new GeminiSkinScanAnalyzer(
                "key",
                "model",
                async () => invalidOutput.response,
            );

            assert.deepEqual(await analyzer.scanSkin(IMAGE), SYSTEM_ERROR);
        });
    }
});

function createAnalyzer (
    payload: unknown,
    groundingMetadata?: unknown,
): GeminiSkinScanAnalyzer {
    return new GeminiSkinScanAnalyzer("key", "model", async () => ({
        text: JSON.stringify(payload),
        candidates: groundingMetadata === undefined
            ? []
            : [{ groundingMetadata }],
    }));
}

function modelResponse (payload: unknown): unknown {
    return { text: JSON.stringify(payload) };
}

function validData (): {
    skinTone: string;
    skinAge: string;
    hydration: string;
    skinType: string;
} {
    return {
        skinTone: "Fair Skin",
        skinAge: "20-25",
        hydration: "Hydrated",
        skinType: "Normal Skin",
    };
}

function withoutKey<T extends object, K extends keyof T> (value: T, key: K): Omit<T, K> {
    const copy = { ...value };
    delete copy[key];
    return copy;
}
