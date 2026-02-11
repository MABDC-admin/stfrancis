@echo off
echo ======================================
echo Importing to Railway PostgreSQL
echo ======================================

SET RAILWAY_URL=postgresql://postgres:fcOYDuoSKzsoVQSsVONBRpyJyDNYRdyg@caboose.proxy.rlwy.net:23034/railway

echo.
echo Checking if export files exist...
if not exist schema.sql (
    echo ERROR: schema.sql not found!
    echo Please run export-from-supabase.bat first
    pause
    exit /b 1
)

if not exist data.sql (
    echo ERROR: data.sql not found!
    echo Please run export-from-supabase.bat first
    pause
    exit /b 1
)

echo.
echo Step 1: Importing schema...
psql "%RAILWAY_URL%" -f schema.sql

if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Schema import had errors (might be okay if some objects already exist)
)

echo.
echo Step 2: Importing data...
psql "%RAILWAY_URL%" -f data.sql

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Data import failed!
    pause
    exit /b 1
)

echo.
echo Step 3: Adding password_hash column...
psql "%RAILWAY_URL%" -c "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;"

echo.
echo ======================================
echo Import Complete!
echo ======================================
echo.
echo Next steps:
echo 1. cd server
echo 2. npm run dev  (start backend)
echo 3. In new terminal: npm run dev  (start frontend)
echo.
pause
