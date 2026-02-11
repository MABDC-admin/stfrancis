/**
 * Account Statement PDF Export Utility
 * Generates Tuition Overview and Statement Details PDFs when an account statement is created
 */
import { db } from '@/lib/db-client';
import { format } from 'date-fns';

interface SchoolSettings {
  name: string;
  acronym: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
}

interface StudentInfo {
  id: string;
  student_name: string;
  lrn: string;
  level: string;
}

interface StatementItem {
  name: string;
  amount: number;
  is_mandatory: boolean;
}

interface StatementData {
  id: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  balance: number;
  status: string;
  assessed_at: string;
  template_name?: string;
}

interface DiscountRecord {
  discount_name: string;
  discount_type: string;
  applied_amount: number;
  status: string;
}

interface PaymentSchedule {
  plan_type: string;
  total_installments: number;
  installments: {
    installment_number: number;
    due_date: string;
    amount: number;
  }[];
}

interface StatementPdfData {
  student: StudentInfo;
  statement: StatementData;
  statementItems: StatementItem[];
  discounts: DiscountRecord[];
  paymentSchedule: PaymentSchedule | null;
  schoolSettings: SchoolSettings;
  academicYear: string;
}

/**
 * Fetch all data needed for account statement PDFs
 */
export async function fetchStatementPdfData(
  statementId: string,
  schoolCode: string
): Promise<StatementPdfData | null> {
  try {
    // Fetch statement from student_assessments table
    const { data: statement, error: stmtErr } = await db
      .from('student_assessments')
      .select('*')
      .eq('id', statementId)
      .single();
    
    if (stmtErr || !statement) {
      console.error('Error fetching statement:', stmtErr);
      return null;
    }

    // Fetch student info
    const { data: student, error: stuErr } = await db
      .from('students')
      .select('id, student_name, lrn, level')
      .eq('id', (statement as any).student_id)
      .single();
    
    if (stuErr || !student) {
      console.error('Error fetching student:', stuErr);
      return null;
    }

    // Fetch statement items from assessment_items table
    const { data: itemsData } = await db
      .from('assessment_items')
      .select('*')
      .eq('assessment_id', statementId)
      .order('name');
    
    const statementItems: StatementItem[] = ((itemsData || []) as any[]).map((i: any) => ({
      name: i.name,
      amount: Number(i.amount),
      is_mandatory: i.is_mandatory,
    }));

    // Fetch template name if template_id exists
    let templateName = '';
    if ((statement as any).template_id) {
      const { data: template } = await db
        .from('fee_templates')
        .select('name')
        .eq('id', (statement as any).template_id)
        .single();
      templateName = (template as any)?.name || '';
    }

    // Fetch applied discounts with discount names (client-side join)
    let discounts: DiscountRecord[] = [];
    const { data: discountsData } = await db
      .from('student_discounts')
      .select('*')
      .eq('assessment_id', statementId);
    
    if (discountsData && (discountsData as any[]).length > 0) {
      const discountIds = [...new Set((discountsData as any[]).map((d: any) => d.discount_id).filter(Boolean))];
      const { data: discountDefs } = await db.from('discounts').select('id, name, type').in('id', discountIds);
      const discountMap: Record<string, any> = {};
      ((discountDefs || []) as any[]).forEach((d: any) => { discountMap[d.id] = d; });
      
      discounts = (discountsData as any[]).map((d: any) => ({
        discount_name: discountMap[d.discount_id]?.name || 'Unknown Discount',
        discount_type: discountMap[d.discount_id]?.type || 'fixed',
        applied_amount: Number(d.applied_amount),
        status: d.status,
      }));
    }

    // Fetch payment plan if exists
    let paymentSchedule: PaymentSchedule | null = null;
    const { data: planData } = await db
      .from('payment_plans')
      .select('*')
      .eq('assessment_id', statementId)
      .limit(1);
    
    if (planData && (planData as any[]).length > 0) {
      const plan = (planData as any[])[0];
      const { data: installmentsData } = await db
        .from('payment_plan_installments')
        .select('*')
        .eq('plan_id', plan.id)
        .order('installment_number');
      
      paymentSchedule = {
        plan_type: plan.plan_type,
        total_installments: plan.total_installments,
        installments: ((installmentsData || []) as any[]).map((i: any) => ({
          installment_number: i.installment_number,
          due_date: i.due_date,
          amount: Number(i.amount),
        })),
      };
    }

    // Fetch school settings
    const { data: settingsData } = await db
      .from('school_settings')
      .select('*')
      .eq('school_id', schoolCode)
      .single();
    
    const schoolSettings: SchoolSettings = {
      name: (settingsData as any)?.name || 'St. Francis Xavier Smart Academy Inc',
      acronym: (settingsData as any)?.acronym || 'SFXSAI',
      address: (settingsData as any)?.address || 'Sitio Cagbolo, Brgy. Conalum Inopacan, Leyte 6522',
      phone: (settingsData as any)?.phone || '',
      email: (settingsData as any)?.email || '',
      website: (settingsData as any)?.website || '',
      logo_url: (settingsData as any)?.logo_url || '',
    };

    // Fetch academic year name
    let academicYear = '';
    if ((statement as any).academic_year_id) {
      const { data: yearData } = await db
        .from('academic_years')
        .select('name')
        .eq('id', (statement as any).academic_year_id)
        .single();
      academicYear = (yearData as any)?.name || '';
    }

    return {
      student: student as StudentInfo,
      statement: {
        ...(statement as StatementData),
        template_name: templateName,
      },
      statementItems,
      discounts,
      paymentSchedule,
      schoolSettings,
      academicYear,
    };
  } catch (error) {
    console.error('Error fetching statement PDF data:', error);
    return null;
  }
}

