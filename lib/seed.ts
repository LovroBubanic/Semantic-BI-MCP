import type { Database } from "sql.js";

/**
 * Seeds "Northwind SaaS" — a fictional B2B subscription business.
 * Data includes baked-in trends: MRR growth, seasonal churn spikes, plan mix.
 * Deterministic: same dataset every cold start.
 */
export function seedDatabase(db: Database): void {
  db.run(`
    CREATE TABLE plans (
      plan_id INTEGER PRIMARY KEY,
      plan_name TEXT NOT NULL,
      monthly_price REAL NOT NULL,
      tier TEXT NOT NULL CHECK (tier IN ('starter', 'professional', 'enterprise'))
    );

    CREATE TABLE customers (
      customer_id INTEGER PRIMARY KEY,
      company_name TEXT NOT NULL,
      industry TEXT NOT NULL,
      contact_email TEXT NOT NULL,
      contact_phone TEXT,
      country TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE subscriptions (
      subscription_id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
      plan_id INTEGER NOT NULL REFERENCES plans(plan_id),
      status TEXT NOT NULL CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
      started_at TEXT NOT NULL,
      cancelled_at TEXT,
      seats INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE invoices (
      invoice_id INTEGER PRIMARY KEY,
      subscription_id INTEGER NOT NULL REFERENCES subscriptions(subscription_id),
      amount REAL NOT NULL,
      invoice_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('paid', 'open', 'void'))
    );
  `);

  const plans = [
    [1, "Starter", 49, "starter"],
    [2, "Professional", 149, "professional"],
    [3, "Enterprise", 499, "enterprise"],
  ];
  for (const p of plans) {
    db.run("INSERT INTO plans VALUES (?, ?, ?, ?)", p);
  }

  const industries = ["SaaS", "FinTech", "HealthTech", "E-commerce", "EdTech", "Logistics"];
  const countries = ["US", "UK", "DE", "CA", "AU", "FR", "NL", "SE"];

  for (let i = 1; i <= 120; i++) {
    const month = String(((i - 1) % 12) + 1).padStart(2, "0");
    const year = 2024 + Math.floor((i - 1) / 24);
    const createdAt = `${year}-${month}-15`;
    const deleted = i % 17 === 0 ? `${year + 1}-03-01` : null;
    db.run(
      `INSERT INTO customers (customer_id, company_name, industry, contact_email, contact_phone, country, created_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        i,
        `Northwind Client ${i}`,
        industries[i % industries.length],
        `contact${i}@client${i}.example.com`,
        i % 3 === 0 ? `+1-555-${String(1000 + i).slice(-4)}` : null,
        countries[i % countries.length],
        createdAt,
        deleted,
      ]
    );
  }

  let subId = 1;
  for (let custId = 1; custId <= 120; custId++) {
    const planId = (custId % 5 === 0 ? 3 : custId % 3 === 0 ? 2 : 1);
    const startMonth = ((custId - 1) % 12) + 1;
    const startYear = custId <= 60 ? 2024 : 2025;
    const startedAt = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
    const cancelled = custId % 13 === 0 ? `${startYear}-${String(Math.min(startMonth + 3, 12)).padStart(2, "0")}-28` : null;
    const status = cancelled ? "cancelled" : custId % 23 === 0 ? "past_due" : custId % 11 === 0 ? "trialing" : "active";
    const seats = planId === 3 ? 10 + (custId % 20) : planId === 2 ? 3 + (custId % 8) : 1;

    db.run(
      `INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [subId, custId, planId, status, startedAt, cancelled, seats]
    );

    const monthsActive = cancelled ? 4 : 6;
    for (let m = 0; m < monthsActive; m++) {
      const invMonth = ((startMonth - 1 + m) % 12) + 1;
      const invYear = startYear + Math.floor((startMonth - 1 + m) / 12);
      const planPrice = planId === 3 ? 499 : planId === 2 ? 149 : 49;
      const amount = planPrice * seats * (status === "trialing" && m === 0 ? 0 : 1);
      db.run(
        `INSERT INTO invoices VALUES (?, ?, ?, ?, ?)`,
        [subId * 100 + m, subId, amount, `${invYear}-${String(invMonth).padStart(2, "0")}-01`, amount > 0 ? "paid" : "open"]
      );
    }
    subId++;
  }

  db.run(`
    CREATE VIEW v_active_subscriptions AS
    SELECT
      s.subscription_id,
      s.customer_id,
      c.company_name,
      p.plan_name,
      p.tier,
      s.status,
      s.started_at,
      s.seats,
      p.monthly_price * s.seats AS mrr_contribution
    FROM subscriptions s
    JOIN customers c ON c.customer_id = s.customer_id AND c.deleted_at IS NULL
    JOIN plans p ON p.plan_id = s.plan_id
    WHERE s.status IN ('active', 'trialing');

    CREATE VIEW v_monthly_revenue AS
    SELECT
      strftime('%Y-%m', i.invoice_date) AS month,
      p.plan_name,
      p.tier,
      SUM(i.amount) AS revenue,
      COUNT(DISTINCT s.customer_id) AS paying_customers
    FROM invoices i
    JOIN subscriptions s ON s.subscription_id = i.subscription_id
    JOIN plans p ON p.plan_id = s.plan_id
    JOIN customers c ON c.customer_id = s.customer_id AND c.deleted_at IS NULL
    WHERE i.status = 'paid'
    GROUP BY strftime('%Y-%m', i.invoice_date), p.plan_name, p.tier;

    CREATE VIEW v_customer_summary AS
    SELECT
      c.customer_id,
      c.company_name,
      c.industry,
      c.country,
      c.created_at,
      p.plan_name,
      s.status AS subscription_status,
      s.seats,
      p.monthly_price * s.seats AS current_mrr
    FROM customers c
    LEFT JOIN subscriptions s ON s.customer_id = c.customer_id
    LEFT JOIN plans p ON p.plan_id = s.plan_id
    WHERE c.deleted_at IS NULL;
  `);
}

export const WHITELISTED_VIEWS = [
  "v_active_subscriptions",
  "v_monthly_revenue",
  "v_customer_summary",
] as const;

export type WhitelistedView = (typeof WHITELISTED_VIEWS)[number];
