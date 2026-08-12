import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';

@Injectable()
export class ApikeyguardGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const apikey = request.headers('x-api-key');
    const expectedApiKey = this.configService.get<string>('INTERNAL_API_KEY');
    if (typeof apikey !== 'string' || !apikey || apikey !== expectedApiKey) {
      throw new UnauthorizedException({
        errrorCode: 'INVALID_API_KEY',
        message: 'Authentication required',
      });
    }
    return true;
  }
}
