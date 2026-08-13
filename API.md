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
{ "ok": true, "data": {} }
```

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

## Current UV index

### `GET /api/v1/uv-index`

Query parameters:

| Name | Type | Required | Range |
| --- | --- | --- | --- |
| `lat` | number | Yes | `-90` to `90` |
| `lon` | number | Yes | `-180` to `180` |

Example:

```text
GET /api/v1/uv-index?lat=10.7769&lon=106.7009
```

Response `200`:

```json
{
  "ok": true,
  "data": {
    "description": "clear sky",
    "uvi": "8.1",
    "temp": "31.5"
  }
}
```

`temp` is Celsius. Values are strings because the shared response formatter normalizes numbers. Results are cached for 6 hours per coordinate pair.

## UV forecasts

Both forecast endpoints accept the same required `lat` and `lon` query parameters as the current UV endpoint.

### `GET /api/v1/uv-index/daily`

Returns the One Call daily timeline at one-day intervals. Results are cached for 12 hours.

Response `200`:

```json
{
  "ok": true,
  "data": [
    {
      "description": "light rain",
      "uvi": "6.2",
      "temp": "29.5",
      "pop": "0.7"
    }
  ]
}
```

### `GET /api/v1/uv-index/hourly`

Returns the One Call hourly timeline sampled at three-hour intervals. Results are cached for 6 hours.

Response item fields for daily and hourly:

| Field | Meaning |
| --- | --- |
| `description` | Weather description from OpenWeatherMap |
| `uvi` | UV index |
| `temp` | Temperature in Celsius |
| `pop` | Probability of precipitation from `0` to `1` |

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

`currentSkin` must be the successful `data` value from skin scan. `desiredSkin` must be one of the six `skinTone` values listed above.

Successful response `200`:

```json
{
  "data": {
    "routineName": "Very Fair to Medium Skin Gradual Glow",
    "totalDays": 14,
    "targetGoal": "Build a gradual, protected medium tone.",
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

The API validates that `dailySchedule` has one sequential entry for every day from `1` through `totalDays`. `grounding` is optional.

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
