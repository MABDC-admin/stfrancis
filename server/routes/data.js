import express from 'express';
import { query } from '../db.js';
import { authMiddleware, requireRole } from '../auth/jwt.js';
import { sanitizeBody, sanitizeQuery, isValidUUID, cacheHeaders } from '../middleware/validation.js';

const router = express.Router();

// Apply sanitization to all routes
router.use(sanitizeBody);
router.use(sanitizeQuery);

// Whitelist of allowed tables (security measure)
const ALLOWED_TABLES = [
  'academic_years', 'admission_audit_logs', 'admissions', 'announcements', 'assessment_items',
  'assignment_submissions', 'attendance', 'audit_logs', 'balance_carry_forwards', 'books',
  'canva_oauth_states', 'class_schedules', 'curriculum_strands', 'discounts',
  'enrollment_applications', 'enrollment_documents', 'enrollments',
  'exam_schedules', 'fee_catalog', 'fee_templates', 'fee_template_items',
  'finance_audit_logs', 'finance_clearance', 'finance_settings',
  'grade_snapshots', 'holidays', 'lesson_plans', 'library_checkouts', 'library_inventory',
  'library_settings', 'lis_chat_conversations', 'lis_chat_messages', 'message_attachments',
  'messages', 'notebook_annotations', 'notebook_chat_messages', 'notebook_chat_sessions',
  'notebook_entries', 'notebook_entry_pages', 'notebook_presentations', 'notebooks',
  'payment_plan_installments', 'payment_plans', 'payments', 'profiles', 'raw_scores',
  'reportcard_templates', 'school_admin_assignments', 'school_subjects',
  'school_themes', 'schools', 'strand_subjects', 'student_assessments', 'student_assignments',
  'student_attendance', 'student_discounts', 'student_documents', 'student_grades',
  'student_incidents', 'student_qr_codes', 'student_report_cards', 'student_subjects',
  'students', 'subjects', 'transmutation_tables', 'user_roles', 'zoom_sessions'
];

// Tables that are segregated by academic_year_id (writes are locked when year is archived)
const YEAR_SEGREGATED_TABLES = [
  'students', 'student_grades', 'student_subjects', 'student_attendance',
  'student_assessments', 'student_assignments', 'raw_scores', 'payments',
  'admissions', 'grade_snapshots'
];

// Whitelist of allowed column names (alphanumeric + underscore only)
const isValidColumnName = (col) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col);

// Validate table name
const isValidTable = (table) => ALLOWED_TABLES.includes(table);

// Sanitize and validate select clause
const sanitizeSelect = (select) => {
  if (select === '*') return '*';
  const columns = select.split(',').map(c => c.trim());
  for (const col of columns) {
    if (!isValidColumnName(col)) {
      throw new Error(`Invalid column name: ${col}`);
    }
  }
  return columns.join(', ');
};

// Generic query builder with SQL injection protection
const buildQuery = (table, options) => {
  if (!isValidTable(table)) {
    throw new Error(`Invalid table name: ${table}`);
  }

  const select = options.select ? sanitizeSelect(options.select) : '*';
  let sql = `SELECT ${select} FROM ${table}`;
  const params = [];
  const conditions = [];
  let paramIndex = 1;

  // WHERE conditions - all use parameterized queries
  if (options.eq) {
    const [field, value] = options.eq;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} = $${paramIndex++}`);
    params.push(value);
  }

  // Support multiple eq filters
  if (options.eqs) {
    for (const [field, value] of options.eqs) {
      if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
      conditions.push(`${field} = $${paramIndex++}`);
      params.push(value);
    }
  }

  if (options.neq) {
    const [field, value] = options.neq;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} != $${paramIndex++}`);
    params.push(value);
  }

  if (options.in) {
    const [field, values] = options.in;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    if (!Array.isArray(values)) throw new Error('IN clause requires array');
    conditions.push(`${field} = ANY($${paramIndex++})`);
    params.push(values);
  }

  if (options.gt) {
    const [field, value] = options.gt;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} > $${paramIndex++}`);
    params.push(value);
  }

  if (options.lt) {
    const [field, value] = options.lt;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} < $${paramIndex++}`);
    params.push(value);
  }

  if (options.gte) {
    const [field, value] = options.gte;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} >= $${paramIndex++}`);
    params.push(value);
  }

  if (options.lte) {
    const [field, value] = options.lte;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    conditions.push(`${field} <= $${paramIndex++}`);
    params.push(value);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  // ORDER BY with validation
  if (options.order) {
    const [field, direction] = options.order;
    if (!isValidColumnName(field)) throw new Error(`Invalid field name: ${field}`);
    const dir = direction === 'asc' || direction === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY ${field} ${dir}`;
  }

  // LIMIT with validation
  if (options.limit) {
    const limit = parseInt(options.limit);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new Error('Invalid limit value');
    }
    sql += ` LIMIT ${limit}`;
  }

  return { sql, params };
};

