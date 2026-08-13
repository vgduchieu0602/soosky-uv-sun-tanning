import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import Server from "../src/http/Server.js";

const currentSkin = { skinTone: "Very Fair Skin", skinAge: "25-30", hydration: "Hydrated", skinType: "Oily Skin" };

describe("POST /api/v1/tanning-routine", () => {
    let server: Server;
    let baseUrl: string;

    before(async () => {
        server = new Server({ http: { host: "127.0.0.1", port: 0 } }, () => "test", {
            uv: {} as never,
            skin: {} as never,
            tanning: {
                createRoutine: {
                    execute: async () => ({ data: { routineName: "Safe glow", totalDays: 2, targetGoal: "Gradual tan", dailySchedule: [{ day: 1, phase: "Prep", activities: ["Use SPF 50+"] }, { day: 2, phase: "Rest", activities: ["No sun exposure."] }] } }),
                },
            },
        } as never);
        const listener = await server.listen();
        baseUrl = "http://127.0.0.1:" + (listener.address() as AddressInfo).port;
    });
    after(async () => server.close());

    it("returns an exact generated routine", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentSkin, desiredSkin: "Medium Skin" }) });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { data: { routineName: "Safe glow", totalDays: 2, targetGoal: "Gradual tan", dailySchedule: [{ day: 1, phase: "Prep", activities: ["Use SPF 50+"] }, { day: 2, phase: "Rest", activities: ["No sun exposure."] }] } });
    });

    it("passes a scan error through without invoking Gemini", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ errmsg: { errorCode: "ERROR_TOO_MANY_FACES", suggestion: "One face." } }) });
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), { errmsg: { errorCode: "ERROR_TOO_MANY_FACES", suggestion: "One face." } });
    });
});
