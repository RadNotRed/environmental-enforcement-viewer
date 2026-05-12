import { Database } from "bun:sqlite";
import * as XLSX from "xlsx";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const sourcePath =
  process.argv[2] ??
  "LOCAL_PATH_TO_SEED.XLSX";
const dbPath = resolve(process.cwd(), "data/environmental_cases.sqlite");
const mainSheet = "All Cases";

const numericColumns = new Set([
  "YEAR",
  "DISTRICT_CODE",
  "CIRCUIT",
  "CORPORATE_BINARY",
  "NUM_INDIVIDUALS",
  "NUM_INDICTMENT_COUNTS",
  "NUM_SPECIES",
  "NUM_COUNTRIES",
  "TRANSNATIONAL",
  "IMPORT_INVOLVEMENT",
  "WEAPON_INVOLVEMENT",
  "CASE_LENGTH_DAYS",
  "CASE_LENGTH_MONTHS",
  "ASSESSMENT",
  "FINE",
  "RESTITUTION",
  "COMMUNITY_SERVICE_HRS",
  "FORFEITURE",
  "JAIL_PRISON_MONTHS",
  "PROBATION_MONTHS",
  "SUPERVISED_RELEASE_MONTHS",
  "ANY_INCARCERATION",
]);

function slugify(header: string) {
  return header
    .trim()
    .replace(/^_+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function quoteIdent(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function cleanCell(value: unknown, header: string) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "—") return null;
    if (numericColumns.has(header)) {
      const n = Number(trimmed.replaceAll(",", ""));
      return Number.isFinite(n) ? n : trimmed;
    }
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
}

function textJoin(parts: Array<unknown>) {
  return parts
    .filter((part) => part !== null && part !== undefined && String(part).trim())
    .map(String)
    .join(" ");
}

mkdirSync(dirname(dbPath), { recursive: true });

const workbook = XLSX.readFile(sourcePath, { cellDates: true });
const sheet = workbook.Sheets[mainSheet];
if (!sheet) {
  throw new Error(`Workbook does not contain a "${mainSheet}" sheet.`);
}

const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
  defval: null,
  raw: false,
});

if (!rows.length) {
  throw new Error(`"${mainSheet}" did not contain any rows.`);
}

const headers = Object.keys(rows[0]);
const columns = headers.map((header) => ({
  original: header,
  slug: slugify(header),
  type: numericColumns.has(header) ? "REAL" : "TEXT",
}));

const db = new Database(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
DROP TABLE IF EXISTS cases;
DROP TABLE IF EXISTS import_metadata;
DROP TABLE IF EXISTS workbook_sheets;
DROP TABLE IF EXISTS column_registry;
DROP TABLE IF EXISTS case_fts;

CREATE TABLE import_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE workbook_sheets (
  sheet_name TEXT PRIMARY KEY,
  range_ref TEXT,
  row_count INTEGER NOT NULL
);

CREATE TABLE column_registry (
  original_name TEXT PRIMARY KEY,
  sqlite_name TEXT NOT NULL,
  data_type TEXT NOT NULL,
  ordinal INTEGER NOT NULL
);

CREATE TABLE cases (
  id INTEGER PRIMARY KEY,
  ${columns.map((column) => `${quoteIdent(column.slug)} ${column.type}`).join(",\n  ")}
);

CREATE VIRTUAL TABLE case_fts USING fts5(
  case_id,
  base_id,
  district_name,
  state,
  country_primary,
  country_detail,
  category,
  charges,
  notes,
  all_text,
  tokenize = 'porter unicode61'
);
`);

const insertMeta = db.prepare("INSERT INTO import_metadata (key, value) VALUES (?, ?)");
insertMeta.run("source_path", sourcePath);
insertMeta.run("imported_at", new Date().toISOString());
insertMeta.run("main_sheet", mainSheet);
insertMeta.run("row_count", String(rows.length));
insertMeta.run("columns", String(columns.length));

const insertSheet = db.prepare(
  "INSERT INTO workbook_sheets (sheet_name, range_ref, row_count) VALUES (?, ?, ?)",
);
for (const name of workbook.SheetNames) {
  const ws = workbook.Sheets[name];
  const ref = ws["!ref"] ?? null;
  const count = XLSX.utils.sheet_to_json(ws, { defval: null }).length;
  insertSheet.run(name, ref, count);
}

const insertColumn = db.prepare(
  "INSERT INTO column_registry (original_name, sqlite_name, data_type, ordinal) VALUES (?, ?, ?, ?)",
);
columns.forEach((column, index) => {
  insertColumn.run(column.original, column.slug, column.type, index + 1);
});

const columnSql = columns.map((column) => quoteIdent(column.slug)).join(", ");
const placeholders = columns.map(() => "?").join(", ");
const insertCase = db.prepare(`INSERT INTO cases (${columnSql}) VALUES (${placeholders})`);
const insertFts = db.prepare(`
  INSERT INTO case_fts (
    rowid,
    case_id,
    base_id,
    district_name,
    state,
    country_primary,
    country_detail,
    category,
    charges,
    notes,
    all_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const transaction = db.transaction((records: typeof rows) => {
  for (const row of records) {
    const values = columns.map((column) => cleanCell(row[column.original], column.original));
    const result = insertCase.run(...values);
    const id = Number(result.lastInsertRowid);
    const bySlug = Object.fromEntries(columns.map((column, index) => [column.slug, values[index]]));
    const category = textJoin([
      bySlug.category_group,
      bySlug.category_collapsed,
      bySlug.category_harmonized,
      bySlug.category_orig,
      bySlug.species_category,
    ]);
    insertFts.run(
      id,
      bySlug.case_id,
      bySlug.base_id,
      bySlug.district_name,
      bySlug.state,
      bySlug.country_primary,
      bySlug.country_detail,
      category,
      bySlug.charges,
      bySlug.notes,
      textJoin(values),
    );
  }
});

transaction(rows);

db.exec(`
CREATE INDEX idx_cases_year ON cases(year);
CREATE INDEX idx_cases_state ON cases(state);
CREATE INDEX idx_cases_district ON cases(district_name);
CREATE INDEX idx_cases_circuit ON cases(circuit);
CREATE INDEX idx_cases_country ON cases(country_primary);
CREATE INDEX idx_cases_category ON cases(category_group);
ANALYZE;
`);

console.log(
  JSON.stringify(
    {
      dbPath,
      sourcePath,
      sheet: mainSheet,
      rows: rows.length,
      columns: columns.length,
      workbookSheets: workbook.SheetNames.length,
    },
    null,
    2,
  ),
);
