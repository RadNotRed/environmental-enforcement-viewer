import type { APIRoute } from "astro";
import { all } from "../../lib/db";

export const prerender = false;

type CsvRow = Record<string, unknown>;

const categorySql = `
  SELECT label, cases FROM (
    SELECT 'Clean Air Act' AS label, SUM(CASE WHEN CAST(cat_flag_cleanairact AS REAL) = 1 THEN 1 ELSE 0 END) AS cases FROM cases
    UNION ALL SELECT 'Clean Water Act', SUM(CASE WHEN CAST(cat_flag_cleanwateract AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'Wildlife / Lacey / ESA', SUM(CASE WHEN CAST(cat_flag_wildlifelaceyesa AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'RCRA Hazardous Waste', SUM(CASE WHEN CAST(cat_flag_rcrahazardouswaste AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'Marine Pollution', SUM(CASE WHEN CAST(cat_flag_marinepollution AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'Fraud / Conspiracy', SUM(CASE WHEN CAST(cat_flag_fraudconspiracy AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'OSHA', SUM(CASE WHEN CAST(cat_flag_osha AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
    UNION ALL SELECT 'Other Environmental', SUM(CASE WHEN CAST(cat_flag_otherenvironmental AS REAL) = 1 THEN 1 ELSE 0 END) FROM cases
  )
  WHERE cases > 0
  ORDER BY cases DESC
`;

const queries: Record<string, { filename: string; sql: string }> = {
  cases: {
    filename: "environmental-enforcement-cases.csv",
    sql: `
      SELECT *
      FROM cases
      ORDER BY year DESC, case_id ASC
    `,
  },
  districts: {
    filename: "environmental-enforcement-district-summary.csv",
    sql: `
      SELECT
        district_name,
        state,
        CASE
          WHEN circuit IS NULL THEN 'Unknown'
          WHEN circuit = CAST(circuit AS INTEGER) THEN CAST(CAST(circuit AS INTEGER) AS TEXT)
          ELSE CAST(circuit AS TEXT)
        END AS circuit,
        COUNT(*) AS cases,
        COALESCE(SUM(fine), 0) AS total_fines,
        COALESCE(SUM(restitution), 0) AS total_restitution,
        SUM(CASE WHEN jail_prison_months > 0 THEN 1 ELSE 0 END) AS incarceration_cases
      FROM cases
      WHERE district_name IS NOT NULL
      GROUP BY district_name, state, circuit
      ORDER BY cases DESC, district_name ASC
    `,
  },
  categories: {
    filename: "environmental-enforcement-category-summary.csv",
    sql: categorySql,
  },
  sheets: {
    filename: "environmental-enforcement-workbook-sheets.csv",
    sql: `
      SELECT *
      FROM workbook_sheets
      ORDER BY row_count DESC
    `,
  },
};

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function toCsv(rows: CsvRow[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export const GET: APIRoute = async ({ url }) => {
  const type = url.searchParams.get("type") ?? "cases";
  const exportDef = queries[type] ?? queries.cases;
  const rows = all<CsvRow>(exportDef.sql);
  const csv = toCsv(rows);

  return new Response(csv, {
    headers: {
      "content-disposition": `attachment; filename="${exportDef.filename}"`,
      "content-type": "text/csv; charset=utf-8",
    },
  });
};
