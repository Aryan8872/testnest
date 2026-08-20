import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto.js';
import { USERROLE } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { tenant: true },
    });

    if (!user) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
      });
    }

    if (!user.is_enabled) {
      throw new UnauthorizedException({
        errorCode: 'ACCOUNT_DISABLED',
        message: 'Your user account has been disabled',
      });
    }

    if (user.tenant && user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        errorCode: 'TENANT_INACTIVE',
        message: 'Your organization account is suspended or inactive',
      });
    }

    const isMatch = await bcrypt.compare(pass, user.password);
    if (!isMatch) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password',
      });
    }

    const { password, ...result } = user;
    return result;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role,
    };

    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN') || '1h';
    const secret = this.configService.get<string>('JWT_SECRET') || 'verysecret';

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        tenantId: user.tenant_id,
      },
    };
  }

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // Check if email already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException({
        errorCode: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email address already exists',
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(dto.password, saltRounds);

    let tenantId = dto.tenantId;

    return await this.prisma.$transaction(async (tx) => {
      // If tenantId was not provided, create a new tenant for this user
      if (!tenantId) {
        const tenantName = dto.tenantName || `${dto.fullName}'s Organization`;
        const newTenant = await tx.tenant.create({
          data: {
            id: `tenant_${randomUUID()}`,
            fullName: tenantName,
            email: normalizedEmail,
            phoneNumber: dto.phoneNumber,
            status: 'ACTIVE',
          },
        });
        tenantId = newTenant.id;
      } else {
        const tenantExists = await tx.tenant.findUnique({
          where: { id: tenantId },
        });
        if (!tenantExists) {
          throw new NotFoundException({
            errorCode: 'TENANT_NOT_FOUND',
            message: 'Specified organization does not exist',
          });
        }
      }

      const createdUser = await tx.user.create({
        data: {
          fullName: dto.fullName,
          email: normalizedEmail,
          password: hashedPassword,
          phoneNumber: dto.phoneNumber,
          role: dto.role || USERROLE.ADMIN,
          tenant_id: tenantId,
        },
      });

      const { password, ...safeUser } = createdUser;
      return safeUser;
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException({
        errorCode: 'USER_NOT_FOUND',
        message: 'User profile not found',
      });
    }

    const { password, ...safeUser } = user;
    return safeUser;
  }
}
