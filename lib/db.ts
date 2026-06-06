import initSqlJs, { Database, SqlJsStatic, type SqlValue } from "sql.js";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { seedDatabase } from "./seed";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbInstance: Database | null = null;

const require = createRequire(import.meta.url);

function resolveWasmPath(): string {
  const candidates = [
    path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
  ];

  try {
    const sqlEntry = require.resolve("sql.js");
    candidates.push(path.join(path.dirname(sqlEntry), "sql-wasm.wasm"));
  } catch {
    /* package not resolvable in this runtime */
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

function loadWasmBinary(): Buffer {
  const wasmPath = resolveWasmPath();
  if (!fs.existsSync(wasmPath)) {
    throw new Error(
      `sql.js WASM not found at ${wasmPath}. Ensure sql.js is installed and included in the deployment bundle.`
    );
  }
  return fs.readFileSync(wasmPath);
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      wasmBinary: loadWasmBinary().buffer as ArrayBuffer,
    });
  }
  return sqlPromise;
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const SQL = await getSql();
  dbInstance = new SQL.Database();
  seedDatabase(dbInstance);
  return dbInstance;
}

export interface QueryRow {
  [key: string]: string | number | null;
}

export interface QueryResult {
  columns: string[];
  rows: QueryRow[];
  rowCount: number;
}

export async function query(sql: string, params: SqlValue[] = []): Promise<QueryResult> {
  const db = await getDb();
  const stmt = db.prepare(sql);
  stmt.bind(params);

  const columns = stmt.getColumnNames();
  const rows: QueryRow[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as QueryRow;
    rows.push(row);
  }

  stmt.free();

  return {
    columns,
    rows,
    rowCount: rows.length,
  };
}

export function resetDbForTests(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getDbFileInfo(): { wasmExists: boolean; wasmPath: string } {
  const wasmPath = resolveWasmPath();
  return {
    wasmPath,
    wasmExists: fs.existsSync(wasmPath),
  };
}