// GET - Query table
router.get('/:table', authMiddleware, async (req, res) => {
  try {
    const { table } = req.params;
    const options = {};

    // Parse query parameters
    if (req.query.select) options.select = req.query.select;
    // Support multiple eq filters (sent as repeated eq params)
    if (req.query.eq) {
      const eqParams = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
      options.eqs = eqParams.map(e => JSON.parse(e));
    }
    if (req.query.neq) options.neq = JSON.parse(req.query.neq);
    if (req.query.in) options.in = JSON.parse(req.query.in);
    if (req.query.gt) options.gt = JSON.parse(req.query.gt);
    if (req.query.lt) options.lt = JSON.parse(req.query.lt);
    if (req.query.gte) options.gte = JSON.parse(req.query.gte);
    if (req.query.lte) options.lte = JSON.parse(req.query.lte);
    if (req.query.order) options.order = JSON.parse(req.query.order);
    if (req.query.limit) options.limit = parseInt(req.query.limit);
    
    const single = req.query.single === 'true';

    const { sql, params } = buildQuery(table, options);
    const result = await query(sql, params);

    if (single) {
      res.json(result.rows[0] || null);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: 'Query failed' });
  }
});

/**
 * Middleware: Check if a write operation to a year-segregated table is allowed.
 * Only the CURRENT (non-archived) academic year can receive writes.
 */
const enforceYearWriteProtection = async (req, res, next) => {
  const { table } = req.params;

  // Only enforce on year-segregated tables
  if (!YEAR_SEGREGATED_TABLES.includes(table)) {
    return next();
  }

  // For INSERT, check the academic_year_id in the body
  // For UPDATE/DELETE, check the academic_year_id in the eq query params
  let academicYearId = null;

  if (req.method === 'POST') {
    academicYearId = req.body?.academic_year_id;
  } else {
    // Parse eq params to find academic_year_id
    if (req.query.eq) {
      const eqParams = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
      for (const eqParam of eqParams) {
        try {
          const [field, value] = JSON.parse(eqParam);
          if (field === 'academic_year_id') {
            academicYearId = value;
            break;
          }
        } catch { /* skip malformed */ }
      }
    }
  }

  // If no academic_year_id provided for a segregated table, that's fine
  // (the DB triggers will catch cross-school violations)
  if (!academicYearId) {
    return next();
  }

  try {
    const yearResult = await query(
      'SELECT is_current, is_archived FROM academic_years WHERE id = $1',
      [academicYearId]
    );

    if (yearResult.rows.length === 0) {
      return res.status(400).json({ error: 'Academic year not found' });
    }

    const year = yearResult.rows[0];

    if (year.is_archived) {
      return res.status(403).json({
        error: 'This academic year is archived and read-only. No modifications are allowed.',
        code: 'YEAR_ARCHIVED'
      });
    }

    if (!year.is_current) {
      return res.status(403).json({
        error: 'Only the current academic year can receive new data. Please switch to the active year.',
        code: 'YEAR_NOT_CURRENT'
      });
    }

    next();
  } catch (error) {
    console.error('Year write protection check failed:', error);
    next(); // Don't block on error - let DB triggers catch it
  }
};

