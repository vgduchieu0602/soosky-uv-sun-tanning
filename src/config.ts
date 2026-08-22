import dotenv from "dotenv";

export { config as default };

/* -------------------------------------------------------------------------- */

class InvalidEnvVarError extends Error {
    constructor(key: string, expectation: string) {
        super(`Environment variable [${key}] must be ${expectation}.`);
        this.name = "InvalidEnvVarError";
    }
}

/* -------------------------------------------------------------------------- */

dotenv.config({
    encoding: "utf-8",
    override: false,
});

/* -------------------------------------------------------------------------- */

function readPositiveInt(key: string, fallback: number): number {
    const raw = process.env[key];

    if (raw === undefined || !raw.trim())
        return fallback;

    const value = Number(raw);

    if (!Number.isSafeInteger(value) || value <= 0)
        throw new InvalidEnvVarError(key, "a positive integer");

    return value;
}

function readTrustProxy(): boolean | number | string {
    const raw = process.env.HTTP_TRUST_PROXY;

    if (raw === undefined || !raw.trim())
        return 1;

    const value = raw.trim();

    if (value === "true" || value === "false")
        return value === "true";

    const hopCount = Number(value);

    if (Number.isSafeInteger(hopCount) && hopCount >= 0)
        return hopCount;

    return value;
}

function readRequiredString(key: string): string {
    const value = process.env[key]?.trim();

    if (!value)
        throw new InvalidEnvVarError(key, "a non-empty string");

    return value;
}

/* -------------------------------------------------------------------------- */

const config = {
    http: {
        port:       readPositiveInt("HTTP_PORT", 3000),
        host:       process.env.HTTP_HOST || "0.0.0.0",
        trustProxy: readTrustProxy(),
    },
    mongo: {
        uri: process.env.MONGO_URI,
    },
    openWeatherMap: {
        apiKey: readRequiredString("OPENWEATHERMAP_API_KEY"),
    },
    gemini: {
        apiKey: readRequiredString("GEMINI_API_KEY"),
        model:  process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite",
    },
    image: {
        maxImageMb: readPositiveInt("MAX_IMAGE_MB", 8),
    },
};
