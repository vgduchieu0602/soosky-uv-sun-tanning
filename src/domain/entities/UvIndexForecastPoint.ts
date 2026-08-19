export interface UvIndexForecastWeather {
    code: string | null;
    mainWeather: string | null;
    description: string | null;
    icon: string | null;
}

export interface UvIndexForecastPoint {
    /** Forecast time in ISO 8601 UTC. */
    datetime: string | null;
    weather: UvIndexForecastWeather[];
    description: string | null;
    uvi: number | null;
    /** UV cao nhat cua khoang thoi gian ma diem du bao dai dien. */
    maxUvi: number | null;
    temp: number | null;
    pop: number | null;
}
