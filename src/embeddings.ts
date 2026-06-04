import { createHash } from "node:crypto";

import { embeddingDimensions, embeddingModel } from "./config.js";

type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding: number[];
    index: number;
  }>;
  error?: {
    message?: string;
  };
};

function openAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY before generating or searching embeddings.");
  }
  return apiKey;
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function vectorLiteral(values: number[]): string {
  if (values.length !== embeddingDimensions) {
    throw new Error(`Expected embedding dimension ${embeddingDimensions}, received ${values.length}.`);
  }
  return `[${values.map((value) => Number(value).toFixed(8)).join(",")}]`;
}

export async function createEmbeddings(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: embeddingModel,
      input: inputs,
      dimensions: embeddingDimensions
    })
  });

  const payload = (await response.json()) as OpenAIEmbeddingResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Embedding request failed with status ${response.status}.`);
  }
  if (!payload.data || payload.data.length !== inputs.length) {
    throw new Error("Embedding response did not include one vector per input.");
  }

  return payload.data
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}

export async function createEmbedding(input: string): Promise<number[]> {
  const [embedding] = await createEmbeddings([input]);
  return embedding;
}
