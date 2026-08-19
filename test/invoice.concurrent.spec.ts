// // test/invoice.concurrent.spec.ts
// import request from 'supertest';
// import { INestApplication } from '@nestjs/common';
// import { createTestApp } from './test-utils'; // helper that boots your app with test db
// import { prisma } from '../src/prisma/prisma.service';

// describe('Invoice concurrency', () => {
//   let app: INestApplication;

//   beforeAll(async () => {
//     app = await createTestApp();
//   });

//   afterAll(async () => {
//     await app.close();
//   });

//   it('should create only one customer when two requests arrive concurrently', async () => {
//     const payload = {
//       amount: 500,
//       due_date: new Date().toISOString(),
//       customerData: {
//         fullName: 'Concurrency User',
//         email: 'concurrent@example.com',
//         phoneNumber: '+1234567890',
//       },
//     };

//     // Fire two requests in parallel
//     const [r1, r2] = await Promise.all([
//       request(app.getHttpServer()).post('/api/v1/invoices').send(payload).set('Idempotency-Key', 'a'),
//       request(app.getHttpServer()).post('/api/v1/invoices').send(payload).set('Idempotency-Key', 'b'),
//     ]);

//     expect([r1.status, r2.status]).toEqual(expect.arrayContaining([201]));

//     // Query DB
//     const customers = await prisma.customer.findMany({ where: { email: 'concurrent@example.com' }});
//     expect(customers.length).toBe(1);

//     const invoices = await prisma.invoice.findMany({ where: { customer: { email: 'concurrent@example.com' } }});
//     expect(invoices.length).toBe(2);
//   });
// });