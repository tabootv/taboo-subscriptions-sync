import { Injectable } from '@nestjs/common';
import { logger } from '../../../core/logger/logger.config';
import { ProviderRegistry } from '../../../core/providers';
import {
  ConsolidatedAnalysisResponseDto,
  ProviderAnalysisResult,
} from '../dto/consolidated-analysis-response.dto';

@Injectable()
export class ConsolidatedAnalysisService {
  private readonly logger = logger();

  constructor(private readonly providerRegistry: ProviderRegistry) {}

  async analyzeAll(
    startDate: Date,
    endDate: Date,
    providerNames?: string[],
    status?: string,
  ): Promise<ConsolidatedAnalysisResponseDto> {
    const startTime = Date.now();

    this.logger.info(
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        requestedProviders: providerNames,
      },
      'Starting consolidated analysis',
    );

    const providers = this.getProvidersToAnalyze(providerNames);

    if (providers.length === 0) {
      this.logger.warn('No active providers found for analysis');
      return this.buildEmptyResponse(startDate, endDate, startTime);
    }

    const results = await Promise.allSettled(
      providers.map((provider) =>
        this.analyzeProvider(provider.name, startDate, endDate, status),
      ),
    );

    const response = this.buildResponse(
      startDate,
      endDate,
      providers.map((p) => p.name),
      results,
      startTime,
    );

    this.logger.info(
      {
        totalProviders: providers.length,
        succeeded: response.metadata.providersSucceeded,
        failed: response.metadata.providersFailed,
        totalTime: response.metadata.totalProcessingTime,
      },
      'Consolidated analysis completed',
    );

    return response;
  }

  private async analyzeProvider(
    providerName: string,
    startDate: Date,
    endDate: Date,
    status?: string,
  ): Promise<{ provider: string; result: ProviderAnalysisResult }> {
    const providerStartTime = Date.now();

    try {
      const adapter = this.providerRegistry.getProviderAdapter(providerName);

      if (!adapter) {
        throw new Error(`Provider adapter not found: ${providerName}`);
      }

      const isHealthy = await adapter.isHealthy();
      if (!isHealthy) {
        throw new Error(`Provider ${providerName} is not healthy`);
      }

      const result: ProviderAnalysisResult = {
        success: true,
        data: {
          memberships: {
            trials: [],
            active: [],
            converted: [],
            notConverted: [],
            firstPaid: [],
          },
          renewals: {
            monthly: { count: 0, emails: [], renewals: [] },
            yearly: { count: 0, emails: [], renewals: [] },
            stats: {},
          },
        },
        metadata: {
          processingTime: Date.now() - providerStartTime,
          recordsProcessed: 0,
          warnings: [
            'Full provider analysis integration pending. Returns placeholder data.',
          ],
        },
      };

      return { provider: providerName, result };
    } catch (error: any) {
      this.logger.error(
        { provider: providerName, error: error.message },
        'Provider analysis failed',
      );

      return {
        provider: providerName,
        result: {
          success: false,
          error: {
            message: error.message,
            code: error.code || 'ANALYSIS_ERROR',
          },
          metadata: {
            processingTime: Date.now() - providerStartTime,
          },
        },
      };
    }
  }

  private getProvidersToAnalyze(requestedProviders?: string[]) {
    const activeProviders = this.providerRegistry.getActiveProviders();

    if (!requestedProviders || requestedProviders.length === 0) {
      return activeProviders;
    }

    return activeProviders.filter((p) => requestedProviders.includes(p.name));
  }

  private buildResponse(
    startDate: Date,
    endDate: Date,
    providerNames: string[],
    results: PromiseSettledResult<{
      provider: string;
      result: ProviderAnalysisResult;
    }>[],
    startTime: number,
  ): ConsolidatedAnalysisResponseDto {
    const providers: { [key: string]: ProviderAnalysisResult } = {};
    let succeeded = 0;
    let failed = 0;

    results.forEach((result, index) => {
      const providerName = providerNames[index];

      if (result.status === 'fulfilled') {
        providers[result.value.provider] = result.value.result;
        if (result.value.result.success) {
          succeeded++;
        } else {
          failed++;
        }
      } else {
        providers[providerName] = {
          success: false,
          error: {
            message: result.reason?.message || 'Unknown error',
            code: 'PROMISE_REJECTED',
          },
          metadata: {
            processingTime: 0,
          },
        };
        failed++;
      }
    });

    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      providers,
      metadata: {
        totalProcessingTime: Date.now() - startTime,
        providersIncluded: providerNames.length,
        providersSucceeded: succeeded,
        providersFailed: failed,
        analyzedAt: new Date().toISOString(),
      },
    };
  }

  private buildEmptyResponse(
    startDate: Date,
    endDate: Date,
    startTime: number,
  ): ConsolidatedAnalysisResponseDto {
    return {
      period: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      providers: {},
      metadata: {
        totalProcessingTime: Date.now() - startTime,
        providersIncluded: 0,
        providersSucceeded: 0,
        providersFailed: 0,
        analyzedAt: new Date().toISOString(),
      },
    };
  }
}
