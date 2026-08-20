import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, USERROLE } from '@prisma/client';

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prismaService = new PrismaClient({ adapter });

async function seedUser() {
  const tenant = await prismaService.tenant.create({
    data: {
      email: 'supertenant@gmail.com',
      fullName: 'Super Tenant',
      phoneNumber: '9876543210',
    },
  });
  await prismaService.user.createMany({
    data: [
      {
        email: 'superadmin1@gmail.com',
        fullName: 'Super Admin1',
        password: 'superadmin1_pass',
        role: USERROLE.SUPERADMIN,
        phoneNumber: '9876543210',
        tenant_id: tenant.id,
      },
      {
        email: 'admin2@gmail.com',
        fullName: 'Admin2',
        password: 'admin2_pass',
        role: USERROLE.ADMIN,
        phoneNumber: '9876543210',
        tenant_id: tenant.id,
      },
    ],
  });
}

seedUser()
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
