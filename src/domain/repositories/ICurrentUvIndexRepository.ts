import { CurrentUvIndex } from "../entities/CurrentUvIndex.js";
import { DataFetchResult } from "../entities/DataFetchResult.js";
import { UvIndexCoordinates } from "../entities/UvIndexCoordinates.js";

export { CurrentUvIndexRepository as default };

interface CurrentUvIndexRepository {
    getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<DataFetchResult<CurrentUvIndex>>;
}
