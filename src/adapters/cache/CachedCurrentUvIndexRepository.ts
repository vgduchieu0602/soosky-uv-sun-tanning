import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import { DataFetchResult } from "../../domain/entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import CurrentUvIndexRepository from "../../domain/repositories/ICurrentUvIndexRepository.js";

export { CachedCurrentUvIndexRepository as default };

class CachedCurrentUvIndexRepository implements CurrentUvIndexRepository {
    private readonly _cache = new Map<string, { value: CurrentUvIndex; expiresAt: number }>();

    public constructor (
        private readonly _upstream: CurrentUvIndexRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<DataFetchResult<CurrentUvIndex>> {
        const key = coordinates.lat + ":" + coordinates.lon;
        const cached = this._cache.get(key);
        const now = this._now();

        if (cached && cached.expiresAt > now) {
            return { data: cached.value, cache: "cached" };
        }

        const result = await this._upstream.getCurrentUvIndex(coordinates);
        this._cache.set(key, { value: result.data, expiresAt: now + this._ttlMs });
        return { data: result.data, cache: "upstream" };
    }
}
