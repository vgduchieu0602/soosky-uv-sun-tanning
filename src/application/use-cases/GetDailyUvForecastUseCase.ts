import { UvIndexForecastPoint } from "../../domain/entities/UvIndexForecastPoint.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";

export { GetDailyUvForecastQuery };
export { GetDailyUvForecastUseCase as default };

class GetDailyUvForecastUseCase {
    public constructor (private readonly _uvIndexForecastRepository: UvIndexForecastRepository) {}

    public async execute (query: GetDailyUvForecastQuery): Promise<UvIndexForecastPoint[]> {
        return this._uvIndexForecastRepository.getDailyUvForecast(query);
    }
}

type GetDailyUvForecastQuery = UvIndexCoordinates;
