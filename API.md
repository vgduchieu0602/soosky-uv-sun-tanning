# Soosky UV Sun Tanning API

Base URL: `http://localhost:3000`

All requests and responses use JSON, except `POST /api/v1/skin-scan`, which uses `multipart/form-data`.

## Setup

Create `.env` with the required provider keys:

```dotenv
OPENWEATHERMAP_API_KEY=your_openweathermap_one_call_key
GEMINI_API_KEY=your_gemini_key
# Optional. Defaults to gemini-3.1-flash-lite
GEMINI_MODEL=gemini-3.1-flash-lite
```

Start the API:

```bash
npm run dev
```

## Response conventions

The UV endpoints use the standard envelope:

```json
{ "ok": true, "data": {}, "meta": { "cache": "upstream" } }
```

For every UV endpoint, `meta.cache` identifies where the returned data came from: `"upstream"` for a cache miss that fetched OpenWeatherMap, or `"cached"` for a cache hit.

The skin-scan and tanning-routine endpoints return exactly one of the following shapes, with no `ok` field:

```json
{ "data": {} }
```

```json
{ "data": {}, "grounding": { "sources": [], "searchQueries": [], "searchSuggestionsHtml": "" } }
```

```json
{ "errmsg": { "errorCode": "...", "suggestion": "..." } }
```

`grounding` is optional and is included only when Gemini returns Google Search grounding metadata.

## Health

### `GET /health`

Returns process and database connection status.

Response `200`:

```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": "42",
    "database": "connected"
  }
}
```

## UV forecasts

Both forecast endpoints require `lat` (`-90` to `90`) and `lon` (`-180` to `180`) query parameters.

### `GET /api/v1/uv-index`

