import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'verysecret',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_TOKEN',
        message: 'Malformed token payload',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || !user.is_enabled) {
      throw new UnauthorizedException({
        errorCode: 'USER_DEACTIVATED',
        message: 'User account does not exist or has been disabled',
      });
    }

    if (user.tenant?.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        errorCode: 'TENANT_INACTIVE',
        message: 'Organization account is suspended or inactive',
      });
    }

    return {
      id: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role,
      fullName: user.fullName,
    };
  }
}
