# Multi-Provider Architecture

## Overview

This document describes the multi-provider architecture of the subscription analysis system, its main components, design decisions, and data flows.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
│  - /api/analysis/whop/memberships                               │
│  - /api/analysis/whop/renewals                                  │
│  - /api/analysis/applepay/memberships (future)                  │
│  - /api/consolidated/analysis (aggregates all)                  │
└──────────────────┬──────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────────┐
│              Consolidated Service Layer                          │
│  - Orchestrates parallel calls to multiple providers            │
│  - Per-provider error handling (graceful degradation)           │
│  - Result aggregation                                            │
└──────────────────┬──────────────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
┌──────▼─────────┐    ┌───────▼────────┐
│ Provider       │    │  Provider      │
│ Registry       │◄───┤  Adapters      │
│                │    │  (Strategy)    │
│ - Whop         │    ├────────────────┤
│ - Apple Pay    │    │ WhopAdapter    │
│ - Google Pay   │    │ AppleAdapter   │
└────────────────┘    │ GoogleAdapter  │
                      └────────┬───────┘
                               │
                      ┌────────▼───────┐
                      │  API Clients   │
                      │ (with Circuit  │
                      │  Breakers)     │
                      └────────┬───────┘
                               │
                      ┌────────▼───────┐
                      │  Domain        │
                      │  Mappers       │
                      │  (Factory)     │
                      └────────┬───────┘
                               │
                      ┌────────▼───────┐
                      │  Domain        │
                      │  Models        │
                      │ (Unified)      │
                      └────────────────┘
```

## Main Components

### 1. Domain Layer (`src/domain/subscriptions/`)

**Responsibility:** Define provider-agnostic contracts and domain models.

**Components:**

- **Interfaces** (`interfaces/`):
  - `ProviderAdapter`: Base contract that all providers must implement
  - `MembershipAnalyzer`: Interface for membership analysis
  - `RenewalAnalyzer`: Interface for renewal analysis

- **Models** (`models/`):
  - `Subscription`: Unified subscription model
  - `Membership`: Membership model
  - `Payment`: Payment model
  - `Renewal`: Renewal model

- **Mappers** (`mappers/`):
  - `WhopMapper`: Converts Whop → Domain
  - `ApplePayMapper`: Converts Apple Pay → Domain
  - Etc.

**Design Decisions:**

- Immutable and well-typed models
- Support for `providerData` for provider-specific data
- Enums for standardized values (status, billing reasons)

### 2. Provider Registry (`src/core/providers/`)

**Responsibility:** Dynamic registration and management of providers.

**Features:**

- Automatic provider registration via `OnModuleInit`
- Dynamic discovery of active providers
- Aggregated health checks
- Runtime enable/disable

**Code:**

```typescript
@Injectable()
export class ProviderRegistry {
  registerProvider(
    name: string,
    adapter: ProviderAdapter,
    enabled: boolean,
  ): void;
  getActiveProviders(): ProviderRegistration[];
  checkProvidersHealth(): Promise<Map<string, boolean>>;
}
```

### 3. Provider Adapters (`src/modules/providers/{provider}/`)

**Responsibility:** Implement the `ProviderAdapter` interface for each provider.

**Implementation Pattern:**

Each provider has:

- **Adapter** (`{provider}-adapter.service.ts`):
  - Implements `ProviderAdapter`
  - Decorated with `@ProviderMetadata`
  - Uses API Client internally

- **API Client** (`{provider}-api-client.service.ts`):
  - HTTP communication with provider API
  - Circuit breaker for protection
  - Provider-specific error handling

- **Module** (`{provider}.module.ts`):
  - Registers adapter in `ProviderRegistry`
  - Exports services for external use

**Example (Whop):**

```typescript
@Injectable()
@ProviderMetadata({ name: 'whop', displayName: 'Whop' })
export class WhopAdapter implements ProviderAdapter {
  async getMemberships(filters: MembershipFilters): Promise<Membership[]> {
    const raw = await this.whopApiClient.getMemberships(...);
    return WhopMapper.toMemberships(raw.data);
  }

