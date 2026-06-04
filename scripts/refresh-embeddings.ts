import "dotenv/config";

import { companies, type Company } from "../src/auth.js";
import { embeddingDimensions, embeddingModel } from "../src/config.js";
import { closePools } from "../src/db.js";
import { refreshCompanyEmbeddings } from "../src/embedding-sources.js";

async function main(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Set OPENAI_API_KEY in .env before running embeddings:refresh.");
  }

  const requestedCompany = process.argv.find((arg) => arg.startsWith("--company="))?.split("=")[1] as Company | undefined;
  const targetCompanies = requestedCompany ? [requestedCompany] : [...companies];

  for (const company of targetCompanies) {
    if (!companies.includes(company)) {
      throw new Error(`Unknown company "${company}". Use deep or poojan.`);
    }
  }

  console.log(`Embedding model: ${embeddingModel}`);
  console.log(`Embedding dimensions: ${embeddingDimensions}`);

  for (const company of targetCompanies) {
    const stats = await refreshCompanyEmbeddings(company);
    console.log(
      `${stats.company}: scanned ${stats.scanned}, embedded ${stats.embedded}, skipped ${stats.skipped_unchanged}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    closePools().catch(() => undefined);
  });
