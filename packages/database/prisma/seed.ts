import { PrismaClient } from "@prisma/client";
import { CountryPackRegistry } from "@atlas/country-pack";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database with default integrity entities...");

  // 1. Seed countries using CountryPackRegistry as the single source of truth
  const packs = CountryPackRegistry.listPacks();
  const seededCountries: Record<string, any> = {};

  for (const pack of packs) {
    const country = await prisma.country.upsert({
      where: { countryCode: pack.countryCode },
      update: {
        name: pack.name,
        currencyCode: pack.baseCurrency,
      },
      create: {
        countryCode: pack.countryCode,
        name: pack.name,
        currencyCode: pack.baseCurrency,
      },
    });
    seededCountries[pack.countryCode] = country;
    console.log(`Seeded country: ${pack.countryCode} (${pack.name})`);
  }

  const countryAE = seededCountries["AE"];
  const countryES = seededCountries["ES"];

  // 2. Seed cities
  const cityDXB = await prisma.city.upsert({
    where: { countryId_cityCode: { countryId: countryAE.id, cityCode: "DXB" } },
    update: {},
    create: {
      countryId: countryAE.id,
      cityCode: "DXB",
      name: "Dubai",
      timezone: "Asia/Dubai",
    },
  });

  const cityMAD = await prisma.city.upsert({
    where: { countryId_cityCode: { countryId: countryES.id, cityCode: "MAD" } },
    update: {},
    create: {
      countryId: countryES.id,
      cityCode: "MAD",
      name: "Madrid",
      timezone: "Europe/Madrid",
    },
  });

  // 3. Seed districts
  const districtDowntown = await prisma.district.upsert({
    where: {
      cityId_districtCode: { cityId: cityDXB.id, districtCode: "DOWNTOWN" },
    },
    update: {},
    create: {
      cityId: cityDXB.id,
      districtCode: "DOWNTOWN",
      name: "Downtown Dubai",
    },
  });

  const districtCentro = await prisma.district.upsert({
    where: {
      cityId_districtCode: { cityId: cityMAD.id, districtCode: "CENTRO" },
    },
    update: {},
    create: {
      cityId: cityMAD.id,
      districtCode: "CENTRO",
      name: "Centro Madrid",
    },
  });

  // 4. Seed listing sources
  const sourceManual = await prisma.listingSource.upsert({
    where: { name: "Seed Source" },
    update: {},
    create: {
      name: "Seed Source",
      sourceType: "manual",
    },
  });

  // 5. Seed buildings
  const buildingBurjCrown = await prisma.building.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      districtId: districtDowntown.id,
      cityId: cityDXB.id,
      name: "Burj Crown",
      normalizedName: "BURJ CROWN",
    },
  });

  // 6. Seed properties
  const propertyBurjCrown = await prisma.property.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      buildingId: buildingBurjCrown.id,
      cityId: cityDXB.id,
      districtId: districtDowntown.id,
      countryId: countryAE.id,
      propertyType: "apartment",
      interiorAreaSqm: 80,
    },
  });

  // 7. Seed listings
  await prisma.listing.upsert({
    where: {
      listingSourceId_externalListingId: {
        listingSourceId: sourceManual.id,
        externalListingId: "ext-burj-crown",
      },
    },
    update: {},
    create: {
      propertyId: propertyBurjCrown.id,
      listingSourceId: sourceManual.id,
      externalListingId: "ext-burj-crown",
      listingType: "sale",
      listingStatus: "active",
      priceAmount: 1200000,
      priceCurrency: "AED",
    },
  });

  // 8. Seed event source and events
  const eventSourceMacro = await prisma.eventSource.upsert({
    where: { name: "Macro Feed" },
    update: {},
    create: {
      name: "Macro Feed",
      sourceType: "api",
      status: "active",
    },
  });

  const event1 = await prisma.event.findFirst({
    where: { title: "Central Bank Interest Rate Decision" },
  });
  if (!event1) {
    await prisma.event.create({
      data: {
        eventSourceId: eventSourceMacro.id,
        eventType: "macro",
        title: "Central Bank Interest Rate Decision",
        summary:
          "UAE Central Bank raises benchmark interest rate by 25 basis points in alignment with the US Federal Reserve, increasing mortgage financing costs.",
        severity: "medium",
        confidence: 0.95,
        occurredAt: new Date(),
        publishedAt: new Date(),
        impacts: {
          create: [
            {
              entityType: "market",
              entityId: "AE",
              impactDomain: "financing",
              impactDirection: "negative",
              impactMagnitude: -0.15,
              confidenceScore: 0.9,
              rationale:
                "Increases local borrowing costs and dampens home buyer leverage capacity.",
            },
          ],
        },
      },
    });
  }

  const event2 = await prisma.event.findFirst({
    where: { title: "Golden Visa Investment Threshold Lowered" },
  });
  if (!event2) {
    await prisma.event.create({
      data: {
        eventSourceId: eventSourceMacro.id,
        eventType: "regulatory",
        title: "Golden Visa Investment Threshold Lowered",
        summary:
          "Spain proposes administrative changes to residency-by-investment programs, creating high net-worth demand shifts for Madrid properties.",
        severity: "high",
        confidence: 0.85,
        occurredAt: new Date(),
        publishedAt: new Date(),
        impacts: {
          create: [
            {
              entityType: "market",
              entityId: "ES",
              impactDomain: "demand",
              impactDirection: "positive",
              impactMagnitude: 0.25,
              confidenceScore: 0.8,
              rationale:
                "Lowers barriers to entry for international buyers looking to secure EU residency.",
            },
          ],
        },
      },
    });
  }

  console.log("Seed data successfully generated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
