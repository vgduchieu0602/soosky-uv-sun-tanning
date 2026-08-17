export type CacheStatus = "upstream" | "cached";

export interface DataFetchResult<T> {
    data: T;
    cache: CacheStatus;
}
