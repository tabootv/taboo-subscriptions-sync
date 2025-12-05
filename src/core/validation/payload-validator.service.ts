import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { logger } from '../logger/logger.config';

@Injectable()
export class PayloadValidatorService {
  private readonly logger = logger();

  isValidPayloadStructure(payload: any): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    if (!payload.event && !payload.data) {
      return false;
    }

    return true;
  }

  hasRequiredFields(payload: any, requiredFields: string[]): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    return requiredFields.every((field) => {
      const value = this.getNestedValue(payload, field);
      return value !== undefined && value !== null;
    });
  }

  async validateWithDto<T>(payload: any, dtoClass: new () => T): Promise<T> {
    const dto = plainToInstance(dtoClass, payload);
    const errors = await validate(dto as object);

    if (errors.length > 0) {
      const errorMessages = errors.flatMap((error) =>
        Object.values(error.constraints || {}),
      );
      this.logger.warn(
        { payload, errors: errorMessages },
        'Payload validation failed',
      );
      throw new BadRequestException({
        message: 'Validation failed',
        errors: errorMessages,
      });
    }

    return dto;
  }

  async validatePayload<T>(
    payload: unknown,
    dtoClass?: new () => T,
    requiredFields?: string[],
  ): Promise<T> {
    if (!this.isValidPayloadStructure(payload)) {
      this.logger.warn({ payload }, 'Invalid payload structure');
      throw new BadRequestException('Invalid payload structure');
    }

    if (requiredFields && !this.hasRequiredFields(payload, requiredFields)) {
      this.logger.warn({ payload, requiredFields }, 'Missing required fields');
      throw new BadRequestException('Missing required fields');
    }

    if (dtoClass) {
      return this.validateWithDto(payload, dtoClass);
    }

    return payload as T;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, prop) => current?.[prop], obj);
  }
}
