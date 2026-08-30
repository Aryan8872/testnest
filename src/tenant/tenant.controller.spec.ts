import { Test, TestingModule } from '@nestjs/testing';
import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';
import { jest } from '@jest/globals';

describe('TenantController', () => {
  let controller: TenantController;

  const mockTenantService = {
    createTenant: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TenantController],
      providers: [
        {
          provide: TenantService,
          useValue: mockTenantService,
        },
      ],
    }).compile();

    controller = module.get<TenantController>(TenantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
