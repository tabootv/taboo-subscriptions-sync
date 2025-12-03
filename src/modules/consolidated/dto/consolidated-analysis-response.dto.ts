/**
 * Response DTO for consolidated analysis endpoint
 */

/**
 * Provider-specific analysis result
 */
export interface ProviderAnalysisResult {
  /**
   * Whether the analysis succeeded
   */
  success: boolean;

  /**
   * Analysis data (if successful)
   */
  data?: {
    memberships?: {
      trials?: any[];
      active?: any[];
      converted?: any[];
      notConverted?: any[];
      firstPaid?: any[];
    };
    renewals?: {
      monthly?: {
        count: number;
        emails: string[];
        renewals: any[];
      };
      yearly?: {
        count: number;
        emails: string[];
        renewals: any[];
      };
      stats?: any;
    };
  };

  /**
   * Error information (if failed)
   */
  error?: {
    message: string;
    code?: string;
  };

  /**
   * Processing metadata
   */
  metadata?: {
    processingTime: number;
    recordsProcessed?: number;
    warnings?: string[];
  };
}

/**
 * Consolidated analysis response
 * Groups results by provider
 */
export interface ConsolidatedAnalysisResponseDto {
  /**
   * Analysis period
   */
  period: {
    startDate: string;
    endDate: string;
  };

  /**
   * Results grouped by provider
   * Key: provider name (e.g., 'whop', 'applepay')
   * Value: Provider-specific analysis result
   */
  providers: {
    [providerName: string]: ProviderAnalysisResult;
  };

  /**
   * Overall metadata
   */
  metadata: {
    /**
     * Total processing time for all providers
     */
    totalProcessingTime: number;

    /**
     * Number of providers included
     */
    providersIncluded: number;

    /**
     * Number of providers that succeeded
     */
    providersSucceeded: number;

    /**
     * Number of providers that failed
     */
    providersFailed: number;

    /**
     * Timestamp when analysis was performed
     */
    analyzedAt: string;
  };
}
