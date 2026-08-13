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
                    getCurrentUvIndex: { execute: async () => ({ description: "clear sky", uvi: 8, temp: 31 }) },
                    getDailyUvForecast: {
                        execute: async () => [{ description: "light rain", uvi: 6.2, temp: 29.5, pop: 0.7 }],
                    },
                    getHourlyUvForecast: {
                        execute: async () => [{ description: "few clouds", uvi: 4.1, temp: 30, pop: 0.1 }],
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

    it("GET /api/v1/uv-index/daily tra ve du lieu forecast daily", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index/daily?lat=10.7769&lon=106.7009");
        const body = await response.json() as {
            ok: boolean;
            data: Array<{ description: string; uvi: string; temp: string; pop: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual(body.data, [{ description: "light rain", uvi: "6.2", temp: "29.5", pop: "0.7" }]);
    });

    it("GET /api/v1/uv-index/hourly tra ve du lieu forecast hourly", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index/hourly?lat=10.7769&lon=106.7009");
        const body = await response.json() as {
            ok: boolean;
            data: Array<{ description: string; uvi: string; temp: string; pop: string }>;
        };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual(body.data, [{ description: "few clouds", uvi: "4.1", temp: "30", pop: "0.1" }]);
    });
});
