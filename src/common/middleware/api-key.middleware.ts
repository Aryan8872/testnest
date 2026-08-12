import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  //runs even before the route is resolved or the route is accessed to reach the api
  use(req: Request, res: Response, next: NextFunction) {
    //validation logic
    //if failed validation throw unauthorized exception
    //if success :
    next();
  }
}
