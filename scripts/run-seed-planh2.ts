// Runner del seed de Plan H2. Uso: npx tsx scripts/run-seed-planh2.ts
import { seedPlanH2 } from "../prisma/seeds/planH2";

seedPlanH2()
  .then(() => {
    console.log("seed planH2 OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
