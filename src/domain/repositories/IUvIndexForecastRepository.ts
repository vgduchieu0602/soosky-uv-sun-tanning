import { UvIndexForecastPoint } from "../entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "../entities/UvIndexCoordinates.js";

export { UvIndexForecastRepository as default };

interface UvIndexForecastRepository {
    getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]>;
    getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]>;
}
