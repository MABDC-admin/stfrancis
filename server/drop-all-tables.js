import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function dropAllTables() {
  console.log('🗑️  Starting to drop all tables from Railway database\n');

  try {
    // Get all tables in public schema
    const result = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    if (result.rows.length === 0) {
      console.log('✅ No tables found - database is already clean\n');
      return;
    }

    console.log(`Found ${result.rows.length} tables:\n`);
    result.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });
    console.log('');

    // Drop all tables with CASCADE
    console.log('Dropping tables...\n');
    for (const row of result.rows) {
      const tableName = row.tablename;
      try {
        await pool.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE;`);
        console.log(`✅ Dropped: ${tableName}`);
      } catch (error) {
        console.error(`❌ Failed to drop ${tableName}: ${error.message}`);
      }
    }

    // Verify all tables are gone
    const verifyResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public';
    `);

    console.log(`\n📊 Final status: ${verifyResult.rows.length} tables remaining\n`);

    if (verifyResult.rows.length === 0) {
      console.log('✅ All tables successfully dropped - database is clean\n');
    } else {
      console.log('⚠️  Some tables still remain:\n');
      verifyResult.rows.forEach(row => {
        console.log(`  - ${row.tablename}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

dropAllTables();
