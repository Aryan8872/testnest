import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RegisterDto } from './dto/register.dto.js';
import { User, USERROLE } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly mailerService: MailerService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

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

  /**
   * Issue dual tokens (Access Token 15m + Refresh Token 7d) and store hashed refresh token in DB
   */
  async login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenant_id,
      role: user.role,
    };

    const accessTokenExpiresIn =
      this.configService.get<string>('JWT_EXPIRES_IN') || '15m';
    const secret =
      this.configService.get<string>('JWT_SECRET') || 'verysecret';

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpiresIn as any,
      secret,
    });

    // Generate cryptographically secure refresh token
    const rawRefreshToken = randomBytes(40).toString('hex');
    const hashedRefreshToken = this.hashToken(rawRefreshToken);

    // Save hashed refresh token to user record
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hashedRefreshToken },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      tokenType: 'Bearer',
      expiresIn: accessTokenExpiresIn,
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

  /**
   * Refresh Token Rotation: Validates provided refresh token, invalidates it, and issues a fresh pair
   */
  async refreshTokens(rawRefreshToken: string) {
    if (!rawRefreshToken) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is required',
      });
    }

    const hashedRefreshToken = this.hashToken(rawRefreshToken);

    const user = await this.prisma.user.findFirst({
      where: { hashedRefreshToken },
      include: { tenant: true },
    });

    if (!user || !user.is_enabled || (user.tenant && user.tenant.status !== 'ACTIVE')) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: 'Refresh token is invalid or expired',
      });
    }

    return this.login(user);
  }

  /**
   * Invalidate refresh token on logout
   */
  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { hashedRefreshToken: null },
    });
    await this.cacheManager.del(`user:profile:${userId}`);
    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Forgot password: Generates a 15-minute reset token and emails it to the user
   */
  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // To prevent user enumeration attacks, always return success even if user not found
    if (!user) {
      return {
        success: true,
        message:
          'If your email address is registered, a password reset token has been sent.',
      };
    }

    const rawResetToken = randomBytes(32).toString('hex');
    const hashedResetToken = this.hashToken(rawResetToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: hashedResetToken,
        password_reset_expires: expiresAt,
      },
    });

    // Send reset email via Mailer
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Password Reset Request',
        text: `You requested a password reset. Use this one-time token within 15 minutes to reset your password: ${rawResetToken}`,
      });
    } catch (e) {
      // Log error but don't fail HTTP request
    }

    return {
      success: true,
      message:
        'If your email address is registered, a password reset token has been sent.',
    };
  }

  /**
   * Reset password using the one-time token
   */
  async resetPassword(token: string, newPass: string) {
    if (!token || !newPass) {
      throw new BadRequestException('Reset token and new password are required');
    }

    const hashedToken = this.hashToken(token);

    const user = await this.prisma.user.findFirst({
      where: {
        password_reset_token: hashedToken,
        password_reset_expires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException({
        errorCode: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Password reset token is invalid or has expired',
      });
    }

    const hashedPassword = await bcrypt.hash(newPass, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        password_reset_token: null,
        password_reset_expires: null,
        hashedRefreshToken: null, // Invalidate all active refresh sessions
      },
    });

    await this.cacheManager.del(`user:profile:${user.id}`);

    return {
      success: true,
      message: 'Password has been successfully updated. Please log in with your new credentials.',
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
    const cachedData = await this.cacheManager.get(`user:profile:${userId}`);
    if (!cachedData) {
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
      const { password, hashedRefreshToken, password_reset_token, password_reset_expires, ...safeUser } = user;
      await this.cacheManager.set(
        `user:profile:${userId}`,
        safeUser,
        60 * 60 * 24,
      );

      return safeUser;
    }

    return cachedData as User;
  }
}

