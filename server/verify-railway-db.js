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

async function verifyDatabase() {
  console.log('========================================');
  console.log('Railway PostgreSQL Database Verification');
  console.log('========================================\n');

  try {
    // 1. Test connection
    console.log('1️⃣ Testing database connection...');
    const connResult = await pool.query('SELECT NOW() as time, current_database() as database');
    console.log(`   ✅ Connected to: ${connResult.rows[0].database}`);
    console.log(`   ✅ Server time: ${connResult.rows[0].time}\n`);

    // 2. List all tables
    console.log('2️⃣ Listing all tables in public schema...');
    const tablesResult = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY tablename;
    `);
    console.log(`   ✅ Found ${tablesResult.rows.length} tables:\n`);
    tablesResult.rows.forEach((row, i) => {
      console.log(`      ${String(i + 1).padStart(2)}. ${row.tablename}`);
    });

    // 3. Check profiles table structure
    console.log('\n3️⃣ Verifying profiles table structure...');
    const profilesStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'profiles'
      ORDER BY ordinal_position;
    `);
    console.log('   Profiles table columns:');
    profilesStructure.rows.forEach(col => {
      const nullable = col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
      console.log(`      - ${col.column_name}: ${col.data_type} (${nullable})`);
    });

    // 4. Check if password_hash column exists
    const hasPasswordHash = profilesStructure.rows.some(col => col.column_name === 'password_hash');
    if (hasPasswordHash) {
      console.log('\n   ✅ password_hash column EXISTS in profiles table');
    } else {
      console.log('\n   ⚠️ password_hash column MISSING - adding it now...');
      await pool.query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;');
      console.log('   ✅ password_hash column added');
    }

    // 5. Check user_roles table
    console.log('\n4️⃣ Checking user_roles table...');
    const rolesResult = await pool.query(`
      SELECT ur.*, p.email, p.full_name
      FROM user_roles ur
      LEFT JOIN profiles p ON ur.user_id = p.id
      ORDER BY ur.role;
    `);
    console.log(`   Found ${rolesResult.rows.length} user roles:`);
    rolesResult.rows.forEach(row => {
      console.log(`      - ${row.email || 'N/A'} (${row.full_name || 'N/A'}): ${row.role}`);
    });

    // 6. Check schools table
    console.log('\n5️⃣ Checking schools table...');
    const schoolsResult = await pool.query('SELECT id, code, name FROM schools ORDER BY name;');
    console.log(`   Found ${schoolsResult.rows.length} schools:`);
    schoolsResult.rows.forEach(row => {
      console.log(`      - ${row.code}: ${row.name} (${row.id.substring(0, 8)}...)`);
    });

    // 7. Check academic_years table
    console.log('\n6️⃣ Checking academic_years table...');
    const yearsResult = await pool.query(`
      SELECT ay.*, s.name as school_name 
      FROM academic_years ay
      LEFT JOIN schools s ON ay.school_id = s.id
      ORDER BY ay.start_date DESC;
    `);
    console.log(`   Found ${yearsResult.rows.length} academic years:`);
    yearsResult.rows.forEach(row => {
      const current = row.is_current ? '(CURRENT)' : '';
      console.log(`      - ${row.name} ${current}: ${row.start_date} to ${row.end_date}`);
    });

    // 8. Check students count
    console.log('\n7️⃣ Checking students table...');
    const studentsCount = await pool.query('SELECT COUNT(*) as count FROM students;');
    console.log(`   Total students: ${studentsCount.rows[0].count}`);

    // 9. Database size
    console.log('\n8️⃣ Database statistics...');
    const sizeResult = await pool.query(`
      SELECT pg_size_pretty(pg_database_size(current_database())) as size;
    `);
    console.log(`   Database size: ${sizeResult.rows[0].size}`);

    console.log('\n========================================');
    console.log('✅ Railway Database Verification Complete');
    console.log('========================================\n');

    console.log('📝 Configuration Summary:');
    console.log('   DATABASE_URL: Configured ✅');
    console.log('   Tables: ' + tablesResult.rows.length + ' ✅');
    console.log('   password_hash column: ' + (hasPasswordHash ? 'Present ✅' : 'Added ✅'));
    console.log('   Users: ' + rolesResult.rows.length + ' ✅');
    console.log('   Schools: ' + schoolsResult.rows.length + ' ✅');
    console.log('   Academic Years: ' + yearsResult.rows.length + ' ✅');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error('Details:', error);
  } finally {
    await pool.end();
  }
}

verifyDatabase();
