import assert from "node:assert/strict";
import { describe, it } from "node:test";
import CachedUvIndexRepository from "../src/adapters/cache/CachedUvIndexRepository.js";
import CachedUvIndexForecastRepository from "../src/adapters/cache/CachedUvIndexForecastRepository.js";
import OpenWeatherMapUvIndexRepository from "../src/adapters/openweathermap/OpenWeatherMapUvIndexRepository.js";
import OpenWeatherMapUvIndexForecastRepository from "../src/adapters/openweathermap/OpenWeatherMapUvIndexForecastRepository.js";
import { CurrentUvIndex } from "../src/domain/entities/CurrentUvIndex.js";
import UvIndexRepository from "../src/domain/repositories/IUvIndexRepository.js";
import UvIndexForecastRepository from "../src/domain/repositories/IUvIndexForecastRepository.js";

describe("CachedUvIndexRepository", () => {
    it("dung lai gia tri trong 6 gio va tai lai khi het han", async () => {
        let now = 1_000;
        let upstreamCalls = 0;
        const upstream: UvIndexRepository = {
            getCurrentUvIndex: async (): Promise<CurrentUvIndex> => {
                upstreamCalls += 1;
                return { description: "clear sky", uvi: upstreamCalls, temp: 30 };
            },
        };
        const repository = new CachedUvIndexRepository(upstream, 6 * 60 * 60 * 1000, () => now);

        const first = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });
        now += 6 * 60 * 60 * 1000 - 1;
        const cached = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });
        now += 1;
        const refreshed = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });

        assert.equal(first.uvi, 1);
        assert.equal(cached.uvi, 1);
        assert.equal(refreshed.uvi, 2);
        assert.equal(upstreamCalls, 2);
    });
});

describe("CachedUvIndexForecastRepository", () => {
    it("cache daily 12 gio va hourly 6 gio doc lap", async () => {
        let now = 1_000;
        let dailyCalls = 0;
        let hourlyCalls = 0;
        const upstream: UvIndexForecastRepository = {
            getDailyUvForecast: async () => {
                dailyCalls += 1;
                return [{ description: "clear sky", uvi: dailyCalls, temp: 30, pop: 0 }];
            },
            getHourlyUvForecast: async () => {
                hourlyCalls += 1;
                return [{ description: "clear sky", uvi: hourlyCalls, temp: 30, pop: 0 }];
            },
        };
        const repository = new CachedUvIndexForecastRepository(
            upstream,
            12 * 60 * 60 * 1000,
            6 * 60 * 60 * 1000,
            () => now,
        );

        await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });
        now += 6 * 60 * 60 * 1000;
        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const hourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily[0]?.uvi, 1);
        assert.equal(hourly[0]?.uvi, 2);
        assert.equal(dailyCalls, 1);
        assert.equal(hourlyCalls, 2);
    });
});

describe("OpenWeatherMapUvIndexRepository", () => {
    it("map data dau tien cua One Call 4.0 va yeu cau don vi metric", async () => {
        let requestUrl: URL | undefined;
        const repository = new OpenWeatherMapUvIndexRepository(
            "test-key",
            async (input): Promise<Response> => {
                requestUrl = new URL(input.toString());
                return new Response(JSON.stringify({
                    data: [{
                        temp: 31.5,
                        uvi: 8.1,
                        weather: [{ description: "clear sky" }],
                    }],
                }), { status: 200 });
            },
        );

        const result = await repository.getCurrentUvIndex({ lat: 10.7769, lon: 106.7009 });

        assert.deepEqual(result, { description: "clear sky", uvi: 8.1, temp: 31.5 });
        assert.equal(requestUrl?.pathname, "/data/4.0/onecall/current");
        assert.equal(requestUrl?.searchParams.get("lat"), "10.7769");
        assert.equal(requestUrl?.searchParams.get("lon"), "106.7009");
        assert.equal(requestUrl?.searchParams.get("units"), "metric");
        assert.equal(requestUrl?.searchParams.get("appid"), "test-key");
    });
});

