import initSqlJs, { Database, SqlJsStatic, type SqlValue } from "sql.js";
import path from "path";
import fs from "fs";
import { seedDatabase } from "./seed";

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbInstance: Database | null = null;

function getWasmPath(): string {
  return path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");
}

async function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => getWasmPath(),
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
  const wasmPath = getWasmPath();
  return {
    wasmPath,
    wasmExists: fs.existsSync(wasmPath),
  };
}
