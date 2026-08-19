import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import UvIndexSeriesRepository, { UvIndexSeries } from "../../domain/repositories/IUvIndexSeriesRepository.js";

export { OpenMeteoUvIndexSeriesRepository as default };

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** Forecast5 tra toi da 5-6 ngay dia phuong; lay du 7 ngay UV de phu het. */
const FORECAST_DAYS = 7;

/**
 * Open-Meteo mo, khong can API key. Dung lam nguon UV vi Forecast5 va Current
 * Weather cua OpenWeatherMap khong co truong UV nao.
 */
class OpenMeteoUvIndexSeriesRepository implements UvIndexSeriesRepository {
    public constructor (private readonly _fetch: typeof fetch = fetch) {}

    public async getUvIndexSeries (coordinates: UvIndexCoordinates): Promise<UvIndexSeries> {
        const url = new URL(FORECAST_URL);
        url.searchParams.set("latitude", String(coordinates.lat));
        url.searchParams.set("longitude", String(coordinates.lon));
        url.searchParams.set("hourly", "uv_index");
        url.searchParams.set("daily", "uv_index_max");
        url.searchParams.set("forecast_days", String(FORECAST_DAYS));
        url.searchParams.set("timezone", "auto");

        let response: Response;

        try {
            response = await this._fetch(url);
        } catch {
            throw new UpstreamUnavailableError("UV provider is unreachable.");
        }

        if (!response.ok) {
            throw new UpstreamUnavailableError("UV provider returned status " + response.status + ".");
        }

        let payload: unknown;

        try {
            payload = await response.json() as unknown;
        } catch {
            throw new UpstreamUnavailableError("UV provider returned invalid JSON.");
        }

        if (!isRecord(payload)) {
            throw new UpstreamUnavailableError("UV provider response is incomplete.");
        }

        const utcOffsetSeconds = toFiniteNumber(payload.utc_offset_seconds) ?? 0;

        return {
            hourly: mapHourly(payload.hourly, utcOffsetSeconds),
            dailyMax: mapDailyMax(payload.daily),
            utcOffsetSeconds,
        };
    }
}

function mapHourly (hourly: unknown, utcOffsetSeconds: number): Map<number, number> {
    const series = new Map<number, number>();
    if (!isRecord(hourly) || !Array.isArray(hourly.time) || !Array.isArray(hourly.uv_index)) return series;

    const values = hourly.uv_index;

    hourly.time.forEach((time, index) => {
        const timestamp = toUtcTimestamp(time, utcOffsetSeconds);
        const uvi = toFiniteNumber(values[index]);
        if (timestamp !== null && uvi !== null) series.set(timestamp, uvi);
    });

    return series;
}

function mapDailyMax (daily: unknown): Map<string, number> {
    const series = new Map<string, number>();
    if (!isRecord(daily) || !Array.isArray(daily.time) || !Array.isArray(daily.uv_index_max)) return series;

    const values = daily.uv_index_max;

    daily.time.forEach((date, index) => {
        const uvi = toFiniteNumber(values[index]);
        if (typeof date === "string" && date.trim() !== "" && uvi !== null) series.set(date, uvi);
    });

    return series;
}

/** Open-Meteo tra gio dia phuong khong hau to; doi ve moc UTC theo giay. */
function toUtcTimestamp (localTime: unknown, utcOffsetSeconds: number): number | null {
    if (typeof localTime !== "string") return null;

    const withSeconds = localTime.length === 16 ? localTime + ":00" : localTime;
    const parsed = Date.parse(withSeconds + "Z");

    return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000) - utcOffsetSeconds;
}

function toFiniteNumber (value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
