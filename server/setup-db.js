import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('📁 Loading .env from:', path.join(__dirname, '.env'));
console.log('🔑 DATABASE_URL:', process.env.DATABASE_URL ? 'Loaded' : 'NOT FOUND');

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:fcOYDuoSKzsoVQSsVONBRpyJyDNYRdyg@caboose.proxy.rlwy.net:23034/railway',
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  console.log('🔧 Setting up Railway PostgreSQL database...\n');

  try {
    // Test connection
    console.log('1️⃣ Testing connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connected to Railway PostgreSQL:', result.rows[0].now);

    // Add password_hash column to profiles if it doesn't exist
    console.log('\n2️⃣ Adding password_hash column to profiles table...');
    await pool.query(`
      ALTER TABLE profiles 
      ADD COLUMN IF NOT EXISTS password_hash TEXT;
    `);
    console.log('✅ password_hash column added');

    // Check if we have any users
    console.log('\n3️⃣ Checking existing users...');
    const usersResult = await pool.query(`
      SELECT COUNT(*) FROM profiles;
    `);
    console.log(`✅ Found ${usersResult.rows[0].count} users in database`);

    // Check tables
    console.log('\n4️⃣ Verifying critical tables exist...');
    const tablesResult = await pool.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('profiles', 'students', 'user_roles', 'schools', 'academic_years')
      ORDER BY tablename;
    `);
    console.log('✅ Found tables:', tablesResult.rows.map(r => r.tablename).join(', '));

    console.log('\n✅ Database setup complete!');
    console.log('\n📝 Next steps:');
    console.log('1. Start backend server: cd server && npm run dev');
    console.log('2. Start frontend: npm run dev');
    console.log('3. Login with your credentials');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
