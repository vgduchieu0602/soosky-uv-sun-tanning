import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import ScanSkinUseCase from "../src/application/use-cases/ScanSkinUseCase.js";
import type { SkinImage, SkinScanResult } from "../src/domain/entities/SkinScanResult.js";
import type SkinScanAnalyzer from "../src/domain/repositories/ISkinScanAnalyzer.js";
import type ImageNormalizer from "../src/domain/services/IImageNormalizer.js";
import Server from "../src/http/Server.js";

const INVALID_IMAGE_RESPONSE = {
    errmsg: {
        errorCode: "ERROR_NON_SKIN",
        suggestion: "Upload one clear frontal face photo in JPEG, PNG, WebP, HEIC, or HEIF format.",
    },
};

describe("POST /api/v1/skin-scan", () => {
    let server: Server;
    let baseUrl: string;
    let scanResult: SkinScanResult;
    let normalizationError: Error | undefined;
    let normalizeCalls: Uint8Array[];
    let analyzedImages: SkinImage[];

    before(async () => {
        scanResult = successResult();
        normalizeCalls = [];
        analyzedImages = [];

        const imageNormalizer: ImageNormalizer = {
            normalizeImage: async (bytes) => {
                normalizeCalls.push(bytes);
                if (normalizationError) throw normalizationError;
                return { bytes: new Uint8Array([9, 8, 7]), mimeType: "image/jpeg" };
            },
        };
        const analyzer: SkinScanAnalyzer = {
            scanSkin: async (image) => {
                analyzedImages.push(image);
                return scanResult;
            },
        };

        server = new Server(
            {
                http: { host: "127.0.0.1", port: 0, trustProxy: false },
                image: { maxImageMb: 1 },
            },
            () => "disconnected",
            {
                uv: {
                    getDailyUvForecast: undefined,
                    getHourlyUvForecast: undefined,
                },
                skin: { scanSkin: new ScanSkinUseCase(analyzer) },
            } as never,
            imageNormalizer,
        );

        const listener = await server.listen();
        const { port } = listener.address() as AddressInfo;
        baseUrl = "http://127.0.0.1:" + port;
    });

    after(async () => {
        await server.close();
    });

    it("returns the exact successful scan object without an ok envelope", async () => {
        const beforeNormalize = normalizeCalls.length;
        const beforeAnalyze = analyzedImages.length;
        const form = imageForm(new Uint8Array([1, 2, 3]), "image/jpeg", "face.jpg");

        const response = await fetch(baseUrl + "/api/v1/skin-scan", { method: "POST", body: form });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), successResult());
        assert.equal(normalizeCalls.length, beforeNormalize + 1);
        assert.deepEqual(Array.from(normalizeCalls.at(-1) ?? []), [1, 2, 3]);
        assert.equal(analyzedImages.length, beforeAnalyze + 1);
        assert.deepEqual(analyzedImages.at(-1), {
            bytes: new Uint8Array([9, 8, 7]),
            mimeType: "image/jpeg",
        });
    });

    it("returns only ERROR_NON_SKIN when the image field is missing", async () => {
        const response = await fetch(baseUrl + "/api/v1/skin-scan", {
            method: "POST",
            body: new FormData(),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), INVALID_IMAGE_RESPONSE);
    });

    it("returns only ERROR_NON_SKIN for an unsupported MIME type", async () => {
        const response = await fetch(baseUrl + "/api/v1/skin-scan", {
            method: "POST",
            body: imageForm(new Uint8Array([1, 2, 3]), "text/plain", "face.txt"),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), INVALID_IMAGE_RESPONSE);
    });

    it("returns only ERROR_NON_SKIN when image decoding fails", async () => {
        normalizationError = new Error("unreadable image");
        try {
            const response = await fetch(baseUrl + "/api/v1/skin-scan", {
                method: "POST",
                body: imageForm(new Uint8Array([0]), "image/png", "broken.png"),
            });

            assert.equal(response.status, 400);
            assert.deepEqual(await response.json(), INVALID_IMAGE_RESPONSE);
        } finally {
            normalizationError = undefined;
        }
    });

    it("returns only ERROR_NON_SKIN when more than one image is uploaded", async () => {
        const form = imageForm(new Uint8Array([1]), "image/jpeg", "one.jpg");
        form.append("image", new Blob([new Uint8Array([2])], { type: "image/jpeg" }), "two.jpg");

        const response = await fetch(baseUrl + "/api/v1/skin-scan", { method: "POST", body: form });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), INVALID_IMAGE_RESPONSE);
    });

    it("returns only ERROR_NON_SKIN when the image exceeds the configured size", async () => {
        const response = await fetch(baseUrl + "/api/v1/skin-scan", {
            method: "POST",
            body: imageForm(new Uint8Array(1024 * 1024 + 1), "image/jpeg", "large.jpg"),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), INVALID_IMAGE_RESPONSE);
    });

    it("returns a model image-quality error unchanged with status 422", async () => {
        scanResult = {
            errmsg: {
                errorCode: "ERROR_IMAGE_BLURRY",
                suggestion: "Retake a sharp, front-facing photo in even light.",
            },
        };

        const response = await fetch(baseUrl + "/api/v1/skin-scan", {
            method: "POST",
            body: imageForm(new Uint8Array([1]), "image/webp", "face.webp"),
        });

        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), scanResult);
    });

    it("returns a model system error unchanged with status 502", async () => {
        scanResult = {
            errmsg: {
                errorCode: "ERROR_SYSTEM",
                suggestion: "Please try again later.",
            },
        };

        const response = await fetch(baseUrl + "/api/v1/skin-scan", {
            method: "POST",
            body: imageForm(new Uint8Array([1]), "image/heic", "face.heic"),
        });

        assert.equal(response.status, 502);
        assert.deepEqual(await response.json(), scanResult);
    });
});

function imageForm (bytes: Uint8Array, type: string, filename: string): FormData {
    const form = new FormData();
    form.set("image", new Blob([bytes], { type }), filename);
    return form;
}

function successResult (): SkinScanResult {
    return {
        data: {
            skinTone: "Medium Skin",
            skinAge: "25-30",
            hydration: "Hydrated",
            skinType: "Combination Skin",
        },
    };
}
