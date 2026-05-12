import Database from "better-sqlite3";
import { resolve } from "node:path";

const dbPath = resolve(process.cwd(), "data/environmental_cases.sqlite");

let db: Database.Database | undefined;

export function getDb() {
  if (!db) {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (getDb().prepare(sql).get(...params) as T | undefined) ?? null;
}

export function scalar<T = unknown>(sql: string, params: unknown[] = []) {
  const row = one<{ value: T }>(sql, params);
  return row?.value;
}

export function metadata() {
  return Object.fromEntries(
    all<{ key: string; value: string }>("SELECT key, value FROM import_metadata").map((row) => [
      row.key,
      row.value,
    ]),
  );
}

export function numeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function ftsQuery(input: string) {
  return input
    .split(/\s+/)
    .map((term) => term.replace(/["*]/g, "").trim())
    .filter(Boolean)
    .map((term) => `"${term}"*`)
    .join(" AND ");
}
