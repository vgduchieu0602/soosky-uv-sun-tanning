export { formatResponseData as default };

/**
 * Chuan hoa payload tra ve cho client: number -> string, Date -> ISO,
 * null/undefined/NaN -> "n/a". Client khong phai xu ly kieu thieu gia tri.
 */
function formatResponseData (data: unknown): unknown {
    if (data === null || data === undefined) {
        return "n/a";
    }

    if (data instanceof Date) {
        return Number.isNaN(data.getTime()) ? "n/a" : data.toISOString();
    }

    if (Array.isArray(data)) {
        return data.map((item) => formatResponseData(item));
    }

    switch (typeof data) {
        case "string":
        case "boolean":
            return data;
        case "number":
            return Number.isFinite(data) ? String(data) : "n/a";
        case "object":
            return Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, formatResponseData(value)]),
            );
        default:
            return "n/a";
    }
}
