# Mobile API v1: audit and plan

The target client is the Btr.me Expo app (`btrme-app`). This document records what the web app exposed before v1, what the mobile app needs, and the versioned API that now serves both.

**Status:** implemented on branch `api-v1`. The code is in `lib/api/`, served by `app/api/v1/[...path]/route.ts`, with migration `20261122190554_mobile_api_v1`. Section 5 covers how to run the tests.

## 1. What exists today

The web app has no general API. Data flows through three surfaces:

| Surface | Used by | Auth |
| --- | --- | --- |
| Server actions in `app/actions/*` (about 40 functions) | Web pages and the Telegram mini app | NextAuth cookie, or Telegram `initData` passed as an argument |
| eve channel `/eve/v1/session…` | Web chat (`useEveAgent`), Telegram, WhatsApp | NextAuth JWT cookie via `getUserFromRequest` |
| Route handlers `app/api/*` | Images only (`attachments/[id]`, `catalog-images/[id]`) and NextAuth | Cookie |

Server actions can't be called from a native app. They are Next.js RPC with framework-generated IDs and no stable contract. There is also no token login: sign-in is an email magic link (Resend) or the Telegram login widget, and both end in a browser cookie.

### Server actions by domain

- **Auth** (`auth.ts`): sign out, Telegram widget sign-in.
- **Summary** (`summary.ts`): diary (today + 14-day window + streak), one day, a day range (max 21).
- **Meals** (`meals.ts`): update a meal item (amount, label), delete a meal item.
- **Products** (`products.ts`): my products (`recent` / `favorites` / `all`), toggle a favorite, log a product to today.
- **Settings** (`settings.ts`): settings payload, save locale, country, goals, timezone and reminders, create and consume link codes.
- **Groups** (`groups.ts`): list, invite preview, join, leave, create, update, delete, rotate invite, remove member, owner and member detail, messages, send a message, a member's nutrition (diary, day, days).

### Domain logic the agent has but the UI doesn't expose

Food search (`searchCatalogAndOpenFoodFactsMany`), barcode lookup (`resolveProductByBarcode`), saving a custom product from a label (`saveCatalogProduct`), logging several items at once (`logMeal`, `upsertMealItems`), copying a meal (`copyMeal`), deleting a meal, profile memory and conversation search.

The core logic already lives in `lib/*` as plain functions. The API layer can be thin.

## 2. What the mobile app needs

| Screen | Needs | Status |
| --- | --- | --- |
| Today | Day diary: meals grouped by label, items with brand and macros, totals vs goals, calories left, streak, week strip with logged flags | Mostly exists (`loadNutritionDiary`). Brand is missing on items. |
| Today: meal card | Edit or remove item, **Copy to…**, **Save as meal**, **Add photo** | Edit, remove and copy exist. Saved meals and meal photos are **missing**. |
| Log food | Search, Recent, Favorites, Saved meals tab, "Often at {meal}", "Repeat yesterday's {meal}", add several items with amounts to a chosen day and meal | Search, recent and favorites exist. Saved meals, the suggestions endpoint and logging to **any date** are **missing** (logging is always "today"). |
| Food detail and amount sheet | Per-100 nutrition, unit (g/ml), serving presets, brand, tags | Exists in the catalog. Needs one food detail endpoint with parsed servings. |
| Scan (barcode, label, meal photo), Describe (text or voice) and Review | Upload a photo, get **draft** items with match confidence, edit portions, then commit | **Missing.** Today only the chat agent does this, and it writes straight to the diary. |
| Progress | Week calories by day **stacked per meal**, macros, nutrients, weight | Day ranges exist. Per-meal splits per day and weight are **missing**. |
| Me | Profile, weight journey (start, now, goal, history, log weight), today eaten and burned, progress photos, settings | Profile, goals and reminders exist. **Weight, progress photos and burned calories are missing.** |
| Groups | My groups, invites, join or leave, members, sharing toggle, unread count, coach comments on a day or food | Groups and messages exist. The sharing flag, unread counts and comments anchored to a day or meal item are **missing**. |
| Notifications | Bell feed and push reminders | **Missing.** Reminders only go out via Telegram and WhatsApp. |

