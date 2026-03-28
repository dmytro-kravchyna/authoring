import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDatabase() {
  if (!db) {
    db = new Database(join(__dirname, "../../store-data/store.db"));
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Run schema
    const schema = readFileSync(join(__dirname, "schema.sql"), "utf-8");
    db.exec(schema);
  }
  return db;
}
