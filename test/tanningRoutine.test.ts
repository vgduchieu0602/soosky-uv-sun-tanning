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
                    execute: async () => ({ data: { routineName: "Safe glow", totalDays: 2, targetGoal: { title: "Safe glow", targetText: "Build a gradual protected tan." }, dailySchedule: [{ day: 1, phase: "Prep", activities: ["Use SPF 50+"] }, { day: 2, phase: "Rest", activities: ["No sun exposure."] }] } }),
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
        assert.deepEqual(await response.json(), { data: { routineName: "Safe glow", totalDays: 2, targetGoal: { title: "Safe glow", targetText: "Build a gradual protected tan." }, dailySchedule: [{ day: 1, phase: "Prep", activities: ["Use SPF 50+"] }, { day: 2, phase: "Rest", activities: ["No sun exposure."] }] } });
    });

    it("passes a scan error through without invoking Gemini", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ errmsg: { errorCode: "ERROR_TOO_MANY_FACES", suggestion: "One face." } }) });
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), { errmsg: { errorCode: "ERROR_TOO_MANY_FACES", suggestion: "One face." } });
    });

    it("accepts targetTone as the backward-compatible target skin field", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentSkin, targetTone: "Medium Skin" }),
        });

        assert.equal(response.status, 200);
    });

    it("rejects a missing target tone", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentSkin }),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            errmsg: { errorCode: "ERR-99", suggestion: "targetTone (or desiredSkin) is required." },
        });
    });

    it("rejects invalid skin age ranges", async () => {
        for (const skinAge of ["-5", "150", "10-90", "18-80"]) {
            const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ currentSkin: { ...currentSkin, skinAge }, desiredSkin: "Medium Skin" }),
            });

            assert.equal(response.status, 400, skinAge);
            assert.deepEqual(await response.json(), {
                errmsg: { errorCode: "ERR-99", suggestion: "currentSkin.skinAge must be a valid age range between 1 and 100 years, with a maximum 20-year span." },
            }, skinAge);
        }
    });

    it("rejects a target tone lighter than the current skin tone", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                currentSkin: { ...currentSkin, skinTone: "Brown Skin" },
                targetTone: "Fair Skin",
            }),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            errmsg: {
                errorCode: "ERR-99",
                suggestion: "targetTone must be the same as or darker than current skin tone.",
            },
        });
    });
});
