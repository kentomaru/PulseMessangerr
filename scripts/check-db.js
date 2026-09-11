const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  console.log("=== DB CONNECTION CHECK ===");
  console.log("DATABASE_URL is set:", !!url);
  if (url) {
    try {
      const parsed = new URL(url);
      console.log("host:", parsed.hostname);
      console.log("port:", parsed.port);
      console.log("database:", parsed.pathname);
    } catch (e) {
      console.log("Could not parse DATABASE_URL as a URL:", e.message);
    }
  }

  if (!url) {
    console.log("=== FAILED: DATABASE_URL is empty/undefined ===");
    process.exit(0);
  }

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  try {
    await client.connect();
    const res = await client.query("SELECT 1 as ok");
    console.log("=== SUCCESS: connected and queried DB ===", res.rows);
    await client.end();
  } catch (e) {
    console.log("=== FAILED: could not connect ===");
    console.log("error name:", e.name);
    console.log("error message:", e.message);
    console.log("error code:", e.code);
  }
}

main();
