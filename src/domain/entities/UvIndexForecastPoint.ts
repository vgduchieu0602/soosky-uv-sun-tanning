export interface UvIndexForecastWeather {
    code: string | null;
    mainWeather: string | null;
    description: string | null;
    icon: string | null;
}

export interface UvIndexForecastPoint {
    /** Local forecast time with the UTC offset reported by OpenWeatherMap. */
    datetime: string | null;
    weather: UvIndexForecastWeather[];
    description: string | null;
    uvi: number | null;
    temp: number | null;
    pop: number | null;
}
