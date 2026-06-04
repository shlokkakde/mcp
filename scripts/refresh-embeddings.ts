import "dotenv/config";

import { companies, type Company } from "../src/auth.js";
import { embeddingDimensions, embeddingModel, embeddingProvider, embeddingStorageKey } from "../src/config.js";
import { closePools } from "../src/db.js";
import { refreshCompanyEmbeddings } from "../src/embedding-sources.js";
import { assertEmbeddingConfig } from "../src/embeddings.js";

async function main(): Promise<void> {
  assertEmbeddingConfig();

  const requestedCompany = process.argv.find((arg) => arg.startsWith("--company="))?.split("=")[1] as Company | undefined;
  const targetCompanies = requestedCompany ? [requestedCompany] : [...companies];

  for (const company of targetCompanies) {
    if (!companies.includes(company)) {
      throw new Error(`Unknown company "${company}". Use deep or poojan.`);
    }
  }

  console.log(`Embedding provider: ${embeddingProvider}`);
  console.log(`Embedding model: ${embeddingModel}`);
  console.log(`Embedding dimensions: ${embeddingDimensions}`);
  console.log(`Embedding storage key: ${embeddingStorageKey}`);

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
