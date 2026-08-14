import { UvIndexForecastPoint } from "../../domain/entities/UvIndexForecastPoint.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";
import { UvIndexCoordinates } from "../../domain/repositories/IUvIndexRepository.js";

export { OpenWeatherMapUvIndexForecastRepository as default };

const DAILY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1day";
const HOURLY_TIMELINE_URL = "https://api.openweathermap.org/data/4.0/onecall/timeline/1h";
const HOUR_IN_SECONDS = 60 * 60;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;
const HOURLY_LOCAL_HOURS = new Set([6, 9, 12, 15, 18]);

interface OpenWeatherMapTimelineResponse {
    data?: OpenWeatherMapForecastStep[];
    timezone_offset?: number;
}

interface OpenWeatherMapForecastStep {
    dt?: number;
    temp?: number | { day?: number };
    uvi?: number;
    pop?: number;
    weather?: Array<{ description?: string }>;
}

class OpenWeatherMapUvIndexForecastRepository implements UvIndexForecastRepository {
    public constructor (
        private readonly _apiKey: string,
        private readonly _fetch: typeof fetch = fetch,
    ) {}

    public async getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        const timeline = await this._fetchTimeline(DAILY_TIMELINE_URL, coordinates);
        return timeline.data.map((step) => this._toForecastPoint(step, "daily"));
    }

    public async getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        const timeline = await this._fetchTimeline(HOURLY_TIMELINE_URL, coordinates);
        const timezoneOffset = timeline.timezone_offset;
        if (typeof timezoneOffset !== "number" || !Number.isFinite(timezoneOffset)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        return timeline.data
            .filter((step) => isRequestedHourlySlot(step.dt, timezoneOffset))
            .map((step) => this._toForecastPoint(step, "hourly"));
    }

    private async _fetchTimeline (
        endpoint: string,
        coordinates: UvIndexCoordinates,
    ): Promise<OpenWeatherMapTimelineResponse & { data: OpenWeatherMapForecastStep[] }> {
        const url = new URL(endpoint);
        url.searchParams.set("lat", String(coordinates.lat));
        url.searchParams.set("lon", String(coordinates.lon));
        url.searchParams.set("appid", this._apiKey);
        url.searchParams.set("units", "metric");

        let response: Response;

        try {
            response = await this._fetch(url);
        } catch {
            throw new UpstreamUnavailableError();
        }

        if (!response.ok) {
            throw new UpstreamUnavailableError("Weather provider returned status " + response.status + ".");
        }

        let payload: OpenWeatherMapTimelineResponse;

        try {
            payload = await response.json() as OpenWeatherMapTimelineResponse;
        } catch {
            throw new UpstreamUnavailableError("Weather provider returned invalid JSON.");
        }

        if (!Array.isArray(payload.data)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        return payload as OpenWeatherMapTimelineResponse & { data: OpenWeatherMapForecastStep[] };
    }

    private _toForecastPoint (
        step: OpenWeatherMapForecastStep,
        timeline: "daily" | "hourly",
    ): UvIndexForecastPoint {
        const description = step.weather?.[0]?.description;
        const temp = timeline === "daily"
            ? getDailyTemperature(step.temp)
            : step.temp;
        const pop = step.pop ?? 0;

        if (
            typeof description !== "string"
            || typeof temp !== "number"
            || !Number.isFinite(temp)
            || typeof step.uvi !== "number"
            || !Number.isFinite(step.uvi)
            || typeof pop !== "number"
            || !Number.isFinite(pop)
            || pop < 0
            || pop > 1
        ) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        return { description, uvi: step.uvi, temp, pop };
    }
}

function getDailyTemperature (temperature: OpenWeatherMapForecastStep["temp"]): number | undefined {
    if (typeof temperature === "object" && temperature !== null) {
        return temperature.day;
    }

    return undefined;
}

function isRequestedHourlySlot (timestamp: unknown, timezoneOffset: number): boolean {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) return false;

    const localSecondOfDay = ((timestamp + timezoneOffset) % DAY_IN_SECONDS + DAY_IN_SECONDS) % DAY_IN_SECONDS;
    return localSecondOfDay % HOUR_IN_SECONDS === 0 && HOURLY_LOCAL_HOURS.has(localSecondOfDay / HOUR_IN_SECONDS);
}
