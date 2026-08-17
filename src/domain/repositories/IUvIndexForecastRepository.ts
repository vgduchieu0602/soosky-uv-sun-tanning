import { UvIndexForecastPoint } from "../entities/UvIndexForecastPoint.js";
import { DataFetchResult } from "../entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../entities/UvIndexCoordinates.js";

export { UvIndexForecastRepository as default };

interface UvIndexForecastRepository {
    getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>>;
    getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<DataFetchResult<UvIndexForecastPoint[]>>;
}
