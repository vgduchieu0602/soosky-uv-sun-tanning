export interface UvIndexForecastWeather {
    code: string | null;
    mainWeather: string | null;
    description: string | null;
    icon: string | null;
}

export interface UvIndexForecastPoint {
    datetime: Date | null;
    weather: UvIndexForecastWeather[];
    description: string | null;
    uvi: number | null;
    temp: number | null;
    pop: number | null;
}
