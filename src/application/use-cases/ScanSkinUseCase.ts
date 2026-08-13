import type { SkinImage, SkinScanResult } from "../../domain/entities/SkinScanResult.js";
import type SkinScanAnalyzer from "../../domain/repositories/ISkinScanAnalyzer.js";

export default class ScanSkinUseCase {
    public constructor (private readonly _skinScanAnalyzer: SkinScanAnalyzer) {}

    public async execute (image: SkinImage): Promise<SkinScanResult> {
        return this._skinScanAnalyzer.scanSkin(image);
    }
}
