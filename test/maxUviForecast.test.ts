import assert from "node:assert/strict";
import { describe, it } from "node:test";
import MaxUviForecastRepository from "../src/adapters/forecast/MaxUviForecastRepository.js";
import OpenMeteoUvIndexSeriesRepository from "../src/adapters/openmeteo/OpenMeteoUvIndexSeriesRepository.js";
import { UvIndexForecastPoint } from "../src/domain/entities/UvIndexForecastPoint.js";
import UvIndexForecastRepository from "../src/domain/repositories/IUvIndexForecastRepository.js";
import UvIndexSeriesRepository from "../src/domain/repositories/IUvIndexSeriesRepository.js";

const NOON_IN_HO_CHI_MINH = Math.floor(Date.parse("2026-08-19T05:00:00.000Z") / 1000);
const UTC_PLUS_SEVEN = 7 * 60 * 60;
const HOUR_IN_SECONDS = 60 * 60;

describe("MaxUviForecastRepository", () => {
    it("reads the local daily maximum for a daily point", async () => {
        const repository = new MaxUviForecastRepository(forecastStub(), seriesStub());

        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily.data[0]?.maxUvi, 9.1);
        assert.equal(daily.cache, "upstream");
    });

    it("reads the peak of the 3-hour window for an hourly point", async () => {
        const repository = new MaxUviForecastRepository(forecastStub(), seriesStub());

        const hourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });

        // 3.0, 7.4 va 5.2 nam trong khung; 9.9 o gio thu tu nen bi loai.
        assert.equal(hourly.data[0]?.maxUvi, 7.4);
    });

    it("keeps the forecast usable when the UV provider fails", async () => {
        const failing: UvIndexSeriesRepository = {
            getUvIndexSeries: async () => {
                throw new Error("UV provider is unreachable.");
            },
        };
        const logged: string[] = [];
        const repository = new MaxUviForecastRepository(forecastStub(), failing, (message) => logged.push(message));

        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });
        const hourly = await repository.getHourlyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily.data[0]?.maxUvi, null);
        assert.equal(hourly.data[0]?.maxUvi, null);
        assert.equal(daily.data[0]?.temp, 30);
        assert.equal(logged.length, 2);
    });

    it("returns a null maximum when the series has no matching entry", async () => {
        const empty: UvIndexSeriesRepository = {
            getUvIndexSeries: async () => ({
                hourly: new Map(),
                dailyMax: new Map(),
                utcOffsetSeconds: UTC_PLUS_SEVEN,
            }),
        };
        const repository = new MaxUviForecastRepository(forecastStub(), empty);

        const daily = await repository.getDailyUvForecast({ lat: 10.7, lon: 106.7 });

        assert.equal(daily.data[0]?.maxUvi, null);
    });
});

describe("OpenMeteoUvIndexSeriesRepository", () => {
    it("maps local provider times onto UTC timestamps", async () => {
        let requested: URL | undefined;
        const repository = new OpenMeteoUvIndexSeriesRepository(async (input) => {
            requested = input as URL;
            return new Response(JSON.stringify({
                utc_offset_seconds: UTC_PLUS_SEVEN,
                hourly: { time: ["2026-08-19T12:00", "2026-08-19T13:00"], uv_index: [8.4, null] },
                daily: { time: ["2026-08-19"], uv_index_max: [9.1] },
            }), { status: 200 });
        });

        const series = await repository.getUvIndexSeries({ lat: 10.7, lon: 106.7 });

        assert.equal(requested?.searchParams.get("hourly"), "uv_index");
        assert.equal(requested?.searchParams.get("daily"), "uv_index_max");
        assert.equal(requested?.searchParams.get("timezone"), "auto");
        assert.equal(series.utcOffsetSeconds, UTC_PLUS_SEVEN);
        assert.equal(series.hourly.get(NOON_IN_HO_CHI_MINH), 8.4);
        assert.equal(series.hourly.size, 1);
        assert.equal(series.dailyMax.get("2026-08-19"), 9.1);
    });

    it("reports an unavailable provider", async () => {
        const repository = new OpenMeteoUvIndexSeriesRepository(async () => new Response("", { status: 503 }));

        await assert.rejects(
            () => repository.getUvIndexSeries({ lat: 10.7, lon: 106.7 }),
            /UV provider returned status 503\./,
        );
    });
});

function forecastStub (): UvIndexForecastRepository {
    const point: UvIndexForecastPoint = {
        datetime: "2026-08-19T05:00:00.000Z",
        weather: [],
        description: "clear sky",
        uvi: null,
        maxUvi: null,
        temp: 30,
        pop: 0,
    };

    return {
        getDailyUvForecast: async () => ({ data: [point], cache: "upstream" }),
        getHourlyUvForecast: async () => ({ data: [point], cache: "upstream" }),
    };
}

function seriesStub (): UvIndexSeriesRepository {
    return {
        getUvIndexSeries: async () => ({
            hourly: new Map([
                [NOON_IN_HO_CHI_MINH, 3],
                [NOON_IN_HO_CHI_MINH + HOUR_IN_SECONDS, 7.4],
                [NOON_IN_HO_CHI_MINH + 2 * HOUR_IN_SECONDS, 5.2],
                [NOON_IN_HO_CHI_MINH + 3 * HOUR_IN_SECONDS, 9.9],
            ]),
            dailyMax: new Map([["2026-08-19", 9.1]]),
            utcOffsetSeconds: UTC_PLUS_SEVEN,
        }),
    };
}
