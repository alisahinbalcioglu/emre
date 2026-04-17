import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { LaborMatchingService } from './labor-matching.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('labor-matching')
@UseGuards(JwtAuthGuard)
export class LaborMatchingController {
  constructor(private service: LaborMatchingService) {}

  @Post('bulk-match')
  bulkMatch(
    @CurrentUser() user: any,
    @Body() body: { firmaId: string; laborNames: string[] },
  ) {
    return this.service.bulkMatch(user.id, body.firmaId, body.laborNames);
  }

  @Post('backfill-tags')
  @UseGuards(RolesGuard)
  @Roles('admin')
  backfillTags() {
    return this.service.backfillTags();
  }
}
