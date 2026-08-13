import type { SkinImage, SkinScanResult } from "../entities/SkinScanResult.js";

export default interface SkinScanAnalyzer {
    scanSkin (image: SkinImage): Promise<SkinScanResult>;
}
