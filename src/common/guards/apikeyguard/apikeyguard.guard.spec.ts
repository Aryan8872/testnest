import { ApikeyguardGuard } from './apikeyguard.guard.js';

describe('ApikeyguardGuard', () => {
  it('should be defined', () => {
    expect(new ApikeyguardGuard({} as any)).toBeDefined();
  });
});
