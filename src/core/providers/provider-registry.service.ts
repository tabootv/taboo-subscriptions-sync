import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef, Reflector } from '@nestjs/core';
import { ProviderAdapter } from '../../domain/subscriptions';
import { logger } from '../logger/logger.config';
import { ProviderRegistration } from './provider.types';

@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = logger();
  private readonly providers = new Map<string, ProviderRegistration>();
  private initialized = false;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const enabledProviders = this.getEnabledProvidersFromConfig();
    this.logger.info({ enabledProviders }, 'Provider registry initialized');

    this.initialized = true;
  }

  registerProvider(
    name: string,
    adapter: ProviderAdapter,
    enabled = true,
  ): void {
    if (this.providers.has(name)) {
      this.logger.warn({ provider: name }, 'Provider already registered');
      return;
    }

    const registration: ProviderRegistration = {
      name,
      adapter,
      enabled,
      metadata: {
        displayName: name.charAt(0).toUpperCase() + name.slice(1),
      },
    };

    this.providers.set(name, registration);
    this.logger.info({ provider: name, enabled }, 'Provider registered');
  }

  unregisterProvider(name: string): void {
    if (!this.providers.has(name)) {
      this.logger.warn({ provider: name }, 'Provider not found');
      return;
    }

    this.providers.delete(name);
    this.logger.info({ provider: name }, 'Provider unregistered');
  }

  getProvider(name: string): ProviderRegistration | undefined {
    return this.providers.get(name);
  }

  getProviderAdapter(name: string): ProviderAdapter | undefined {
    return this.providers.get(name)?.adapter;
  }

  getAllProviders(): ProviderRegistration[] {
    return Array.from(this.providers.values());
  }

  getActiveProviders(): ProviderRegistration[] {
    return Array.from(this.providers.values()).filter((p) => p.enabled);
  }

  getActiveProviderAdapters(): ProviderAdapter[] {
    return this.getActiveProviders().map((p) => p.adapter);
  }

  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  isProviderEnabled(name: string): boolean {
    const provider = this.providers.get(name);
    return provider?.enabled ?? false;
  }

  enableProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      this.logger.warn({ provider: name }, 'Provider not found');
      return;
    }

    provider.enabled = true;
    this.logger.info({ provider: name }, 'Provider enabled');
  }

  disableProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      this.logger.warn({ provider: name }, 'Provider not found');
      return;
    }

    provider.enabled = false;
    this.logger.info({ provider: name }, 'Provider disabled');
  }

  async checkProvidersHealth(): Promise<Map<string, boolean>> {
    const healthMap = new Map<string, boolean>();
    const activeProviders = this.getActiveProviders();

    await Promise.all(
      activeProviders.map(async (provider) => {
        try {
          const isHealthy = await provider.adapter.isHealthy();
          healthMap.set(provider.name, isHealthy);
        } catch (error) {
          this.logger.error(
            { provider: provider.name, error },
            'Health check failed',
          );
          healthMap.set(provider.name, false);
        }
      }),
    );

    return healthMap;
  }

  private getEnabledProvidersFromConfig(): string[] {
    const enabledProviders = this.configService.get<string>(
      'ENABLED_PROVIDERS',
      'whop',
    );

    return enabledProviders
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  getProviderCount(): number {
    return this.providers.size;
  }

  getActiveProviderCount(): number {
    return this.getActiveProviders().length;
  }
}
