import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserContextDto } from '../common/dto/user-context.dto';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '개발용 로그인(이메일 기준 upsert)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiOperation({ summary: '이메일 기준 사용자 조회' })
  async me(@Query() query: UserContextDto) {
    const user = await this.authService.me(query.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
