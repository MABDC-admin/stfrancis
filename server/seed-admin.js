import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
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

async function seedAdmin() {
  console.log('🌱 Seeding admin user...\n');

  try {
    const adminId = '00000000-0000-0000-0000-000000000001';
    const email = 'sottodennis@gmail.com';
    const password = 'Denskie123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into profiles
    await pool.query(`
      INSERT INTO profiles (id, email, full_name, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE 
      SET email = $2, full_name = $3, password_hash = $4, updated_at = NOW()
    `, [adminId, email, 'Dennis Sotto', hashedPassword]);

    console.log('✅ Profile created');

    // Insert into user_roles
    await pool.query(`
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT DO NOTHING
    `, [adminId, 'admin']);

    console.log('✅ Admin role assigned');

    // Insert into user_credentials for backward compatibility
    await pool.query(`
      INSERT INTO user_credentials (user_id, email, temp_password, role, password_changed, created_at)
      VALUES ($1, $2, $3, $4, true, NOW())
      ON CONFLICT DO NOTHING
    `, [adminId, email, password, 'admin']);

    console.log('✅ User credentials created\n');

    console.log('📊 Admin user ready:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedAdmin();
