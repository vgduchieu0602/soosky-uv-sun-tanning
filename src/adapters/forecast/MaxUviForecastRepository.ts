import { DataFetchResult } from "../../domain/entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import { UvIndexForecastPoint } from "../../domain/entities/UvIndexForecastPoint.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";
import UvIndexSeriesRepository, { UvIndexSeries } from "../../domain/repositories/IUvIndexSeriesRepository.js";

export { MaxUviForecastRepository as default };

const HOUR_IN_SECONDS = 60 * 60;

/** Moi ban ghi Forecast5 dai 3 gio nen maxUvi lay dinh cua 3 gio do. */
const FORECAST_STEP_HOURS = 3;

/**
 * Gan maxUvi vao forecast point. Nguon UV tach roi nguon thoi tiet, nen khi
 * nguon UV hong thi forecast van tra binh thuong voi maxUvi = null.
 */
class MaxUviForecastRepository implements UvIndexForecastRepository {
    public constructor (
        private readonly _upstream: UvIndexForecastRepository,
        private readonly _uvIndexSeriesRepository: UvIndexSeriesRepository,
        private readonly _logError: (message: string) => void = (message: string) => console.error(message),
    ) {}

    public async getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>> {
        const [result, series] = await Promise.all([
            this._upstream.getDailyUvForecast(coordinates),
            this._loadSeries(coordinates),
        ]);

        return withMaxUvi(result, (point) => readDailyMaxUvi(point, series));
    }

    public async getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>> {
        const [result, series] = await Promise.all([
            this._upstream.getHourlyUvForecast(coordinates),
            this._loadSeries(coordinates),
        ]);

        return withMaxUvi(result, (point) => readHourlyMaxUvi(point, series));
    }

    private async _loadSeries (coordinates: UvIndexCoordinates): Promise<UvIndexSeries | null> {
        try {
            return await this._uvIndexSeriesRepository.getUvIndexSeries(coordinates);
        } catch (error) {
            this._logError("UV series fetch failed: " + toErrorMessage(error));
            return null;
        }
    }
}

function withMaxUvi (
    result: DataFetchResult<UvIndexForecastPoint[]>,
    readMaxUvi: (point: UvIndexForecastPoint) => number | null,
): DataFetchResult<UvIndexForecastPoint[]> {
    return {
        data: result.data.map((point) => ({ ...point, maxUvi: readMaxUvi(point) })),
        cache: result.cache,
    };
}

/** maxUvi cua diem ngay = UV cao nhat cua ca ngay dia phuong do. */
function readDailyMaxUvi (point: UvIndexForecastPoint, series: UvIndexSeries | null): number | null {
    if (series === null) return null;

    const timestamp = toTimestamp(point.datetime);
    if (timestamp === null) return null;

    const localDate = new Date((timestamp + series.utcOffsetSeconds) * 1000).toISOString().slice(0, 10);
    return series.dailyMax.get(localDate) ?? null;
}

/** maxUvi cua diem gio = UV cao nhat trong khung 3 gio bat dau tu diem do. */
function readHourlyMaxUvi (point: UvIndexForecastPoint, series: UvIndexSeries | null): number | null {
    if (series === null) return null;

    const timestamp = toTimestamp(point.datetime);
    if (timestamp === null) return null;

    let maxUvi: number | null = null;

    for (let hour = 0; hour < FORECAST_STEP_HOURS; hour += 1) {
        const uvi = series.hourly.get(timestamp + hour * HOUR_IN_SECONDS);
        if (uvi !== undefined && (maxUvi === null || uvi > maxUvi)) maxUvi = uvi;
    }

    return maxUvi;
}

function toTimestamp (datetime: string | null): number | null {
    if (datetime === null) return null;

    const parsed = Date.parse(datetime);
    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function toErrorMessage (error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
