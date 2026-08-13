import { CurrentUvIndex } from "../entities/CurrentUvIndex.js";

export { UvIndexCoordinates };
export { UvIndexRepository as default };

interface UvIndexRepository {
    getCurrentUvIndex (coordinates: UvIndexCoordinates): Promise<CurrentUvIndex>;
}

interface UvIndexCoordinates {
    lat: number;
    lon: number;
}
