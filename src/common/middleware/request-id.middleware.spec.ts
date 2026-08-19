import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  it('should be defined', () => {
    expect(new RequestIdMiddleware()).toBeDefined();
  });
});
