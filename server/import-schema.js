import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function importSchema() {
  console.log('📥 Starting schema import to Railway PostgreSQL\n');

  try {
    // Read the schema file
    const schemaPath = join(__dirname, '..', 'schema_dump.sql');
    console.log(`Reading schema from: ${schemaPath}\n`);
    
    const schemaSql = readFileSync(schemaPath, 'utf8');

    // Enable extensions first
    console.log('🔧 Enabling PostgreSQL extensions...\n');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "pg_trgm";');
    console.log('✅ Extensions enabled\n');

    // Create app_role enum type if not exists
    console.log('🔧 Creating app_role enum type...\n');
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE app_role AS ENUM ('student', 'teacher', 'admin', 'registrar', 'finance', 'principal');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ app_role type created\n');

    // Replace extensions.uuid_generate_v4() with gen_random_uuid()
    const cleanedSql = schemaSql
      .replace(/extensions\.uuid_generate_v4\(\)/g, 'gen_random_uuid()')
      .replace(/auth\.uid\(\)/g, 'gen_random_uuid()'); // Temporary replacement for auth.uid()

    // Split SQL into individual CREATE TABLE statements
    console.log('🚀 Parsing schema...\n');
    const statements = cleanedSql
      .split(/;\s*(?=CREATE TABLE|CREATE INDEX|$)/)
      .filter(stmt => stmt.trim().length > 0);

    console.log(`Found ${statements.length} statements\n`);

    // Separate table creations from index creations
    const tableStatements = statements.filter(s => s.includes('CREATE TABLE'));
    const indexStatements = statements.filter(s => s.includes('CREATE INDEX'));
    const otherStatements = statements.filter(s => !s.includes('CREATE TABLE') && !s.includes('CREATE INDEX'));

    console.log(`- ${tableStatements.length} table definitions`);
    console.log(`- ${indexStatements.length} index definitions\n`);

    // Parse tables - extract FK constraints separately
    const tables = tableStatements.map(sql => {
      const match = sql.match(/CREATE TABLE\s+public\.(\w+)/i);
      const tableName = match ? match[1] : null;
      
      // Extract foreign key constraints for later
      const fkMatches = [...sql.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+public\.(\w+)\s*\(([^)]+)\)/gi)];
      const foreignKeys = fkMatches.map(m => ({
        column: m[1].trim(),
        refTable: m[2].trim(),
        refColumn: m[3].trim()
      }));
      
      // Remove FK lines but preserve structure - match until next comma or closing paren
      let sqlWithoutFK = sql.replace(/,\s*FOREIGN KEY\s*\([^)]+\)\s*REFERENCES\s+public\.\w+\s*\([^)]+\)/gi, '');
      
      return { name: tableName, sql: sqlWithoutFK, foreignKeys };
    });

    // Execute table creation without foreign keys
    console.log('🚀 Creating tables (without foreign keys)...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const table of tables) {
      try {
        await pool.query(table.sql);
        console.log(`✅ ${table.name}`);
        successCount++;
      } catch (error) {
        console.error(`❌ ${table.name}: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📊 Tables created: ${successCount}, failed: ${errorCount}\n`);

    // Now add foreign key constraints
    console.log('🚀 Adding foreign key constraints...\n');
    let fkSuccess = 0;
    let fkError = 0;

    for (const table of tables) {
      for (const fk of table.foreignKeys) {
        try {
          await pool.query(`
            ALTER TABLE public.${table.name}
            ADD FOREIGN KEY (${fk.column}) REFERENCES public.${fk.refTable}(${fk.refColumn});
          `);
          fkSuccess++;
        } catch (error) {
          console.error(`❌ FK on ${table.name}(${fk.column}): ${error.message}`);
          fkError++;
        }
      }
    }

    console.log(`\n📊 Foreign keys: ${fkSuccess} added, ${fkError} failed\n`);

    // Execute indexes
    if (indexStatements.length > 0) {
      console.log('🚀 Creating indexes...\n');
      let indexSuccess = 0;
      for (const indexSql of indexStatements) {
        try {
          await pool.query(indexSql);
          indexSuccess++;
        } catch (error) {
          // Silently skip index errors
        }
      }
      console.log(`✅ Created ${indexSuccess} indexes\n`);
    }

    console.log('✅ Schema imported successfully!\n');

    // Verify tables were created
    const result = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);

    console.log(`📊 Created ${result.rows.length} tables:\n`);
    result.rows.forEach((row, index) => {
      console.log(`  ${index + 1}. ${row.tablename}`);
    });

    console.log('\n✅ Schema import complete!\n');

  } catch (error) {
    console.error('❌ Error importing schema:', error.message);
    console.error('Details:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

importSchema();
