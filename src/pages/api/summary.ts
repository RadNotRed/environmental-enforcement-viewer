import type { APIRoute } from "astro";
import { all, metadata, one } from "../../lib/db";

export const prerender = false;

export const GET: APIRoute = async () => {
  const stats = one<{
    cases: number;
    first_year: number | null;
    last_year: number | null;
    total_fines: number;
    total_restitution: number;
    incarceration_cases: number;
  }>(`
    SELECT
      COUNT(*) AS cases,
      MIN(year) AS first_year,
      MAX(year) AS last_year,
      COALESCE(SUM(fine), 0) AS total_fines,
      COALESCE(SUM(restitution), 0) AS total_restitution,
      SUM(CASE WHEN jail_prison_months > 0 THEN 1 ELSE 0 END) AS incarceration_cases
    FROM cases
  `);

  const timeSeries = all(`
    SELECT CAST(year AS INTEGER) AS year, COUNT(*) AS cases
    FROM cases
    WHERE year IS NOT NULL
    GROUP BY year
    ORDER BY year
  `);

  const categoryFlags = all(`
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
  `);

  const topDistricts = all(`
    SELECT
      district_name,
      state,
      (
        SELECT CASE
          WHEN c2.circuit IS NULL THEN 'Unknown'
          WHEN c2.circuit = CAST(c2.circuit AS INTEGER) THEN CAST(CAST(c2.circuit AS INTEGER) AS TEXT)
          ELSE CAST(c2.circuit AS TEXT)
        END
        FROM cases c2
        WHERE c2.district_name = cases.district_name
          AND COALESCE(c2.state, '') = COALESCE(cases.state, '')
        GROUP BY c2.circuit
        ORDER BY COUNT(*) DESC
        LIMIT 1
      ) AS circuit,
      COUNT(*) AS cases
    FROM cases
    WHERE district_name IS NOT NULL
    GROUP BY district_name, state
    ORDER BY cases DESC
    LIMIT 12
  `);

  const circuits = all(`
    SELECT
      CASE
        WHEN circuit IS NULL THEN 'Unknown'
        WHEN circuit = CAST(circuit AS INTEGER) THEN CAST(CAST(circuit AS INTEGER) AS TEXT)
        ELSE CAST(circuit AS TEXT)
      END AS circuit,
      COUNT(*) AS cases
    FROM cases
    GROUP BY circuit
    ORDER BY cases DESC
  `);

  const countries = all(`
    SELECT country_primary AS country, COUNT(*) AS cases
    FROM cases
    WHERE country_primary IS NOT NULL
    GROUP BY country_primary
    ORDER BY cases DESC
    LIMIT 12
  `);

  const sheets = all("SELECT * FROM workbook_sheets ORDER BY row_count DESC");

  return new Response(
    JSON.stringify({
      metadata: metadata(),
      stats,
      timeSeries,
      categoryFlags,
      topDistricts,
      circuits,
      countries,
      sheets,
    }),
    {
      headers: { "content-type": "application/json" },
    },
  );
};
