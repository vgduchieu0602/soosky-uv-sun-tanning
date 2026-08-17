import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import { DataFetchResult } from "../../domain/entities/DataFetchResult.js";
import { UvIndexForecastWeather } from "../../domain/entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import CurrentUvIndexRepository from "../../domain/repositories/ICurrentUvIndexRepository.js";

export { OpenWeatherMapCurrentUvIndexRepository as default };

const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";

class OpenWeatherMapCurrentUvIndexRepository implements CurrentUvIndexRepository {
    public constructor (
        private readonly _apiKey: string,
        private readonly _fetch: typeof fetch = fetch,
    ) {}

    public async getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<DataFetchResult<CurrentUvIndex>> {
        const url = new URL(CURRENT_WEATHER_URL);
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

        let payload: unknown;

        try {
            payload = await response.json() as unknown;
        } catch {
            throw new UpstreamUnavailableError("Weather provider returned invalid JSON.");
        }

        if (!isRecord(payload)) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        const weather = mapWeather(payload.weather);
        return {
            data: {
                description: weather[0]?.description ?? null,
                uvi: null,
                temp: isRecord(payload.main) ? toFiniteNumber(payload.main.temp) : null,
                weather,
            },
            cache: "upstream",
        };
    }
}

function mapWeather (weather: unknown): UvIndexForecastWeather[] {
    if (!Array.isArray(weather)) return [];

    return weather.map((item) => {
        const condition = isRecord(item) ? item : {};
        const icon = toNonEmptyString(condition.icon);
        const weatherId = toFiniteNumber(condition.id);
        const period = icon?.at(-1);

        return {
            code: weatherId !== null && Number.isSafeInteger(weatherId) && (period === "d" || period === "n")
                ? String(weatherId) + period
                : null,
            mainWeather: toNonEmptyString(condition.main),
            description: toNonEmptyString(condition.description),
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
