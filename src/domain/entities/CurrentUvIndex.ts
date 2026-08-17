import { UvIndexForecastWeather } from "./UvIndexForecastPoint.js";

export interface CurrentUvIndex {
    description: string | null;
    uvi: null;
    temp: number | null;
    weather: UvIndexForecastWeather[];
}