describe("OpenWeatherMapUvIndexForecastRepository", () => {
    it("returns only local 06:00 through 18:00 three-hour hourly forecast slots", async () => {
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (): Promise<Response> => new Response(JSON.stringify({
                timezone_offset: 7 * 60 * 60,
                data: [
                    hourlyStep(82_800, "06:00", 1),
                    hourlyStep(86_400, "07:00", 2),
                    hourlyStep(93_600, "09:00", 3),
                    hourlyStep(100_800, "11:00", 4),
                    hourlyStep(104_400, "12:00", 5),
                    hourlyStep(115_200, "15:00", 6),
                    hourlyStep(126_000, "18:00", 7),
                    hourlyStep(129_600, "19:00", 8),
                ],
            }), { status: 200 }),
        );

        assert.deepEqual(await repository.getHourlyUvForecast({ lat: 10.7769, lon: 106.7009 }), [
            { description: "06:00", uvi: 1, temp: 30, pop: 0 },
            { description: "09:00", uvi: 3, temp: 30, pop: 0 },
            { description: "12:00", uvi: 5, temp: 30, pop: 0 },
            { description: "15:00", uvi: 6, temp: 30, pop: 0 },
            { description: "18:00", uvi: 7, temp: 30, pop: 0 },
        ]);
    });

    it("treats a missing daily pop as zero precipitation probability", async () => {
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (): Promise<Response> => new Response(JSON.stringify({
                data: [{
                    temp: { day: 32.82 },
                    uvi: 0,
                    weather: [{ description: "broken clouds" }],
                }],
            }), { status: 200 }),
        );

        assert.deepEqual(await repository.getDailyUvForecast({ lat: 10.7769, lon: 106.7009 }), [{
            description: "broken clouds",
            uvi: 0,
            temp: 32.82,
            pop: 0,
        }]);
    });

    it("map daily temp.day va hourly moi 3 gio tu One Call 4.0", async () => {
        const requestedUrls: URL[] = [];
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (input): Promise<Response> => {
                const url = new URL(input.toString());
                requestedUrls.push(url);
                const isDaily = url.pathname.endsWith("/1day");
                return new Response(JSON.stringify({
                    timezone_offset: 0,
                    data: isDaily
                        ? [{ temp: { day: 29.5 }, uvi: 6.2, pop: 0.7, weather: [{ description: "light rain" }] }]
                        : [
                            { dt: 21_600, temp: 30, uvi: 1, pop: 0, weather: [{ description: "first" }] },
                            { dt: 25_200, temp: 30, uvi: 2, pop: 0, weather: [{ description: "skip one" }] },
                            { dt: 32_400, temp: 31, uvi: 4, pop: 0.1, weather: [{ description: "three hours" }] },
                        ],
                }), { status: 200 });
            },
        );

        const daily = await repository.getDailyUvForecast({ lat: 10.7769, lon: 106.7009 });
        const hourly = await repository.getHourlyUvForecast({ lat: 10.7769, lon: 106.7009 });

        assert.deepEqual(daily, [{ description: "light rain", uvi: 6.2, temp: 29.5, pop: 0.7 }]);
        assert.deepEqual(hourly, [
            { description: "first", uvi: 1, temp: 30, pop: 0 },
            { description: "three hours", uvi: 4, temp: 31, pop: 0.1 },
        ]);
        assert.deepEqual(requestedUrls.map((url) => url.pathname), [
            "/data/4.0/onecall/timeline/1day",
            "/data/4.0/onecall/timeline/1h",
        ]);
        assert.ok(requestedUrls.every((url) => url.searchParams.get("units") === "metric"));
    });
});

function hourlyStep (dt: number, description: string, uvi: number): object {
    return { dt, temp: 30, uvi, pop: 0, weather: [{ description }] };
}
