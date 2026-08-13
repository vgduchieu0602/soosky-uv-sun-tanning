import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import UvIndexRepository, { UvIndexCoordinates } from "../../domain/repositories/IUvIndexRepository.js";

export { GetCurrentUvIndexQuery };
export { GetCurrentUvIndexUseCase as default };

class GetCurrentUvIndexUseCase {
    public constructor (private readonly _uvIndexRepository: UvIndexRepository) {}

    public async execute (query: GetCurrentUvIndexQuery): Promise<CurrentUvIndex> {
        return this._uvIndexRepository.getCurrentUvIndex(query);
    }
}

type GetCurrentUvIndexQuery = UvIndexCoordinates;
