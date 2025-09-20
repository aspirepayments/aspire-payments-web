// api/scripts/set-user-password.ts
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.argv[2];
  const plain = process.argv[3];
  if (!email || !plain) {
    console.error('Usage: ts-node scripts/set-user-password.ts <email> <plainPassword>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  const hash = await bcrypt.hash(plain, 12);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash: hash },
  });
  console.log(`Updated user ${user.email}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
