import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import UpstreamUnavailableError from "../../domain/errors/UpstreamUnavailableError.js";
import UvIndexRepository, { UvIndexCoordinates } from "../../domain/repositories/IUvIndexRepository.js";

export { OpenWeatherMapUvIndexRepository as default };

const CURRENT_WEATHER_URL = "https://api.openweathermap.org/data/4.0/onecall/current";

interface OpenWeatherMapCurrentResponse {
    data?: Array<{
        temp?: number;
        uvi?: number;
        weather?: Array<{ description?: string }>;
    }>;
}

class OpenWeatherMapUvIndexRepository implements UvIndexRepository {
    public constructor (
        private readonly _apiKey: string,
        private readonly _fetch: typeof fetch = fetch,
    ) {}

    public async getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<CurrentUvIndex> {
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

        let payload: OpenWeatherMapCurrentResponse;

        try {
            payload = await response.json() as OpenWeatherMapCurrentResponse;
        } catch {
            throw new UpstreamUnavailableError("Weather provider returned invalid JSON.");
        }

        const current = payload.data?.[0];
        const description = current?.weather?.[0]?.description;

        if (
            !current
            || typeof description !== "string"
            || typeof current.uvi !== "number"
            || !Number.isFinite(current.uvi)
            || typeof current.temp !== "number"
            || !Number.isFinite(current.temp)
        ) {
            throw new UpstreamUnavailableError("Weather provider response is incomplete.");
        }

        return { description, uvi: current.uvi, temp: current.temp };
    }
}
