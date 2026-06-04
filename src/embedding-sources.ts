import type { Company } from "./auth.js";
import { embeddingModel } from "./config.js";
import { contentHash, createEmbeddings, vectorLiteral } from "./embeddings.js";
import { queryRows } from "./db.js";

export const embeddingSourceTypes = ["client", "task", "comment"] as const;
export type EmbeddingSourceType = (typeof embeddingSourceTypes)[number];

export type EmbeddingSource = {
  source_type: EmbeddingSourceType;
  source_id: string;
  source_code: string;
  team_code: string;
  title: string;
  text_content: string;
  source_updated_at: string | null;
  content_hash: string;
};

export type SemanticSearchResult = {
  source_type: EmbeddingSourceType;
  source_id: string;
  source_code: string;
  team_code: string;
  title: string;
  text_content: string;
  similarity: number;
};

type ExistingHashRow = {
  source_type: EmbeddingSourceType;
  source_id: string;
  content_hash: string;
};

type RefreshStats = {
  company: Company;
  scanned: number;
  embedded: number;
  skipped_unchanged: number;
};

function withHashes(rows: Omit<EmbeddingSource, "content_hash">[]): EmbeddingSource[] {
  return rows.map((row) => ({
    ...row,
    content_hash: contentHash(row.text_content)
  }));
}

export async function loadEmbeddingSources(
  company: Company,
  sourceTypes: EmbeddingSourceType[] = [...embeddingSourceTypes]
): Promise<EmbeddingSource[]> {
  const sources: EmbeddingSource[] = [];

  if (sourceTypes.includes("client")) {
    const rows = await queryRows<Omit<EmbeddingSource, "content_hash">>(
      company,
      `
        SELECT
          'client' AS source_type,
          c.id::text AS source_id,
          c.client_code AS source_code,
          t.team_code,
          c.name AS title,
          concat_ws(E'\n',
            'Client: ' || c.name,
            'Industry: ' || c.industry,
            'Status: ' || c.status,
            'Priority: ' || c.priority,
            CASE WHEN c.notes IS NOT NULL THEN 'Notes: ' || c.notes END
          ) AS text_content,
          c.updated_at::text AS source_updated_at
        FROM clients c
        JOIN teams t ON t.id = c.team_id
      `
    );
    sources.push(...withHashes(rows));
  }

  if (sourceTypes.includes("task")) {
    const rows = await queryRows<Omit<EmbeddingSource, "content_hash">>(
      company,
      `
        SELECT
          'task' AS source_type,
          ct.id::text AS source_id,
          ct.task_code AS source_code,
          t.team_code,
          ct.title,
          concat_ws(E'\n',
            'Task: ' || ct.title,
            'Client: ' || c.name || ' (' || c.client_code || ')',
            'Status: ' || ct.status,
            'Priority: ' || ct.priority,
            'Description: ' || ct.description,
            CASE WHEN e.full_name IS NOT NULL THEN 'Assigned employee: ' || e.full_name || ' (' || e.employee_code || ')' END,
            CASE WHEN ct.completion_notes IS NOT NULL THEN 'Completion notes: ' || ct.completion_notes END
          ) AS text_content,
          ct.updated_at::text AS source_updated_at
        FROM client_tasks ct
        JOIN clients c ON c.id = ct.client_id
        JOIN teams t ON t.id = c.team_id
        LEFT JOIN employees e ON e.id = ct.assigned_employee_id
      `
    );
    sources.push(...withHashes(rows));
  }

  if (sourceTypes.includes("comment")) {
    const rows = await queryRows<Omit<EmbeddingSource, "content_hash">>(
      company,
      `
        SELECT
          'comment' AS source_type,
          tc.id::text AS source_id,
          COALESCE(tc.comment_code, 'COMMENT-' || tc.id::text) AS source_code,
          t.team_code,
          'Comment on ' || ct.task_code AS title,
          concat_ws(E'\n',
            'Comment on task: ' || ct.title || ' (' || ct.task_code || ')',
            'Client: ' || c.name || ' (' || c.client_code || ')',
            'Comment: ' || tc.body
          ) AS text_content,
          tc.created_at::text AS source_updated_at
        FROM task_comments tc
        JOIN client_tasks ct ON ct.id = tc.task_id
        JOIN clients c ON c.id = ct.client_id
        JOIN teams t ON t.id = c.team_id
      `
    );
    sources.push(...withHashes(rows));
  }

  return sources;
}