## 3. Design

### Principles

- REST JSON under `/api/v1`, as Next.js route handlers.
- Each handler parses input with zod, calls a `lib/*` function and returns a view. No business logic in handlers.
- Server actions become thin callers of the same service functions, so web and mobile cannot drift.
- Errors use HTTP status plus `{ "error": { "code": "invalid_amount", "message": "…" } }`. The message is localized with the user's locale. Stable codes replace the current `ok` / `reason` unions.
- Dates are `YYYY-MM-DD` in the user's timezone. Timestamps are ISO 8601. The server resolves "today" from the profile timezone. The client may send `X-Timezone` as a fallback before onboarding.
- The vocabulary is the existing web one: nutrient keys `energyKcal, proteins, carbohydrates, sugars, fat, saturatedFat, fiber, salt`, labels `breakfast | lunch | dinner | snack | other`, units `g | ml | serving`. The mobile app maps `snacks` to `snack` and `fibre` to `fiber`.

### Authentication

One resolver, `requireUser(request)`, replaces `resolveAppUser` and accepts, in order:

1. `Authorization: Bearer <access token>` (mobile)
2. NextAuth session cookie (web)
3. `X-Telegram-Init-Data` header (mini app)

Mobile sign-in uses an email one-time code. The current magic link is awkward to complete inside a native app.

```
POST /api/v1/auth/email/start    { email }                → 204   (sends a 6-digit code via Resend)
POST /api/v1/auth/email/verify   { email, code }          → { accessToken, refreshToken, expiresIn, user }
POST /api/v1/auth/refresh        { refreshToken }         → { accessToken, refreshToken, expiresIn }
POST /api/v1/auth/logout         { refreshToken }         → 204
```

Sign in with Apple (`POST /auth/apple`) is not built yet. It becomes required once any third-party sign-in ships on iOS.

Access tokens are short-lived (15 min) encrypted JWTs derived from `AUTH_SECRET`. Refresh tokens are opaque, hashed in a new `RefreshToken` table and rotated on each use. Telegram and WhatsApp users connect a mobile account through the existing link-code flow (`/me/link-codes`).

The eve channel adds the same bearer check to `getUserFromRequest`, so the app can use `/eve/v1/session` for chat later without a second auth system.

### Endpoints

**Me, settings and goals**

```
GET    /me                     → { id, name, email, locale, country, timezone, plan, linkedChannels[] }
PATCH  /me                     { name?, locale?, country?, timezone? }
GET    /me/goals               → { caloriesPerDay, proteinGPerDay, carbsGPerDay, fatGPerDay, fiberGPerDay, goalWeightKg }
PUT    /me/goals               partial patch
GET    /me/reminders           → { timezone, reminders: [{ label, enabled, hour, minute, nextRunAt }] }
PUT    /me/reminders           { reminders: [{ label, enabled?, hour?, minute? }] }   (needs a time zone first)
POST   /me/devices             { expoPushToken, platform }      (push reminders)
DELETE /me/devices/{token}
POST   /me/link-codes          → { code, expiresAt }
POST   /me/link-codes/consume  { code }
GET    /meta/options           → { countries[], timeZones[], locales[] }   (static lists, cacheable)
```

**Diary** (Today and Progress)

```
GET /diary?date=YYYY-MM-DD          → { day: DayView, week: DayBucket[7], streak, goals, today, timezone }
GET /diary/days/{date}              → DayView
GET /diary/days?from=&to=           → DayBucket[]   (max 92 days; each bucket includes byLabel kcal)
```

`DayView` is the current `NutritionDayPayload` plus `remaining`. `DayBucket` adds `byLabel: Record<MealLabel, number>`, which is what the stacked weekly chart needs. `MealItemView` gains `brand`, `per100` and `servings`, so the amount sheet opens without a second request.

**Meals and items**

```
POST   /meals/items            { date, label, items: MealItemInput[] }  → MealView    (append to that day's meal, or create it)
GET    /meals/{id}                                                    → { meal }
PATCH  /meal-items/{id}        { amount?, label? }                    → { meal }   (label moves the item to that meal)
DELETE /meal-items/{id}                                               → 204
DELETE /meals/{id}                                                    → 204
POST   /meals/{id}/copy        { date, label }                        → MealView    (Copy to…, Repeat yesterday)
POST   /meals/{id}/photos      { uploadId }                           → { meal }   (Add photo)
DELETE /meals/{id}/photos/{photoId}
```

