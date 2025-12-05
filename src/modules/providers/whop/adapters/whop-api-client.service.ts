import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerService } from '../../../../core/circuit-breaker/circuit-breaker.service';
import { ProcessingLimitsService } from '../../../../core/limits/processing-limits.service';
import { RateLimiterService } from '../../../../core/limits/rate-limiter.service';
import { logger } from '../../../../core/logger/logger.config';
import {
  delayWithJitter,
  parseRetryAfter,
} from '../../../../core/utils/delay.util';

@Injectable()
export class WhopApiClientService {
  private readonly logger = logger();
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly companyId: string;
  private readonly maxRetries: number;
  private readonly retryBackoffBaseMs: number;
  private circuitBreaker: any;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly limitsService: ProcessingLimitsService,
    private readonly rateLimiter: RateLimiterService,
  ) {
    this.baseUrl =
      this.configService.get<string>('WHOP_BASE_URL') ||
      'https://api.whop.com/api/v1';
    this.apiKey = this.configService.get<string>('WHOP_API_KEY') || '';
    this.companyId = this.configService.get<string>('WHOP_COMPANY_ID') || '';
    this.maxRetries = this.configService.get<number>('WHOP_API_MAX_RETRIES', 3);
    this.retryBackoffBaseMs = this.configService.get<number>(
      'WHOP_API_RETRY_BACKOFF_BASE_MS',
      1000,
    );
  }

  private getCircuitBreaker(): any {
    if (!this.circuitBreaker) {
      const makeRequestWrapper = async (
        args: [string, string, AxiosRequestConfig?, number?],
      ) => {
        return this.makeRequestWithRetry(args[0], args[1], args[2], args[3]);
      };

      const circuitBreakerTimeout = 150000;

      this.circuitBreaker = this.circuitBreakerService.createCircuitBreaker(
        makeRequestWrapper,
        {
          name: 'whop-api',
          timeout: circuitBreakerTimeout,
        },
      );
    }
    return this.circuitBreaker;
  }

  /**
   * Wrapper method that handles retries with backoff OUTSIDE the HTTP timeout
   */
  private async makeRequestWithRetry(
    method: string,
    endpoint: string,
    config?: AxiosRequestConfig,
    attempt: number = 0,
  ): Promise<any> {
    try {
      const result = await this.makeRequest(method, endpoint, config);
      return result;
    } catch (error: any) {
      const statusCode =
        error.response?.status ||
        error.status ||
        HttpStatus.INTERNAL_SERVER_ERROR;

      if (statusCode === 429 && attempt < this.maxRetries) {
        this.rateLimiter.onRateLimitDetected();

        const errorData = error.response?.data || {};
        const errorMessage =
          errorData.message ||
          errorData.error?.message ||
          errorData.error ||
          error.message ||
          'Whop API request failed';

        const retryAfter = parseRetryAfter(
          error.response?.headers?.['retry-after'] ||
            error.response?.headers?.['Retry-After'],
          errorMessage,
        );

        const backoffDelay = this.retryBackoffBaseMs * Math.pow(2, attempt);
        const waitTime = Math.max(retryAfter, backoffDelay);

        this.logger.warn(
          {
            endpoint,
            method,
            statusCode,
            errorMessage,
            attempt,
            retryAfterFromMessage: retryAfter,
            backoffDelay,
            waitTime,
            nextAttempt: attempt + 1,
            maxRetries: this.maxRetries,
          },
          'Rate limit hit, retrying with backoff',
        );

        await delayWithJitter(waitTime, 30);
        return this.makeRequestWithRetry(method, endpoint, config, attempt + 1);
      }
      if (statusCode === 429) {
        this.logger.error(
          {
            endpoint,
            method,
            statusCode,
            attempt,
            retriesExhausted: true,
          },
          'Rate limit exceeded - max retries exhausted',
        );
      }

      throw error;
    }
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    config?: AxiosRequestConfig,
  ): Promise<any> {
    await this.rateLimiter.acquire();

    const upperMethod = method.toUpperCase();
    if (upperMethod !== 'GET') {
      this.logger.error(
        { method: upperMethod, endpoint },
        'SECURITY: Only GET requests are allowed to Whop API',
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Only GET requests are allowed to Whop API',
          error: `Method ${upperMethod} is not allowed. This service only reads data from Whop API.`,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!this.baseUrl) {
      throw new HttpException(
        'WHOP_BASE_URL is not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!endpoint) {
      throw new HttpException(
        'Endpoint is required',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const url = `${this.baseUrl}${endpoint}`;
    const timeout = this.limitsService.getApiCallTimeout();

    if (!url || url.includes('undefined') || !url.startsWith('http')) {
      this.logger.error(
        { baseUrl: this.baseUrl, endpoint, url },
        'Invalid URL constructed',
      );
      throw new HttpException(
        `Invalid URL: ${url}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...config?.headers,
    };

    const requestConfig: AxiosRequestConfig = {
      method: upperMethod as any,
      url,
      headers,
      timeout,
      ...(config?.params && { params: config.params }),
      ...(config?.data && { data: config.data }),
    };

    this.logger.debug(
      { method, url, hasParams: !!config?.params },
      'Making HTTP request',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.request(requestConfig),
      );
      this.rateLimiter.onSuccess();
      return response.data;
    } catch (error: any) {
      const statusCode =
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
      const errorData = error.response?.data || {};
      const errorMessage =
        errorData.message ||
        errorData.error?.message ||
        errorData.error ||
        error.message ||
        'Whop API request failed';

      const errorDetails = {
        endpoint,
        method,
        statusCode,
        errorMessage,
        url: error.config?.url || url,
        params: config?.params,
        whopError: errorData,
      };

      if (statusCode !== 429) {
        this.logger.error(errorDetails, 'Whop API request failed');
      }

      let userFriendlyMessage = 'Whop API error';
      if (statusCode === 400) {
        userFriendlyMessage =
          'Invalid request to Whop API. Check parameters and API key.';
      } else if (statusCode === 401) {
        userFriendlyMessage = 'Unauthorized. Invalid or missing Whop API key.';
      } else if (statusCode === 403) {
        userFriendlyMessage =
          'Forbidden. API key does not have required permissions.';
      } else if (statusCode === 404) {
        userFriendlyMessage = 'Resource not found in Whop API.';
      } else if (statusCode === 429) {
        userFriendlyMessage =
          'Rate limit exceeded. Too many requests to Whop API.';
      } else if (statusCode >= 500) {
        userFriendlyMessage = 'Whop API server error. Please try again later.';
      }

      throw new HttpException(
        {
          statusCode,
          message: userFriendlyMessage,
          error: errorMessage,
          endpoint,
          method,
          details:
            statusCode === 400
              ? {
                  url: error.config?.url || url,
                  params: config?.params,
                  whopError: errorData,
                }
              : undefined,
        },
        statusCode,
      );
    }
  }

  async getMemberships(filters?: {
    statuses?: string[];
    limit?: number;
    page?: number;
    cursor?: string | null;
    created_after?: string;
    created_before?: string;
    useDefaultDateFilter?: boolean;
  }): Promise<any> {
    const params: any = {
      company_id: this.companyId,
    };

    const useDefaultDate = filters?.useDefaultDateFilter !== false;

    if (useDefaultDate && !filters?.created_after && !filters?.created_before) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      params.created_after = yesterday.toISOString();
      params.created_before = endOfYesterday.toISOString();

      this.logger.debug(
        {
          created_after: params.created_after,
          created_before: params.created_before,
        },
        'Using default date filter (yesterday)',
      );
    } else {
      if (filters?.created_after) {
        params.created_after = filters.created_after;
      }
      if (filters?.created_before) {
        params.created_before = filters.created_before;
      }
    }

    if (filters?.statuses) {
      params['statuses[]'] = filters.statuses;
    }
    if (filters?.limit) {
      params.limit = filters.limit;
    }
    if (filters?.page) {
      params.page = filters.page;
    }
    if (filters?.cursor) {
      params.after = filters.cursor;
    }

    return this.getCircuitBreaker().fire(['GET', '/memberships', { params }]);
  }

  async getMembership(id: string): Promise<any> {
    return this.getCircuitBreaker().fire([
      'GET',
      `/memberships/${id}`,
      undefined,
    ]);
  }

  async getMember(id: string): Promise<any> {
    return this.getCircuitBreaker().fire(['GET', `/members/${id}`, undefined]);
  }

  async getPayments(filters?: {
    limit?: number;
    page?: number;
    cursor?: string | null;
    created_after?: string;
    created_before?: string;
    useDefaultDateFilter?: boolean;
    substatuses?: string | string[];
    billing_reasons?: string | string[];
  }): Promise<any> {
    const params: any = {
      company_id: this.companyId,
    };

    const useDefaultDate = filters?.useDefaultDateFilter !== false;

    if (useDefaultDate && !filters?.created_after && !filters?.created_before) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);

      params.created_after = yesterday.toISOString();
      params.created_before = endOfYesterday.toISOString();

      this.logger.debug(
        {
          created_after: params.created_after,
          created_before: params.created_before,
        },
        'Using default date filter for payments (yesterday)',
      );
    } else {
      if (filters?.created_after) {
        params.created_after = filters.created_after;
      }
      if (filters?.created_before) {
        params.created_before = filters.created_before;
      }
    }

    if (filters?.substatuses) {
      params.substatuses = Array.isArray(filters.substatuses)
        ? filters.substatuses.join(',')
        : filters.substatuses;
    }

    if (filters?.billing_reasons) {
      params.billing_reasons = Array.isArray(filters.billing_reasons)
        ? filters.billing_reasons.join(',')
        : filters.billing_reasons;
    }

    if (filters?.limit) {
      params.limit = filters.limit;
    }
    if (filters?.page) {
      params.page = filters.page;
    }
    if (filters?.cursor) {
      params.after = filters.cursor;
    }

    return this.getCircuitBreaker().fire(['GET', '/payments', { params }]);
  }

  async getPayment(id: string): Promise<any> {
    return this.getCircuitBreaker().fire(['GET', `/payments/${id}`, undefined]);
  }

  async getPlan(id: string): Promise<any> {
    return this.getCircuitBreaker().fire(['GET', `/plans/${id}`, undefined]);
  }
}
