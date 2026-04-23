import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: { name: dto.name },
      create: { email: dto.email, name: dto.name }
    });

    const tokens = await this.signTokens(
      user.id,
      user.email,
      user.tokenVersion
    );

    return {
      ...tokens,
      user
    };
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_SECRET ?? 'change-me'
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Refresh token expired');
    }

    return this.signTokens(user.id, user.email, user.tokenVersion);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } }
    });

    return { ok: true };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private async signTokens(
    userId: string,
    email: string,
    tokenVersion: number
  ) {
    const accessExpiresInSeconds = Number(
      process.env.JWT_ACCESS_EXPIRES_IN ?? 900
    );
    const refreshExpiresInSeconds = Number(
      process.env.JWT_REFRESH_EXPIRES_IN ?? 604800
    );

    const basePayload = {
      sub: userId,
      email,
      tokenVersion
    };

    const accessToken = await this.jwtService.signAsync(
      { ...basePayload, tokenType: 'access' },
      {
        secret: process.env.JWT_SECRET ?? 'change-me',
        expiresIn: accessExpiresInSeconds
      }
    );

    const refreshToken = await this.jwtService.signAsync(
      { ...basePayload, tokenType: 'refresh' },
      {
        secret: process.env.JWT_SECRET ?? 'change-me',
        expiresIn: refreshExpiresInSeconds
      }
    );

    return { accessToken, refreshToken };
  }
}
