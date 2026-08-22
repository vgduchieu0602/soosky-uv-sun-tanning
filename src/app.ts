import CachedCurrentUvIndexRepository from "./adapters/cache/CachedCurrentUvIndexRepository.js";
import CachedUvIndexForecastRepository from "./adapters/cache/CachedUvIndexForecastRepository.js";
import GeminiSkinScanAnalyzer from "./adapters/gemini/GeminiSkinScanAnalyzer.js";
import GeminiTanningRoutineRepository from "./adapters/gemini/GeminiTanningRoutineRepository.js";
import SharpImageNormalizer from "./adapters/image/SharpImageNormalizer.js";
import { connectMongoInBackground, getDatabaseStatus } from "./adapters/mongo/connectMongo.js";
import OpenWeatherMapCurrentUvIndexRepository from "./adapters/openweathermap/OpenWeatherMapCurrentUvIndexRepository.js";
import OpenWeatherMapUvIndexForecastRepository from "./adapters/openweathermap/OpenWeatherMapUvIndexForecastRepository.js";
import CreateTanningRoutineUseCase from "./application/use-cases/CreateTanningRoutineUseCase.js";
import GetCurrentUvIndexUseCase from "./application/use-cases/GetCurrentUvIndexUseCase.js";
import GetDailyUvForecastUseCase from "./application/use-cases/GetDailyUvForecastUseCase.js";
import GetHourlyUvForecastUseCase from "./application/use-cases/GetHourlyUvForecastUseCase.js";
import ScanSkinUseCase from "./application/use-cases/ScanSkinUseCase.js";
import config from "./config.js";
import Server from "./http/Server.js";

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST,
    },
    openWeatherMap: {
        apiKey: OPENWEATHERMAP_API_KEY,
    },
    gemini: {
        apiKey: GEMINI_API_KEY,
        model:  GEMINI_MODEL,
    },
} = config;

/* -------------------------------------------------------------------------- */

//===Production===
// const CURRENT_UV_INDEX_CACHE_TTL_MS  = 6 * 60 * 60 * 1000;
// const DAILY_UV_FORECAST_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
// const HOURLY_UV_FORECAST_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

//===Test===
const CURRENT_UV_INDEX_CACHE_TTL_MS   = 10 * 60 * 1000;
const DAILY_UV_FORECAST_CACHE_TTL_MS  = 15 * 60 * 1000;
const HOURLY_UV_FORECAST_CACHE_TTL_MS = 15 * 60 * 1000;

/* -------------------------------------------------------------------------- */

const currentUvIndexRepository  = new CachedCurrentUvIndexRepository(
    new OpenWeatherMapCurrentUvIndexRepository(OPENWEATHERMAP_API_KEY),
    CURRENT_UV_INDEX_CACHE_TTL_MS,
);
const uvIndexForecastRepository = new CachedUvIndexForecastRepository(
    new OpenWeatherMapUvIndexForecastRepository(OPENWEATHERMAP_API_KEY),
    DAILY_UV_FORECAST_CACHE_TTL_MS,
    HOURLY_UV_FORECAST_CACHE_TTL_MS,
);
const imageNormalizer           = new SharpImageNormalizer();
const skinScanAnalyzer          = new GeminiSkinScanAnalyzer(GEMINI_API_KEY, GEMINI_MODEL);
const tanningRoutineRepository  = new GeminiTanningRoutineRepository(GEMINI_API_KEY, GEMINI_MODEL);

const useCases = {
    uv: {
        getCurrentUvIndex:  new GetCurrentUvIndexUseCase(currentUvIndexRepository),
        getDailyUvForecast: new GetDailyUvForecastUseCase(uvIndexForecastRepository),
        getHourlyUvForecast: new GetHourlyUvForecastUseCase(uvIndexForecastRepository),
    },
    skin: {
        scanSkin: new ScanSkinUseCase(skinScanAnalyzer),
    },
    tanning: {
        createRoutine: new CreateTanningRoutineUseCase(tanningRoutineRepository),
    },
};

/* -------------------------------------------------------------------------- */

(async () => {
    try {
        await startServer();
        connectMongoDB();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();

/* -------------------------------------------------------------------------- */

async function startServer() {
    const server = new Server(config, getDatabaseStatus, useCases, imageNormalizer);

    await server.listen();
    console.log(`Soosky UV Sun Tanning API running on http://${HTTP_HOST}:${HTTP_PORT}`);
}

function connectMongoDB() {
    void connectMongoInBackground();
}
