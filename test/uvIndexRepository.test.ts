import assert from "node:assert/strict";
import { describe, it } from "node:test";
import CachedCurrentUvIndexRepository from "../src/adapters/cache/CachedCurrentUvIndexRepository.js";
import CachedUvIndexForecastRepository from "../src/adapters/cache/CachedUvIndexForecastRepository.js";
import OpenWeatherMapUvIndexForecastRepository from "../src/adapters/openweathermap/OpenWeatherMapUvIndexForecastRepository.js";
import CurrentUvIndexRepository from "../src/domain/repositories/ICurrentUvIndexRepository.js";
import UvIndexForecastRepository from "../src/domain/repositories/IUvIndexForecastRepository.js";

describe("CachedCurrentUvIndexRepository", () => {
    it("identifies an upstream fetch and a cache hit", async () => {
        let now = 1_000;
        let calls = 0;
        const upstream: CurrentUvIndexRepository = {
            getCurrentUvIndex: async () => {
                calls += 1;
                return {
                    data: { description: "clear sky", uvi: null, temp: 30, weather: expectedWeather("clear sky") },
                    cache: "upstream",
                };
            },
        };
        const repository = new CachedCurrentUvIndexRepository(upstream, 10 * 60 * 1000, () => now);

        const first = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });
        now += 9 * 60 * 1000;
        const second = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });
        now += 60 * 1000;
        const refreshed = await repository.getCurrentUvIndex({ lat: 10.7, lon: 106.7 });

        assert.equal(first.cache, "upstream");
        assert.equal(second.cache, "cached");
        assert.equal(refreshed.cache, "upstream");
        assert.equal(calls, 2);
    });
});

describe("CachedUvIndexForecastRepository", () => {
    it("caches daily and hourly forecasts for 15 minutes", async () => {
        let now = 1_000;
        let dailyCalls = 0;
        let hourlyCalls = 0;
        const upstream: UvIndexForecastRepository = {
            getDailyUvForecast: async () => {
                dailyCalls += 1;
                return { data: [{
                    datetime: "1970-01-01T00:00:00+00:00",
                    weather: expectedWeather("clear sky"),
                    description: "clear sky",
                    uvi: dailyCalls,
                    temp: 30,
                    pop: 0,
                }], cache: "upstream" };
            },
            getHourlyUvForecast: async () => {
                hourlyCalls += 1;
                return { data: [{
                    datetime: "1970-01-01T00:00:00+00:00",
                    weather: expectedWeather("clear sky"),
                    description: "clear sky",
                    uvi: hourlyCalls,
                    temp: 30,
                    pop: 0,
                }], cache: "upstream" };
            },
        };
        const repository = new CachedUvIndexForecastRepository(
            upstream,
            15 * 60 * 1000,
            15 * 60 * 1000,
            () => now,
        );

        await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });
        now += 10 * 60 * 1000;
        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const hourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });
        now += 5 * 60 * 1000;
        const refreshedDaily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const refreshedHourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily.data[0]?.uvi, 1);
        assert.equal(hourly.data[0]?.uvi, 1);
        assert.equal(daily.cache, "cached");
        assert.equal(hourly.cache, "cached");
        assert.equal(refreshedDaily.data[0]?.uvi, 2);
        assert.equal(refreshedHourly.data[0]?.uvi, 2);
        assert.equal(refreshedDaily.cache, "upstream");
        assert.equal(refreshedHourly.cache, "upstream");
        assert.equal(dailyCalls, 2);
        assert.equal(hourlyCalls, 2);
    });
});

describe("OpenWeatherMapUvIndexForecastRepository", () => {
    it("maps Forecast5 three-hour records for the hourly endpoint", async () => {
        let requestUrl: URL | undefined;
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (input): Promise<Response> => {
                requestUrl = new URL(input.toString());
                return new Response(JSON.stringify({
                    city: { timezone: 7 * 60 * 60 },
                    list: [
                        { dt: 86_400, main: { temp: 30 }, pop: 0, weather: [providerWeather("first forecast")] },
                        { dt: 97_200, main: { temp: 31 }, pop: 0.4, weather: [providerWeather("next forecast")] },
                    ],
                }), { status: 200 });
            },
        );

        assert.deepEqual(await repository.getHourlyUvForecast({ lat: 10.7769, lon: 106.7009 }), { data: [
            {
                datetime: "1970-01-02T00:00:00.000Z",
                weather: expectedWeather("first forecast"),
                description: "first forecast",
                uvi: null,
                temp: 30,
                pop: 0,
            },
            {
                datetime: "1970-01-02T03:00:00.000Z",
                weather: expectedWeather("next forecast"),
                description: "next forecast",
                uvi: null,
                temp: 31,
                pop: 0.4,
            },
        ], cache: "upstream" });
        assert.equal(requestUrl?.pathname, "/data/2.5/forecast");
        assert.equal(requestUrl?.searchParams.get("units"), "metric");
    });

    it("includes both endpoints of the next 24-hour hourly range", async () => {
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (): Promise<Response> => new Response(JSON.stringify({
                list: Array.from({ length: 9 }, (_, index) => ({
                    dt: index * 3 * 60 * 60,
                    main: { temp: 30 },
                    pop: 0,
                    weather: [providerWeather("forecast " + index)],
                })),
            }), { status: 200 }),
        );

        const result = await repository.getHourlyUvForecast({ lat: 10.7769, lon: 106.7009 });

        assert.equal(result.data.length, 9);
        assert.equal(result.data[0]?.datetime, "1970-01-01T00:00:00.000Z");
        assert.equal(result.data.at(-1)?.datetime, "1970-01-02T00:00:00.000Z");
    });

    it("groups Forecast5 data into daily points and preserves provider zero precipitation", async () => {
        let requestUrl: URL | undefined;
        const repository = new OpenWeatherMapUvIndexForecastRepository(
            "test-key",
            async (input): Promise<Response> => {
                requestUrl = new URL(input.toString());
                return new Response(JSON.stringify({
                    city: { timezone: 0 },
                    list: [
                        { dt: 32_400, main: { temp: 29 }, pop: 0.7, weather: [providerWeather("morning rain")] },
                        { dt: 43_200, main: { temp: 30 }, pop: 0, weather: [providerWeather("midday rain")] },
                        { dt: 118_800, main: { temp: 31 }, pop: 0.2, weather: [providerWeather("next morning")] },
                        { dt: 129_600, main: { temp: 32 }, weather: [providerWeather("next midday")] },
                    ],
                }), { status: 200 });
            },
        );

        assert.deepEqual(await repository.getDailyUvForecast({ lat: 10.7769, lon: 106.7009 }), { data: [{
            datetime: "1970-01-01T12:00:00.000Z",
            weather: expectedWeather("midday rain"),
            description: "midday rain",
            uvi: null,
            temp: 30,
            pop: 0,
        }, {
            datetime: "1970-01-02T12:00:00.000Z",
            weather: expectedWeather("next midday"),
            description: "next midday",
            uvi: null,
            temp: 32,
            pop: null,
        }], cache: "upstream" });
        assert.equal(requestUrl?.pathname, "/data/2.5/forecast");
        assert.equal(requestUrl?.searchParams.get("units"), "metric");
    });
});

function providerWeather (description: string): object {
    return { id: 500, main: "Rain", description, icon: "10d" };
}

function expectedWeather (description: string): object[] {
    return [{ code: "500d", mainWeather: "Rain", description, icon: "10d" }];
}
