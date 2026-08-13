import type { SkinImage } from "../entities/SkinScanResult.js";

export default interface ImageNormalizer {
    normalizeImage (bytes: Uint8Array): Promise<SkinImage>;
}