async function loadExistingHashes(company: Company): Promise<Map<string, string>> {
  const rows = await queryRows<ExistingHashRow>(
    company,
    `
      SELECT source_type, source_id::text, content_hash
      FROM crm_embeddings
      WHERE embedding_model = $1
    `,
    [embeddingModel]
  );
  return new Map(rows.map((row) => [`${row.source_type}:${row.source_id}`, row.content_hash]));
}

export async function upsertEmbedding(company: Company, source: EmbeddingSource, embedding: number[]): Promise<void> {
  await queryRows(
    company,
    `
      INSERT INTO crm_embeddings (
        source_type,
        source_id,
        source_code,
        team_code,
        title,
        text_content,
        content_hash,
        embedding_model,
        embedding,
        source_updated_at
      )
      VALUES ($1, $2::bigint, $3, $4, $5, $6, $7, $8, $9::vector, $10::timestamptz)
      ON CONFLICT (source_type, source_id, embedding_model)
      DO UPDATE SET
        source_code = EXCLUDED.source_code,
        team_code = EXCLUDED.team_code,
        title = EXCLUDED.title,
        text_content = EXCLUDED.text_content,
        content_hash = EXCLUDED.content_hash,
        embedding = EXCLUDED.embedding,
        source_updated_at = EXCLUDED.source_updated_at,
        updated_at = now()
    `,
    [
      source.source_type,
      source.source_id,
      source.source_code,
      source.team_code,
      source.title,
      source.text_content,
      source.content_hash,
      embeddingModel,
      vectorLiteral(embedding),
      source.source_updated_at
    ]
  );
}

export async function refreshCompanyEmbeddings(company: Company, batchSize = 64): Promise<RefreshStats> {
  const sources = await loadEmbeddingSources(company);
  const existingHashes = await loadExistingHashes(company);
  const staleSources = sources.filter(
    (source) => existingHashes.get(`${source.source_type}:${source.source_id}`) !== source.content_hash
  );

  for (let start = 0; start < staleSources.length; start += batchSize) {
    const batch = staleSources.slice(start, start + batchSize);
    const embeddings = await createEmbeddings(batch.map((source) => source.text_content));
    await Promise.all(batch.map((source, index) => upsertEmbedding(company, source, embeddings[index])));
  }

  return {
    company,
    scanned: sources.length,
    embedded: staleSources.length,
    skipped_unchanged: sources.length - staleSources.length
  };
}

export async function semanticSearch(
  company: Company,
  queryEmbedding: number[],
  options: {
    teamCode: string | null;
    sourceTypes: EmbeddingSourceType[];
    limit: number;
    minSimilarity?: number;
    excludeSourceCode?: string;
  }
): Promise<SemanticSearchResult[]> {
  return queryRows<SemanticSearchResult>(
    company,
    `
      SELECT
        source_type,
        source_id::text,
        source_code,
        team_code,
        title,
        text_content,
        (1 - (embedding <=> $1::vector))::float8 AS similarity
      FROM crm_embeddings
      WHERE embedding_model = $2
        AND ($3::text IS NULL OR team_code = $3)
        AND source_type = ANY($4::text[])
        AND ($5::text IS NULL OR source_code <> $5)
        AND ($6::float8 IS NULL OR (1 - (embedding <=> $1::vector)) >= $6)
      ORDER BY embedding <=> $1::vector
      LIMIT $7
    `,
    [
      vectorLiteral(queryEmbedding),
      embeddingModel,
      options.teamCode,
      options.sourceTypes,
      options.excludeSourceCode || null,
      options.minSimilarity ?? null,
      options.limit
    ]
  );
}

export async function getTaskEmbeddingText(company: Company, taskCode: string): Promise<string> {
  const rows = await queryRows<{ text_content: string }>(
    company,
    `
      SELECT text_content
      FROM crm_embeddings
      WHERE embedding_model = $1
        AND source_type = 'task'
        AND source_code = $2
      LIMIT 1
    `,
    [embeddingModel, taskCode]
  );
  if (!rows[0]) {
    throw new Error(`No task embedding found for ${taskCode}. Run npm run embeddings:refresh first.`);
  }
  return rows[0].text_content;
}
