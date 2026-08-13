# soosky-uv-sun-tanning

## Current UV index

Set `OPENWEATHERMAP_API_KEY` to an API key with One Call API 4.0 access, then call:

```text
GET /api/v1/uv-index?lat=10.7769&lon=106.7009
```

The API returns only `description`, `uvi`, and `temp` (Celsius). Each coordinate pair is cached in memory for 6 hours.

## Facial skin scan

Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, defaulting to `gemini-3.1-flash-lite`), then upload one facial photo:

```bash
curl -X POST http://localhost:3000/api/v1/skin-scan \
  -F "image=@face.jpg"
```

The endpoint accepts JPEG, PNG, WebP, HEIC, and HEIF up to 8 MB by default (`MAX_IMAGE_MB`). Images are processed only in memory and are not stored. A successful result returns `data` and optional `grounding`; a failure returns only `errmsg`.

## Tanning routine

Create a routine from a successful skin-scan result. The endpoint uses the configured Gemini model with minimal thinking and Google Search grounding:

```bash
curl -X POST http://localhost:3000/api/v1/tanning-routine \
  -H "content-type: application/json" \
  -d '{"currentSkin":{"skinTone":"Very Fair Skin","skinAge":"25-30","hydration":"Hydrated","skinType":"Oily Skin"},"desiredSkin":"Medium Skin"}'
```

`POST /api/v1/tanning-routine` returns `data` with `routineName`, `totalDays`, `targetGoal`, and a complete daily schedule. It returns optional Google Search `grounding` metadata. If a preceding scan returns `errmsg`, submit that object directly and the endpoint returns it unchanged with HTTP 422, without calling Gemini.

Forecast endpoints use the same `lat` and `lon` query parameters:

```text
GET /api/v1/uv-index/daily?lat=10.7769&lon=106.7009
GET /api/v1/uv-index/hourly?lat=10.7769&lon=106.7009
```

Both return arrays of `description`, `uvi`, `temp` (Celsius), and `pop` (0-1). Daily uses the One Call 1-day timeline and caches for 12 hours. Hourly uses the 1-hour timeline, returns every third record (3-hour intervals), and caches for 6 hours.

Backend TypeScript theo Soosky Clean Architecture (Level 3). Đây là **base**: HTTP server + kết nối MongoDB + biên lỗi, chưa có feature nghiệp vụ nào.

## Cấu trúc

```text
src/
├── app.ts                      # composition root: khởi tạo adapter, inject vào use-case
├── config.ts                   # nơi DUY NHẤT đọc process.env
├── domain/
│   ├── entities/               # (trống) entity nghiệp vụ
│   ├── value-objects/          # (trống) VO có invariant thật
│   ├── repositories/           # (trống) port I<Name>Repository
│   └── errors/                 # (trống) lỗi domain
├── application/
│   └── use-cases/              # (trống) <Verb><Noun>UseCase, một execute()
├── adapters/
│   └── mongo/connectMongo.ts   # kết nối nền + retry, báo trạng thái cho /health
└── http/
    ├── Server.ts               # transport mỏng + biên lỗi tập trung
    ├── ClientError.ts
    └── formatResponseData.ts
```

Các thư mục `domain/*` và `application/use-cases` đang giữ chỗ bằng `.gitkeep` để cố định ranh giới; xoá `.gitkeep` khi thêm file thật.

## Quy tắc phụ thuộc

```text
http        →  application  →  domain
adapters    →  domain
app.ts      →  wiring tất cả
```

Cấm:

- `domain/` import adapter, application, http, framework, `config`, `process.env`
- `application/` import adapter cụ thể hoặc framework
- khởi tạo adapter ngoài `app.ts`

## Response envelope

```json
{ "ok": true, "data": {} }
{ "ok": false, "code": "BAD_REQUEST", "reason": "..." }
```

`formatResponseData` chuẩn hoá: number → string, Date → ISO, null/NaN → `"n/a"`.

## Endpoint hiện có

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | trạng thái app + uptime + trạng thái MongoDB |

## Environment

Copy `.env.example` → `.env`. Biến bắt buộc:

| Biến | Mặc định | Ghi chú |
|---|---|---|
| `MONGO_URI` | — | **phải có tên database trước dấu `?`**, thiếu là ghi vào db `test` |
| `HTTP_PORT` | `3000` | |
| `HTTP_HOST` | `0.0.0.0` | |
| `HTTP_TRUST_PROXY` | `1` | `false` khi expose trực tiếp, tránh giả mạo `X-Forwarded-For` |
| `HOST_PORT` | `3003` | chỉ dùng cho docker compose (3000/3001/3002 đã bị sibling chiếm) |

## Lệnh

```bash
npm install
npm run dev      # tsx watch
npm test         # node:test
npm run build    # tsc --noEmit + esbuild -> dist/app.js
npm start        # node dist/app.js
docker compose up -d --build
```

## Thêm feature đầu tiên

1. `domain/entities` + `domain/value-objects` cho khái niệm nghiệp vụ (ví dụ `UvIndex`, `Coordinate`, `SkinType`).
2. `domain/repositories/I<Name>Repository.ts` — port mô tả cái use-case cần, không mang tên công nghệ.
3. `application/use-cases/<Verb><Noun>UseCase.ts` — một `execute()`.
4. `adapters/<vendor>/<Vendor><Name>Repository.ts` — implement port, map dữ liệu ngoài về domain.
5. Wire trong `app.ts`, thêm route trong `http/Server.ts`.

## Cố ý chưa làm

Rate limiter, cache TTL, scheduler/job, push notification, CI workflow — thêm khi có yêu cầu thật, không dựng sẵn.
