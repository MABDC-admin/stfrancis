@echo off
echo ======================================
echo Exporting Lovable-Managed Supabase Database
echo ======================================

SET SUPABASE_HOST=aws-0-ap-southeast-1.pooler.supabase.com
SET SUPABASE_PORT=6543
SET SUPABASE_USER=postgres.fkvijsazmfvmlmtoyhsf
SET SUPABASE_DB=postgres

echo.
echo IMPORTANT: Get your Supabase database password from Lovable:
echo 1. Go to your Lovable project
echo 2. Settings ^> Database
echo 3. Copy the database password or connection string
echo.
echo Or from Supabase directly:
echo https://supabase.com/dashboard/project/fkvijsazmfvmlmtoyhsf/settings/database
echo.
pause

echo.
echo Step 1: Exporting schema...
pg_dump -h %SUPABASE_HOST% -p %SUPABASE_PORT% -U %SUPABASE_USER% -d %SUPABASE_DB% --schema-only -n public --no-owner --no-acl -f schema.sql

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Schema export failed!
    pause
    exit /b 1
)

echo SUCCESS: Schema exported to schema.sql
echo.
echo Step 2: Exporting data...
pg_dump -h %SUPABASE_HOST% -p %SUPABASE_PORT% -U %SUPABASE_USER% -d %SUPABASE_DB% --data-only -n public --no-owner --no-acl -f data.sql

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Data export failed!
    pause
    exit /b 1
)

echo SUCCESS: Data exported to data.sql
echo.
echo ======================================
echo Export Complete!
echo ======================================
echo.
echo Next step: Run import-to-railway.bat
pause
