import heicConvert from "heic-convert";
import sharp from "sharp";
import type { SkinImage } from "../../domain/entities/SkinScanResult.js";
import type ImageNormalizer from "../../domain/services/IImageNormalizer.js";

export { SharpImageNormalizer as default };

const HEIC_BRANDS = new Set([
    "heic",
    "heix",
    "hevc",
    "hevx",
    "heim",
    "heis",
    "hevm",
    "hevs",
    "mif1",
    "msf1",
]);

class SharpImageNormalizer implements ImageNormalizer {
    public async normalizeImage (bytes: Uint8Array): Promise<SkinImage> {
        const source = isHeic(bytes)
            ? await heicConvert({ buffer: bytes, format: "JPEG" })
            : bytes;
        const normalized = await sharp(source)
            .rotate()
            .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();

        return { bytes: normalized, mimeType: "image/jpeg" };
    }
}

function isHeic (bytes: Uint8Array): boolean {
    if (bytes.length < 12 || readAscii(bytes, 4, 8) !== "ftyp") {
        return false;
    }

    return HEIC_BRANDS.has(readAscii(bytes, 8, 12));
}

function readAscii (bytes: Uint8Array, start: number, end: number): string {
    return String.fromCharCode(...bytes.subarray(start, end));
}
