import { UvIndexForecastPoint } from "../entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "./IUvIndexRepository.js";

export { UvIndexForecastRepository as default };

interface UvIndexForecastRepository {
    getDailyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]>;
    getHourlyUvForecast (coordinates: UvIndexCoordinates): Promise<UvIndexForecastPoint[]>;
}