`MealItemInput` is the existing shape: `{ barcode? | foodId? | name + nutrimentsPer100g?, amount, unit }`.

**Foods**

```
GET  /foods/search?q=&limit=        → FoodSummary[]    (custom catalog first, then Open Food Facts; respects profile country)
GET  /foods/barcode/{code}          → FoodDetail | 404 { code: "not_found" }
GET  /foods/{id}                    → FoodDetail       (id = catalog id or `off:<barcode>`)
POST /foods                         { name, brand?, barcode?, servingSize?, nutriments, photos?: [{ uploadId, kind }] } → FoodDetail
```

`FoodDetail` contains `{ id, name, brand, barcode, verified, unit: "g"|"ml", per100: NutrientValues, servings: [{ label, grams }], images[], tags[] }`. Servings come from `parseServingSize` and the pack quantity.

**Log food helpers**

```
GET    /log/suggestions?date=&label=   → { repeat: { mealId, date, itemCount, totals } | null, often: FoodSummary[] }
GET    /products?segment=recent|favorites|all
PUT    /products/favorites/{key}       { barcode?, name }
DELETE /products/favorites/{key}
GET    /saved-meals                    → SavedMeal[]
POST   /saved-meals                    { name, fromMealId } | { name, items }
PATCH  /saved-meals/{id}
DELETE /saved-meals/{id}
POST   /saved-meals/{id}/log           { date, label }  → MealView
```

Write endpoints return `{ meal }`, where each meal includes `photos: [{ id, url }]`. `DELETE /meal-items/{id}` returns `{ mealId, mealDeleted }`.

**Scan, Describe and Review**

The flow is two steps, so nothing is written until the user taps "Add to {meal}".

```
POST /uploads                      multipart or Vercel Blob client upload → { uploadId, url }
POST /log/analyze                  { source: "barcode"|"label"|"photo"|"text", barcode?, uploadIds?, text?, locale? }
                                   → { source, items: DraftItem[], note }
POST /meals/items                  commit the edited items (same endpoint as above)
```

`DraftItem` is `{ key, name, brand, barcode, foodId, amount, unit, per100, nutrimentsPer100g, metrics, servings, servingSize, match, saveable, alternatives }`, with `match` one of `barcode`, `catalog`, `label` or `estimate`. To commit, send `{ foodId, amount, unit }` for catalog items, or `{ name, nutrimentsPer100g, amount, unit }` for estimates. A `label` draft is `saveable`: `POST /foods` adds it to the catalog first, with the barcode that wasn't found, the label photo and the printed `servingSize`, so the next scan of that barcode finds it. An unknown barcode returns 404 `food_not_found`, which is the client's cue to offer a label scan.

- `barcode` is deterministic: `resolveProductByBarcode`, with no model call.
- `label` reads the nutrition table with a vision model. It can return a product to save through `POST /foods` (photos attached).
- `photo` and `text` use a structured-output model call that identifies foods and portions, then reuses `searchCatalogAndOpenFoodFactsMany` to ground each item. This reuses the agent's rules from `instructions.md`, but its tools are read-only.

**Weight and progress photos** (new)

```
GET    /me/weights?from=&to=   → { startKg, currentKg, goalKg, progress, entries: [{ id, date, weightKg, deltaKg }] }
POST   /me/weights             { date?, weightKg }        (one entry per day; defaults to today)
PATCH  /me/weights             { startWeightKg?, goalWeightKg? }
DELETE /me/weights/{id}
GET    /me/progress-photos
POST   /me/progress-photos     { uploadId, date }
DELETE /me/progress-photos/{id}
```

**Groups**

