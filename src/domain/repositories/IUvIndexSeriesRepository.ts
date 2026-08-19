import { UvIndexCoordinates } from "../entities/UvIndexCoordinates.js";

export { UvIndexSeriesRepository as default };
export type { UvIndexSeries };

/**
 * Chuoi UV cua mot toa do. Nha cung cap thoi tiet chinh (Forecast5) khong tra
 * UV nen UV duoc lay tu mot nguon rieng roi gan vao forecast point.
 */
interface UvIndexSeries {
    /** UV theo tung gio. Key la moc thoi gian UTC tinh bang giay. */
    hourly: Map<number, number>;
    /** UV cao nhat trong ngay. Key la ngay dia phuong dang YYYY-MM-DD. */
    dailyMax: Map<string, number>;
    /** Chenh lech giay giua gio dia phuong cua toa do va UTC. */
    utcOffsetSeconds: number;
}

interface UvIndexSeriesRepository {
    getUvIndexSeries (coordinates: UvIndexCoordinates): Promise<UvIndexSeries>;
}
