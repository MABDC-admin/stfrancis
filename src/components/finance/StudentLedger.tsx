import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { exportStudentLedgerPdf } from '@/utils/studentLedgerPdfExport';
import { toast } from 'sonner';

const PaymentHistoryRow = ({ assessmentId, schoolId, isOpen }: { assessmentId: string; schoolId: string; isOpen: boolean }) => {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['payment-history', assessmentId, schoolId],
    queryFn: async () => {
      const { data } = await db
        .from('payments')
        .select('*')
        .eq('assessment_id', assessmentId)
        .eq('school_id', schoolId)
        .order('payment_date', { ascending: false });
      return data || [];
    },
    enabled: isOpen,
  });

  if (!isOpen) return null;

  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={9} className="p-0">
        <div className="px-8 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Payment History</p>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : payments && payments.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead className="h-8 text-xs">Date</TableHead>
                  <TableHead className="h-8 text-xs">OR #</TableHead>
                  <TableHead className="h-8 text-xs">Amount</TableHead>
                  <TableHead className="h-8 text-xs">Method</TableHead>
                  <TableHead className="h-8 text-xs">Ref #</TableHead>
                  <TableHead className="h-8 text-xs">Status</TableHead>
                  <TableHead className="h-8 text-xs">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => {
                  const isVoided = p.status === 'voided';
                  return (
                    <TableRow key={p.id} className={isVoided ? 'opacity-50' : ''}>
                      <TableCell className={`text-xs ${isVoided ? 'line-through' : ''}`}>
                        {p.payment_date ? format(new Date(p.payment_date), 'MMM dd, yyyy') : '—'}
                      </TableCell>
                      <TableCell className={`text-xs ${isVoided ? 'line-through' : ''}`}>{p.or_number || '—'}</TableCell>
                      <TableCell className={`text-xs ${isVoided ? 'line-through' : ''}`}>₱{Number(p.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{p.payment_method || '—'}</TableCell>
                      <TableCell className="text-xs">{p.reference_number || '—'}</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant={p.status === 'verified' ? 'default' : p.status === 'voided' ? 'destructive' : 'secondary'} className="text-[10px]">
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {isVoided && p.void_reason ? `[Voided: ${p.void_reason}]` : p.notes || '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-xs text-muted-foreground py-2">No payments recorded</p>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

export const StudentLedger = () => {
  const { selectedSchool } = useSchool();
  const { selectedYearId, selectedYear } = useAcademicYear();
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exportingId, setExportingId] = useState<string | null>(null);

  const { data: schoolData } = useQuery({
    queryKey: ['school-id-full', selectedSchool],
    queryFn: async () => {
      const { data } = await db.from('schools').select('id, name, code').eq('code', selectedSchool).single();
      return data;
    },
  });

  const { data: ledger = [] } = useQuery({
    queryKey: ['student-ledger', schoolData?.id, selectedYearId],
    queryFn: async () => {
      // Client-side join: fetch assessments + students separately
      let query = db.from('student_assessments').select('*').eq('school_id', schoolData!.id);
      if (selectedYearId) query = query.eq('academic_year_id', selectedYearId);
      const { data: rawAssessments } = await query.order('created_at', { ascending: false });
      if (!rawAssessments || (rawAssessments as any[]).length === 0) return [];
      const studentIds = [...new Set((rawAssessments as any[]).map((a: any) => a.student_id).filter(Boolean))];
      const { data: studentsData } = await db.from('students').select('id, student_name, lrn, level').in('id', studentIds);
      const studentMap: Record<string, any> = {};
      ((studentsData || []) as any[]).forEach((s: any) => { studentMap[s.id] = s; });
      return (rawAssessments as any[]).map((a: any) => ({ ...a, students: studentMap[a.student_id] || null }));
    },
    enabled: !!schoolData?.id,
  });

  const filtered = ledger.filter((a: any) => {
    const name = a.students?.student_name?.toLowerCase() || '';
    const lrn = a.students?.lrn?.toLowerCase() || '';
    return name.includes(search.toLowerCase()) || lrn.includes(search.toLowerCase());
  });

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExportPdf = async (assessmentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!schoolData?.id || !selectedYearId) {
      toast.error('School or academic year not selected');
      return;
    }

    setExportingId(assessmentId);
    try {
      const success = await exportStudentLedgerPdf(
        assessmentId,
        schoolData.id,
        selectedYearId,
        (schoolData as any).name || selectedSchool,
        selectedYear?.name || 'Academic Year'
      );
      if (!success) {
        toast.error('Failed to generate PDF. Please try again.');
      }
    } catch (error) {
      console.error('Export error:', error);
      toast.error('An error occurred while generating the PDF');
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Student Ledger</h1>
        <p className="text-muted-foreground">Complete student account view</p>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search student..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Student</TableHead>
                <TableHead>LRN</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Total Charges</TableHead>
                <TableHead>Discounts</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: any) => {
                const isExpanded = expandedRows.has(a.id);
                return (
                  <>
                    <TableRow key={a.id} className="cursor-pointer" onClick={() => toggleRow(a.id)}>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{a.students?.student_name}</TableCell>
                      <TableCell>{a.students?.lrn}</TableCell>
                      <TableCell>{a.students?.level}</TableCell>
                      <TableCell>₱{Number(a.total_amount).toLocaleString()}</TableCell>
                      <TableCell>₱{Number(a.discount_amount).toLocaleString()}</TableCell>
                      <TableCell>₱{Number(a.total_paid).toLocaleString()}</TableCell>
                      <TableCell className="font-bold">₱{Number(a.balance).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === 'paid' ? 'default' : a.status === 'partial' ? 'secondary' : 'outline'}>{a.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={(e) => handleExportPdf(a.id, e)}
                          disabled={exportingId === a.id}
                          title="Export Financial Statement PDF"
                        >
                          {exportingId === a.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <FileText className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">PDF</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                    <PaymentHistoryRow key={`${a.id}-history`} assessmentId={a.id} schoolId={schoolData?.id || ''} isOpen={isExpanded} />
                  </>
                );
              })}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No records found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
