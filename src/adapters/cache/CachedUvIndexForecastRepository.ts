import { UvIndexForecastPoint } from "../../domain/entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";

export { CachedUvIndexForecastRepository as default };

interface CacheEntry {
    value: UvIndexForecastPoint[];
    expiresAt: number;
}

class CachedUvIndexForecastRepository implements UvIndexForecastRepository {
    private readonly _dailyCache = new Map<string, CacheEntry>();
    private readonly _hourlyCache = new Map<string, CacheEntry>();

    public constructor (
        private readonly _upstream: UvIndexForecastRepository,
        private readonly _dailyTtlMs: number,
        private readonly _hourlyTtlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        return this._getOrLoad(
            this._dailyCache,
            coordinates,
            this._dailyTtlMs,
            () => this._upstream.getDailyUvForecast(coordinates),
        );
    }

    public async getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]> {
        return this._getOrLoad(
            this._hourlyCache,
            coordinates,
            this._hourlyTtlMs,
            () => this._upstream.getHourlyUvForecast(coordinates),
        );
    }

    private async _getOrLoad (
        cache: Map<string, CacheEntry>,
        coordinates: UvIndexCoordinates,
        ttlMs: number,
        load: () => Promise<UvIndexForecastPoint[]>,
    ): Promise<UvIndexForecastPoint[]> {
        const key = coordinates.lat + ":" + coordinates.lon;
        const cached = cache.get(key);
        const now = this._now();

        if (cached && cached.expiresAt > now) {
            return cached.value;
        }

        const value = await load();
        cache.set(key, { value, expiresAt: now + ttlMs });
        return value;
    }
}
