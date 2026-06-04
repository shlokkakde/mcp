import { createHash } from "node:crypto";

import { embeddingDimensions, embeddingModel, embeddingProvider } from "./config.js";

type EmbeddingTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

type OpenAIEmbeddingResponse = {
  data?: Array<{
    embedding: number[];
    index: number;
  }>;
  error?: {
    message?: string;
  };
};

type GeminiEmbeddingResponse = {
  embedding?: {
    values?: number[];
  };
  error?: {
    message?: string;
    status?: string;
  };
};

function openAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY before generating or searching embeddings.");
  }
  return apiKey;
}

function geminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Set GEMINI_API_KEY before generating or searching embeddings.");
  }
  return apiKey;
}

export function assertEmbeddingConfig(): void {
  if (embeddingProvider === "gemini") {
    geminiApiKey();
    return;
  }
  openAiApiKey();
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

async function createOpenAiEmbeddings(inputs: string[]): Promise<number[][]> {
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
    throw new Error(payload.error?.message || `OpenAI embedding request failed with status ${response.status}.`);
  }
  if (!payload.data || payload.data.length !== inputs.length) {
    throw new Error("OpenAI embedding response did not include one vector per input.");
  }

  return payload.data
    .sort((left, right) => left.index - right.index)
    .map((item) => item.embedding);
}

function geminiModelResource(): string {
  return embeddingModel.startsWith("models/") ? embeddingModel : `models/${embeddingModel}`;
}

async function createGeminiEmbedding(input: string, taskType: EmbeddingTaskType): Promise<number[]> {
  const model = geminiModelResource();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:embedContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiApiKey()
    },
    body: JSON.stringify({
      model,
      content: {
        parts: [{ text: input }]
      },
      taskType,
      outputDimensionality: embeddingDimensions
    })
  });

  const payload = (await response.json()) as GeminiEmbeddingResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini embedding request failed with status ${response.status}.`);
  }
  if (!payload.embedding?.values) {
    throw new Error("Gemini embedding response did not include a vector.");
  }
  return payload.embedding.values;
}

async function createGeminiEmbeddings(inputs: string[], taskType: EmbeddingTaskType): Promise<number[][]> {
  const embeddings: number[][] = [];
  for (const input of inputs) {
    embeddings.push(await createGeminiEmbedding(input, taskType));
  }
  return embeddings;
}

export async function createEmbeddings(
  inputs: string[],
  taskType: EmbeddingTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (inputs.length === 0) {
    return [];
  }

  return embeddingProvider === "gemini"
    ? createGeminiEmbeddings(inputs, taskType)
    : createOpenAiEmbeddings(inputs);
}

export async function createEmbedding(input: string, taskType: EmbeddingTaskType = "RETRIEVAL_QUERY"): Promise<number[]> {
  const [embedding] = await createEmbeddings([input], taskType);
  return embedding;
}
