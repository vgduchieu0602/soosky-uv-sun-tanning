import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import Server from "../src/http/Server.js";

describe("Server", () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
        // Port 0: OS cap cong ranh, test khong dung cong that cua may.
        server = new Server(
            { http: { host: "127.0.0.1", port: 0, trustProxy: false } },
            () => "disconnected",
        );

        const listener = await server.listen();
        const { port } = listener.address() as AddressInfo;

        baseUrl = "http://127.0.0.1:" + port;
    });

    after(async () => {
        await server.close();
    });

    it("GET /health tra ve envelope ok cung trang thai database", async () => {
        const response = await fetch(baseUrl + "/health");
        const body = await response.json() as { ok: boolean; data: Record<string, unknown> };

        assert.equal(response.status, 200);
        assert.equal(body.ok, true);
        assert.equal(body.data.status, "ok");
        assert.equal(body.data.database, "disconnected");
    });

    it("route la tra ve 404 NOT_FOUND theo envelope loi", async () => {
        const response = await fetch(baseUrl + "/khong-ton-tai");
        const body = await response.json() as { ok: boolean; code: string };

        assert.equal(response.status, 404);
        assert.equal(body.ok, false);
        assert.equal(body.code, "NOT_FOUND");
    });
});
