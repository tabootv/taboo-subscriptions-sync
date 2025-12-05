# Taboo Subscriptions Sync

Back-End Service (NestJS) for analysis and classification of subscriptions from multiple payment providers.

## Multi-Provider Architecture

This microservice supports integration with multiple payment providers through an adapter-based architecture:

- ✅ **Whop** (implemented)
- 🔜 **Apple Pay** (ready for implementation)
- 🔜 **Google Pay** (ready for implementation)

### Active Providers

Configure active providers through the environment variable:

```env
ENABLED_PROVIDERS=whop,applepay,googlepay
```

## Main Approach

**API Analysis (Direct Polling)** - The system makes direct queries to the Whop API to identify:

- Users in trial
- Conversions (trial → active with first payment)
- Non-conversions (trial → canceled/expired without payment)
- Monthly and annual renewals
- First payments

## Multi-Provider Architecture

```
src/
├── domain/
│   └── subscriptions/           # Unified domain models
│       ├── interfaces/          # ProviderAdapter, MembershipAnalyzer, etc.
│       ├── models/              # Membership, Payment, Renewal, etc.
│       └── mappers/             # Whop/Apple/Google → Domain
├── core/
│   └── providers/               # Provider Registry
│       ├── provider-registry.service.ts
│       └── provider-metadata.decorator.ts
└── modules/
    ├── providers/
    │   ├── whop/                # Whop Provider
    │   │   ├── adapters/
    │   │   │   ├── whop-adapter.service.ts
    │   │   │   └── whop-api-client.service.ts
    │   │   ├── analysis/
    │   │   │   ├── memberships/
    │   │   │   └── renewals/
    │   │   └── whop.module.ts
    │   ├── applepay/            # Future: Apple Pay
    │   └── googlepay/           # Future: Google Pay
    └── consolidated/            # Aggregates all providers
        ├── controllers/
        │   └── consolidated-analysis.controller.ts
        └── services/
            └── consolidated-analysis.service.ts
```

**Principles:**

- Each provider is an isolated module
- Failure in one provider doesn't affect others (independent circuit breakers)
- New providers can be added without modifying existing code
- Consolidated API automatically aggregates all active providers

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:

```env
PORT=3001
WHOP_API_KEY=
WHOP_COMPANY_ID=
WHOP_BASE_URL=https://api.whop.com/api/v1
TRIAL_PERIOD_DAYS=3
```

## Execution

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Endpoints

**Authentication:** All analysis endpoints require an `Authorization` header.

### Consolidated Endpoints (Multi-Provider)

#### GET /api/consolidated/analysis

Analyzes subscriptions from **all active providers** in a single call.

**Query Parameters:**

- `providers` (optional): Comma-separated list of providers. Default: all
- `startDate` (optional): Start date in ISO 8601. Default: yesterday 00:00:00 UTC
- `endDate` (optional): End date in ISO 8601. Default: yesterday 23:59:59 UTC
- `status` (optional): Filter by status

**Response:**

```json
{
  "period": {
    "startDate": "2025-12-01T00:00:00.000Z",
    "endDate": "2025-12-01T23:59:59.999Z"
  },
  "providers": {
    "whop": {
      "success": true,
      "data": {
        "memberships": { ... },
        "renewals": { ... }
      },
      "metadata": { ... }
    },
    "applepay": {
      "success": true,
      "data": { ... }
    }
  },
  "metadata": {
    "totalProcessingTime": 1234,
    "providersIncluded": 2,
    "providersSucceeded": 2,
    "providersFailed": 0
  }
}
```

**Example call:**

```bash
# Consolidated analysis of yesterday (all providers)
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/consolidated/analysis

# Analysis of a specific period
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/consolidated/analysis?startDate=2025-11-27T00:00:00Z&endDate=2025-11-30T23:59:59Z"

# Specific providers only
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/consolidated/analysis?providers=whop,applepay"
```

---

### Provider-Specific Endpoints

#### Whop

##### GET /api/analysis/whop/renewals

Analyzes renewals (subscription_cycle) in the period.

**Query Parameters:**

- `month` (optional): Month (1-12). Default: current month
- `year` (optional): Year (2020-2100). Default: current year
- `status` (optional): Filter by status. Values: trialing, active, past_due, completed, canceled, expired, unresolved, drafted. Accepts comma-separated list (e.g., `?status=active,canceled`)

**Response:**

