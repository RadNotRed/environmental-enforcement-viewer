import type { APIRoute } from "astro";
import { all, ftsQuery, one } from "../../lib/db";

export const prerender = false;

const sortable = new Set(["year", "fine", "restitution", "jail_prison_months", "case_id"]);

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get("q")?.trim() ?? "";
  const district = url.searchParams.get("district")?.trim();
  const state = url.searchParams.get("state")?.trim();
  const circuit = url.searchParams.get("circuit")?.trim();
  const category = url.searchParams.get("category")?.trim();
  const sort = sortable.has(url.searchParams.get("sort") ?? "")
    ? url.searchParams.get("sort")!
    : "year";
  const direction = url.searchParams.get("dir") === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  const where: string[] = [];
  const params: unknown[] = [];

  if (district) {
    where.push("cases.district_name = ?");
    params.push(district);
  }
  if (state) {
    where.push("cases.state = ?");
    params.push(state);
  }
  if (circuit) {
    where.push("CAST(cases.circuit AS TEXT) = ?");
    params.push(circuit);
  }
  if (category) {
    where.push(`(
      cases.category_group = ?
      OR cases.category_collapsed = ?
      OR cases.category_harmonized = ?
      OR cases.category_orig = ?
    )`);
    params.push(category, category, category, category);
  }

  const query = q ? ftsQuery(q) : "";
  let sql = `
    SELECT
      cases.id,
      cases.case_id,
      cases.base_id,
      cases.year,
      cases.district_name,
      cases.state,
      cases.circuit,
      cases.us_region,
      cases.category_group,
      cases.category_collapsed,
      cases.category_harmonized,
      cases.species_category,
      cases.species_names,
      cases.country_primary,
      cases.country_detail,
      cases.fine,
      cases.restitution,
      cases.jail_prison_months,
      cases.probation_months,
      cases.charges,
      cases.notes
  `;

  if (query) {
    sql += `,
      snippet(case_fts, 7, '<mark>', '</mark>', '...', 18) AS charge_snippet,
      bm25(case_fts) AS rank
      FROM case_fts
      JOIN cases ON cases.id = case_fts.rowid
      WHERE case_fts MATCH ?
    `;
    params.unshift(query);
  } else {
    sql += `, NULL AS charge_snippet, NULL AS rank FROM cases`;
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  }

  if (query && where.length) sql += ` AND ${where.join(" AND ")}`;
  sql += ` ORDER BY ${query ? "rank ASC," : ""} cases.${sort} ${direction} LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const countSql = query
    ? `SELECT COUNT(*) AS value FROM case_fts JOIN cases ON cases.id = case_fts.rowid WHERE case_fts MATCH ?${where.length ? ` AND ${where.join(" AND ")}` : ""}`
    : `SELECT COUNT(*) AS value FROM cases${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const countParams = query ? [query, ...params.slice(1, -2)] : params.slice(0, -2);

  const rows = all(sql, params);
  const total = one<{ value: number }>(countSql, countParams)?.value ?? 0;

  return new Response(JSON.stringify({ q, total, limit, offset, rows }), {
    headers: { "content-type": "application/json" },
  });
};