  async getPayments(filters: PaymentFilters): Promise<Payment[]> { ... }
  async getRenewals(filters: RenewalFilters): Promise<Renewal[]> { ... }
  getCapabilities(): ProviderCapabilities { ... }
  async isHealthy(): Promise<boolean> { ... }
}
```

### 4. Consolidated Service (`src/modules/consolidated/`)

**Responsibility:** Aggregate data from multiple providers.

**Flow:**

1. Receives request with period and filters
2. Queries `ProviderRegistry` to get active providers
3. Executes analyses in parallel using `Promise.allSettled`
4. Aggregates results, keeping successes and logging failures
5. Returns consolidated response with data per provider

**Code:**

```typescript
@Injectable()
export class ConsolidatedAnalysisService {
  async analyzeAll(
    startDate: Date,
    endDate: Date,
    providerNames?: string[],
  ): Promise<ConsolidatedAnalysisResponseDto> {
    const providers = this.providerRegistry.getActiveProviders();

    const results = await Promise.allSettled(
      providers.map(provider => this.analyzeProvider(provider, ...))
    );

    return this.aggregateResults(results);
  }
}
```

### 5. Circuit Breakers (`src/core/circuit-breaker/`)

**Responsibility:** Protect the system from cascading failures.

**Characteristics:**

- **One circuit breaker per provider** (`{provider}-api`)
- **Isolation**: Failure in one provider doesn't affect others
- **Configurable**: Timeout, threshold, reset timeout
- **Observable**: State exposed via health check

**Naming:**

- `whop-api` → Whop circuit breaker
- `applepay-api` → Apple Pay circuit breaker
- `googlepay-api` → Google Pay circuit breaker

**Code:**

```typescript
// In each provider's API Client
this.circuitBreaker = this.circuitBreakerService.createProviderCircuitBreaker(
  'whop',
  makeRequestWrapper,
  { timeout: 10000 },
);
```

## Data Flows

### Flow 1: Consolidated Analysis

```
Client
  │
  └─► GET /api/consolidated/analysis?startDate=...&endDate=...
       │
       ▼
  ConsolidatedAnalysisController
       │
       ▼
  ConsolidatedAnalysisService
       │
       ├─► ProviderRegistry.getActiveProviders()
       │    └─► ['whop', 'applepay', 'googlepay']
       │
       ├─► Promise.allSettled([
       │    ├─► analyzeWhop(filters)
       │    ├─► analyzeApplePay(filters)
       │    └─► analyzeGooglePay(filters)
       │   ])
       │
       └─► aggregateResults()
            └─► { providers: { whop: {...}, applepay: {...} } }
```

### Flow 2: Provider-Specific Analysis

```
Client
  │
  └─► GET /api/analysis/whop/memberships?startDate=...
       │
       ▼
  MembershipsController (Whop)
       │
       ▼
  MembershipsService
       │
       ├─► MembershipFetcher.fetchByStatus('trialing')
       │    └─► WhopAdapter.getMemberships(filters)
       │         └─► WhopApiClient.getMemberships()
       │              └─► CircuitBreaker['whop-api'].fire()
       │                   └─► HTTP GET api.whop.com/memberships
       │
       ├─► EmailEnricher.enrichMemberships()
       ├─► PlanCache.warmupCache()
       └─► Analysis of conversions/non-conversions
            └─► Response { trials, converted, notConverted }
```

### Flow 3: New Provider Registration

```
Application Bootstrap
  │
  └─► AppModule imports WhopModule
       │
       ▼
  WhopModule.onModuleInit()
       │
       └─► ProviderRegistry.registerProvider('whop', whopAdapter, true)
            │
            ├─► Saves in internal Map
            ├─► Log: "Provider registered successfully"
            └─► Available for ConsolidatedService
