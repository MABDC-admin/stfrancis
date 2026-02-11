# Railway PostgreSQL Migration - Data Copy Script

## Your Railway database is connected but empty.

You need to copy your data from Supabase to Railway. Here are your options:

### Option 1: Use Supabase Dashboard (Easiest)

1. Go to your Supabase project: https://supabase.com/dashboard/project/fkvijsazmfvmlmtoyhsf
2. Go to **SQL Editor**
3. Click **Export** → **Database Schema** → Copy SQL
4. Save it as `schema.sql`
5. Go to **Export** → **Database Data** → Copy SQL (or use pg_dump)
6. Save it as `data.sql`

### Option 2: Use pg_dump (Recommended)

```bash
# Export schema
pg_dump -h aws-0-ap-southeast-1.pooler.supabase.com -U postgres.fkvijsazmfvmlmtoyhsf -d postgres --schema-only -n public > schema.sql

# Export data  
pg_dump -h aws-0-ap-southeast-1.pooler.supabase.com -U postgres.fkvijsazmfvmlmtoyhsf -d postgres --data-only -n public > data.sql

# Import to Railway
psql postgresql://postgres:fcOYDuoSKzsoVQSsVONBRpyJyDNYRdyg@caboose.proxy.rlwy.net:23034/railway < schema.sql
psql postgresql://postgres:fcOYDuoSKzsoVQSsVONBRpyJyDNYRdyg@caboose.proxy.rlwy.net:23034/railway < data.sql
```

### Option 3: Quick Test (Create minimal schema for testing)

I can create a minimal schema with just the tables needed for auth to test the system first.

**Which option do you prefer?**
1. I'll wait while you export from Supabase (Option 1 or 2)
2. Create minimal test schema now (Option 3)
