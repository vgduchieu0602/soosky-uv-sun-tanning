import { CurrentUvIndex } from "../entities/CurrentUvIndex.js";
import { UvIndexCoordinates } from "../entities/UvIndexCoordinates.js";

export { CurrentUvIndexRepository as default };

interface CurrentUvIndexRepository {
    getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<CurrentUvIndex>;
}
