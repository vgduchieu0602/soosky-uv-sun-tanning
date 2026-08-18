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

    it("rejects an age below one", async () => {
        const { skinAge: _skinAge, ...skinWithoutAge } = currentSkin;
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentSkin: { ...skinWithoutAge, age: -5 }, desiredSkin: "Medium Skin" }),
        });

        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
            errmsg: { errorCode: "ERR-99", suggestion: "Age must be greater than 0." },
        });
    });

    it("allows an age range above 100 when its span is valid", async () => {
        const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ currentSkin: { ...currentSkin, skinAge: "150-160" }, desiredSkin: "Medium Skin" }),
        });

        assert.equal(response.status, 200);
    });

    it("rejects invalid or excessively wide skin-age ranges", async () => {
        for (const skinAge of ["10-90", "18-80", "30-20", "not-an-age"]) {
            const response = await fetch(baseUrl + "/api/v1/tanning-routine", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ currentSkin: { ...currentSkin, skinAge }, desiredSkin: "Medium Skin" }),
            });

            assert.equal(response.status, 400, skinAge);
            assert.deepEqual(await response.json(), {
                errmsg: { errorCode: "ERR-99", suggestion: "Invalid predicted age range." },
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
                suggestion: "Invalid targetTone value.",
            },
        });
    });
});
