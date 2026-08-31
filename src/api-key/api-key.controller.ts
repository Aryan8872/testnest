import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyService } from './api-key.service.js';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import {
  ApiKeyCreatedResponseDto,
  CreateApiKeyDto,
} from './dto/create-api-key.dto.js';

@ApiTags('API Keys')
@ApiBearerAuth('JWT-auth')
@Controller('api-key')
@UseGuards(JwtAuthGuard)
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post('/new')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate a new API key for the authenticated tenant',
    description:
      'Creates a cryptographically secure API key prefixed with cms_live_. The full secret key is returned ONLY ONCE in the response.',
  })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    type: ApiKeyCreatedResponseDto,
  })
  async createApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeyService.createApiKey(user.tenantId, dto);
  }

  @Get('/all')
  @ApiOperation({
    summary: 'List all API keys for the authenticated tenant',
    description:
      'Returns active, expired, and revoked API key metadata (prefix, name, last used timestamp). Secret key hashes are never exposed.',
  })
  @ApiResponse({ status: 200, description: 'List of tenant API keys' })
  async listApiKeys(@CurrentUser() user: AuthenticatedUser) {
    return this.apiKeyService.listApiKeys(user.tenantId);
  }

  @Post('/:id/roll')
  @ApiOperation({
    summary: 'Roll an API key',
    description:
      'Atomically revokes the specified API key and generates a new active replacement with the same expiration rules.',
  })
  @ApiParam({ name: 'id', description: 'API Key ID to roll' })
  @ApiResponse({
    status: 200,
    description: 'API key rolled successfully. New secret returned once.',
    type: ApiKeyCreatedResponseDto,
  })
  async rollApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeyService.rollApiKey(user.tenantId, id);
  }

  @Delete('/:id')
  @ApiOperation({
    summary: 'Revoke an API key immediately',
    description:
      'Permanently revokes the API key and removes it from the high-speed Redis authentication cache.',
  })
  @ApiParam({ name: 'id', description: 'API Key ID to revoke' })
  @ApiResponse({ status: 200, description: 'API key revoked successfully' })
  async revokeApiKey(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.apiKeyService.revokeApiKey(user.tenantId, id);
  }
}
