import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.upsert({
      where: { email: dto.email },
      update: { name: dto.name },
      create: { email: dto.email, name: dto.name }
    });

    return {
      accessToken: `dev-token-${user.id}`,
      user
    };
  }

  async me(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }
}
