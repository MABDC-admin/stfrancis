/**
 * Student Ledger PDF Export Utility
 * Generates a comprehensive financial statement for a student's academic year
 */
import { db } from '@/lib/db-client';
import { format } from 'date-fns';

interface StudentInfo {
  id: string;
  student_name: string;
  lrn: string;
  level: string;
}

interface StatementData {
  id: string;
  total_amount: number;
  discount_amount: number;
  net_amount: number;
  total_paid: number;
  balance: number;
  status: string;
  assessed_at: string;
  is_closed: boolean;
}

interface StatementItem {
  name: string;
  amount: number;
  is_mandatory: boolean;
}

interface DiscountRecord {
  id: string;
  discount_name: string;
  discount_type: string;
  applied_amount: number;
  status: string;
  approved_at: string | null;
}

interface PaymentPlan {
  id: string;
  plan_type: string;
  total_installments: number;
  grace_period_days: number;
  late_fee_amount: number;
  installments: PaymentInstallment[];
}

interface PaymentInstallment {
  installment_number: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  or_number: string;
  reference_number: string;
  status: string;
  notes: string;
}

interface TransactionEntry {
  date: string;
  type: 'charge' | 'discount' | 'payment' | 'adjustment';
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerExportData {
  student: StudentInfo;
  statement: StatementData;
  statementItems: StatementItem[];
  discounts: DiscountRecord[];
  paymentPlan: PaymentPlan | null;
  payments: PaymentRecord[];
  transactions: TransactionEntry[];
}

/**
 * Fetch all ledger data for a student's account statement
 */
export async function fetchStudentLedgerData(
  statementId: string,
  schoolId: string,
  academicYearId: string
): Promise<LedgerExportData | null> {
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

    // Fetch applied discounts with discount names (client-side join)
    const { data: discountsData } = await db
      .from('student_discounts')
      .select('*')
      .eq('assessment_id', statementId)
      .order('created_at');
    
    let discounts: DiscountRecord[] = [];
    if (discountsData && (discountsData as any[]).length > 0) {
      const discountIds = [...new Set((discountsData as any[]).map((d: any) => d.discount_id).filter(Boolean))];
      const { data: discountDefs } = await db.from('discounts').select('id, name, type').in('id', discountIds);
      const discountMap: Record<string, any> = {};
      ((discountDefs || []) as any[]).forEach((d: any) => { discountMap[d.id] = d; });
      
      discounts = (discountsData as any[]).map((d: any) => ({
        id: d.id,
        discount_name: discountMap[d.discount_id]?.name || 'Unknown Discount',
        discount_type: discountMap[d.discount_id]?.type || 'fixed',
        applied_amount: Number(d.applied_amount),
        status: d.status,
        approved_at: d.approved_at,
      }));
    }

    // Fetch payment plan and installments
    let paymentPlan: PaymentPlan | null = null;
    const { data: planData } = await db
      .from('payment_plans')
      .select('*')
      .eq('assessment_id', statementId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (planData && (planData as any[]).length > 0) {
      const plan = (planData as any[])[0];
      const { data: installmentsData } = await db
        .from('payment_plan_installments')
        .select('*')
        .eq('plan_id', plan.id)
        .order('installment_number');
      
      paymentPlan = {
        id: plan.id,
        plan_type: plan.plan_type,
        total_installments: plan.total_installments,
        grace_period_days: plan.grace_period_days,
        late_fee_amount: Number(plan.late_fee_amount),
        installments: ((installmentsData || []) as any[]).map((i: any) => ({
          installment_number: i.installment_number,
          due_date: i.due_date,
          amount: Number(i.amount),
          paid_amount: Number(i.paid_amount || 0),
          status: i.status,
        })),
      };
    }

    // Fetch all payments
    const { data: paymentsData } = await db
      .from('payments')
      .select('*')
      .eq('assessment_id', statementId)
      .order('payment_date');
    
    const payments: PaymentRecord[] = ((paymentsData || []) as any[]).map((p: any) => ({
      id: p.id,
      amount: Number(p.amount),
      payment_date: p.payment_date,
      payment_method: p.payment_method,
      or_number: p.or_number || '',
      reference_number: p.reference_number || '',
      status: p.status,
      notes: p.notes || '',
    }));

    // Build chronological transaction ledger
    const transactions: TransactionEntry[] = [];
    let runningBalance = 0;

    // 1. Add initial statement charges
    const statementDate = (statement as any).assessed_at || (statement as any).created_at;
    statementItems.forEach((item) => {
      runningBalance += item.amount;
      transactions.push({
        date: statementDate,
        type: 'charge',
        description: `${item.name}${item.is_mandatory ? '' : ' (Optional)'}`,
        debit: item.amount,
        credit: 0,
        balance: runningBalance,
      });
    });

    // 2. Add discounts (approved only)
    discounts.filter(d => d.status === 'approved').forEach((disc) => {
      runningBalance -= disc.applied_amount;
      transactions.push({
        date: disc.approved_at || statementDate,
        type: 'discount',
        description: `Discount: ${disc.discount_name}`,
        debit: 0,
        credit: disc.applied_amount,
        balance: Math.max(0, runningBalance),
      });
    });

    // 3. Add payments (verified only)
    payments.filter(p => p.status === 'verified').forEach((pay) => {
      runningBalance -= pay.amount;
      transactions.push({
        date: pay.payment_date,
        type: 'payment',
        description: `Payment (${pay.or_number || 'OR N/A'}) - ${pay.payment_method?.replace(/_/g, ' ') || 'Cash'}`,
        debit: 0,
        credit: pay.amount,
        balance: Math.max(0, runningBalance),
      });
    });

    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Recalculate running balance after sorting
    let sortedBalance = 0;
    transactions.forEach((t) => {
      sortedBalance += t.debit - t.credit;
      t.balance = Math.max(0, sortedBalance);
    });

    return {
      student: student as StudentInfo,
      statement: statement as StatementData,
      statementItems,
      discounts,
      paymentPlan,
      payments,
      transactions,
    };
  } catch (error) {
    console.error('Error fetching ledger data:', error);
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
    return format(new Date(dateStr), 'MMM dd, yyyy');
  } catch {
    return dateStr || '—';
  }
};

/**
 * Generate and open PDF in new window for printing
 */
export function generateStudentLedgerPdf(
  data: LedgerExportData,
  schoolName: string,
  academicYearName: string,
  schoolAddress?: string
): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) {
    alert('Please allow popups to generate the PDF');
    return;
  }

  const { student, statement, statementItems, discounts, paymentPlan, payments, transactions } = data;
  
  // Filter verified payments and approved discounts
  const verifiedPayments = payments.filter(p => p.status === 'verified');
  const approvedDiscounts = discounts.filter(d => d.status === 'approved');
  const totalDiscounts = approvedDiscounts.reduce((sum, d) => sum + d.applied_amount, 0);
  const totalPayments = verifiedPayments.reduce((sum, p) => sum + p.amount, 0);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Student Ledger - ${student.student_name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11px; color: #333; padding: 20px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
    .header h1 { font-size: 18px; color: #1e40af; margin-bottom: 4px; }
    .header .school-address { font-size: 11px; color: #64748b; margin-bottom: 8px; }
    .header h2 { font-size: 14px; font-weight: normal; color: #666; margin-bottom: 8px; }
    .header .subtitle { font-size: 12px; color: #666; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 12px; font-weight: bold; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-item { display: flex; gap: 8px; }
    .info-label { color: #666; min-width: 100px; }
    .info-value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { padding: 6px 8px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f8fafc; font-weight: 600; font-size: 10px; text-transform: uppercase; color: #475569; }
    td { font-size: 11px; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 600; }
    .text-green { color: #059669; }
    .text-red { color: #dc2626; }
    .text-blue { color: #2563eb; }
    .text-gray { color: #6b7280; }
    .bg-yellow { background: #fef3c7; }
    .bg-green { background: #d1fae5; }
    .bg-red { background: #fee2e2; }
    .total-row { background: #f1f5f9; font-weight: 600; }
    .summary-box { border: 2px solid #2563eb; border-radius: 8px; padding: 15px; margin-top: 15px; background: #eff6ff; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; text-align: center; }
    .summary-item { }
    .summary-label { font-size: 10px; color: #64748b; text-transform: uppercase; }
    .summary-value { font-size: 16px; font-weight: 700; margin-top: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-partial { background: #dbeafe; color: #1e40af; }
    .badge-voided { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
    .voided-row { opacity: 0.5; text-decoration: line-through; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 10px; color: #9ca3af; }
    .page-break { page-break-before: always; }
    @media print {
      body { padding: 10px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${schoolName || 'St. Francis Xavier Smart Academy Inc'}</h1>
    <div class="school-address">${schoolAddress || 'Sitio Cagbolo, Brgy. Conalum Inopacan, Leyte 6522'}</div>
    <h2>STUDENT FINANCIAL STATEMENT</h2>
    <div class="subtitle">Academic Year: ${academicYearName} | Generated: ${formatDate(new Date().toISOString())}</div>
  </div>

  <!-- Student Information -->
  <div class="section">
    <div class="section-title">Student Information</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Name:</span><span class="info-value">${student.student_name}</span></div>
      <div class="info-item"><span class="info-label">LRN:</span><span class="info-value">${student.lrn || '—'}</span></div>
      <div class="info-item"><span class="info-label">Grade Level:</span><span class="info-value">${student.level || '—'}</span></div>
      <div class="info-item"><span class="info-label">Statement Date:</span><span class="info-value">${formatDate(statement.assessed_at)}</span></div>
    </div>
  </div>

  <!-- Summary Box -->
  <div class="summary-box">
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-label">Total Charges</div>
        <div class="summary-value">${formatCurrency(Number(statement.total_amount))}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Discounts</div>
        <div class="summary-value text-blue">${formatCurrency(totalDiscounts)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Total Paid</div>
        <div class="summary-value text-green">${formatCurrency(totalPayments)}</div>
      </div>
      <div class="summary-item">
        <div class="summary-label">Balance Due</div>
        <div class="summary-value ${Number(statement.balance) > 0 ? 'text-red' : 'text-green'}">${formatCurrency(Number(statement.balance))}</div>
      </div>
    </div>
  </div>

  <!-- Fee Breakdown -->
  <div class="section" style="margin-top: 20px;">
    <div class="section-title">Tuition & Fees Breakdown</div>
    <table>
      <thead>
        <tr>
          <th style="width: 75%">Description</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${statementItems.map((item: StatementItem) => `
          <tr>
            <td>${item.name}</td>
            <td class="text-right">${formatCurrency(item.amount)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td class="text-right font-bold">Total Charges:</td>
          <td class="text-right font-bold">${formatCurrency(Number(statement.total_amount))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${approvedDiscounts.length > 0 ? `
  <!-- Applied Discounts -->
  <div class="section">
    <div class="section-title">Applied Discounts & Scholarships</div>
    <table>
      <thead>
        <tr>
          <th>Discount Name</th>
          <th>Type</th>
          <th class="text-center">Status</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${approvedDiscounts.map(disc => `
          <tr>
            <td>${disc.discount_name}</td>
            <td class="text-center" style="text-transform: capitalize">${disc.discount_type}</td>
            <td class="text-center"><span class="badge badge-paid">Approved</span></td>
            <td class="text-right text-blue">-${formatCurrency(disc.applied_amount)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="3" class="text-right font-bold">Total Discounts:</td>
          <td class="text-right font-bold text-blue">-${formatCurrency(totalDiscounts)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" class="text-right font-bold">Net Amount Due:</td>
          <td class="text-right font-bold">${formatCurrency(Number(statement.net_amount))}</td>
        </tr>
      </tbody>
    </table>
  </div>
  ` : ''}

  ${paymentPlan ? `
  <!-- Payment Plan -->
  <div class="section">
    <div class="section-title">Payment Plan (${paymentPlan.plan_type.charAt(0).toUpperCase() + paymentPlan.plan_type.slice(1)})</div>
    <div class="info-grid" style="margin-bottom: 10px;">
      <div class="info-item"><span class="info-label">Total Installments:</span><span class="info-value">${paymentPlan.total_installments}</span></div>
      <div class="info-item"><span class="info-label">Grace Period:</span><span class="info-value">${paymentPlan.grace_period_days} days</span></div>
      <div class="info-item"><span class="info-label">Late Fee:</span><span class="info-value">${formatCurrency(paymentPlan.late_fee_amount)}</span></div>
    </div>
    <table>
      <thead>
        <tr>
          <th class="text-center">#</th>
          <th>Due Date</th>
          <th class="text-right">Amount</th>
          <th class="text-right">Paid</th>
          <th class="text-center">Status</th>
        </tr>
      </thead>
      <tbody>
        ${paymentPlan.installments.map(inst => `
          <tr>
            <td class="text-center">${inst.installment_number}</td>
            <td>${formatDate(inst.due_date)}</td>
            <td class="text-right">${formatCurrency(inst.amount)}</td>
            <td class="text-right ${inst.paid_amount > 0 ? 'text-green' : ''}">${formatCurrency(inst.paid_amount)}</td>
            <td class="text-center">
              <span class="badge ${inst.status === 'paid' ? 'badge-paid' : inst.status === 'overdue' ? 'bg-red' : 'badge-pending'}">${inst.status}</span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <!-- Payment History -->
  <div class="section">
    <div class="section-title">Payment History</div>
    ${payments.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>OR Number</th>
          <th>Method</th>
          <th>Reference</th>
          <th class="text-center">Status</th>
          <th class="text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${payments.map(pay => `
          <tr class="${pay.status === 'voided' ? 'voided-row' : ''}">
            <td>${formatDate(pay.payment_date)}</td>
            <td>${pay.or_number || '—'}</td>
            <td style="text-transform: capitalize">${pay.payment_method?.replace(/_/g, ' ') || 'Cash'}</td>
            <td>${pay.reference_number || '—'}</td>
            <td class="text-center">
              <span class="badge ${pay.status === 'verified' ? 'badge-paid' : pay.status === 'voided' ? 'badge-voided' : 'badge-pending'}">${pay.status}</span>
            </td>
            <td class="text-right ${pay.status === 'verified' ? 'text-green' : ''}">${formatCurrency(pay.amount)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="5" class="text-right font-bold">Total Payments (Verified):</td>
          <td class="text-right font-bold text-green">${formatCurrency(totalPayments)}</td>
        </tr>
      </tbody>
    </table>
    ` : '<p class="text-gray" style="padding: 10px;">No payments recorded</p>'}
  </div>

  <!-- Complete Transaction Ledger -->
  <div class="section page-break">
    <div class="section-title">Complete Transaction Ledger</div>
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th class="text-right">Debit (Charges)</th>
          <th class="text-right">Credit (Payments)</th>
          <th class="text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(t => `
          <tr>
            <td>${formatDate(t.date)}</td>
            <td>${t.description}</td>
            <td class="text-right ${t.debit > 0 ? 'text-red' : ''}">${t.debit > 0 ? formatCurrency(t.debit) : '—'}</td>
            <td class="text-right ${t.credit > 0 ? 'text-green' : ''}">${t.credit > 0 ? formatCurrency(t.credit) : '—'}</td>
            <td class="text-right font-bold">${formatCurrency(t.balance)}</td>
          </tr>
        `).join('')}
        <tr class="total-row">
          <td colspan="2" class="text-right font-bold">Final Balance:</td>
          <td class="text-right font-bold text-red">${formatCurrency(Number(statement.total_amount))}</td>
          <td class="text-right font-bold text-green">${formatCurrency(totalDiscounts + totalPayments)}</td>
          <td class="text-right font-bold ${Number(statement.balance) > 0 ? 'text-red' : 'text-green'}">${formatCurrency(Number(statement.balance))}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer">
    <p>This is a computer-generated document. No signature required.</p>
    <p style="margin-top: 4px;">For inquiries, please contact the Finance Office.</p>
  </div>

  <script>
    window.onload = function() { 
      window.print(); 
    };
  </script>
</body>
</html>
`;

  win.document.write(html);
  win.document.close();
}

/**
 * Main export function - fetches data and generates PDF
 */
export async function exportStudentLedgerPdf(
  assessmentId: string,
  schoolId: string,
  academicYearId: string,
  schoolName: string,
  academicYearName: string,
  schoolAddress?: string
): Promise<boolean> {
  try {
    const data = await fetchStudentLedgerData(assessmentId, schoolId, academicYearId);
    
    if (!data) {
      throw new Error('Could not fetch ledger data');
    }

    generateStudentLedgerPdf(data, schoolName, academicYearName, schoolAddress);
    return true;
  } catch (error) {
    console.error('Error exporting ledger PDF:', error);
    return false;
  }
}
