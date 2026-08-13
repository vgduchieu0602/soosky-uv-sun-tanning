import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import SharpImageNormalizer from "../src/adapters/image/SharpImageNormalizer.js";

describe("SharpImageNormalizer", () => {
    it("converts a large PNG into a JPEG whose dimensions do not exceed 1024 pixels", async () => {
        const image = await sharp({
            create: {
                width: 1600,
                height: 800,
                channels: 3,
                background: { r: 120, g: 90, b: 80 },
            },
        }).png().toBuffer();

        const result = await new SharpImageNormalizer().normalizeImage(image);
        const metadata = await sharp(result.bytes).metadata();

        assert.equal(result.mimeType, "image/jpeg");
        assert.ok((metadata.width ?? 0) <= 1024);
        assert.ok((metadata.height ?? 0) <= 1024);
    });
});
