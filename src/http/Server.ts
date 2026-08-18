import http from "node:http";
import express, { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { MulterError } from "multer";
import GetCurrentUvIndexUseCase from "../application/use-cases/GetCurrentUvIndexUseCase.js";
import GetDailyUvForecastUseCase from "../application/use-cases/GetDailyUvForecastUseCase.js";
import GetHourlyUvForecastUseCase from "../application/use-cases/GetHourlyUvForecastUseCase.js";
import ScanSkinUseCase from "../application/use-cases/ScanSkinUseCase.js";
import CreateTanningRoutineUseCase from "../application/use-cases/CreateTanningRoutineUseCase.js";
import type { SkinScanData, SkinScanError } from "../domain/entities/SkinScanResult.js";
import type { DesiredSkin, TanningRoutineQuery } from "../domain/entities/TanningRoutine.js";
import UpstreamUnavailableError from "../domain/errors/UpstreamUnavailableError.js";
import type ImageNormalizer from "../domain/services/IImageNormalizer.js";
import ClientError from "./ClientError.js";
import formatResponseData from "./formatResponseData.js";
import SkinScanRequestError from "./SkinScanRequestError.js";

export { Server as default };
export type { ServerConfig };

interface ServerUseCases {
    uv: {
        getCurrentUvIndex: GetCurrentUvIndexUseCase;
        getDailyUvForecast: GetDailyUvForecastUseCase;
        getHourlyUvForecast: GetHourlyUvForecastUseCase;
    };
    skin: {
        scanSkin: ScanSkinUseCase;
    };
    tanning: {
        createRoutine: CreateTanningRoutineUseCase;
    };
}

interface ServerConfig {
    readonly http: {
        readonly host: string;
        readonly port: number;
        readonly trustProxy?: boolean | number | string;
    };
    readonly image?: {
        readonly maxImageMb: number;
    };
}

type Route = readonly ["get" | "post" | "put" | "delete", string, ...RequestHandler[]];

const INVALID_SKIN_IMAGE = {
    errmsg: {
        errorCode: "ERROR_NON_SKIN",
        suggestion: "Upload one clear frontal face photo in JPEG, PNG, WebP, HEIC, or HEIF format.",
    },
} as const;
const SUPPORTED_SKIN_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);

/**
 * Lop transport mong: validate input bien, goi use-case, tra response.
 * Business logic khong duoc nam o day.
 */
class Server {
    private readonly _server = express();
    private _listener: http.Server | null = null;
    private readonly _skinScanUpload: ReturnType<typeof multer>;
    private readonly _routes: Route[];

    public constructor (
        private readonly _config: ServerConfig,
        private readonly _getDatabaseStatus: () => string = () => "unknown",
        private readonly _useCases?: ServerUseCases,
        private readonly _imageNormalizer?: ImageNormalizer,
    ) {
        this._skinScanUpload = multer({
            storage: multer.memoryStorage(),
            limits: {
                fileSize: (this._config.image?.maxImageMb ?? 8) * 1024 * 1024,
                files: 1,
            },
        });
        this._routes = [
            ["get", "/health", this._GET_health],
            ["get", "/api/v1/uv-index", this._GET_uvIndex],
            ["get", "/api/v1/uv-index/daily", this._GET_uvIndexDailyForecast],
            ["get", "/api/v1/uv-index/hourly", this._GET_uvIndexHourlyForecast],
            ["get", "/api/v1/uv-forecast/daily", this._GET_uvIndexDailyForecast],
            ["get", "/api/v1/uv-forecast/hourly", this._GET_uvIndexHourlyForecast],
            ["post", "/api/v1/skin-scan", this._skinScanUpload.single("image"), this._POST_skinScan],
            ["post", "/api/v1/tanning-routine", this._POST_tanningRoutine],
        ];
        this._registerRouter();
        this._registerErrorHandler();
    }

    public listen (): Promise<http.Server> {
        return new Promise((resolve, reject) => {
            const listener = this._server.listen(this._config.http.port, this._config.http.host);

            listener.once("listening", () => {
                listener.removeAllListeners("error");
                this._listener = listener;
                resolve(listener);
            });
            listener.once("error", (error) => {
                reject(error);
            });
        });
    }