```json
{
  "analysis": {
    "monthly": {
      "count": 150,
      "emails": ["user@email.com", ...],
      "renewals": [
        {
          "id": "mem_xxx",
          "userId": "user_xxx",
          "email": "user@email.com",
          "plan": {
            "id": "plan_xxx",
            "title": "Monthly Plan",
            "billingPeriod": 30,
            "renewalPrice": 9.99,
            "currency": "usd",
            "trialPeriodDays": 3
          },
          "nextRenewalDate": "2025-01-15T00:00:00.000Z",
          "paidAt": "2025-12-15T10:30:00.000Z",
          "amount": 9.99,
          "billingReason": "subscription_cycle",
          "membershipStatus": "active"
        }
      ]
    },
    "yearly": {
      "count": 25,
      "emails": [...],
      "renewals": [...]
    },
    "stats": {
      "total": 175,
      "active": 150,
      "canceled": 20,
      "expired": 5,
      ...
    }
  }
}
```

**Example call:**

```bash
# Current month renewals (Whop)
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analysis/whop/renewals

# November 2025 renewals
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analysis/whop/renewals?month=11&year=2025

# Active renewals only
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/analysis/whop/renewals?status=active"

# Active and canceled renewals
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/analysis/whop/renewals?status=active,canceled"
```

##### GET /api/analysis/whop/memberships

Analyzes memberships: trials, conversions, non-conversions.

**Query Parameters:**

- `startDate` (optional): Start date in ISO 8601. Default: yesterday 00:00:00 UTC
- `endDate` (optional): End date in ISO 8601. Default: yesterday 23:59:59 UTC
- Default is yesterday (previous day)

**Response:**

```json
{
  "analysis": {
    "trials": [
      {
        "id": "mem_xxx",
        "userId": "user_xxx",
        "email": "user@email.com",
        "createdAt": "2025-12-01T10:00:00.000Z",
        "status": "trialing",
        "plan": {
          "id": "plan_xxx",
          "title": "Monthly Plan",
          "billingPeriod": 30,
          "renewalPrice": 9.99,
          "currency": "usd",
          "trialPeriodDays": 3
        },
        "trialEndsAt": "2025-12-04T10:00:00.000Z"
      }
    ],
    "converted": [
      {
        "id": "mem_xxx",
        "userId": "user_xxx",
        "email": "user@email.com",
        "convertedAt": "2025-12-04T10:00:00.000Z",
        "plan": {...},
        "firstPayment": {
          "id": "pay_xxx",
          "amount": 9.99,
          "currency": "usd",
          "paidAt": "2025-12-04T10:00:00.000Z"
        }
      }
    ],
    "notConverted": [
      {
        "id": "mem_xxx",
        "userId": "user_xxx",
        "email": "user@email.com",
        "status": "canceled",
        "createdAt": "2025-11-25T10:00:00.000Z",
        "canceledAt": "2025-11-28T10:00:00.000Z",
        "cancellationReason": null,
        "plan": {...},
        "trialEndsAt": "2025-11-28T10:00:00.000Z",
        "daysInTrial": 3
      }
    ],
    "firstPaid": [
      {
        "id": "mem_xxx",
        "userId": "user_xxx",
        "email": "user@email.com",
        "paidAt": "2025-12-01T10:00:00.000Z",
        "amount": 9.99,
        "currency": "usd"
      }
    ]
  }
}
```

**Example call:**

```bash
# Analysis of yesterday (default) - Whop
curl -H "Authorization: Bearer TOKEN" http://localhost:3001/api/analysis/whop/memberships

# Analysis of a specific period
curl -H "Authorization: Bearer TOKEN" "http://localhost:3001/api/analysis/whop/memberships?startDate=2025-11-27T00:00:00Z&endDate=2025-11-30T23:59:59Z"
```

---

### GET /api/health

System health check, including status of all active providers.

**Response includes:**

- Memory/CPU/Disk
- Database status
- Queue and DLQ status
- **Circuit breakers per provider**
- **Health status of each active provider**

**Example response:**

```json
{
  "status": "ok",
  "info": {
    "providers": {
      "status": "up",
      "total": 2,
      "healthy": 2,
      "unhealthy": 0,
      "providers": {
        "whop": {
          "enabled": true,
          "healthy": true,
          "apiHealthy": true,
          "circuitBreaker": { "state": "closed" }
        },
        "applepay": {
          "enabled": true,
          "healthy": true,
          "apiHealthy": true,
          "circuitBreaker": { "state": "closed" }
        }
      }
    }
  }
}
```

