import { PrismaService } from 'src/prisma/prisma.service.js';
import { USERROLE } from '@prisma/client';

export class User_TenantSeed {
  constructor(private readonly prismaservice: PrismaService) {}

  async seedUser() {
    await this.prismaservice.tenant.createMany({
      data: [
        {
          email: 'supertenant@gmail.com',
          fullName: 'Super Tenant',
        },
      ],
    });
    await this.prismaservice.user.createMany({
      data: [
        {
          email: 'superadmin1@gmail.com',
          fullName: 'Super Admin1',
          password: 'superadmin1_pass',
          role: USERROLE.SUPERADMIN,
          phoneNumber: '9876543210',
          tenant_id: 'SUPERADMIN',
        },
        {
          email: 'admin2@gmail.com',
          fullName: 'Admin2',
          password: 'admin2_pass',
          role: USERROLE.ADMIN,
          phoneNumber: '9876543210',
          tenant_id: 'ADMIN2',
        },
      ],
    });
  }
}
