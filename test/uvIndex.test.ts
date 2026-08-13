import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import Server from "../src/http/Server.js";

describe("GET /api/v1/uv-index", () => {
    let server: Server;
    let baseUrl: string;
    let receivedCoordinates: { lat: number; lon: number } | undefined;

    before(async () => {
        server = new Server(
            { http: { host: "127.0.0.1", port: 0, trustProxy: false } },
            () => "disconnected",
            {
                uv: {
                    getCurrentUvIndex: {
                        execute: async (coordinates: { lat: number; lon: number }) => {
                            receivedCoordinates = coordinates;
                            return { description: "clear sky", uvi: 8.1, temp: 31.5 };
                        },
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

    it("tra ve weather description, uvi va temp cho toa do hop le", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index?lat=10.7769&lon=106.7009");
        const body = await response.json() as {
            ok: boolean;
            data: { description: string; uvi: string; temp: string };
        };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.deepEqual(receivedCoordinates, { lat: 10.7769, lon: 106.7009 });
        assert.deepEqual(body.data, { description: "clear sky", uvi: "8.1", temp: "31.5" });
    });

    it("tu choi toa do ngoai pham vi", async () => {
        const response = await fetch(baseUrl + "/api/v1/uv-index?lat=91&lon=106.7009");
        const body = await response.json() as { ok: boolean; code: string };

        assert.equal(response.status, 400);
        assert.equal(body.ok, false);
        assert.equal(body.code, "BAD_REQUEST");
    });
});
