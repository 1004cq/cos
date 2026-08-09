import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log('管理员已存在，跳过创建');
    return;
  }

  const hashed = await hash(password, 12);

  await prisma.user.create({
    data: {
      username,
      password: hashed,
    },
  });

  console.log(`管理员创建成功: ${username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });