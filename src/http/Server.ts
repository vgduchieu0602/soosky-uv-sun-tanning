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

        const data = await this._useCases.uv.getCurrentUvIndex.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(data) });
    }

    private async _GET_uvIndexDailyForecast (request: Request, response: Response): Promise<void> {
        if (!this._useCases) {
            throw new Error("UV index use case is not configured.");
        }

        const data = await this._useCases.uv.getDailyUvForecast.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(data) });
    }

    private async _GET_uvIndexHourlyForecast (request: Request, response: Response): Promise<void> {
        if (!this._useCases) {
            throw new Error("UV index use case is not configured.");
        }

        const data = await this._useCases.uv.getHourlyUvForecast.execute(this._readCoordinates(request));
        response.json({ ok: true, data: formatResponseData(data) });
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

        const query = readTanningRoutineQuery(request.body);
        if (query === undefined) {
            response.status(400).json({
                errmsg: { errorCode: "ERR-99", suggestion: "Provide currentSkin from a successful skin scan and a valid desiredSkin." },
            });
            return;
        }

        const result = await this._useCases.tanning.createRoutine.execute(query);
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

    if (!Number.isFinite(coordinate) || coordinate < minimum || coordinate > maximum) {
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

function readTanningRoutineQuery (body: unknown): TanningRoutineQuery | undefined {
    if (!isRecord(body) || !isRecord(body.currentSkin) || typeof body.desiredSkin !== "string") return undefined;
    const skin = body.currentSkin;
    if (
        typeof skin.skinTone !== "string" || !SKIN_TONES.has(skin.skinTone as DesiredSkin)
        || typeof skin.skinAge !== "string" || skin.skinAge.trim() === ""
        || typeof skin.hydration !== "string" || !HYDRATIONS.has(skin.hydration as SkinScanData["hydration"])
        || typeof skin.skinType !== "string" || !SKIN_TYPES.has(skin.skinType as SkinScanData["skinType"])
        || !SKIN_TONES.has(body.desiredSkin as DesiredSkin)
    ) return undefined;

    return {
        currentSkin: {
            skinTone: skin.skinTone as SkinScanData["skinTone"],
            skinAge: skin.skinAge,
            hydration: skin.hydration as SkinScanData["hydration"],
            skinType: skin.skinType as SkinScanData["skinType"],
        },
        desiredSkin: body.desiredSkin as DesiredSkin,
    };
}

function isRecord (value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