/**
 * Format currency for display
 */
const formatCurrency = (amount: number): string => {
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Format date for display
 */
const formatDate = (dateStr: string): string => {
  try {
    return format(new Date(dateStr), 'MMMM dd, yyyy');
  } catch {
    return dateStr || '—';
  }
};

/**
 * Sanitize filename - remove invalid characters
 */
const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '_');
};

/**
 * Generate the school letterhead HTML
 */
const generateLetterhead = (settings: SchoolSettings): string => {
  return `
    <div class="letterhead">
      <div class="logo-section">
        ${settings.logo_url 
          ? `<img src="${settings.logo_url}" alt="School Logo" class="school-logo" />` 
          : `<div class="logo-placeholder"><span>${settings.acronym || 'S'}</span></div>`
        }
      </div>
      <div class="school-info">
        <h1 class="school-name">${settings.name}</h1>
        ${settings.address ? `<p class="school-address">${settings.address}</p>` : ''}
        <div class="contact-row">
          ${settings.phone ? `<span class="contact-item">Tel: ${settings.phone}</span>` : ''}
          ${settings.email ? `<span class="contact-item">Email: ${settings.email}</span>` : ''}
          ${settings.website ? `<span class="contact-item">Web: ${settings.website}</span>` : ''}
        </div>
      </div>
    </div>
  `;
};

/**
 * Generate common CSS styles for PDFs
 */
