import { CurrentUvIndex } from "../../domain/entities/CurrentUvIndex.js";
import { DataFetchResult } from "../../domain/entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../../domain/entities/UvIndexCoordinates.js";
import CurrentUvIndexRepository from "../../domain/repositories/ICurrentUvIndexRepository.js";

export { GetCurrentUvIndexQuery };
export { GetCurrentUvIndexUseCase as default };

class GetCurrentUvIndexUseCase {
    public constructor (private readonly _currentUvIndexRepository: CurrentUvIndexRepository) {}

    public async execute (query: GetCurrentUvIndexQuery): Promise<DataFetchResult<CurrentUvIndex>> {
        return this._currentUvIndexRepository.getCurrentUvIndex(query);
    }
}

type GetCurrentUvIndexQuery = UvIndexCoordinates;
