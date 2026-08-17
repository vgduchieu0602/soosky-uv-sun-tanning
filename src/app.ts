import { connectMongoInBackground, getDatabaseStatus } from "./adapters/mongo/connectMongo.js";
import CachedCurrentUvIndexRepository from "./adapters/cache/CachedCurrentUvIndexRepository.js";
import CachedUvIndexForecastRepository from "./adapters/cache/CachedUvIndexForecastRepository.js";
import GeminiSkinScanAnalyzer from "./adapters/gemini/GeminiSkinScanAnalyzer.js";
import GeminiTanningRoutineRepository from "./adapters/gemini/GeminiTanningRoutineRepository.js";
import SharpImageNormalizer from "./adapters/image/SharpImageNormalizer.js";
import OpenWeatherMapCurrentUvIndexRepository from "./adapters/openweathermap/OpenWeatherMapCurrentUvIndexRepository.js";
import OpenWeatherMapUvIndexForecastRepository from "./adapters/openweathermap/OpenWeatherMapUvIndexForecastRepository.js";
import GetCurrentUvIndexUseCase from "./application/use-cases/GetCurrentUvIndexUseCase.js";
import GetDailyUvForecastUseCase from "./application/use-cases/GetDailyUvForecastUseCase.js";
import GetHourlyUvForecastUseCase from "./application/use-cases/GetHourlyUvForecastUseCase.js";
import ScanSkinUseCase from "./application/use-cases/ScanSkinUseCase.js";
import CreateTanningRoutineUseCase from "./application/use-cases/CreateTanningRoutineUseCase.js";
import config from "./config.js";
import Server from "./http/Server.js";

const {
    http: {
        port: HTTP_PORT,
        host: HTTP_HOST,
    },
} = config;

const CURRENT_UV_INDEX_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DAILY_UV_FORECAST_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const HOURLY_UV_FORECAST_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const currentUvIndexRepository = new CachedCurrentUvIndexRepository(
    new OpenWeatherMapCurrentUvIndexRepository(config.openWeatherMap.apiKey),
    CURRENT_UV_INDEX_CACHE_TTL_MS,
);
const uvIndexForecastRepository = new CachedUvIndexForecastRepository(
    new OpenWeatherMapUvIndexForecastRepository(config.openWeatherMap.apiKey),
    DAILY_UV_FORECAST_CACHE_TTL_MS,
    HOURLY_UV_FORECAST_CACHE_TTL_MS,
);
const imageNormalizer = new SharpImageNormalizer();
const skinScanAnalyzer = new GeminiSkinScanAnalyzer(config.gemini.apiKey, config.gemini.model);
const tanningRoutineRepository = new GeminiTanningRoutineRepository(config.gemini.apiKey, config.gemini.model);
const useCases = {
    uv: {
        getCurrentUvIndex: new GetCurrentUvIndexUseCase(currentUvIndexRepository),
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

// Composition root. Adapter cu the chi duoc khoi tao o file nay, roi inject
// vao use-case. Use-case va domain khong bao gio import adapter.
//
// Vertical slice dau tien se them o day:
//   const uvIndexRepository = new <Provider>UvIndexRepository(...);
//   const useCases = { uv: { getUvIndex: new GetUvIndexUseCase(uvIndexRepository) } };
//   const server = new Server(config, getDatabaseStatus, useCases);

(async () => {
    try {
        const server = new Server(config, getDatabaseStatus, useCases, imageNormalizer);

        await server.listen();
        console.log("Soosky UV Sun Tanning API running on http://" + HTTP_HOST + ":" + HTTP_PORT);

        void connectMongoInBackground();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
