export interface UvIndexForecastWeather {
    code: string;
    mainWeather: string;
    description: string;
    icon: string;
}

export interface UvIndexForecastPoint {
    datetime: Date;
    weather: UvIndexForecastWeather[];
    description: string;
    uvi: number;
    temp: number;
    pop: number;
}
