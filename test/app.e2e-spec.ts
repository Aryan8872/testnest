import { PrismaService } from '../src/prisma/prisma.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('CMS Enterprise E2E & Payment Integration Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test_jwt_secret_must_be_very_secure_12345';
    process.env.DATABASE_URL =
      process.env.DATABASE_URL_TEST ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgrespass@localhost:5432/SAAS_BILLING';
    process.env.APP_URL = 'http://localhost:3000';
    process.env.ESEWA_MERCHANT_CODE = 'EPAYTEST';
    process.env.ESEWA_SECRET_KEY = '8gBm/:&EnhH.1';
    process.env.ESEWA_BASE_URL = 'https://rc-epay.esewa.com.np';
    process.env.KHALTI_SECRET_KEY = 'test_secret_key_12345';
    process.env.KHALTI_BASE_URL = 'https://a.khalti.com';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('1. should register a new tenant organization + admin user, login, and verify dual-token JWT', async () => {
    // 1. Register organization + admin user via public /auth/register
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Ram Bahadur',
        email: 'ram@acme.np',
        password: 'Password123!',
        phoneNumber: '9841234567',
        tenantName: 'Acme Nepal Technologies',
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body).toHaveProperty('email', 'ram@acme.np');
    expect(regRes.body).toHaveProperty('tenant_id');
    const tenantId = regRes.body.tenant_id;

    // 2. Login to receive accessToken and refreshToken
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'ram@acme.np',
        password: 'Password123!',
        tenant_id: tenantId,
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('refreshToken');

    // 3. Test Refresh Token Rotation
    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({
        refreshToken: loginRes.body.refreshToken,
      });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).toHaveProperty('refreshToken');
    expect(refreshRes.body.refreshToken).not.toBe(loginRes.body.refreshToken); // Rotated
  });

  it('2. should initiate eSewa payment checkout with HMAC-SHA256 signature for invoice', async () => {
    // 1. Register organization + admin
    const regRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Sita Sharma',
        email: 'sita@enterprise.np',
        password: 'Password123!',
        phoneNumber: '9841000000',
        tenantName: 'Sita Enterprises',
      });
    const tenantId = regRes.body.tenant_id;

    // 2. Login
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'sita@enterprise.np',
        password: 'Password123!',
        tenant_id: tenantId,
      });
    const token = loginRes.body.accessToken;

    // 3. Create customer & invoice in DB
    const customer = await prisma.customer.create({
      data: {
        fullName: 'Hari Prasad',
        email: 'hari@client.np',
        phoneNumber: '9800000001',
        tenant_id: tenantId,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        amount: 150000, // NPR 1,500 in paisa
        due_date: new Date(Date.now() + 86400000 * 7),
        customerId: customer.id,
        tenant_id: tenantId,
        status: 'SENT',
      },
    });

    // 4. Initiate eSewa checkout
    const paymentInitRes = await request(app.getHttpServer())
      .post(`/payment/initiate/esewa/${invoice.id}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-id', tenantId);

    expect(paymentInitRes.status).toBe(200);
    expect(paymentInitRes.body).toHaveProperty('formAction');
    expect(paymentInitRes.body.fields).toHaveProperty('amount', 1500);
    expect(paymentInitRes.body.fields).toHaveProperty('total_amount', 1500);
    expect(paymentInitRes.body.fields).toHaveProperty('product_code', 'EPAYTEST');
    expect(paymentInitRes.body.fields).toHaveProperty('signature');
  });

  it('3. should expose Prometheus /metrics endpoint for DevOps monitoring', async () => {
    const metricsRes = await request(app.getHttpServer()).get('/metrics');
    expect(metricsRes.status).toBe(200);
    expect(metricsRes.text).toContain('cms_payments_total');
    expect(metricsRes.text).toContain('cms_payment_revenue_npr_total');
    expect(metricsRes.text).toContain('cms_payment_processing_duration_seconds');
  });
});
