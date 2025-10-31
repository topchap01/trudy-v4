import { PrismaClient, CampaignStatus, Mode } from "@prisma/client";
const prisma = new PrismaClient();

async function ensureClient(name: string, notes?: string) {
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.client.create({ data: { name, notes } });
}

async function main() {
  const vinarchy = await ensureClient("Vinarchy", "Challenger wine brand");
  const westinghouse = await ensureClient("Westinghouse", "Appliances");

  const count = await prisma.campaign.count();
  if (count === 0) {
    await prisma.campaign.create({
      data: {
        clientId: vinarchy.id,
        title: "Vineyard Weekend Draw",
        status: CampaignStatus.DRAFT,
        mode: Mode.EVALUATION,
        market: "AU",
        category: "Wine",
      },
    });
    await prisma.campaign.create({
      data: {
        clientId: vinarchy.id,
        title: "Instant Win Glassware + Hero Trip",
        status: CampaignStatus.DRAFT,
        mode: Mode.CREATE,
        market: "AU",
        category: "Wine",
      },
    });
    await prisma.campaign.create({
      data: {
        clientId: westinghouse.id,
        title: "Kitchen Upgrade Promo",
        status: CampaignStatus.DRAFT,
        mode: Mode.EVALUATION,
        market: "AU",
        category: "Appliances",
      },
    });
  }
  console.log("Seed complete ✔");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
