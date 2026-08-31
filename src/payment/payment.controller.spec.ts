import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from './payment.controller.js';
import { PaymentService } from './payment.service.js';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { jest } from '@jest/globals';

describe('PaymentController', () => {
  let controller: PaymentController;

  const mockPaymentService = {
    initiateEsewaPayment: jest.fn(),
    handleEsewaCallback: jest.fn(),
    initiateKhaltiPayment: jest.fn(),
    handleKhaltiCallback: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [{ provide: PaymentService, useValue: mockPaymentService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PaymentController>(PaymentController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate initiateEsewaPayment to service', async () => {
    mockPaymentService.initiateEsewaPayment.mockResolvedValueOnce({
      formAction: 'https://rc-epay.esewa.com.np',
      fields: {},
    });

    const result = await controller.initiateEsewaPayment('inv-123', 'tenant-1');
    expect(mockPaymentService.initiateEsewaPayment).toHaveBeenCalledWith('inv-123', 'tenant-1');
    expect(result).toBeDefined();
  });
});
