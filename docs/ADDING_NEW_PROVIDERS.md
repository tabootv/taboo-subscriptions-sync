# Guide: How to Add a New Provider

This guide details the step-by-step process for integrating a new payment provider (such as Apple Pay, Google Pay, Stripe, etc.) into the subscription analysis system.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step by Step](#step-by-step)
- [Examples](#examples)
- [Final Checklist](#final-checklist)
- [Troubleshooting](#troubleshooting)

---

## Overview

The multi-provider architecture uses:

- **Provider Adapter Pattern**: Each provider implements the `ProviderAdapter` interface
- **Domain Models**: Unified models that abstract differences between providers
- **Mappers**: Convert provider-specific data to the unified domain
- **Provider Registry**: Dynamic registry that manages all active providers
- **Circuit Breakers**: Failure isolation per provider

```
┌─────────────────────────────────────────┐
│    Consolidated API (Multi-Provider)    │
│    /api/consolidated/analysis           │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
┌──────▼─────┐  ┌─────▼──────┐
│   Whop     │  │  Apple Pay │
│  Adapter   │  │  Adapter   │
└────────────┘  └────────────┘
```

---

## Prerequisites

Before starting, make sure you have:

1. ✅ API credentials from the new provider (API key, secrets, etc.)
2. ✅ Provider's API documentation
3. ✅ Knowledge of returned data types (memberships, payments, etc.)
4. ✅ Node.js 18+ and NestJS installed

---

## Step by Step

### 1. Create Directory Structure

Create the provider module structure in `src/modules/providers/{provider}/`:

```bash
mkdir -p src/modules/providers/{provider}/adapters
mkdir -p src/modules/providers/{provider}/analysis
mkdir -p src/modules/providers/{provider}/controllers
mkdir -p src/modules/providers/{provider}/services
```

**Example for Apple Pay:**

```bash
mkdir -p src/modules/providers/applepay/adapters
mkdir -p src/modules/providers/applepay/analysis
mkdir -p src/modules/providers/applepay/controllers
mkdir -p src/modules/providers/applepay/services
```

### 2. Implement the Mapper

Create the mapper in `src/domain/subscriptions/mappers/{provider}-mapper.ts` to convert provider data to domain models.

**Template:**

```typescript
// src/domain/subscriptions/mappers/{provider}-mapper.ts
import {
  Membership,
  Payment,
  Renewal,
  PlanInfo,
  SubscriptionStatus,
  PaymentStatus,
  BillingReason,
} from '../models';

export class {Provider}Mapper {
  private static readonly PROVIDER_NAME = '{provider}';

  /**
   * Map {provider} subscription to domain Membership model
   */
  static toMembership(raw{Provider}Data: any, email?: string): Membership {
    return {
      id: raw{Provider}Data.id,
      userId: raw{Provider}Data.userId || raw{Provider}Data.customer_id,
      email: email || raw{Provider}Data.email || null,
      status: this.mapStatus(raw{Provider}Data.status),
      provider: this.PROVIDER_NAME,
      plan: this.mapPlan(raw{Provider}Data.plan),
      createdAt: raw{Provider}Data.created_at || raw{Provider}Data.createdAt,
      updatedAt: raw{Provider}Data.updated_at,
      trialEndsAt: raw{Provider}Data.trial_end,
      providerData: {
        raw: raw{Provider}Data,
      },
    };
  }

  /**
   * Map {provider} payment to domain Payment model
   */
  static toPayment(raw{Provider}Payment: any): Payment {
    return {
      id: raw{Provider}Payment.id,
      membershipId: raw{Provider}Payment.subscription_id,
      userId: raw{Provider}Payment.customer_id,
      email: raw{Provider}Payment.customer_email,
      provider: this.PROVIDER_NAME,
      amount: raw{Provider}Payment.amount / 100, // Convert cents to dollars
      currency: raw{Provider}Payment.currency,
      status: this.mapPaymentStatus(raw{Provider}Payment.status),
      billingReason: this.mapBillingReason(raw{Provider}Payment.type),
      createdAt: raw{Provider}Payment.created,
      paidAt: raw{Provider}Payment.paid_at,
      providerData: {
        raw: raw{Provider}Payment,
      },
    };
  }

  /**
   * Map array of memberships
   */
  static toMemberships(raw{Provider}Data: any[]): Membership[] {
    return raw{Provider}Data.map((m) => this.toMembership(m));
  }

  /**
   * Map array of payments
   */
  static toPayments(raw{Provider}Payments: any[]): Payment[] {
    return raw{Provider}Payments.map((p) => this.toPayment(p));
  }

  /**
   * Map {provider} plan to domain PlanInfo
   */
  private static mapPlan(raw{Provider}Plan: any): PlanInfo | null {
    if (!raw{Provider}Plan) return null;

    return {
      id: raw{Provider}Plan.id,
      title: raw{Provider}Plan.name || raw{Provider}Plan.product_name,
      billingPeriod: raw{Provider}Plan.interval_count * 30, // Approximate to days
      renewalPrice: raw{Provider}Plan.amount / 100,
      currency: raw{Provider}Plan.currency,
      trialPeriodDays: raw{Provider}Plan.trial_period_days,
    };
  }

  /**
   * Map {provider} status to domain SubscriptionStatus
   */
  private static mapStatus(raw{Provider}Status: string): SubscriptionStatus | string {
    const statusMap: Record<string, SubscriptionStatus> = {
      trial: SubscriptionStatus.TRIALING,
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELED,
      // Add provider-specific mappings here
    };

    return statusMap[raw{Provider}Status] || raw{Provider}Status;
  }

  /**
   * Map {provider} payment status
   */
  private static mapPaymentStatus(raw{Provider}Status: string): PaymentStatus | string {
    const statusMap: Record<string, PaymentStatus> = {
      succeeded: PaymentStatus.SUCCEEDED,
      pending: PaymentStatus.PENDING,
      failed: PaymentStatus.FAILED,
      // Add provider-specific mappings here
    };

    return statusMap[raw{Provider}Status] || raw{Provider}Status;
  }

  /**
   * Map {provider} billing reason
   */
  private static mapBillingReason(raw{Provider}Type: string): BillingReason | string {
    const reasonMap: Record<string, BillingReason> = {
      initial: BillingReason.SUBSCRIPTION_CREATE,
      recurring: BillingReason.SUBSCRIPTION_CYCLE,
      // Add provider-specific mappings here
    };

    return reasonMap[raw{Provider}Type] || BillingReason.OTHER;
  }
}
```

### 3. Create the API Client Service

Create the service that communicates with the provider's API in `src/modules/providers/{provider}/adapters/{provider}-api-client.service.ts`.

**Template:**

```typescript
// src/modules/providers/{provider}/adapters/{provider}-api-client.service.ts
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../../../../core/circuit-breaker/circuit-breaker.service';
import { logger } from '../../../../core/logger/logger.config';

@Injectable()
export class {Provider}ApiClientService {
  private readonly logger = logger();
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private circuitBreaker: any;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {
    this.baseUrl = this.configService.get<string>('{PROVIDER}_BASE_URL') || '';
    this.apiKey = this.configService.get<string>('{PROVIDER}_API_KEY') || '';

    this.logger.info(
      {
        baseUrl: this.baseUrl,
        hasApiKey: !!this.apiKey,
      },
      '{Provider}ApiClientService initialized',
    );
  }

  /**
   * Get circuit breaker (lazy initialization)
   */
  private getCircuitBreaker(): any {
    if (!this.circuitBreaker) {
      const makeRequestWrapper = async (
        args: [string, string, AxiosRequestConfig?],
      ) => {
        return this.makeRequest(args[0], args[1], args[2]);
      };

      this.circuitBreaker = this.circuitBreakerService.createProviderCircuitBreaker(
        '{provider}',
        makeRequestWrapper,
        {
          timeout: 10000, // 10s timeout
        },
      );
    }
    return this.circuitBreaker;
  }

  /**
   * Make HTTP request with circuit breaker protection
   */
  private async makeRequest(
    method: string,
    endpoint: string,
    config?: AxiosRequestConfig,
  ): Promise<any> {
    const upperMethod = method.toUpperCase();
    if (upperMethod !== 'GET') {
      throw new HttpException(
        'Only GET requests are allowed',
        HttpStatus.FORBIDDEN,
      );
    }

    const url = `${this.baseUrl}${endpoint}`;

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    const requestConfig: AxiosRequestConfig = {
      method: upperMethod as any,
      url,
      headers,
      timeout: 10000,
      ...(config?.params && { params: config.params }),
    };

    this.logger.debug({ method, url }, 'Making HTTP request');

    try {
      const response = await firstValueFrom(
        this.httpService.request(requestConfig),
      );
      return response.data;
    } catch (error: any) {
      const statusCode = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorMessage = error.response?.data?.message || error.message;

      this.logger.error(
        { endpoint, method, statusCode, errorMessage },
        '{Provider} API request failed',
      );

      throw new HttpException(
        {
          statusCode,
          message: `{Provider} API error: ${errorMessage}`,
          endpoint,
        },
        statusCode,
      );
    }
  }

  /**
   * Get subscriptions/memberships from {Provider}
   */
  async getSubscriptions(filters?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    const params: any = {};

    if (filters?.startDate) params.created_after = filters.startDate;
    if (filters?.endDate) params.created_before = filters.endDate;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.cursor) params.cursor = filters.cursor;

    return this.getCircuitBreaker().fire(['GET', '/subscriptions', { params }]);
  }

  /**
   * Get payments from {Provider}
   */
  async getPayments(filters?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    cursor?: string;
  }): Promise<any> {
    const params: any = {};

    if (filters?.startDate) params.created_after = filters.startDate;
    if (filters?.endDate) params.created_before = filters.endDate;
    if (filters?.limit) params.limit = filters.limit;
    if (filters?.cursor) params.cursor = filters.cursor;

    return this.getCircuitBreaker().fire(['GET', '/payments', { params }]);
  }
}
```

### 4. Implement the Provider Adapter

Create the adapter that implements the `ProviderAdapter` interface in `src/modules/providers/{provider}/adapters/{provider}-adapter.service.ts`.

**Template:**

```typescript
// src/modules/providers/{provider}/adapters/{provider}-adapter.service.ts
import { Injectable } from '@nestjs/common';
import {
  MembershipFilters,
  PaymentFilters,
  ProviderAdapter,
  ProviderCapabilities,
  RenewalFilters,
  Membership,
  Payment,
  Renewal,
} from '../../../../domain/subscriptions';
import { ProviderMetadata } from '../../../../core/providers';
import { {Provider}ApiClientService } from './{provider}-api-client.service';
import { {Provider}Mapper } from '../../../../domain/subscriptions/mappers/{provider}-mapper';
import { logger } from '../../../../core/logger/logger.config';

@Injectable()
@ProviderMetadata({
  name: '{provider}',
  displayName: '{Provider}',
  description: '{Provider} payment provider adapter',
  enabled: true,
})
export class {Provider}Adapter implements ProviderAdapter {
  private readonly logger = logger();
  readonly providerName = '{provider}';

  constructor(
    private readonly {provider}ApiClient: {Provider}ApiClientService,
  ) {}

  /**
   * Get memberships from {Provider}
   */
  async getMemberships(filters: MembershipFilters): Promise<Membership[]> {
    this.logger.debug({ filters }, '{Provider}Adapter: Fetching memberships');

    try {
      const response = await this.{provider}ApiClient.getSubscriptions({
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
        limit: filters.limit,
        cursor: filters.cursor,
      });

      const rawData = response.data || [];
      return {Provider}Mapper.toMemberships(rawData);
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        '{Provider}Adapter: Failed to fetch memberships',
      );
      throw error;
    }
  }

  /**
   * Get payments from {Provider}
   */
  async getPayments(filters: PaymentFilters): Promise<Payment[]> {
    this.logger.debug({ filters }, '{Provider}Adapter: Fetching payments');

    try {
      const response = await this.{provider}ApiClient.getPayments({
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
        limit: filters.limit,
        cursor: filters.cursor,
      });

      const rawData = response.data || [];
      return {Provider}Mapper.toPayments(rawData);
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        '{Provider}Adapter: Failed to fetch payments',
      );
      throw error;
    }
  }

  /**
   * Get renewals from {Provider}
   */
  async getRenewals(filters: RenewalFilters): Promise<Renewal[]> {
    this.logger.debug({ filters }, '{Provider}Adapter: Fetching renewals');

    try {
      const response = await this.{provider}ApiClient.getPayments({
        startDate: filters.startDate.toISOString(),
        endDate: filters.endDate.toISOString(),
        limit: filters.limit,
        cursor: filters.cursor,
      });

      const rawData = response.data || [];
      // Filter for renewal payments
      return rawData
        .filter((p: any) => p.type === 'recurring') // Provider-specific logic
        .map((p: any) => ({
          ...{Provider}Mapper.toPayment(p),
          provider: this.providerName,
        }));
    } catch (error: any) {
      this.logger.error(
        { error: error.message, filters },
        '{Provider}Adapter: Failed to fetch renewals',
      );
      throw error;
    }
  }

  /**
   * Get {Provider} provider capabilities
   */
  getCapabilities(): ProviderCapabilities {
    return {
      supportsTrials: true,
      supportsRenewals: true,
      supportsRefunds: true,
      supportedCurrencies: ['usd', 'eur', 'gbp'],
      supportedBillingPeriods: [30, 365],
    };
  }

  /**
   * Check {Provider} API health
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.{provider}ApiClient.getSubscriptions({ limit: 1 });
      return true;
    } catch (error: any) {
      this.logger.error(
        { error: error.message },
        '{Provider}Adapter: Health check failed',
      );
      return false;
    }
  }
}
```

### 5. Create the Provider Module

Create the NestJS module in `src/modules/providers/{provider}/{provider}.module.ts`.

**Template:**

```typescript
// src/modules/providers/{provider}/{provider}.module.ts
import { Module, OnModuleInit } from '@nestjs/common';
import { CoreModule } from '../../../core/core.module';
import { ProviderRegistry } from '../../../core/providers';
import { {Provider}Adapter } from './adapters/{provider}-adapter.service';
import { {Provider}ApiClientService } from './adapters/{provider}-api-client.service';

/**
 * {Provider} Module
 *
 * Contains everything related to {Provider} provider.
 * Automatically registers the adapter with ProviderRegistry on initialization.
 */
@Module({
  imports: [CoreModule],
  providers: [{Provider}ApiClientService, {Provider}Adapter],
  exports: [{Provider}ApiClientService, {Provider}Adapter],
})
export class {Provider}Module implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly {provider}Adapter: {Provider}Adapter,
  ) {}

  /**
   * Register {Provider} adapter with the provider registry
   */
  onModuleInit() {
    this.providerRegistry.registerProvider('{provider}', this.{provider}Adapter, true);
  }
}
```

### 6. Update AppModule

Import the new module in `src/app.module.ts`:

```typescript
import { {Provider}Module } from './modules/providers/{provider}/{provider}.module';

@Module({
  imports: [
    // ... other modules
    WhopModule,
    {Provider}Module, // ← Add here
    ConsolidatedModule,
    // ...
  ],
})
export class AppModule {}
```

### 7. Add Environment Variables

Add the required variables in `.env.example`:

```env
# {Provider} Configuration
{PROVIDER}_BASE_URL=https://api.{provider}.com
{PROVIDER}_API_KEY=your_api_key_here

# Enable/disable providers (comma-separated)
ENABLED_PROVIDERS=whop,{provider}
```

### 8. Update Mapper Index

Add the export of the new mapper in `src/domain/subscriptions/mappers/index.ts`:

```typescript
export * from './whop-mapper';
export * from './{provider}-mapper';
```

---

## Examples

### Complete Example: Apple Pay

See the directory structure for Apple Pay as an example:

```
src/modules/providers/applepay/
├── adapters/
│   ├── applepay-adapter.service.ts
│   └── applepay-api-client.service.ts
├── applepay.module.ts
└── README.md (optional)
```

---

## Final Checklist

Before considering the integration complete, verify:

- [ ] ✅ Mapper implemented and tested
- [ ] ✅ API Client Service created with circuit breaker
- [ ] ✅ Provider Adapter implements all interface methods
- [ ] ✅ Module created and registers adapter in ProviderRegistry
- [ ] ✅ Module imported in AppModule
- [ ] ✅ Environment variables added
- [ ] ✅ Provider health check is working (`GET /api/health`)
- [ ] ✅ Consolidated endpoint includes new provider (`GET /api/consolidated/analysis`)
- [ ] ✅ Provider-specific circuit breaker was created
- [ ] ✅ Structured logs include provider name
- [ ] ✅ README updated with new provider

---

## Troubleshooting

### Provider doesn't appear in health check

**Problem:** Provider doesn't appear in `/api/health`.

**Solution:**

1. Verify module is imported in `AppModule`
2. Confirm `onModuleInit()` is being called
3. Check logs to see if provider was registered in `ProviderRegistry`

```bash
# Look for logs like:
"Provider registered successfully" provider="applepay"
```

### Circuit breaker doesn't work

**Problem:** Circuit breaker is not protecting API calls.

**Solution:**

1. Verify `CircuitBreakerService` is being injected correctly
2. Use `createProviderCircuitBreaker()` instead of `createCircuitBreaker()`
3. Confirm circuit breaker is being created with lazy initialization

### Data doesn't appear in consolidated endpoint

**Problem:** `/api/consolidated/analysis` doesn't include data from new provider.

**Solution:**

1. Verify provider is enabled in `ENABLED_PROVIDERS`
2. Confirm adapter is correctly implementing `ProviderAdapter`
3. Test health check: `GET /api/health` → Verify provider is `healthy: true`
4. Make a direct call to provider endpoint to debug

### Mapper returns incorrect data

**Problem:** Mapped data doesn't match expected format.

**Solution:**

1. Compare provider fields with domain model fields
2. Add logs in mapper to see raw data: `console.log('Raw data:', rawData)`
3. Verify data types are being converted correctly (e.g., cents → dollars)
4. Test mapper in isolation with example data

---

## Next Steps

After integrating the provider:

1. **Tests**: Create unit and integration tests
2. **Documentation**: Update main README with information about new provider
3. **Monitoring**: Configure alerts for provider's circuit breaker
4. **Performance**: Monitor latency and throughput of API calls

---

## Additional Resources

- [ProviderAdapter Interface Documentation](./src/domain/subscriptions/interfaces/provider-adapter.interface.ts)
- [Implementation Example: Whop](./src/modules/providers/whop/)
- [Circuit Breakers Guide](./src/core/circuit-breaker/README.md) _(if exists)_

---

**Questions?** Consult the architecture team or open an issue in the repository.
