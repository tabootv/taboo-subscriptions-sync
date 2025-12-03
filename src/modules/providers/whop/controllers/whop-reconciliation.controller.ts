import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { logger } from '../../../../core/logger/logger.config';
import { Timeout } from '../../../../core/timeout/timeout.decorator';
import { TimeoutInterceptor } from '../../../../core/timeout/timeout.interceptor';
import { ReconciliationService } from '../services/reconciliation.service';

@Controller('jobs/whop/reconciliation')
@UseInterceptors(TimeoutInterceptor)
export class WhopReconciliationController {
  private readonly logger = logger();

  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Timeout(3600000)
  async triggerReconciliation(
    @Headers('authorization') auth?: string,
  ): Promise<{ message: string; result: any }> {
    if (!auth) {
      throw new UnauthorizedException('Authorization required');
    }

    this.logger.info('Manual reconciliation triggered via API');
    const result = await this.reconciliationService.manualReconciliation();

    return {
      message: 'Reconciliation completed',
      result,
    };
  }
}
