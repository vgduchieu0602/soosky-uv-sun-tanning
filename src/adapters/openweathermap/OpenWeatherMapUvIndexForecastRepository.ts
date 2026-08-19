import {
    UvIndexForecastPoint,
    UvIndexForecastWeather,
} from "../../domain/entities/UvIndexForecastPoint.js";
import { DataFetchResult } from "../../domain/entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";

export { OpenWeatherMapUvIndexForecastRepository as default };

const FIVE_DAY_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";
const HOUR_IN_SECONDS = 60 * 60;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;
const DAILY_TARGET_SECOND = 12 * HOUR_IN_SECONDS;
const HOURLY_FORECAST_POINTS_PER_INCLUSIVE_DAY = 9;

interface OpenWeatherMapWeather {
    id?: unknown;
    main?: unknown;
    description?: unknown;
    icon?: unknown;
}

interface OpenWeatherMapForecastStep {
    dt?: unknown;
    main?: {
        temp?: unknown;
    };
    pop?: unknown;
    weather?: OpenWeatherMapWeather[];
}

class OpenWeatherMapUvIndexForecastRepository implements UvIndexForecastRepository {
    public constructor (
        private readonly _apiKey: string,
        private readonly _fetch: typeof fetch = fetch,
    ) {}

    public async getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>> {
        const payload = await this._fetchPayload(FIVE_DAY_FORECAST_URL, coordinates);
        if (!isRecord(payload) || !Array.isArray(payload.list)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        const city = isRecord(payload.city) ? payload.city : undefined;
        const timezoneOffset = toFiniteNumber(city?.timezone) ?? 0;
        return {
            data: selectDailySteps(payload.list as OpenWeatherMapForecastStep[], timezoneOffset).map(toForecastPoint),
            cache: "upstream",
        };
    }

    public async getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>> {
        const payload = await this._fetchPayload(FIVE_DAY_FORECAST_URL, coordinates);
        if (!isRecord(payload) || !Array.isArray(payload.list)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        return {
            data: (payload.list as OpenWeatherMapForecastStep[])
                .slice(0, HOURLY_FORECAST_POINTS_PER_INCLUSIVE_DAY)
                .map(toForecastPoint),
            cache: "upstream",
        };
    }

    private async _fetchPayload (endpoint: string, coordinates: UvIndexCoordinates): Promise<unknown> {
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

        try {
            return await response.json() as unknown;
        } catch {
            throw new UpstreamUnavailableError("Weather provider returned invalid JSON.");
        }
    }
}

function selectDailySteps (
    steps: OpenWeatherMapForecastStep[],
    timezoneOffset: number,
): OpenWeatherMapForecastStep[] {
    const groups = new Map<number, OpenWeatherMapForecastStep[]>();

    for (const step of steps) {
        const timestamp = toFiniteNumber(step.dt);
        if (timestamp === null) continue;

        const localDay = Math.floor((timestamp + timezoneOffset) / DAY_IN_SECONDS);
        const group = groups.get(localDay) ?? [];
        group.push(step);
        groups.set(localDay, group);
    }

    return [...groups.entries()]
        .sort(([firstDay], [secondDay]) => firstDay - secondDay)
        .flatMap(([, group]) => {
            const step = selectStepClosestToNoon(group, timezoneOffset);
            return step === undefined ? [] : [step];
        });
}

function selectStepClosestToNoon (
    steps: OpenWeatherMapForecastStep[],
    timezoneOffset: number,
): OpenWeatherMapForecastStep | undefined {
    return steps.reduce<OpenWeatherMapForecastStep | undefined>((closest, step) => {
        if (closest === undefined) return step;

        const stepDistance = distanceFromLocalNoon(step.dt, timezoneOffset);
        const closestDistance = distanceFromLocalNoon(closest.dt, timezoneOffset);
        return stepDistance < closestDistance ? step : closest;
    }, undefined);
}

function distanceFromLocalNoon (timestamp: unknown, timezoneOffset: number): number {
    const value = toFiniteNumber(timestamp);
    if (value === null) return Number.POSITIVE_INFINITY;

    const localSecondOfDay = ((value + timezoneOffset) % DAY_IN_SECONDS + DAY_IN_SECONDS) % DAY_IN_SECONDS;
    return Math.abs(localSecondOfDay - DAILY_TARGET_SECOND);
}

function toForecastPoint (step: OpenWeatherMapForecastStep): UvIndexForecastPoint {
    const weather = mapForecastWeather(step.weather);

    return {
        datetime: getForecastDatetime(step.dt),
        weather,
        description: weather[0]?.description ?? null,
        uvi: null,
        temp: toFiniteNumber(step.main?.temp),
        pop: getPrecipitationProbability(step.pop),
    };
}

function getForecastDatetime (timestamp: unknown): string | null {
    const value = toFiniteNumber(timestamp);
    if (value === null) return null;

    const datetime = new Date(value * 1000);
    return Number.isNaN(datetime.getTime()) ? null : datetime.toISOString();
}

function getPrecipitationProbability (value: unknown): number | null {
    const probability = toFiniteNumber(value);
    return probability === null || probability < 0 || probability > 1 ? null : probability;
}

function mapForecastWeather (weather: unknown): UvIndexForecastWeather[] {
    if (!Array.isArray(weather)) return [];

    return weather.map((item) => {
        const weatherItem = isRecord(item) ? item : {};
        const icon = toNonEmptyString(weatherItem.icon);
        const weatherId = toFiniteNumber(weatherItem.id);
        const period = icon?.at(-1);

        return {
            code: weatherId !== null && Number.isSafeInteger(weatherId) && (period === "d" || period === "n")
                ? String(weatherId) + period
                : null,
            mainWeather: toNonEmptyString(weatherItem.main),
            description: toNonEmptyString(weatherItem.description),
            icon,
        };
    });
}

function toFiniteNumber (value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toNonEmptyString (value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