    public close (): Promise<void> {
        if (!this._listener) {
            return Promise.resolve();
        }

        const listener = this._listener;

        return new Promise((resolve, reject) => {
            listener.close((error) => {
                this._listener = null;

                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            });
        });
    }

    private _registerRouter (): void {
        this._server.set("trust proxy", this._config.http.trustProxy ?? 1);
        this._server.use(express.json({ limit: "64kb" }));

        for (const [method, path, ...handlers] of this._routes) {
            this._server[method](path, ...handlers.map((handler) => handler.bind(this)));
        }

        this._server.use(() => {
            throw new ClientError("Route not found", 404, "NOT_FOUND");
        });
    }

    /** Bien loi duy nhat. Khong controller nao tu format loi. */
    private _registerErrorHandler (): void {
        this._server.use((
            error: unknown,
            request: Request,
            response: Response,
            _next: NextFunction,
        ) => {
            switch (true) {
                case request.path === "/api/v1/skin-scan"
                    && (error instanceof SkinScanRequestError || error instanceof MulterError):
                    response.status(400).json(INVALID_SKIN_IMAGE);
                    return;
                case isRequestBodyError(error):
                    response.status(error.status === 413 ? 413 : 400).json({
                        ok: false,
                        code: error.status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST",
                        reason: error.status === 413
                            ? "Request body is too large."
                            : "Request body must be valid JSON.",
                    });
                    return;
                case error instanceof ClientError:
                    response.status(error.statusCode).json({
                        ok: false,
                        code: error.code,
                        reason: error.message,
                    });
                    return;
                case error instanceof UpstreamUnavailableError:
                    response.status(502).json({
                        ok: false,
                        code: "UPSTREAM_UNAVAILABLE",
                        reason: error.message,
                    });
                    return;
                default:
                    // Loi la: log noi bo, client chi nhan thong bao chung.
                    console.error(error);
                    response.status(500).json({
                        ok: false,
                        code: "INTERNAL_SERVER_ERROR",
                        reason: "An unexpected error occurred",
                    });
            }
        });
    }

    private _GET_health (_request: Request, response: Response): void {
        response.json({
            ok: true,
            data: formatResponseData({
                status: "ok",
                uptimeSeconds: Math.round(process.uptime()),
                database: this._getDatabaseStatus(),
            }),
        });
    }

    private async _GET_uvIndex (request: Request, response: Response): Promise<void> {
        if (!this._useCases) {
            throw new Error("UV index use case is not configured.");
        }

        const result = await this._useCases.uv.getCurrentUvIndex.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(result.data, null), meta: { cache: result.cache } });
    }

    private async _GET_uvIndexDailyForecast (request: Request, response: Response): Promise<void> {
        if (!this._useCases) {
            throw new Error("UV index use case is not configured.");
        }

        const result = await this._useCases.uv.getDailyUvForecast.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(result.data, null), meta: { cache: result.cache } });
    }

    private async _GET_uvIndexHourlyForecast (request: Request, response: Response): Promise<void> {
        if (!this._useCases) {
            throw new Error("UV index use case is not configured.");
        }

        const result = await this._useCases.uv.getHourlyUvForecast.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(result.data, null), meta: { cache: result.cache } });
    }

    private async _POST_skinScan (request: Request, response: Response): Promise<void> {
        if (!request.file || !SUPPORTED_SKIN_IMAGE_MIME_TYPES.has(request.file.mimetype)) {
            throw new SkinScanRequestError();
        }
        if (!this._imageNormalizer || !this._useCases?.skin) {
            throw new Error("Skin scan use case is not configured.");
        }

        let image;
        try {
            image = await this._imageNormalizer.normalizeImage(request.file.buffer);
        } catch {
            throw new SkinScanRequestError();
        }

        const result = await this._useCases.skin.scanSkin.execute(image);
        const status = result.errmsg === undefined
            ? 200
            : result.errmsg.errorCode === "ERROR_SYSTEM" ? 502 : 422;

        response.status(status).json(result);
    }

    private async _POST_tanningRoutine (request: Request, response: Response): Promise<void> {
        const scanError = readScanError(request.body);
        if (scanError !== undefined) {
            response.status(422).json({ errmsg: scanError });
            return;
        }
        if (!this._useCases?.tanning) {
            throw new Error("Tanning routine use case is not configured.");
        }

        const parsedQuery = readTanningRoutineQuery(request.body);
        if ("errmsg" in parsedQuery) {
            response.status(400).json(parsedQuery);
            return;
        }

        const result = await this._useCases.tanning.createRoutine.execute(parsedQuery);
        response.status(result.errmsg === undefined ? 200 : 502).json(result);
    }

    private _readCoordinates (request: Request): { lat: number; lon: number } {
        return {
            lat: parseCoordinate(request.query.lat, "lat", -90, 90),
            lon: parseCoordinate(request.query.lon, "lon", -180, 180),
        };
    }
}

