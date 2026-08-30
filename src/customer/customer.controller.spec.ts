import { Test, TestingModule } from '@nestjs/testing';
import { CustomerController } from './customer.controller.js';
import { CustomerService } from './customer.service.js';
import { jest } from '@jest/globals';

describe('CustomerController', () => {
  let controller: CustomerController;

  const mockCustomerService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [
        {
          provide: CustomerService,
          useValue: mockCustomerService,
        },
      ],
    }).compile();

    controller = module.get<CustomerController>(CustomerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
