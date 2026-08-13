import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import UvIndexRepository, { UvIndexCoordinates } from "../../domain/repositories/IUvIndexRepository.js";

export { CachedUvIndexRepository as default };

interface CacheEntry {
    value: CurrentUvIndex;
    expiresAt: number;
}

class CachedUvIndexRepository implements UvIndexRepository {
    private readonly _cache = new Map<string, CacheEntry>();

    public constructor (
        private readonly _upstream: UvIndexRepository,
        private readonly _ttlMs: number,
        private readonly _now: () => number = Date.now,
    ) {}

    public async getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<CurrentUvIndex> {
        const key = coordinates.lat + ":" + coordinates.lon;
        const cached = this._cache.get(key);
        const now = this._now();

        if (cached && cached.expiresAt > now) {
            return cached.value;
        }

        const value = await this._upstream.getCurrentUvIndex(coordinates);
        this._cache.set(key, { value, expiresAt: now + this._ttlMs });
        return value;
    }
}