// POST - Insert into table (supports single object or array of objects)
router.post('/:table', authMiddleware, enforceYearWriteProtection, async (req, res) => {
  try {
    const { table } = req.params;
    
    if (!isValidTable(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    const body = req.body;
    const isArray = Array.isArray(body);
    const rows = isArray ? body : [body];

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data provided' });
    }

    // Use the first row's keys as the field list (all rows must have same structure)
    const fields = Object.keys(rows[0]);
    
    // Validate all field names
    for (const field of fields) {
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
    }

    if (rows.length === 1) {
      // Single row insert (original behavior)
      const values = Object.values(rows[0]);
      const placeholders = fields.map((_, i) => `$${i + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders}) RETURNING *`;
      const result = await query(sql, values);
      res.json(result.rows[0]);
    } else {
      // Bulk insert: INSERT INTO table (cols) VALUES ($1,$2), ($3,$4), ... RETURNING *
      const values = [];
      const valueGroups = [];
      let paramIndex = 1;

      for (const row of rows) {
        const placeholders = fields.map((f) => {
          values.push(row[f] !== undefined ? row[f] : null);
          return `$${paramIndex++}`;
        });
        valueGroups.push(`(${placeholders.join(', ')})`);
      }

      const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES ${valueGroups.join(', ')} RETURNING *`;
      const result = await query(sql, values);
      res.json(result.rows);
    }
  } catch (error) {
    console.error('Insert error:', error);
    res.status(500).json({ error: error.message || 'Insert failed' });
  }
});

// PUT - Update table (supports query params for WHERE clause)
router.put('/:table', authMiddleware, enforceYearWriteProtection, async (req, res) => {
  try {
    const { table } = req.params;
    
    if (!isValidTable(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    const data = req.body;
    const fields = Object.keys(data);
    
    // Validate all field names
    for (const field of fields) {
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
    }
    
    const values = Object.values(data);
    const setClause = fields.map((field, i) => `${field} = $${i + 1}`).join(', ');
    
    let sql = `UPDATE ${table} SET ${setClause}`;
    let paramIndex = fields.length + 1;
    
    // Parse WHERE conditions from query params (supports multiple eq, neq, in)
    if (req.query.eq) {
      const eqParams = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
      const eqConditions = [];
      for (const eqParam of eqParams) {
        const [field, value] = JSON.parse(eqParam);
        if (!isValidColumnName(field)) {
          return res.status(400).json({ error: `Invalid field name: ${field}` });
        }
        eqConditions.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
      if (eqConditions.length > 0) {
        sql += ' WHERE ' + eqConditions.join(' AND ');
      }
    }

    // neq filter for UPDATE
    if (req.query.neq) {
      const [field, value] = JSON.parse(req.query.neq);
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
      const neqClause = `${field} != $${paramIndex++}`;
      values.push(value);
      sql += sql.includes('WHERE') ? ` AND ${neqClause}` : ` WHERE ${neqClause}`;
    }

    // in filter for UPDATE
    if (req.query.in) {
      const [field, inValues] = JSON.parse(req.query.in);
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
      if (!Array.isArray(inValues)) {
        return res.status(400).json({ error: 'IN clause requires array' });
      }
      const inClause = `${field} = ANY($${paramIndex++})`;
      values.push(inValues);
      sql += sql.includes('WHERE') ? ` AND ${inClause}` : ` WHERE ${inClause}`;
    }
    
    sql += ' RETURNING *';
    
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: error.message || 'Update failed' });
  }
});

// DELETE - Delete from table (supports query params for WHERE clause)
router.delete('/:table', authMiddleware, enforceYearWriteProtection, async (req, res) => {
  try {
    const { table } = req.params;
    
    if (!isValidTable(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }
    
    let sql = `DELETE FROM ${table}`;
    const params = [];
    let paramIndex = 1;
    
    // Parse WHERE conditions from query params (supports multiple eq, neq, in)
    if (req.query.eq) {
      const eqParams = Array.isArray(req.query.eq) ? req.query.eq : [req.query.eq];
      const eqConditions = [];
      for (const eqParam of eqParams) {
        const [field, value] = JSON.parse(eqParam);
        if (!isValidColumnName(field)) {
          return res.status(400).json({ error: `Invalid field name: ${field}` });
        }
        eqConditions.push(`${field} = $${paramIndex++}`);
        params.push(value);
      }
      if (eqConditions.length > 0) {
        sql += ' WHERE ' + eqConditions.join(' AND ');
      }
    }

    // neq filter for DELETE
    if (req.query.neq) {
      const [field, value] = JSON.parse(req.query.neq);
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
      const neqClause = `${field} != $${paramIndex++}`;
      params.push(value);
      sql += sql.includes('WHERE') ? ` AND ${neqClause}` : ` WHERE ${neqClause}`;
    }

    // in filter for DELETE
    if (req.query.in) {
      const [field, inValues] = JSON.parse(req.query.in);
      if (!isValidColumnName(field)) {
        return res.status(400).json({ error: `Invalid field name: ${field}` });
      }
      if (!Array.isArray(inValues)) {
        return res.status(400).json({ error: 'IN clause requires array' });
      }
      const inClause = `${field} = ANY($${paramIndex++})`;
      params.push(inValues);
      sql += sql.includes('WHERE') ? ` AND ${inClause}` : ` WHERE ${inClause}`;
    }

    // Require at least one WHERE condition for safety
    if (!sql.includes('WHERE')) {
      return res.status(400).json({ error: 'DELETE requires WHERE clause (use eq, neq, or in parameter)' });
    }

    const result = await query(sql, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({ message: 'Deleted successfully', rowCount: result.rowCount });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: error.message || 'Delete failed' });
  }
});

// POST - Activate academic year (special endpoint with freeze logic)
router.post('/academic_years/:id/activate', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Get the year to activate
    const yearResult = await query('SELECT * FROM academic_years WHERE id = $1', [id]);
    if (yearResult.rows.length === 0) {
      return res.status(404).json({ error: 'Academic year not found' });
    }

    const year = yearResult.rows[0];

    if (year.is_archived) {
      return res.status(400).json({ error: 'Cannot activate an archived academic year' });
    }

    // The database trigger auto_freeze_previous_years will handle unsetting other current years
    const result = await query(
      'UPDATE academic_years SET is_current = true WHERE id = $1 RETURNING *',
      [id]
    );

    res.json({
      message: `Academic year ${result.rows[0].name} is now active`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Activate year error:', error);
    res.status(500).json({ error: error.message || 'Failed to activate academic year' });
  }
});

// POST - Archive academic year (with grade snapshot preservation)
router.post('/academic_years/:id/archive', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get the year to archive
    const yearResult = await query('SELECT * FROM academic_years WHERE id = $1', [id]);
    if (yearResult.rows.length === 0) {
      return res.status(404).json({ error: 'Academic year not found' });
    }

    const year = yearResult.rows[0];

    if (year.is_archived) {
      return res.status(400).json({ error: 'Academic year is already archived' });
    }

    // 1. Snapshot grades before archiving
    const gradesResult = await query(
      'SELECT * FROM student_grades WHERE academic_year_id = $1',
      [id]
    );

    let snapshotCount = 0;
    if (gradesResult.rows.length > 0) {
      for (const g of gradesResult.rows) {
        await query(`
          INSERT INTO grade_snapshots (student_id, subject_id, academic_year_id, quarter,
            written_work, performance_task, quarterly_assessment, final_grade, remarks, school_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT DO NOTHING
        `, [g.student_id, g.subject_id, g.academic_year_id, g.quarter,
            g.written_work, g.performance_task, g.quarterly_assessment,
            g.final_grade, g.remarks, g.school_id]);
        snapshotCount++;
      }
    }

    // 2. Archive the year
    const result = await query(`
      UPDATE academic_years 
      SET is_archived = true, is_current = false, archived_at = NOW(), archived_by = $2
      WHERE id = $1 
      RETURNING *
    `, [id, userId]);

    res.json({
      message: `Academic year ${result.rows[0].name} archived. ${snapshotCount} grade records preserved.`,
      data: result.rows[0],
      grades_preserved: snapshotCount
    });
  } catch (error) {
    console.error('Archive year error:', error);
    res.status(500).json({ error: error.message || 'Failed to archive academic year' });
  }
});

// GET - Check if academic year is writable
router.get('/academic_years/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT id, name, is_current, is_archived FROM academic_years WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Academic year not found' });
    }

    const year = result.rows[0];
    res.json({
      id: year.id,
      name: year.name,
      is_current: year.is_current,
      is_archived: year.is_archived,
      is_writable: year.is_current && !year.is_archived,
      is_read_only: year.is_archived || !year.is_current
    });
  } catch (error) {
    console.error('Year status error:', error);
    res.status(500).json({ error: 'Failed to get year status' });
  }
});

export default router;