Uses OpenWeatherMap [Current Weather](https://openweathermap.org/api/current?collection=current_forecast) and is cached for 10 minutes per coordinate pair in this test build.

Response `200`:

```json
{
  "ok": true,
  "data": {
    "description": "overcast clouds",
    "uvi": null,
    "temp": "31.8",
    "weather": [
      {
        "code": "804d",
        "mainWeather": "Clouds",
        "description": "overcast clouds",
        "icon": "04d"
      }
    ]
  },
  "meta": { "cache": "upstream" }
}
```

`description`, `uvi`, and `temp` preserve the previous response fields. `weather` is added for icon rendering. `uvi` is `null` because Current Weather does not provide UV index.

### `GET /api/v1/uv-index/daily`

Uses OpenWeatherMap [Forecast5](https://openweathermap.org/api/forecast5?collection=current_forecast) and groups its 3-hour records into one result per local calendar day. The selected record is the forecast closest to 12:00 local time. Results are cached for 15 minutes in this test build.

`GET /api/v1/uv-forecast/daily` is kept as a backward-compatible alias.

Response `200`:

```json
{
  "ok": true,
  "data": [
    {
      "datetime": "2026-08-14T00:00:00.000Z",
      "weather": [
        {
          "code": "500d",
          "mainWeather": "Rain",
          "description": "light rain",
          "icon": "10d"
        }
      ],
      "description": "light rain",
      "uvi": "6.2",
      "temp": "29.5",
      "pop": "0.7"
    }
  ],
  "meta": { "cache": "cached" }
}
```

### `GET /api/v1/uv-index/hourly`

Uses OpenWeatherMap [Forecast5](https://openweathermap.org/api/forecast5?collection=current_forecast) and returns a 24-hour inclusive range: at most 9 records in provider order, at 3-hour intervals. For example, a range starting at 09:00 ends at 09:00 the following day. Results are cached for 15 minutes in this test build.

`GET /api/v1/uv-forecast/hourly` is kept as a backward-compatible alias.

Response item fields for daily and hourly:

| Field | Meaning |
| --- | --- |
| `datetime` | Forecast time in ISO 8601 UTC (`Z`, UTC+0) |
| `weather` | OpenWeatherMap weather conditions; each item has `code`, `mainWeather`, `description`, and `icon` |
| `description` | Weather description from OpenWeatherMap |
| `uvi` | UV index; `null` because Forecast5 does not provide it |
| `temp` | Temperature in Celsius |
| `pop` | Probability of precipitation from `0` to `1`; `null` when the provider does not provide it |

`weather[].code` is a string composed from the provider weather ID and the day/night suffix in `icon`; for example, weather ID `500` with icon `10d` becomes `"500d"`.

For daily and hourly forecasts, any unavailable provider field is returned as JSON `null`; a provider value of `0` remains `"0"` after the API's standard numeric string formatting.

## Facial skin scan

### `POST /api/v1/skin-scan`

Content type: `multipart/form-data`

Form fields:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `image` | File | Yes | One JPEG, PNG, WebP, HEIC, or HEIF facial photo, maximum 8 MB by default |

Example:

```bash
curl -X POST http://localhost:3000/api/v1/skin-scan \
  -F "image=@face.jpg"
```

Successful response `200`:

```json
{
  "data": {
    "skinTone": "Fair Skin",
    "skinAge": "25-30",
    "hydration": "Hydrated",
    "skinType": "Combination Skin"
  },
  "grounding": {
    "sources": [{ "title": "Example source", "url": "https://example.com" }],
    "searchQueries": ["facial skin hydration"],
    "searchSuggestionsHtml": ""
  }
}
```

`grounding` is optional. Valid value sets:

| Field | Values |
| --- | --- |
| `skinTone` | `Very Fair Skin`, `Fair Skin`, `Medium Skin`, `Olive Skin`, `Brown Skin`, `Dark Skin` |
| `hydration` | `Critically Dry`, `Dehydrated`, `Hydrated`, `Over-Hydrated` |
| `skinType` | `Normal Skin`, `Dry Skin`, `Oily Skin`, `Combination Skin`, `Sensitive Skin` |

Failure response:

```json
{
  "errmsg": {
    "errorCode": "ERROR_TOO_MANY_FACES",
    "suggestion": "Please provide an image containing only one face for accurate skin analysis."
  }
}
```

Possible error codes: `ERROR_NON_SKIN`, `ERROR_TOO_MANY_FACES`, `ERROR_NO_FACE_DETECTED`, `ERROR_IMAGE_BLURRY`, `ERROR_IMAGE_GLARE`, `ERROR_LIGHTING_POOR`, and `ERROR_SYSTEM`.

Image input errors use HTTP `400`; model analysis errors use HTTP `422`; `ERROR_SYSTEM` uses HTTP `502`.

## Tanning routine

### `POST /api/v1/tanning-routine`

Content type: `application/json`

Request body:

```json
{
  "currentSkin": {
    "skinTone": "Very Fair Skin",
    "skinAge": "25-30",
    "hydration": "Hydrated",
    "skinType": "Oily Skin"
  },
  "desiredSkin": "Medium Skin"
}
```

`currentSkin` must be the successful `data` value from skin scan. `skinAge` must be an age range from 1 to 100 years with a maximum 20-year span (for example `25-30`). `desiredSkin` must be one of the six `skinTone` values listed above and cannot be lighter than `currentSkin.skinTone`.

For compatibility, the client may send `targetTone` instead of `desiredSkin`. If both are supplied, their values must match.

Successful response `200`:

```json
{
  "data": {
    "routineName": "Very Fair to Medium Skin Gradual Glow",
    "totalDays": 14,
    "targetGoal": {
      "title": "Gradual protected glow",
      "targetText": "Build a gradual, protected medium tone."
    },
    "dailySchedule": [
      {
        "day": 1,
        "phase": "Initial Skin Prep",
        "activities": [
          "Apply broad-spectrum SPF 50+ to face and body.",
          "Use an oil-free moisturizer."
        ]
      }
    ]
  },
  "grounding": {
    "sources": [],
    "searchQueries": [],
    "searchSuggestionsHtml": ""
  }
}
```

The API validates that `dailySchedule` has one sequential entry for every day from `1` through `totalDays`; each `phase` is at most 32 characters and `targetGoal.targetText` is at most 65 characters. `grounding` is optional.

If skin scan fails, submit its exact error object instead of a routine request:

```json
{
  "errmsg": {
    "errorCode": "ERROR_TOO_MANY_FACES",
    "suggestion": "Please provide an image containing only one face for accurate skin analysis."
  }
}
```

The endpoint returns that object unchanged with HTTP `422` and does not call Gemini.

Routine generation failures return `ERR-01` or `ERR-99` in `errmsg` with HTTP `502`. Invalid request input returns `ERR-99` with HTTP `400`.

## Common errors

| Status | Body | Meaning |
| --- | --- | --- |
| `400` | `{ "ok": false, "code": "BAD_REQUEST", ... }` | Invalid UV query parameter or malformed JSON for standard endpoints |
| `404` | `{ "ok": false, "code": "NOT_FOUND", ... }` | Endpoint does not exist |
| `502` | `{ "ok": false, "code": "UPSTREAM_UNAVAILABLE", ... }` | OpenWeatherMap is unavailable |

For the two Gemini endpoints, use their exact `errmsg` error shape documented above instead of the standard envelope.