function parseCoordinate (value: unknown, name: string, minimum: number, maximum: number): number {
    if (typeof value !== "string" || !value.trim()) {
        throw new ClientError("Query parameter '" + name + "' is required.");
    }

    const coordinate = Number(value);

    if (!Number.isFinite(coordinate)) {
        throw new ClientError("Query parameter '" + name + "' must be a valid number.");
    }

    if (coordinate < minimum || coordinate > maximum) {
        throw new ClientError(
            "Query parameter '" + name + "' must be between " + minimum + " and " + maximum + ".",
        );
    }

    return coordinate;
}

function isRequestBodyError (error: unknown): error is Error & { status: number } {
    return error instanceof Error
        && "status" in error
        && typeof (error as { status: unknown }).status === "number"
        && "body" in error;
}

const SKIN_TONES = new Set<DesiredSkin>([
    "Very Fair Skin", "Fair Skin", "Medium Skin", "Olive Skin", "Brown Skin", "Dark Skin",
]);
const HYDRATIONS = new Set<SkinScanData["hydration"]>([
    "Critically Dry", "Dehydrated", "Hydrated", "Over-Hydrated",
]);
const SKIN_TYPES = new Set<SkinScanData["skinType"]>([
    "Normal Skin", "Dry Skin", "Oily Skin", "Combination Skin", "Sensitive Skin",
]);
const SKIN_TONE_RANK: Record<DesiredSkin, number> = {
    "Very Fair Skin": 0,
    "Fair Skin": 1,
    "Medium Skin": 2,
    "Olive Skin": 3,
    "Brown Skin": 4,
    "Dark Skin": 5,
};
const MINIMUM_SKIN_AGE = 1;
const MAXIMUM_SKIN_AGE_RANGE = 20;
const INVALID_TARGET_TONE_SUGGESTION = "Invalid targetTone value."
const INVALID_SKIN_AGE_SUGGESTION = "Age must be greater than 0.";
const INVALID_SKIN_AGE_RANGE_SUGGESTION = "Invalid predicted age range.";

function readScanError (body: unknown): SkinScanError | undefined {
    if (!isRecord(body) || !isRecord(body.errmsg)) return undefined;
    const { errorCode, suggestion } = body.errmsg;
    if (
        typeof suggestion !== "string"
        || errorCode !== "ERROR_NON_SKIN"
        && errorCode !== "ERROR_TOO_MANY_FACES"
        && errorCode !== "ERROR_NO_FACE_DETECTED"
        && errorCode !== "ERROR_IMAGE_BLURRY"
        && errorCode !== "ERROR_IMAGE_GLARE"
        && errorCode !== "ERROR_LIGHTING_POOR"
        && errorCode !== "ERROR_SYSTEM"
    ) return undefined;
    return { errorCode, suggestion };
}

