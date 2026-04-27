import {
  Controller, Post, Body, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

/**
 * Tek seferlik kullanim icin "make-admin" endpoint'i.
 *
 * AdminController @Roles('admin') ile korunuyor — ilk admin'i nasil
 * olusturacaksin? Burasi onun cikis kapisi: BOOTSTRAP_SECRET env'i
 * Render'da set edilmisse bu endpoint aktif. Set degilse 403.
 *
 * Kullanim sonrasi BOOTSTRAP_SECRET env'i Render'dan SIL — endpoint
 * tekrar 403'e dussun.
 */
@Controller('bootstrap')
export class BootstrapController {
  constructor(private prisma: PrismaService) {}

  @Post('make-admin')
  async makeAdmin(@Body() body: { email?: string; secret?: string }) {
    const expected = process.env.BOOTSTRAP_SECRET?.trim();
    if (!expected) {
      throw new ForbiddenException('Bootstrap endpoint disabled (BOOTSTRAP_SECRET env not set)');
    }
    if (!body?.secret || body.secret !== expected) {
      throw new ForbiddenException('Invalid bootstrap secret');
    }
    if (!body?.email) {
      throw new BadRequestException('email required');
    }

    const user = await this.prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      throw new NotFoundException(`User ${body.email} not found — register first`);
    }

    const updated = await this.prisma.user.update({
      where: { email: body.email },
      data: { role: 'admin', tier: 'suite', status: 'active' },
      select: { email: true, role: true, tier: true, status: true },
    });
    return { ok: true, user: updated, hint: 'Now remove BOOTSTRAP_SECRET env from Render to disable this endpoint.' };
  }
}
