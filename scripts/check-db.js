const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  console.log("=== DB CONNECTION CHECK ===");
  console.log("DATABASE_URL is set:", !!url);
  
  if (!url) {
    console.log("=== WARNING: DATABASE_URL is empty, skipping DB check ===");
    console.log("This is normal during early startup. Retrying in 2 seconds...");
    // Retry with exponential backoff
    await new Promise(resolve => setTimeout(resolve, 2000));
    return main();
  }
  
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
    console.log("Retrying in 2 seconds...");
    await new Promise(resolve => setTimeout(resolve, 2000));
    return main();
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});