function readTanningRoutineQuery (
    body: unknown,
): TanningRoutineQuery | { errmsg: { errorCode: "ERR-99"; suggestion: string } } {
    if (!isRecord(body) || !isRecord(body.currentSkin)) {
        return tanningInputError("currentSkin from a successful skin scan is required.");
    }
    const skin = body.currentSkin;
    const desiredSkinInput = readDesiredSkin(body);
    if ("suggestion" in desiredSkinInput) return tanningInputError(desiredSkinInput.suggestion);
    const desiredSkin = desiredSkinInput.desiredSkin;

    if (
        typeof skin.skinTone !== "string" || !SKIN_TONES.has(skin.skinTone as DesiredSkin)
        || typeof skin.hydration !== "string" || !HYDRATIONS.has(skin.hydration as SkinScanData["hydration"])
        || typeof skin.skinType !== "string" || !SKIN_TYPES.has(skin.skinType as SkinScanData["skinType"])
    ) return tanningInputError("currentSkin must contain valid scan-skin values.");

    const skinAgeInput = normalizeSkinAge(skin);
    if ("suggestion" in skinAgeInput) return tanningInputError(skinAgeInput.suggestion);
    const skinAge = skinAgeInput.skinAge;

    if (!SKIN_TONES.has(desiredSkin as DesiredSkin)) {
        return tanningInputError(INVALID_TARGET_TONE_SUGGESTION);
    }

    // Bỏ ràng buộc "không được sáng hơn" — cho phép desiredSkin sáng hơn currentSkin

    return {
        currentSkin: {
            skinTone: skin.skinTone as SkinScanData["skinTone"],
            skinAge,
            hydration: skin.hydration as SkinScanData["hydration"],
            skinType: skin.skinType as SkinScanData["skinType"],
        },
        desiredSkin: desiredSkin as DesiredSkin,
    };
}

function readDesiredSkin (
    body: Record<string, unknown>,
): { desiredSkin: string } | { suggestion: string } {
    const targetTone = body.targetTone;
    const desiredSkin = body.desiredSkin;
    if (targetTone === undefined && desiredSkin === undefined) return { suggestion: "targetTone (or desiredSkin) is required." };
    if (targetTone !== undefined && typeof targetTone !== "string") return { suggestion: "targetTone must be a string." };
    if (desiredSkin !== undefined && typeof desiredSkin !== "string") return { suggestion: "desiredSkin must be a string." };
    if (typeof targetTone === "string" && typeof desiredSkin === "string" && targetTone !== desiredSkin) {
        return { suggestion: "targetTone and desiredSkin must match when both are provided." };
    }
    return { desiredSkin: (targetTone ?? desiredSkin) as string };
}

function normalizeSkinAge (
    skin: Record<string, unknown>,
): { skinAge: string } | { suggestion: string } {
    if (typeof skin.skinAge === "string") {
        const value = skin.skinAge.trim();
        const age = parseInteger(value);
        if (age !== undefined) return normalizeSingleSkinAge(age);

        const match = /^([+-]?\d+)\s*-\s*([+-]?\d+)$/.exec(value);
        if (!match) return { suggestion: INVALID_SKIN_AGE_RANGE_SUGGESTION };
        const minimum = Number(match[1]);
        const maximum = Number(match[2]);
        if (minimum < MINIMUM_SKIN_AGE || maximum < MINIMUM_SKIN_AGE) {
            return { suggestion: INVALID_SKIN_AGE_SUGGESTION };
        }
        if (minimum > maximum || maximum - minimum > MAXIMUM_SKIN_AGE_RANGE) {
            return { suggestion: INVALID_SKIN_AGE_RANGE_SUGGESTION };
        }
        return { skinAge: String(minimum) + "-" + String(maximum) };
    }

    if (typeof skin.age === "number" && Number.isInteger(skin.age)) {
        return normalizeSingleSkinAge(skin.age);
    }

    return { suggestion: INVALID_SKIN_AGE_RANGE_SUGGESTION };
}

function parseInteger (value: string): number | undefined {
    if (!/^[+-]?\d+$/.test(value)) return undefined;
    const age = Number(value);
    return Number.isSafeInteger(age) ? age : undefined;
}

function normalizeSingleSkinAge (age: number): { skinAge: string } | { suggestion: string } {
    if (age < MINIMUM_SKIN_AGE) return { suggestion: INVALID_SKIN_AGE_SUGGESTION };
    return { skinAge: String(age) + "-" + String(age) };
}

function tanningInputError (suggestion: string): { errmsg: { errorCode: "ERR-99"; suggestion: string } } {
    return { errmsg: { errorCode: "ERR-99", suggestion } };
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
