import { UvIndexForecastPoint } from "../../domain/entities/UvIndexForecastPoint.js";
import UvIndexForecastRepository from "../../domain/repositories/IUvIndexForecastRepository.js";
import { UvIndexCoordinates } from "../../domain/repositories/IUvIndexRepository.js";

export { GetHourlyUvForecastQuery };
export { GetHourlyUvForecastUseCase as default };

class GetHourlyUvForecastUseCase {
    public constructor (private readonly _uvIndexForecastRepository: UvIndexForecastRepository) {}

    public async execute (query: GetHourlyUvForecastQuery): Promise<UvIndexForecastPoint[]> {
        return this._uvIndexForecastRepository.getHourlyUvForecast(query);
    }
}

type GetHourlyUvForecastQuery = UvIndexCoordinates;
