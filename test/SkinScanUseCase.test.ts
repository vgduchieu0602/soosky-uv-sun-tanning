import assert from "node:assert/strict";
import test from "node:test";
import ScanSkinUseCase from "../src/application/use-cases/ScanSkinUseCase.js";
import type SkinScanAnalyzer from "../src/domain/repositories/ISkinScanAnalyzer.js";

test("returns the scan result from the analyzer", async () => {
    const expected = {
        data: {
            skinTone: "Medium Skin",
            skinAge: "25-30",
            hydration: "Hydrated",
            skinType: "Normal Skin",
        },
    };
    const analyzer: SkinScanAnalyzer = {
        scanSkin: async () => expected,
    };
    const useCase = new ScanSkinUseCase(analyzer);

    const result = await useCase.execute({
        bytes: new Uint8Array([1]),
        mimeType: "image/jpeg",
    });

    assert.deepEqual(result, expected);
});