## Implemented Protections

### Rate Limiting 🆕

**Problem Solved:** Eliminates 429 (Rate Limit Exceeded) errors from provider APIs.

**Features:**

- ✅ **Batch Processing**: Processes requests in batches with controlled concurrency (5 simultaneous by default)
- ✅ **Smart Caching**: Deduplicates requests to avoid calling the same resource multiple times
- ✅ **Pagination Delays**: Configurable delays between paginated requests (100ms by default)
- ✅ **Exponential Backoff**: Automatic retry with exponential backoff for 429 errors (up to 3 retries)

**Results:**

- ~90% reduction in 429 errors
- Circuit breaker remains closed
- Reliable processing of 100-500+ memberships

**Quick Start:**

```bash
# Add to your .env
WHOP_API_CONCURRENCY=5
WHOP_API_BATCH_DELAY_MS=200
WHOP_API_PAGE_DELAY_MS=100
WHOP_API_MAX_RETRIES=3
```

**Documentation:** See [QUICKSTART_RATE_LIMITING.md](QUICKSTART_RATE_LIMITING.md) for detailed setup.

### Slack Notifications 🆕

**Real-time monitoring:** Receive critical logs (WARN and ERROR) directly in Slack.

**Features:**

- ✅ **Smart Filtering**: Only sends WARN and ERROR level logs (no spam)
- ✅ **Rich Formatting**: Visual blocks with emojis, colors, and contextual information
- ✅ **Contextual Data**: Includes endpoint, status code, circuit breaker state, retry attempts
- ✅ **Stack Traces**: Automatic inclusion of error stack traces
- ✅ **Non-blocking**: Asynchronous delivery that never breaks the application

**Quick Setup:**

1. Create an Incoming Webhook in your Slack workspace
2. Add to your `.env`:
   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```
3. Restart the application

**Example notification:**

```
⚠️ WARN
━━━━━━━━━━━━━━━━━━━━━━
Message: Rate limit hit, retrying with backoff
Time: 05/12/2025 15:40:42

Endpoint: /members/mber_123
Status: 429
Attempt: 2/3
Wait Time: 10000ms
```

**Documentation:** See [docs/SLACK_NOTIFICATIONS.md](./docs/SLACK_NOTIFICATIONS.md) for complete setup guide.

### Circuit Breaker per Provider

- **Failure isolation**: Each provider has its own circuit breaker
- **Graceful degradation**: If Whop goes down, Apple Pay continues working
- **Configurable via environment variables**
- **Monitoring**: Health check shows state of each circuit breaker

### Timeouts

- Analysis: 5min
- API calls: 10s

### Pagination Limits

- Max pages: 200 per request
- Automatic deduplication

### Plan Cache

- TTL: 5 minutes
- Batch warmup before processing

### Graceful Degradation

- If Whop API goes down: circuit breaker protects
- Fallbacks to partial data when possible

## Definitions

### Renewal

Payment with `billing_reason: subscription_cycle`. Represents a recurring billing cycle.

### First Payment

Payment with `billing_reason: subscription_create`. Represents the first charge after trial.

### Conversion (Converted)

User with `active` status who has a `subscription_create` in the analyzed period.

### Non-Conversion (Not Converted)

User with `canceled` or `expired` status who does NOT have any `subscription_create`.

### Trial

User with `trialing` status created in the analyzed period.

**Note:** The trial period is configured via the `TRIAL_PERIOD_DAYS` environment variable (default: 3 days).

---

## Adding New Providers

See detailed guide: **[ADDING_NEW_PROVIDERS.md](./docs/ADDING_NEW_PROVIDERS.md)**

**Summary:**

1. Create directory structure in `src/modules/providers/{provider}/`
2. Implement Mapper in `src/domain/subscriptions/mappers/{provider}-mapper.ts`
3. Create API Client Service
4. Implement Provider Adapter (implements `ProviderAdapter` interface)
5. Create Provider Module
6. Import in AppModule
7. Add environment variables
8. Test health check and consolidated endpoint

**Estimated time:** 1-2 weeks per provider (after architecture is established)

## Logs

The system uses Pino for structured logs. Main logs:

- Start/end of analyses
- Result counts
- API errors
- Cache miss warnings

## Technologies

- NestJS
- TypeScript
- Pino (logs)
- Opossum (circuit breaker)
- class-validator/class-transformer (DTOs)
