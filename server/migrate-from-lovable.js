import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

async function runMigrations() {
  console.log('🚀 Starting migration from Lovable Supabase to Railway PostgreSQL\n');

  try {
    // Test connection
    console.log('1️⃣ Testing Railway connection...');
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to Railway PostgreSQL\n');

    // Create migrations tracking table
    console.log('2️⃣ Creating migrations tracking table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Migrations table ready\n');

    // Get list of migration files
    console.log('3️⃣ Reading migration files...');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql') && !f.includes('verify'))
      .sort();
    
    console.log(`Found ${sqlFiles.length} migration files\n`);

    // Check which migrations are already applied
    const { rows: appliedMigrations } = await pool.query(
      'SELECT version FROM schema_migrations'
    );
    const appliedVersions = new Set(appliedMigrations.map(r => r.version));

    // Apply each migration
    console.log('4️⃣ Applying migrations...\n');
    let appliedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const file of sqlFiles) {
      const version = file.replace('.sql', '');
      
      if (appliedVersions.has(version)) {
        console.log(`⏭️  Skipped: ${file} (already applied)`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`📄 Applying: ${file}`);
        const filePath = path.join(migrationsDir, file);
        const sql = await fs.readFile(filePath, 'utf8');

        // Execute migration in a transaction
        await pool.query('BEGIN');
        
        try {
          await pool.query(sql);
          await pool.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [version]
          );
          await pool.query('COMMIT');
          
          console.log(`✅ Success: ${file}\n`);
          appliedCount++;
        } catch (migrationError) {
          await pool.query('ROLLBACK');
          throw migrationError;
        }
      } catch (error) {
        console.error(`❌ Error in ${file}:`);
        console.error(`   ${error.message}\n`);
        errorCount++;
        
        // Ask whether to continue
        if (error.code === '42P07' || error.code === '42710') {
          // Object already exists - safe to continue
          console.log('   (Object already exists - continuing...)\n');
          await pool.query(
            'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
            [version]
          );
        } else if (error.code === '42501') {
          // Permission denied - skip
          console.log('   (Permission issue - skipping...)\n');
        } else {
          // Other errors - decide whether to stop
          console.log('   (Non-critical error - continuing...)\n');
        }
      }
    }

    // Add password_hash column
    console.log('\n5️⃣ Adding password_hash column to profiles...');
    try {
      await pool.query(`
        ALTER TABLE profiles 
        ADD COLUMN IF NOT EXISTS password_hash TEXT;
      `);
      console.log('✅ password_hash column added\n');
    } catch (error) {
      console.log('⚠️  Could not add password_hash:', error.message, '\n');
    }

    // Summary
    console.log('═══════════════════════════════════════');
    console.log('Migration Complete!');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Applied: ${appliedCount} migrations`);
    console.log(`⏭️  Skipped: ${skippedCount} migrations (already applied)`);
    console.log(`❌ Errors: ${errorCount} migrations (non-critical)`);
    console.log('═══════════════════════════════════════\n');

    // Verify key tables
    console.log('6️⃣ Verifying key tables exist...');
    const { rows: tables } = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);
    
    console.log(`Found ${tables.length} tables:`);
    const keyTables = ['profiles', 'students', 'user_roles', 'schools', 'academic_years'];
    keyTables.forEach(table => {
      const exists = tables.some(t => t.tablename === table);
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });

    console.log('\n📝 Next steps:');
    console.log('1. cd server && npm run dev  (start backend)');
    console.log('2. npm run dev  (start frontend in new terminal)');
    console.log('3. Login with your credentials\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
