# Supabase to Railway PostgreSQL Migration Guide

## Prerequisites
✅ Railway account created
✅ Railway PostgreSQL database provisioned
✅ Database URL obtained from Railway

## Step 1: Export Supabase Data

### Export Schema
```bash
# In Supabase dashboard, go to SQL Editor and run:
pg_dump --schema-only -h <supabase-host> -U postgres -d postgres > schema.sql
```

### Export Data
```bash
pg_dump --data-only -h <supabase-host> -U postgres -d postgres > data.sql
```

## Step 2: Setup Railway Database

1. Create `.env` file in `server/` directory:
```env
DATABASE_URL="your-railway-postgres-url"
JWT_SECRET="generate-a-secure-32-char-secret"
FRONTEND_URL="http://localhost:8083"
PORT=3001
```

2. Add `password_hash` column to profiles:
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
```

3. Import schema and data to Railway:
```bash
psql <railway-database-url> < schema.sql
psql <railway-database-url> < data.sql
```

## Step 3: Install Server Dependencies

```bash
cd server
npm install
```

## Step 4: Update Frontend Environment

Create `.env` in project root:
```env
VITE_API_URL=http://localhost:3001/api
```

## Step 5: Replace Supabase Client

### Update imports across the app:
**Before:**
```typescript
import { supabase } from '@/integrations/supabase/client';
```

**After:**
```typescript
import { apiClient } from '@/lib/api-client';
```

### Update queries:
**Before:**
```typescript
const { data, error } = await supabase
  .from('students')
  .select('*')
  .eq('school_id', schoolId);
```

**After:**
```typescript
const { data, error } = await apiClient.query('students', {
  select: '*',
  eq: ['school_id', schoolId]
});
```

## Step 6: Replace AuthContext

In `src/App.tsx`, replace:
```typescript
import { AuthProvider } from '@/contexts/AuthContext';
```

With:
```typescript
import { AuthProvider } from '@/contexts/AuthContextRailway';
```

## Step 7: Start Services

### Terminal 1 - Backend:
```bash
cd server
npm run dev
```

### Terminal 2 - Frontend:
```bash
npm run dev
```

## Step 8: Test Critical Paths

1. ✅ Login with admin credentials
2. ✅ View student list
3. ✅ Create new student
4. ✅ Upload logo/document
5. ✅ View grades/reports
6. ✅ Test all CRUD operations

## API Endpoints

### Auth
- POST `/api/auth/login` - Login
- GET `/api/auth/me` - Get current user
- POST `/api/auth/logout` - Logout

### Data
- GET `/api/data/:table` - Query table
- POST `/api/data/:table` - Insert record
- PATCH `/api/data/:table/:id` - Update record
- DELETE `/api/data/:table/:id` - Delete record

### Storage
- POST `/api/storage/upload/:folder` - Upload file
- GET `/api/storage/files/:path` - Get file
- DELETE `/api/storage/:folder/:filename` - Delete file

## Common Issues

### Issue: "Connection refused"
**Solution**: Ensure Railway database is running and DATABASE_URL is correct

### Issue: "Invalid token"
**Solution**: Clear localStorage and re-login

### Issue: "Column not found"
**Solution**: Verify schema was imported correctly to Railway

### Issue: "File upload fails"
**Solution**: Check STORAGE_PATH permissions and create directories

## Rollback Plan

If migration fails:
1. Keep Supabase instance running
2. Revert AuthContext import in App.tsx
3. Remove .env VITE_API_URL
4. Restart frontend: `npm run dev`

## Production Deployment

1. Deploy backend to Railway
2. Update VITE_API_URL to production Railway URL
3. Set JWT_SECRET in Railway environment
4. Configure Railway volume for file storage
5. Update CORS origin to production domain