```
GET    /groups                           → GroupListItem[] (+ sharing, unreadCount)
POST   /groups                           { name, description, uploadId? }
GET    /groups/{id}                      → owner or member detail
PATCH  /groups/{id}
DELETE /groups/{id}
POST   /groups/{id}/invite/rotate        → { inviteToken, webInviteUrl, telegramInviteUrl }
GET    /invites/{token}                  → GroupInvitePreview + membership
POST   /invites/{token}/join
POST   /groups/{id}/leave
DELETE /groups/{id}/members/{userId}
PATCH  /groups/{id}/membership           { sharing }
GET    /groups/{id}/messages?memberId=   (members read their own thread; owners pass memberId)
POST   /groups/{id}/messages             { memberId, body, target?: { type: "day", date } | { type: "mealItem", mealItemId } }   (owner only; pushes to the member)
POST   /groups/{id}/messages/read
GET    /groups/{id}/members/{userId}/diary?date=   (owner only, requires member sharing)
GET    /groups/{id}/members/{userId}/days?from=&to=
```

**Notifications**

```
GET  /notifications?before=   → { items, unreadCount, nextBefore }   (coach comments and joins to groups you own)
POST /notifications/read
```

### Schema changes

| Change | Why |
| --- | --- |
| `RefreshToken { id, userId, tokenHash, expiresAt, revokedAt, device }` | Mobile auth |
| `EmailOtp { email, codeHash, expiresAt, attempts }` (or reuse `VerificationToken`) | Email code sign-in |
| `PushDevice { userId, token, platform }` and a `push` reach target in reminders | Push reminders |
| `MealItem.brand String?` | Brand on food rows |
| `SavedMeal`, `SavedMealItem` | Save as meal, Saved meals tab |
| `MealPhoto { mealId, attachmentId }` | Add photo |
| None: API uploads reuse `UserAttachment` with `sessionId = "api-upload"` | Uploads outside agent turns |
| `WeightEntry { userId, date, weightKg }`, `UserProfile.startWeightKg?` and `goalWeightKg?` | Weight journey |
| `UserProfile.notificationsReadAt` | Notification unread state |
| `ProgressPhoto { userId, attachmentId, date }` | Progress photos |
| `GroupMember.sharing Boolean @default(true)`, `lastReadAt DateTime?` | Sharing toggle, unread counts |
| `GroupMessage.targetDate String?`, `targetMealItemId String?` | "Coach commented on your day" and food item comments |

### Out of scope for v1

- **Burned calories**: needs HealthKit or Health Connect. The API returns `burned: 0` until that ships.
- **Followers, following and journal counts** on Me.
- **In-app agent chat**: it already works through `/eve/v1` once bearer auth lands. A UI is a separate step.

## 4. Implementation order

1. **Foundation**: a `lib/api/*` helper (`requireUser`, zod parsing, error mapping, i18n), bearer token issuance, the email OTP endpoints and CORS for the dev client. Move server actions onto shared services.
2. **Read paths**: `/me`, goals, reminders, `/diary*` (with `byLabel` and brand), `/foods/*`, `/products`, `/log/suggestions`.
3. **Write paths**: `/meals/items` with any date, item edit and delete, copy, favorites.
4. **New features**: saved meals, uploads and meal photos, `/log/analyze`, then weight and progress photos.
5. **Social**: groups endpoints, sharing, comments, notifications and push.

Each step ships with tests next to the `lib` functions (the repo's existing pattern). Each step can be wired into the mobile app as soon as it lands.

## 5. Running and testing

- `npm run test:api:db` starts a throwaway Postgres in Docker (port 54329) and applies migrations.
- `npm run test:api` runs the end-to-end suites in `lib/api/*.api.test.ts`. Each request goes through the real router, auth, zod validation, `lib/*` services and Postgres. Email, push, blob storage and the food-recognition model are swapped for fakes in `lib/api/test/harness.ts`. `scripts/test/api-env.mjs` refuses to run against any non-local database.
- Conventions: POST returns 201 and DELETE returns 204. Errors are `{ error: { code, message, details? } }`. Dates are `YYYY-MM-DD` nutrition days, which start at 04:00 in the user's time zone.

Not done yet:
- Sign in with Apple.
- Push for scheduled reminders. Push only goes out for coach comments; reminders still go through Telegram and WhatsApp.
- Changing an item's unit or day.
- Burned calories.