```

## Design Decisions

### 1. Why Adapter Pattern?

**Problem:** Each provider has different APIs (structures, endpoints, authentication).

**Solution:** `ProviderAdapter` interface standardizes the contract, allowing each provider to implement it their own way.

**Benefits:**

- Easy to add new providers
- Testability (simple mocks)
- Low coupling

### 2. Why Static Mappers?

**Problem:** Conversion of provider-specific data → domain models.

**Solution:** Static mapper classes (stateless) that do pure conversion.

**Benefits:**

- Performance (no dependency injection overhead)
- Testability (pure functions)
- Reusable

### 3. Why Individual Circuit Breakers?

**Problem:** Failure in one provider can bring down the entire system.

**Solution:** One circuit breaker per provider.

**Benefits:**

- Failure isolation
- Graceful degradation (Whop goes down, Apple Pay continues)
- Visibility (health check shows state of each one)

### 4. Why Promise.allSettled?

**Problem:** If using `Promise.all`, one failure in any provider rejects everything.

**Solution:** `Promise.allSettled` allows capturing successes and failures independently.

**Benefits:**

- Always returns response (even with partial failures)
- Client sees which providers failed
- Better user experience

### 5. Why Provider Registry?

**Problem:** How to dynamically discover which providers are available?

**Solution:** Centralized registry that maintains list of active providers.

**Benefits:**

- Dynamic discovery
- Easy enable/disable
- Aggregated health checks

## Scalability

### Adding New Providers

**Estimated time:** 1-2 weeks per provider (after architecture is established)

**Steps:**

1. Create Mapper (1-2 days)
2. Create API Client (2-3 days)
3. Implement Adapter (1-2 days)
4. Create Module (1 day)
5. Tests and documentation (2-3 days)

**Without modifying:**

- Domain models ✅
- ConsolidatedService ✅
- ProviderRegistry ✅
- Health checks ✅

### Performance

**Consolidated Analysis:**

- Providers execute in parallel (`Promise.allSettled`)
- Total time ≈ slowest provider time
- Circuit breakers prevent long timeouts

**Cache:**

- Plans: 5min TTL (per provider)
- Can add cache for complete responses if needed

**Rate Limiting:**

- Per provider (each API has its limits)
- Circuit breaker protects against rate limits

## Security

### Authentication

- All endpoints require `Authorization` header
- Provider API keys stored in environment variables
- Never expose credentials in logs or responses

### Validation

- DTOs with `class-validator`
- Validation of dates, formats, limits
- Input sanitization

### Rate Limiting

- Global throttler (configurable)
- Circuit breakers per provider
- Pagination limits (max 200 pages)

## Observability

### Structured Logs

All logs include:

```json
{
  "provider": "whop",
  "operation": "fetch_memberships",
  "duration": 1234,
  "recordsProcessed": 150,
  "level": "info"
}
```

### Health Check

`GET /api/health` returns:

```json
{
  "status": "ok",
  "info": {
    "providers": {
      "status": "up",
      "providers": {
        "whop": {
          "healthy": true,
          "circuitBreaker": { "state": "closed" }
        }
      }
    },
    "circuit-breakers": {
      "status": "up",
      "total": 3,
      "open": 0
    }
  }
}
```

### Metrics

Recommendations for production:

- Latency per provider
- Success/failure rate per provider
- Open circuit breaker count
- Request throughput

## Tests

### Testing Strategy

**Unit Tests:**

- Mappers (data conversion)
- Domain models
- Isolated services

**Integration Tests:**

- Adapter + API Client (with HTTP mocks)
- ConsolidatedService + ProviderRegistry
- E2E Controllers

**Contract Tests:**

- Verify adapters implement ProviderAdapter correctly
- Ensure response compatibility

### Mocking

```typescript
// ProviderAdapter Mock
const mockWhopAdapter: ProviderAdapter = {
  providerName: 'whop',
  getMemberships: jest.fn().mockResolvedValue([...]),
  getPayments: jest.fn().mockResolvedValue([...]),
  getRenewals: jest.fn().mockResolvedValue([...]),
  getCapabilities: jest.fn().mockReturnValue({...}),
  isHealthy: jest.fn().mockResolvedValue(true),
};
```

## Next Steps

### Short Term

- [ ] Implement complete analysis in ConsolidatedService (currently returns placeholder)
- [ ] Add cache for consolidated responses
- [ ] Implement webhooks per provider (real-time events)

### Medium Term

- [ ] Add Apple Pay as second provider
- [ ] Implement Google Pay
- [ ] Metrics system (Prometheus/Grafana)
- [ ] Observability dashboard

### Long Term

- [ ] Data persistence (Prisma + PostgreSQL)
- [ ] Background jobs for reconciliation
- [ ] Notification system (failure alerts)
- [ ] Public API with per-client rate limiting

## References

- [Provider Addition Guide](./ADDING_NEW_PROVIDERS.md)
- [Main README](./README.md)
- [NestJS Documentation](https://docs.nestjs.com)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Adapter Pattern](https://refactoring.guru/design-patterns/adapter)

---

**Last updated:** December 2025  
**Maintained by:** Architecture Team
