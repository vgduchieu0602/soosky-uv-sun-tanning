import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import Server from "../src/http/Server.js";

describe("UV forecast endpoints", () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
        server = new Server(
            { http: { host: "127.0.0.1", port: 0, trustProxy: false } },
            () => "disconnected",
            {
                uv: {
                    getCurrentUvIndex: {
                        execute: async () => ({
                            data: {
                                description: "overcast clouds",
                                uvi: null,
                                temp: 31.8,
                                weather: [{ code: "804d", mainWeather: "Clouds", description: "overcast clouds", icon: "04d" }],
                            },
                            cache: "upstream" as const,
                        }),
                    },
                    getDailyUvForecast: {
                        execute: async () => ({
                            data: [{
                                datetime: new Date("2026-08-14T00:00:00.000Z"),
                                weather: [{ code: "500d", mainWeather: "Rain", description: "light rain", icon: "10d" }],
                                description: "light rain",
                                uvi: 6.2,
                                temp: 29.5,
                                pop: 0.7,
                            }],
                            cache: "cached" as const,
                        }),
                    },
                    getHourlyUvForecast: {
                        execute: async () => ({
                            data: [{
                                datetime: new Date("2026-08-14T06:00:00.000Z"),
                                weather: [{ code: "500d", mainWeather: "Rain", description: "few clouds", icon: "10d" }],
                                description: "few clouds",
                                uvi: null,
                                temp: 30,
                                pop: null,
                            }],
                            cache: "upstream" as const,
                        }),
                    },
                },
            } as never,
        );

        const listener = await server.listen();
        const { port } = listener.address() as AddressInfo;
        baseUrl = "http://127.0.0.1:" + port;
    });

    after(async () => {
        await server.close();
    });

    it("returns current weather in the legacy current UV response shape", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index?lat=10.7769&lon=106.7009");

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            ok: true,
            data: {
                description: "overcast clouds",
                uvi: null,
                temp: "31.8",
                weather: [{ code: "804d", mainWeather: "Clouds", description: "overcast clouds", icon: "04d" }],
            },
            meta: { cache: "upstream" },
        });
    });

    it("GET /api/v1/uv-index/daily tra ve du lieu forecast daily", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index/daily?lat=10.7769&lon=106.7009");
        const body = await response.json() as {
            ok: boolean;
            data: Array<{ datetime: string; description: string; uvi: string; temp: string; pop: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual((body as { meta?: unknown }).meta, { cache: "cached" });
        assert.deepEqual(body.data, [{
            datetime: "2026-08-14T00:00:00.000Z",
            weather: [{ code: "500d", mainWeather: "Rain", description: "light rain", icon: "10d" }],
            description: "light rain",
            uvi: "6.2",
            temp: "29.5",
            pop: "0.7",
        }]);
    });

    it("GET /api/v1/uv-index/hourly tra ve du lieu forecast hourly", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index/hourly?lat=10.7769&lon=106.7009");
        const body = await response.json() as {
            ok: boolean;
            data: Array<{ datetime: string; description: string; uvi: string; temp: string; pop: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual((body as { meta?: unknown }).meta, { cache: "upstream" });
        assert.deepEqual(body.data, [{
            datetime: "2026-08-14T06:00:00.000Z",
            weather: [{ code: "500d", mainWeather: "Rain", description: "few clouds", icon: "10d" }],
            description: "few clouds",
            uvi: null,
            temp: "30",
            pop: null,
        }]);
    });

    it("supports the legacy uv-forecast paths", async () => {
        const dailyResponse = await fetch(baseUrl + "/api/v1/uv-forecast/daily?lat=10.7769&lon=106.7009");
        const hourlyResponse = await fetch(baseUrl + "/api/v1/uv-forecast/hourly?lat=10.7769&lon=106.7009");

        assert.equal(dailyResponse.status, 200);
        assert.equal(hourlyResponse.status, 200);
    });

    it("rejects non-numeric coordinates with an invalid number-format message", async () => {
        for (const path of ["/api/v1/uv-index", "/api/v1/uv-forecast/daily", "/api/v1/uv-forecast/hourly"]) {
            const response = await fetch(baseUrl + path + "?lat=%40%23%24&lon=xyz");

            assert.equal(response.status, 400, path);
            assert.deepEqual(await response.json(), {
                ok: false,
                code: "BAD_REQUEST",
                reason: "Query parameter 'lat' must be a valid number.",
            }, path);
        }
    });
});
