import assert from "node:assert/strict";
import { describe, it } from "node:test";
import CachedUvIndexForecastRepository from "../src/adapters/cache/CachedUvIndexForecastRepository.js";
import OpenWeatherMapUvIndexForecastRepository from "../src/adapters/openweathermap/OpenWeatherMapUvIndexForecastRepository.js";
import UvIndexForecastRepository from "../src/domain/repositories/IUvIndexForecastRepository.js";

describe("CachedUvIndexForecastRepository", () => {
    it("caches daily and hourly forecasts for 12 hours", async () => {
        let now = 1_000;
        let dailyCalls = 0;
        let hourlyCalls = 0;
        const upstream: UvIndexForecastRepository = {
            getDailyUvForecast: async () => {
                dailyCalls += 1;
                return [{
                    datetime: new Date(0),
                    weather: expectedWeather("clear sky"),
                    description: "clear sky",
                    uvi: dailyCalls,
                    temp: 30,
                    pop: 0,
                }];
            },
            getHourlyUvForecast: async () => {
                hourlyCalls += 1;
                return [{
                    datetime: new Date(0),
                    weather: expectedWeather("clear sky"),
                    description: "clear sky",
                    uvi: hourlyCalls,
                    temp: 30,
                    pop: 0,
                }];
            },
        };
        const repository = new CachedUvIndexForecastRepository(
            upstream,
            12 * 60 * 60 * 1000,
            12 * 60 * 60 * 1000,
            () => now,
        );

        await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });
        now += 6 * 60 * 60 * 1000;
        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const hourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });
        now += 6 * 60 * 60 * 1000;
        const refreshedDaily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const refreshedHourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily[0]?.uvi, 1);
        assert.equal(hourly[0]?.uvi, 1);
        assert.equal(refreshedDaily[0]?.uvi, 2);
        assert.equal(refreshedHourly[0]?.uvi, 2);
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
                    list: [
                        { dt: 86_400, main: { temp: 30 }, pop: 0, weather: [providerWeather("first forecast")] },
                        { dt: 97_200, main: { temp: 31 }, pop: 0.4, weather: [providerWeather("next forecast")] },
                    ],
                }), { status: 200 });
            },
        );

        assert.deepEqual(await repository.getHourlyUvForecast({ lat: 10.7769, lon: 106.7009 }), [
            {
                datetime: new Date(86_400_000),
                weather: expectedWeather("first forecast"),
                description: "first forecast",
                uvi: null,
                temp: 30,
                pop: 0,
            },
            {
                datetime: new Date(97_200_000),
                weather: expectedWeather("next forecast"),
                description: "next forecast",
                uvi: null,
                temp: 31,
                pop: 0.4,
            },
        ]);
        assert.equal(requestUrl?.pathname, "/data/2.5/forecast");
        assert.equal(requestUrl?.searchParams.get("units"), "metric");
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

        assert.deepEqual(await repository.getDailyUvForecast({ lat: 10.7769, lon: 106.7009 }), [{
            datetime: new Date(43_200_000),
            weather: expectedWeather("midday rain"),
            description: "midday rain",
            uvi: null,
            temp: 30,
            pop: 0,
        }, {
            datetime: new Date(129_600_000),
            weather: expectedWeather("next midday"),
            description: "next midday",
            uvi: null,
            temp: 32,
            pop: null,
        }]);
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
