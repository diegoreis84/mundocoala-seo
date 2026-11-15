import type { Repo } from "./tipos";

export * from "./tipos";

/** BANCO=firestore no Google Cloud; padrão: SQLite local. */
let repo: Repo | null = null;
export async function getRepo(): Promise<Repo> {
  if (repo) return repo;
  repo = process.env.BANCO === "firestore" ? (await import("./firestore")).firestoreRepo : (await import("./sqlite")).sqliteRepo;
  return repo;
}