const generateStyles = (): string => {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      font-size: 11px; 
      color: #333; 
      padding: 25px 30px; 
      max-width: 800px; 
      margin: 0 auto;
      line-height: 1.4;
    }
    .letterhead { display: flex; align-items: center; gap: 20px; padding-bottom: 15px; border-bottom: 3px solid #2563eb; margin-bottom: 20px; }
    .logo-section { flex-shrink: 0; }
    .school-logo { width: 80px; height: 80px; object-fit: contain; }
    .logo-placeholder { width: 80px; height: 80px; border-radius: 12px; background: linear-gradient(135deg, #2563eb, #1d4ed8); display: flex; align-items: center; justify-content: center; }
    .logo-placeholder span { font-size: 28px; font-weight: bold; color: white; }
    .school-info { flex: 1; }
    .school-name { font-size: 20px; color: #1e40af; font-weight: 700; margin-bottom: 4px; }
    .school-address { font-size: 11px; color: #4b5563; margin-bottom: 4px; }
    .contact-row { display: flex; gap: 15px; flex-wrap: wrap; }
    .contact-item { font-size: 10px; color: #6b7280; }
    .doc-title { text-align: center; margin-bottom: 20px; }
    .doc-title h2 { font-size: 16px; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 5px; }
    .doc-title .subtitle { font-size: 11px; color: #64748b; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 11px; font-weight: 700; color: #1e40af; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; }
    .info-item { display: flex; gap: 8px; }
    .info-label { color: #64748b; min-width: 110px; font-size: 10px; }
    .info-value { font-weight: 600; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 8px 10px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f8fafc; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #475569; }
    td { font-size: 11px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 600; }
    .text-green { color: #059669; }
    .text-red { color: #dc2626; }
    .text-blue { color: #2563eb; }
    .text-gray { color: #6b7280; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
    .badge-mandatory { background: #dbeafe; color: #1e40af; }
    .badge-optional { background: #fef3c7; color: #92400e; }
    .badge-approved { background: #d1fae5; color: #065f46; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .total-row { background: #f1f5f9; font-weight: 600; }
    .summary-box { border: 2px solid #2563eb; border-radius: 8px; padding: 15px; background: #eff6ff; margin-top: 15px; }
    .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center; }
    .summary-label { font-size: 10px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .summary-value { font-size: 18px; font-weight: 700; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; }
    .footer-notes { font-size: 10px; color: #6b7280; margin-bottom: 10px; }
    .footer-generated { text-align: center; font-size: 9px; color: #9ca3af; }
    .signature-section { margin-top: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .signature-box { text-align: center; }
    .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; }
    .signature-label { font-size: 10px; color: #64748b; }
    @media print { body { padding: 15px; } .no-print { display: none; } }
  `;
};

/**
 * Generate Learner Tuition Overview PDF
 */
export function generateTuitionOverviewPdf(data: StatementPdfData): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow popups to generate the PDF'); return; }

  const { student, statement, statementItems, discounts, schoolSettings, academicYear } = data;
  const approvedDiscounts = discounts.filter(d => d.status === 'approved');
  const totalDiscounts = approvedDiscounts.reduce((sum, d) => sum + d.applied_amount, 0);
  const mandatoryItems = statementItems.filter(i => i.is_mandatory);
  const optionalItems = statementItems.filter(i => !i.is_mandatory);
  const mandatoryTotal = mandatoryItems.reduce((sum, i) => sum + i.amount, 0);
  const optionalTotal = optionalItems.reduce((sum, i) => sum + i.amount, 0);

  const html = `<!DOCTYPE html><html><head>
  <title>Learner_Tuition_Overview_${sanitizeFilename(student.student_name)}_${sanitizeFilename(academicYear)}</title>
  <style>${generateStyles()}</style></head><body>
  ${generateLetterhead(schoolSettings)}
  <div class="doc-title"><h2>Learner Tuition Overview</h2><div class="subtitle">Academic Year ${academicYear}</div></div>
  <div class="section"><div class="section-title">Student Information</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Student Name:</span><span class="info-value">${student.student_name}</span></div>
      <div class="info-item"><span class="info-label">LRN:</span><span class="info-value">${student.lrn || 'N/A'}</span></div>
      <div class="info-item"><span class="info-label">Grade Level:</span><span class="info-value">${student.level || 'N/A'}</span></div>
      <div class="info-item"><span class="info-label">Statement Date:</span><span class="info-value">${formatDate(statement.assessed_at)}</span></div>
    </div></div>
  <div class="section"><div class="section-title">Tuition Fee Summary</div>
    <table><thead><tr><th style="width: 70%">Description</th><th class="text-right">Amount</th></tr></thead><tbody>
      <tr><td>Tuition and Mandatory Fees</td><td class="text-right">${formatCurrency(mandatoryTotal)}</td></tr>
      ${optionalTotal > 0 ? `<tr><td>Optional Fees</td><td class="text-right">${formatCurrency(optionalTotal)}</td></tr>` : ''}
      <tr class="total-row"><td><strong>Gross Total</strong></td><td class="text-right"><strong>${formatCurrency(Number(statement.total_amount))}</strong></td></tr>
      ${totalDiscounts > 0 ? `<tr><td class="text-blue">Less: Discounts & Scholarships</td><td class="text-right text-blue">-${formatCurrency(totalDiscounts)}</td></tr>` : ''}
      <tr class="total-row" style="background: #dbeafe;"><td><strong>Net Amount Due</strong></td><td class="text-right"><strong>${formatCurrency(Number(statement.net_amount))}</strong></td></tr>
    </tbody></table></div>
  ${approvedDiscounts.length > 0 ? `<div class="section"><div class="section-title">Applied Discounts & Scholarships</div>
    <table><thead><tr><th>Discount/Scholarship</th><th>Type</th><th class="text-right">Amount</th></tr></thead><tbody>
      ${approvedDiscounts.map(d => `<tr><td>${d.discount_name}</td><td class="text-center" style="text-transform: capitalize">${d.discount_type}</td><td class="text-right text-blue">-${formatCurrency(d.applied_amount)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
  ${data.paymentSchedule ? `<div class="section"><div class="section-title">Payment Schedule (${data.paymentSchedule.plan_type})</div>
    <table><thead><tr><th class="text-center">Installment</th><th>Due Date</th><th class="text-right">Amount</th></tr></thead><tbody>
      ${data.paymentSchedule.installments.map(inst => `<tr><td class="text-center">${inst.installment_number} of ${data.paymentSchedule!.total_installments}</td><td>${formatDate(inst.due_date)}</td><td class="text-right">${formatCurrency(inst.amount)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
  <div class="summary-box"><div class="summary-grid">
    <div><div class="summary-label">Total Charges</div><div class="summary-value">${formatCurrency(Number(statement.total_amount))}</div></div>
    <div><div class="summary-label">Total Discounts</div><div class="summary-value text-blue">${formatCurrency(totalDiscounts)}</div></div>
    <div><div class="summary-label">Amount Due</div><div class="summary-value ${Number(statement.net_amount) > 0 ? 'text-red' : 'text-green'}">${formatCurrency(Number(statement.net_amount))}</div></div>
  </div></div>
  <div class="footer"><div class="footer-notes"><strong>Important Notes:</strong><ul style="margin-left: 15px; margin-top: 5px;">
    <li>Please keep this document for your records.</li><li>Payments can be made at the Finance Office during school hours.</li><li>For inquiries, please contact the Finance Department.</li>
  </ul></div><div class="footer-generated">This document was generated on ${formatDate(new Date().toISOString())} | Statement ID: ${statement.id.substring(0, 8).toUpperCase()}</div></div>
  <script>window.onload = function() { document.title = "Learner_Tuition_Overview_${sanitizeFilename(student.student_name)}_${sanitizeFilename(academicYear)}"; window.print(); };</script>
</body></html>`;
  win.document.write(html);
  win.document.close();
}

/**
 * Generate Statement Details PDF
 */
export function generateStatementDetailsPdf(data: StatementPdfData): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow popups to generate the PDF'); return; }

  const { student, statement, statementItems, discounts, schoolSettings, academicYear } = data;
  const approvedDiscounts = discounts.filter(d => d.status === 'approved');
  const pendingDiscounts = discounts.filter(d => d.status === 'pending');
  const totalApprovedDiscounts = approvedDiscounts.reduce((sum, d) => sum + d.applied_amount, 0);

  const html = `<!DOCTYPE html><html><head>
  <title>Account_Statement_${sanitizeFilename(student.student_name)}_${sanitizeFilename(academicYear)}</title>
  <style>${generateStyles()}</style></head><body>
  ${generateLetterhead(schoolSettings)}
  <div class="doc-title"><h2>Account Statement Details</h2><div class="subtitle">Academic Year ${academicYear}</div></div>
  <div class="section"><div class="section-title">Statement Information</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Statement ID:</span><span class="info-value">${statement.id.substring(0, 8).toUpperCase()}</span></div>
      <div class="info-item"><span class="info-label">Statement Date:</span><span class="info-value">${formatDate(statement.assessed_at)}</span></div>
      ${statement.template_name ? `<div class="info-item"><span class="info-label">Fee Template:</span><span class="info-value">${statement.template_name}</span></div>` : ''}
      <div class="info-item"><span class="info-label">Status:</span><span class="info-value" style="text-transform: capitalize">${statement.status}</span></div>
    </div></div>
  <div class="section"><div class="section-title">Student Information</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Student Name:</span><span class="info-value">${student.student_name}</span></div>
      <div class="info-item"><span class="info-label">LRN:</span><span class="info-value">${student.lrn || 'N/A'}</span></div>
      <div class="info-item"><span class="info-label">Grade Level:</span><span class="info-value">${student.level || 'N/A'}</span></div>
      <div class="info-item"><span class="info-label">Academic Year:</span><span class="info-value">${academicYear}</span></div>
    </div></div>
  <div class="section"><div class="section-title">Detailed Fee Breakdown</div>
    <table><thead><tr><th style="width: 70%">Fee Description</th><th class="text-right">Amount</th></tr></thead><tbody>
      ${statementItems.map(item => `<tr><td>${item.name}</td><td class="text-right">${formatCurrency(item.amount)}</td></tr>`).join('')}
      <tr class="total-row"><td class="text-right"><strong>Total Charges:</strong></td><td class="text-right"><strong>${formatCurrency(Number(statement.total_amount))}</strong></td></tr>
    </tbody></table></div>
  ${discounts.length > 0 ? `<div class="section"><div class="section-title">Discounts & Scholarships</div>
    <table><thead><tr><th>Description</th><th class="text-center">Type</th><th class="text-center">Status</th><th class="text-right">Amount</th></tr></thead><tbody>
      ${discounts.map(d => `<tr><td>${d.discount_name}</td><td class="text-center" style="text-transform: capitalize">${d.discount_type}</td><td class="text-center"><span class="badge ${d.status === 'approved' ? 'badge-approved' : 'badge-pending'}">${d.status}</span></td><td class="text-right ${d.status === 'approved' ? 'text-blue' : 'text-gray'}">${d.status === 'approved' ? '-' : '('}${formatCurrency(d.applied_amount)}${d.status !== 'approved' ? ')' : ''}</td></tr>`).join('')}
      <tr class="total-row"><td colspan="3" class="text-right"><strong>Total Approved Discounts:</strong></td><td class="text-right text-blue"><strong>-${formatCurrency(totalApprovedDiscounts)}</strong></td></tr>
    </tbody></table>${pendingDiscounts.length > 0 ? `<p style="font-size: 10px; color: #92400e; margin-top: 8px;">* Amounts in parentheses are pending approval and not yet applied to the balance.</p>` : ''}</div>` : ''}
  ${data.paymentSchedule ? `<div class="section"><div class="section-title">Payment Schedule</div>
    <p style="margin-bottom: 10px; font-size: 11px;"><strong>Plan Type:</strong> ${data.paymentSchedule.plan_type.charAt(0).toUpperCase() + data.paymentSchedule.plan_type.slice(1)} | <strong>Total Installments:</strong> ${data.paymentSchedule.total_installments}</p>
    <table><thead><tr><th class="text-center">No.</th><th>Due Date</th><th class="text-right">Amount Due</th></tr></thead><tbody>
      ${data.paymentSchedule.installments.map(inst => `<tr><td class="text-center">${inst.installment_number}</td><td>${formatDate(inst.due_date)}</td><td class="text-right">${formatCurrency(inst.amount)}</td></tr>`).join('')}
    </tbody></table></div>` : ''}
  <div class="section"><div class="section-title">Financial Summary</div>
    <table><tbody>
      <tr><td style="width: 70%">Gross Total (Total Fees)</td><td class="text-right font-bold">${formatCurrency(Number(statement.total_amount))}</td></tr>
      <tr><td>Less: Approved Discounts</td><td class="text-right text-blue">-${formatCurrency(totalApprovedDiscounts)}</td></tr>
      <tr class="total-row" style="background: #dbeafe;"><td><strong>Net Amount Due</strong></td><td class="text-right"><strong>${formatCurrency(Number(statement.net_amount))}</strong></td></tr>
      <tr><td>Less: Payments Made</td><td class="text-right text-green">-${formatCurrency(Number((statement as any).total_paid || 0))}</td></tr>
      <tr class="total-row" style="background: ${Number(statement.balance) > 0 ? '#fee2e2' : '#d1fae5'};"><td><strong>Outstanding Balance</strong></td><td class="text-right ${Number(statement.balance) > 0 ? 'text-red' : 'text-green'}"><strong>${formatCurrency(Number(statement.balance))}</strong></td></tr>
    </tbody></table></div>
  <div class="signature-section"><div class="signature-box"><div class="signature-line"><div class="signature-label">Parent/Guardian Signature</div></div></div><div class="signature-box"><div class="signature-line"><div class="signature-label">Finance Officer</div></div></div></div>
  <div class="footer"><div class="footer-generated">Document generated on ${formatDate(new Date().toISOString())} | Statement ID: ${statement.id.substring(0, 8).toUpperCase()}</div></div>
  <script>window.onload = function() { document.title = "Account_Statement_${sanitizeFilename(student.student_name)}_${sanitizeFilename(academicYear)}"; window.print(); };</script>
</body></html>`;
  win.document.write(html);
  win.document.close();
}

/**
 * Main export function - fetches data and generates both PDFs
 */
export async function generateStatementPdfs(
  statementId: string,
  schoolCode: string,
  options?: { tuitionOverview?: boolean; statementDetails?: boolean; }
): Promise<boolean> {
  try {
    const data = await fetchStatementPdfData(statementId, schoolCode);
    if (!data) { console.error('Could not fetch statement PDF data'); return false; }
    const opts = { tuitionOverview: true, statementDetails: true, ...options };
    if (opts.tuitionOverview) generateTuitionOverviewPdf(data);
    if (opts.statementDetails) setTimeout(() => generateStatementDetailsPdf(data), 500);
    return true;
  } catch (error) { console.error('Error generating statement PDFs:', error); return false; }
}

/**
 * Generate single PDF - Tuition Overview only
 */
export async function exportTuitionOverviewPdf(statementId: string, schoolCode: string): Promise<boolean> {
  return generateStatementPdfs(statementId, schoolCode, { tuitionOverview: true, statementDetails: false });
}

/**
 * Generate single PDF - Statement Details only
 */
export async function exportStatementDetailsPdf(statementId: string, schoolCode: string): Promise<boolean> {
  return generateStatementPdfs(statementId, schoolCode, { tuitionOverview: false, statementDetails: true });
}
