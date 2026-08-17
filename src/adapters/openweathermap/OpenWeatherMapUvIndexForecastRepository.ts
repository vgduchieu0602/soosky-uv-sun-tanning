import {
    UvIndexForecastPoint,
    UvIndexForecastWeather,
} from "../../domain/entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";

export { OpenWeatherMapUvIndexForecastRepository as default };

const FIVE_DAY_FORECAST_URL = "https://api.openweathermap.org/data/2.5/forecast";
const HOUR_IN_SECONDS = 60 * 60;
const DAY_IN_SECONDS = 24 * HOUR_IN_SECONDS;
const DAILY_TARGET_SECOND = 12 * HOUR_IN_SECONDS;

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

    public async getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        const payload = await this._fetchPayload(FIVE_DAY_FORECAST_URL, coordinates);
        if (!isRecord(payload) || !Array.isArray(payload.list)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        const city = isRecord(payload.city) ? payload.city : undefined;
        const timezoneOffset = toFiniteNumber(city?.timezone) ?? 0;
        return selectDailySteps(payload.list as OpenWeatherMapForecastStep[], timezoneOffset)
            .map((step) => toForecastPoint(step, timezoneOffset));
    }

    public async getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        const payload = await this._fetchPayload(FIVE_DAY_FORECAST_URL, coordinates);
        if (!isRecord(payload) || !Array.isArray(payload.list)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        const city = isRecord(payload.city) ? payload.city : undefined;
        const timezoneOffset = toFiniteNumber(city?.timezone) ?? 0;
        return (payload.list as OpenWeatherMapForecastStep[]).map((step) => toForecastPoint(step, timezoneOffset));
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

function toForecastPoint (step: OpenWeatherMapForecastStep, timezoneOffset: number): UvIndexForecastPoint {
    const weather = mapForecastWeather(step.weather);

    return {
        datetime: getForecastDatetime(step.dt, timezoneOffset),
        weather,
        description: weather[0]?.description ?? null,
        uvi: null,
        temp: toFiniteNumber(step.main?.temp),
        pop: getPrecipitationProbability(step.pop),
    };
}

function getForecastDatetime (timestamp: unknown, timezoneOffset: number): string | null {
    const value = toFiniteNumber(timestamp);
    if (value === null) return null;

    const datetime = new Date((value + timezoneOffset) * 1000);
    if (Number.isNaN(datetime.getTime())) return null;

    const sign = timezoneOffset < 0 ? "-" : "+";
    const absoluteOffset = Math.abs(timezoneOffset);
    const offsetHours = Math.floor(absoluteOffset / HOUR_IN_SECONDS);
    const offsetMinutes = Math.floor((absoluteOffset % HOUR_IN_SECONDS) / 60);

    return datetime.getUTCFullYear()
        + "-" + pad(datetime.getUTCMonth() + 1)
        + "-" + pad(datetime.getUTCDate())
        + "T" + pad(datetime.getUTCHours())
        + ":" + pad(datetime.getUTCMinutes())
        + ":" + pad(datetime.getUTCSeconds())
        + sign + pad(offsetHours)
        + ":" + pad(offsetMinutes);
}

function pad (value: number): string {
    return String(value).padStart(2, "0");
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
