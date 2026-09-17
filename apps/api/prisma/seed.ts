import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const STUB_USER_ID = "00000000-0000-4000-8000-000000000001";

async function main() {
  await prisma.user.upsert({
    where: { id: STUB_USER_ID },
    update: { displayName: "Stub Test User" },
    create: { id: STUB_USER_ID, displayName: "Stub Test User" },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
