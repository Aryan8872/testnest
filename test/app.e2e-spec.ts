import { PrismaService } from '../src/prisma/prisma.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  // 1. SETUP PHASE: This runs once before any tests start.
  beforeEach(async () => {
    // CRITICAL: Force the app to connect to the TEST database instead of the DEV database
    process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    //Boot up entire nestjs backend like how main.ts does
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    //cleaning up db for clean test to prevent conflict
    const prisma = app.get(PrismaService);
    await prisma.invoice.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.user.deleteMany();
    await prisma.tenant.deleteMany();
  });

  //2. Actual test
  it('/auth/register (POST) - should successfully register a new user', async () => {
    // We use 'supertest' to make fake HTTP requests directly to the in-memory NestJS server
    const tenant = await request(app.getHttpServer()).post('/tenant/new').send({
      fullName: 'test',
      phoneNumber: '9815016727',
      email: 'testten@gmail.com',
    });
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'John Doe',
        email: 'john@gmail.com',
        password: 'john123',
        phoneNumber: '9815016727',
        tenant_id: tenant.body?.id,
      });
    expect(registerResponse.status).toBe(201);
    console.log(registerResponse.body);

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'john@gmail.com',
        password: 'john123',
        tenant_id: tenant.body?.id,
      });
    console.log(loginResponse.body);
    // expect(response.body).toHaveProperty('token');
    // expect(response.body.user).toHaveProperty('email', 'john@gmail.com');
    // expect(response.body.user).toHaveProperty('tenant_id', tenant.body?.id);
    // expect(response.body.user).toHaveProperty('role', 'BILLING');
  });

  // 3. TEARDOWN PHASE: This runs after all tests finish.
  afterEach(async () => {
    // CRITICAL: Close the app to terminate DB connections and prevent memory leaks
    await app.close();
  });
});
