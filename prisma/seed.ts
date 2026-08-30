import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, USERROLE } from '@prisma/client';
import bcrypt from 'bcrypt';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prismaService = new PrismaClient({ adapter });

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  // 1. Create or ensure Demo Tenant exists
  const tenant = await prismaService.tenant.upsert({
    where: { email: 'supertenant@gmail.com' },
    update: {
      fullName: 'Super Tenant Organization',
      phoneNumber: '9876543210',
    },
    create: {
      email: 'supertenant@gmail.com',
      fullName: 'Super Tenant Organization',
      phoneNumber: '9876543210',
    },
  });
  console.log(`✅ Tenant configured: ${tenant.fullName} (${tenant.id})`);

  // 2. Hash default seed passwords
  const superAdminPassword = await bcrypt.hash('superadmin1_pass', 10);
  const adminPassword = await bcrypt.hash('admin2_pass', 10);

  // 3. Upsert SuperAdmin user
  const superAdmin = await prismaService.user.upsert({
    where: { email: 'superadmin1@gmail.com' },
    update: {
      password: superAdminPassword,
      role: USERROLE.SUPERADMIN,
    },
    create: {
      email: 'superadmin1@gmail.com',
      fullName: 'Super Admin',
      password: superAdminPassword,
      role: USERROLE.SUPERADMIN,
      phoneNumber: '9876543210',
      tenant_id: tenant.id,
    },
  });
  console.log(`✅ SuperAdmin user configured: ${superAdmin.email}`);

  // 4. Upsert Admin user
  const admin = await prismaService.user.upsert({
    where: { email: 'admin2@gmail.com' },
    update: {
      password: adminPassword,
      role: USERROLE.ADMIN,
    },
    create: {
      email: 'admin2@gmail.com',
      fullName: 'Tenant Admin',
      password: adminPassword,
      role: USERROLE.ADMIN,
      phoneNumber: '9876543210',
      tenant_id: tenant.id,
    },
  });
  console.log(`✅ Admin user configured: ${admin.email}`);

  // 5. Upsert Demo Customer
  const customer = await prismaService.customer.upsert({
    where: { email: 'john.doe@example.com' },
    update: {
      fullName: 'John Doe Enterprise',
      phoneNumber: '5551234567',
    },
    create: {
      email: 'john.doe@example.com',
      fullName: 'John Doe Enterprise',
      phoneNumber: '5551234567',
      tenant_id: tenant.id,
    },
  });
  console.log(`✅ Demo Customer configured: ${customer.fullName}`);
}

seedDatabase()
  .then(async () => {
    await prismaService.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.log(e);
    await prismaService.$disconnect();
    await pool.end();
    process.exit(1);
  });
