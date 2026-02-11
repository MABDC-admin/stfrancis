import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Search, UserPlus, Tag, Banknote, FileText, MoreHorizontal, Loader2, Pencil, Trash2, AlertTriangle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { 
  generateStatementPdfs, 
  exportTuitionOverviewPdf, 
  exportStatementDetailsPdf 
} from '@/utils/accountStatementPdfExport';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  partial: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overpaid: 'bg-purple-100 text-purple-800',
  closed: 'bg-red-100 text-red-800',
};

export const AccountStatementsContent = () => {
  const { selectedSchool } = useSchool();
  const { selectedYearId } = useAcademicYear();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [assessOpen, setAssessOpen] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Discount dialog state
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAssessment, setDiscountAssessment] = useState<any>(null);
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(null);

  // PDF export loading state
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  // Edit dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<any>(null);
  const [editTemplateId, setEditTemplateId] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAssessment, setDeletingAssessment] = useState<any>(null);

  // Close confirmation state
  const [closeOpen, setCloseOpen] = useState(false);
  const [closingAssessment, setClosingAssessment] = useState<any>(null);

  const { data: schoolData } = useQuery({
    queryKey: ['school-id', selectedSchool],
    queryFn: async () => {
      const { data } = await db.from('schools').select('id').eq('code', selectedSchool).single();
      return data;
    },
  });

  const { data: assessments = [] } = useQuery({
    queryKey: ['student-assessments', schoolData?.id, selectedYearId],
    queryFn: async () => {
      let query = db.from('student_assessments').select('*').eq('school_id', schoolData!.id);
      if (selectedYearId) query = query.eq('academic_year_id', selectedYearId);
      const { data: rawAssessments } = await query.order('created_at', { ascending: false });
      if (!rawAssessments || rawAssessments.length === 0) return [];
      // Client-side join: fetch student info
      const studentIds = [...new Set((rawAssessments as any[]).map((a: any) => a.student_id).filter(Boolean))];
      const { data: studentsData } = await db.from('students').select('id, student_name, lrn, level').in('id', studentIds);
      const studentMap: Record<string, any> = {};
      (studentsData || []).forEach((s: any) => { studentMap[s.id] = s; });
      return (rawAssessments as any[]).map((a: any) => ({ ...a, students: studentMap[a.student_id] || null }));
    },
    enabled: !!schoolData?.id,
  });

  // Students for the assess dialog
  const { data: students = [] } = useQuery({
    queryKey: ['students-for-assess', schoolData?.id, selectedYearId, studentSearch],
    queryFn: async () => {
      // First, get students who already have active assessments for this year
      const { data: existingAssessments } = await db
        .from('student_assessments')
        .select('student_id')
        .eq('school_id', schoolData!.id)
        .eq('academic_year_id', selectedYearId!)
        .eq('is_closed', false);
      
      const excludedStudentIds = new Set((existingAssessments || []).map((a: any) => a.student_id));

      const { data } = await db.from('students').select('id, student_name, lrn, level').eq('school_id', schoolData!.id).eq('academic_year_id', selectedYearId!).limit(50).order('student_name');
      if (!data) return [];
      
      // Filter out students with active assessments
      let filtered = (data as any[]).filter((s: any) => !excludedStudentIds.has(s.id));
      
      // Apply search filter
      if (studentSearch) {
        const q = studentSearch.toLowerCase();
        filtered = filtered.filter((s: any) => s.student_name?.toLowerCase().includes(q) || s.lrn?.toLowerCase().includes(q));
      }
      
      return filtered.slice(0, 20);
    },
    enabled: !!schoolData?.id && !!selectedYearId && assessOpen,
  });

  // Templates for the assess dialog
  const { data: templates = [] } = useQuery({
    queryKey: ['fee-templates-active', schoolData?.id, selectedYearId],
    queryFn: async () => {
      let query = db.from('fee_templates').select('*').eq('school_id', schoolData!.id).eq('is_active', true);
      if (selectedYearId) query = query.eq('academic_year_id', selectedYearId);
      const { data } = await query.order('grade_level');
      return data || [];
    },
    enabled: !!schoolData?.id && (assessOpen || editOpen),
  });

  // Template items preview
  const { data: templateItems = [] } = useQuery({
    queryKey: ['fee-template-items-preview', selectedTemplateId],
    queryFn: async () => {
      const { data: items } = await db.from('fee_template_items').select('*').eq('template_id', selectedTemplateId!);
      if (!items || items.length === 0) return [];
      const catalogIds = [...new Set((items as any[]).map((i: any) => i.fee_catalog_id).filter(Boolean))];
      if (catalogIds.length > 0) {
        const { data: catalogs } = await db.from('fee_catalog').select('id, name').in('id', catalogIds);
        const catalogMap: Record<string, string> = {};
        (catalogs || []).forEach((c: any) => { catalogMap[c.id] = c.name; });
        return (items as any[]).map((i: any) => ({ ...i, fee_catalog: { name: catalogMap[i.fee_catalog_id] || 'Unknown' } }));
      }
      return items || [];
    },
    enabled: !!selectedTemplateId,
  });

  // Edit template items preview
  const { data: editTemplateItems = [] } = useQuery({
    queryKey: ['fee-template-items-edit', editTemplateId],
    queryFn: async () => {
      const { data: items } = await db.from('fee_template_items').select('*').eq('template_id', editTemplateId!);
      if (!items || items.length === 0) return [];
      const catalogIds = [...new Set((items as any[]).map((i: any) => i.fee_catalog_id).filter(Boolean))];
      if (catalogIds.length > 0) {
        const { data: catalogs } = await db.from('fee_catalog').select('id, name').in('id', catalogIds);
        const catalogMap: Record<string, string> = {};
        (catalogs || []).forEach((c: any) => { catalogMap[c.id] = c.name; });
        return (items as any[]).map((i: any) => ({ ...i, fee_catalog: { name: catalogMap[i.fee_catalog_id] || 'Unknown' } }));
      }
      return items || [];
    },
    enabled: !!editTemplateId,
  });

  // Available discounts
  const { data: availableDiscounts = [] } = useQuery({
    queryKey: ['discounts-active', schoolData?.id],
    queryFn: async () => {
      const { data } = await db.from('discounts').select('*').eq('school_id', schoolData!.id).eq('is_active', true).order('name');
      return data || [];
    },
    enabled: !!schoolData?.id && discountOpen,
  });

  const templateTotal = templateItems.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
  const editTemplateTotal = editTemplateItems.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
  const selectedStudent = students.find((s: any) => s.id === selectedStudentId);

  const selectedDiscount = availableDiscounts.find((d: any) => d.id === selectedDiscountId);
  const discountPreviewAmount = (() => {
    if (!selectedDiscount || !discountAssessment) return 0;
    if (selectedDiscount.type === 'percentage') {
      const raw = (selectedDiscount.value / 100) * Number(discountAssessment.total_amount);
      return selectedDiscount.max_cap ? Math.min(raw, selectedDiscount.max_cap) : raw;
    }
    if (selectedDiscount.type === 'fixed') return Number(selectedDiscount.value);
    if (selectedDiscount.type === 'coverage') return Number(discountAssessment.total_amount);
    return 0;
  })();

  const createAssessment = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!selectedStudentId || !selectedTemplateId || !schoolData?.id || !selectedYearId) {
        throw new Error('Please select a student and template');
      }

      const { data: existing } = await db.from('student_assessments')
        .select('id').eq('student_id', selectedStudentId).eq('academic_year_id', selectedYearId).eq('is_closed', false).limit(1);
      if (existing && (existing as any[]).length > 0) {
        throw new Error('This student already has an active account statement for the current year');
      }

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const { data: assessment, error } = await (db.from('student_assessments') as any).insert({
        student_id: selectedStudentId,
        school_id: schoolData.id,
        academic_year_id: selectedYearId,
        template_id: selectedTemplateId,
        total_amount: templateTotal,
        net_amount: templateTotal,
        balance: templateTotal,
        assessed_by: userId || null,
        assessed_at: new Date().toISOString(),
        status: 'pending',
      }).select('id').single();
      if (error) throw error;

      for (const i of templateItems) {
        const { error: itemError } = await (db.from('assessment_items') as any).insert({
          assessment_id: assessment.id,
          fee_catalog_id: i.fee_catalog_id,
          name: (i.fee_catalog as any)?.name || 'Fee Item',
          amount: Number(i.amount),
          is_mandatory: i.is_mandatory,
        });
        if (itemError) throw itemError;
      }

      return assessment.id;
    },
    onSuccess: async (assessmentId: string) => {
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
      toast.success('Account statement created successfully');
      setAssessOpen(false);
      setSelectedStudentId(null);
      setSelectedTemplateId(null);
      setStudentSearch('');

      // Auto PDF generation disabled - users can export manually from Actions menu
      // if (selectedSchool) {
      //   toast.info('Generating tuition documents...', { duration: 2000 });
      //   setTimeout(async () => {
      //     try {
      //       const success = await generateStatementPdfs(assessmentId, selectedSchool);
      //       if (success) {
      //         toast.success('Tuition documents generated! Check your popup windows.');
      //       }
      //     } catch (err) {
      //       console.error('PDF generation error:', err);
      //       toast.error('Could not generate PDFs. You can export them manually from the Actions menu.');
      //     }
      //   }, 500);
      // }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const applyDiscount = useMutation({
    mutationFn: async () => {
      if (!selectedDiscountId || !discountAssessment || !schoolData?.id) throw new Error('Missing data');

      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;

      const appliedAmount = Math.round(discountPreviewAmount * 100) / 100;

      const { error: sdErr } = await (db.from('student_discounts') as any).insert({
        student_id: discountAssessment.student_id,
        discount_id: selectedDiscountId,
        assessment_id: discountAssessment.id,
        school_id: schoolData.id,
        applied_amount: appliedAmount,
        status: selectedDiscount?.requires_approval ? 'pending' : 'approved',
        approved_by: selectedDiscount?.requires_approval ? null : userId,
        approved_at: selectedDiscount?.requires_approval ? null : new Date().toISOString(),
      });
      if (sdErr) throw sdErr;

      if (!selectedDiscount?.requires_approval) {
        const newDiscountAmount = Number(discountAssessment.discount_amount) + appliedAmount;
        const newNetAmount = Number(discountAssessment.total_amount) - newDiscountAmount;
        const newBalance = newNetAmount - Number(discountAssessment.total_paid);

        const { error: updErr } = await db.from('student_assessments').update({
          discount_amount: newDiscountAmount,
          net_amount: Math.max(0, newNetAmount),
          balance: Math.max(0, newBalance),
        }).eq('id', discountAssessment.id);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
      const msg = selectedDiscount?.requires_approval
        ? 'Discount submitted for approval'
        : 'Discount applied successfully';
      toast.success(msg);
      setDiscountOpen(false);
      setDiscountAssessment(null);
      setSelectedDiscountId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateAssessment = useMutation({
    mutationFn: async () => {
      if (!editingAssessment || !editTemplateId || !schoolData?.id) {
        throw new Error('Missing required data');
      }

      // Check if template changed
      if (editTemplateId !== editingAssessment.template_id) {
        // Delete old assessment items
        const { error: deleteError } = await db.from('assessment_items').delete().eq('assessment_id', editingAssessment.id);
        if (deleteError) throw deleteError;

        // Insert new assessment items from the new template
        for (const i of editTemplateItems) {
          const { error: itemError } = await (db.from('assessment_items') as any).insert({
            assessment_id: editingAssessment.id,
            fee_catalog_id: i.fee_catalog_id,
            name: (i.fee_catalog as any)?.name || 'Fee Item',
            amount: Number(i.amount),
            is_mandatory: i.is_mandatory,
          });
          if (itemError) throw itemError;
        }

        // Recalculate amounts
        const newNetAmount = editTemplateTotal - Number(editingAssessment.discount_amount);
        const newBalance = newNetAmount - Number(editingAssessment.total_paid);

        const { error: updateError } = await db.from('student_assessments').update({
          template_id: editTemplateId,
          total_amount: editTemplateTotal,
          net_amount: Math.max(0, newNetAmount),
          balance: newBalance, // Can be negative if overpaid
          status: newBalance <= 0 ? (newBalance < 0 ? 'overpaid' : 'paid') : (Number(editingAssessment.total_paid) > 0 ? 'partial' : 'pending'),
        }).eq('id', editingAssessment.id);
        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
      toast.success('Account statement updated successfully');
      setEditOpen(false);
      setEditingAssessment(null);
      setEditTemplateId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteAssessment = useMutation({
    mutationFn: async () => {
      if (!deletingAssessment) throw new Error('No assessment selected');

      // Check if there are payments
      if (Number(deletingAssessment.total_paid) > 0) {
        throw new Error('Cannot delete statement with recorded payments. Close it instead.');
      }

      // Delete assessment items first (foreign key constraint)
      const { error: itemsError } = await db.from('assessment_items').delete().eq('assessment_id', deletingAssessment.id);
      if (itemsError) throw itemsError;

      // Delete student discounts linked to this assessment
      const { error: discountsError } = await db.from('student_discounts').delete().eq('assessment_id', deletingAssessment.id);
      if (discountsError) throw discountsError;

      // Delete the assessment
      const { error: assessmentError } = await db.from('student_assessments').delete().eq('id', deletingAssessment.id);
      if (assessmentError) throw assessmentError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
      toast.success('Account statement deleted successfully');
      setDeleteOpen(false);
      setDeletingAssessment(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeAssessment = useMutation({
    mutationFn: async () => {
      if (!closingAssessment) throw new Error('No assessment selected');

      const { error } = await db.from('student_assessments').update({
        is_closed: true,
        status: 'closed',
      }).eq('id', closingAssessment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['student-assessments'] });
      toast.success('Account statement closed successfully');
      setCloseOpen(false);
      setClosingAssessment(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleExportTuitionOverview = async (assessmentId: string) => {
    if (!selectedSchool) {
      toast.error('School not selected');
      return;
    }
    setExportingPdfId(assessmentId);
    try {
      const success = await exportTuitionOverviewPdf(assessmentId, selectedSchool);
      if (!success) {
        toast.error('Failed to generate Tuition Overview PDF');
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('An error occurred while generating the PDF');
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleExportAssessmentDetails = async (assessmentId: string) => {
    if (!selectedSchool) {
      toast.error('School not selected');
      return;
    }
    setExportingPdfId(assessmentId);
    try {
      const success = await exportStatementDetailsPdf(assessmentId, selectedSchool);
      if (!success) {
        toast.error('Failed to generate Statement Details PDF');
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('An error occurred while generating the PDF');
    } finally {
      setExportingPdfId(null);
    }
  };

  const handleExportBothPdfs = async (assessmentId: string) => {
    if (!selectedSchool) {
      toast.error('School not selected');
      return;
    }
    setExportingPdfId(assessmentId);
    try {
      const success = await generateStatementPdfs(assessmentId, selectedSchool);
      if (!success) {
        toast.error('Failed to generate PDFs');
      } else {
        toast.success('Documents generated! Check your popup windows.');
      }
    } catch (err) {
      console.error('Export error:', err);
      toast.error('An error occurred while generating the PDFs');
    } finally {
      setExportingPdfId(null);
    }
  };

  const filtered = assessments.filter((a: any) => {
    const name = a.students?.student_name?.toLowerCase() || '';
    const lrn = a.students?.lrn?.toLowerCase() || '';
    const matchesSearch = name.includes(search.toLowerCase()) || lrn.includes(search.toLowerCase());
    const matchesGrade = gradeFilter === 'all' || a.students?.level === gradeFilter;
    return matchesSearch && matchesGrade;
  });

  const gradeLevels = [...new Set(assessments.map((a: any) => a.students?.level).filter(Boolean))].sort();

  return (
    <div className="space-y-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Student Statements</h2>
          <p className="text-sm text-muted-foreground">View and manage student account statements</p>
        </div>
        <Dialog open={assessOpen} onOpenChange={(v) => {
          setAssessOpen(v);
          if (!v) { setSelectedStudentId(null); setSelectedTemplateId(null); setStudentSearch(''); }
        }}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4 mr-2" />Create Statement</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Account Statement</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {/* Student Search */}
              <div>
                <Label>Search Student</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Name or LRN..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="pl-9" />
                </div>
                {students.length > 0 && !selectedStudentId && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                    {students.map((s: any) => (
                      <button key={s.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm" onClick={() => { setSelectedStudentId(s.id); setStudentSearch(s.student_name); }}>
                        <span className="font-medium">{s.student_name}</span>
                        <span className="text-muted-foreground ml-2">{s.lrn}</span>
                        <span className="text-muted-foreground ml-2">({s.level})</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedStudent && (
                  <div className="mt-2 p-2 bg-muted rounded-md text-sm flex justify-between items-center">
                    <span><strong>{selectedStudent.student_name}</strong> — {selectedStudent.lrn} ({selectedStudent.level})</span>
                    <Button variant="ghost" size="sm" onClick={() => { setSelectedStudentId(null); setStudentSearch(''); }}>Change</Button>
                  </div>
                )}
              </div>

              {/* Template Picker */}
              <div>
                <Label>Fee Template</Label>
                <Select value={selectedTemplateId || ''} onValueChange={v => setSelectedTemplateId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.grade_level ? `(${t.grade_level})` : ''} {t.strand ? `- ${t.strand}` : ''}
                      </SelectItem>
                    ))}
                    {templates.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No active templates. Create one in Fee Setup first.</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Items Preview */}
              {templateItems.length > 0 && (
                <div>
                  <Label className="text-base">Statement Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {templateItems.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell>{(i.fee_catalog as any)?.name}</TableCell>
                          <TableCell className="text-right">₱{Number(i.amount).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-right font-semibold mt-2">Total: ₱{templateTotal.toLocaleString()}</div>
                </div>
              )}

              <Button onClick={() => createAssessment.mutate()} className="w-full" disabled={!selectedStudentId || !selectedTemplateId || createAssessment.isPending}>
                Create Statement
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or LRN..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={gradeFilter} onValueChange={setGradeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Grades" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grades</SelectItem>
            {gradeLevels.map((g: string) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Statements Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead><span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Total</span></TableHead>
                <TableHead>Discount</TableHead>
                <TableHead><span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Net</span></TableHead>
                <TableHead><span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Paid</span></TableHead>
                <TableHead><span className="flex items-center gap-1"><Banknote className="h-3.5 w-3.5" />Balance</span></TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((a: any) => (
                <TableRow key={a.id} className={a.is_closed ? 'opacity-60' : ''}>
                  <TableCell>
                    <div><span className="font-medium">{a.students?.student_name}</span><br /><span className="text-xs text-muted-foreground">{a.students?.lrn}</span></div>
                  </TableCell>
                  <TableCell>{a.students?.level}</TableCell>
                  <TableCell>₱{Number(a.total_amount).toLocaleString()}</TableCell>
                  <TableCell>₱{Number(a.discount_amount).toLocaleString()}</TableCell>
                  <TableCell>₱{Number(a.net_amount).toLocaleString()}</TableCell>
                  <TableCell>₱{Number(a.total_paid).toLocaleString()}</TableCell>
                  <TableCell className="font-semibold">₱{Number(a.balance).toLocaleString()}</TableCell>
                  <TableCell><Badge className={statusColors[a.is_closed ? 'closed' : a.status] || ''}>{a.is_closed ? 'closed' : a.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {!a.is_closed && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-8"
                          onClick={() => { setDiscountAssessment(a); setDiscountOpen(true); }}
                        >
                          <Tag className="h-3.5 w-3.5" /> Discount
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={exportingPdfId === a.id}>
                            {exportingPdfId === a.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <MoreHorizontal className="h-4 w-4" />
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!a.is_closed && (
                            <>
                              <DropdownMenuItem onClick={() => { 
                                setEditingAssessment(a); 
                                setEditTemplateId(a.template_id); 
                                setEditOpen(true); 
                              }}>
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit Statement
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => { setDeletingAssessment(a); setDeleteOpen(true); }}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete Statement
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => { setClosingAssessment(a); setCloseOpen(true); }}
                                className="text-amber-600 focus:text-amber-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Close Statement
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => handleExportBothPdfs(a.id)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Export All Documents
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportTuitionOverview(a.id)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Tuition Overview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportAssessmentDetails(a.id)}>
                            <FileText className="h-4 w-4 mr-2" />
                            Statement Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No account statements found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Apply Discount Dialog */}
      <Dialog open={discountOpen} onOpenChange={(v) => { if (!v) { setDiscountOpen(false); setDiscountAssessment(null); setSelectedDiscountId(null); } else setDiscountOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />Apply Discount</DialogTitle></DialogHeader>

          {discountAssessment && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-md p-3">
                <p className="font-medium text-sm">{discountAssessment.students?.student_name}</p>
                <p className="text-xs text-muted-foreground">LRN: {discountAssessment.students?.lrn} • Statement Total: ₱{Number(discountAssessment.total_amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Current Discount: ₱{Number(discountAssessment.discount_amount).toLocaleString()} • Balance: ₱{Number(discountAssessment.balance).toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                <Label>Select Discount / Scholarship</Label>
                <Select value={selectedDiscountId || ''} onValueChange={v => setSelectedDiscountId(v)}>
                  <SelectTrigger><SelectValue placeholder="Choose a discount..." /></SelectTrigger>
                  <SelectContent>
                    {availableDiscounts.map((d: any) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} — {d.type === 'percentage' ? `${d.value}%` : `₱${Number(d.value).toLocaleString()}`}
                        {d.requires_approval ? ' (needs approval)' : ''}
                      </SelectItem>
                    ))}
                    {availableDiscounts.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No active discounts. Create one in Discounts & Scholarships first.</div>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {selectedDiscount && (
                <div className="bg-muted/30 rounded-md p-3 space-y-1">
                  <p className="text-sm font-medium">Discount Preview</p>
                  <p className="text-sm">Type: <span className="capitalize">{selectedDiscount.type}</span> — Value: {selectedDiscount.type === 'percentage' ? `${selectedDiscount.value}%` : `₱${Number(selectedDiscount.value).toLocaleString()}`}</p>
                  <p className="text-sm font-semibold">Amount to deduct: ₱{discountPreviewAmount.toLocaleString()}</p>
                  {selectedDiscount.requires_approval && (
                    <p className="text-xs text-amber-600">⚠ This discount requires admin approval before it takes effect.</p>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDiscountOpen(false); setDiscountAssessment(null); setSelectedDiscountId(null); }}>Cancel</Button>
            <Button onClick={() => applyDiscount.mutate()} disabled={!selectedDiscountId || applyDiscount.isPending}>
              {applyDiscount.isPending ? 'Applying...' : 'Apply Discount'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Statement Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { 
        if (!v) { setEditOpen(false); setEditingAssessment(null); setEditTemplateId(null); } 
        else setEditOpen(true); 
      }}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-5 w-5" />Edit Account Statement</DialogTitle></DialogHeader>
          
          {editingAssessment && (
            <div className="space-y-4">
              {/* Student Info (read-only) */}
              <div className="bg-muted/50 rounded-md p-3">
                <p className="font-medium">{editingAssessment.students?.student_name}</p>
                <p className="text-sm text-muted-foreground">LRN: {editingAssessment.students?.lrn} • Grade: {editingAssessment.students?.level}</p>
              </div>

              {/* Template Picker */}
              <div>
                <Label>Fee Template</Label>
                <Select value={editTemplateId || ''} onValueChange={v => setEditTemplateId(v)}>
                  <SelectTrigger><SelectValue placeholder="Select a template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.grade_level ? `(${t.grade_level})` : ''} {t.strand ? `- ${t.strand}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Current vs New Template Preview */}
              {editTemplateId && editTemplateId !== editingAssessment.template_id && editTemplateItems.length > 0 && (
                <div>
                  <Label className="text-base">New Statement Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editTemplateItems.map((i: any) => (
                        <TableRow key={i.id}>
                          <TableCell>{(i.fee_catalog as any)?.name}</TableCell>
                          <TableCell className="text-right">₱{Number(i.amount).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="text-right font-semibold mt-2">New Total: ₱{editTemplateTotal.toLocaleString()}</div>
                  <p className="text-sm text-muted-foreground mt-2">
                    Current Total: ₱{Number(editingAssessment.total_amount).toLocaleString()} → New Total: ₱{editTemplateTotal.toLocaleString()}
                  </p>
                </div>
              )}

              {editTemplateId === editingAssessment.template_id && (
                <p className="text-sm text-muted-foreground">No changes made. Select a different template to update the statement.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditOpen(false); setEditingAssessment(null); setEditTemplateId(null); }}>Cancel</Button>
            <Button 
              onClick={() => updateAssessment.mutate()} 
              disabled={!editTemplateId || editTemplateId === editingAssessment?.template_id || updateAssessment.isPending}
            >
              {updateAssessment.isPending ? 'Updating...' : 'Update Statement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={(v) => { 
        if (!v) { setDeleteOpen(false); setDeletingAssessment(null); } 
        else setDeleteOpen(true); 
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Delete Account Statement</DialogTitle></DialogHeader>
          
          {deletingAssessment && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                <p className="text-sm font-medium">Are you sure you want to delete this account statement?</p>
                <p className="text-sm text-muted-foreground mt-1">This action cannot be undone.</p>
              </div>

              <div className="bg-muted/50 rounded-md p-3">
                <p className="font-medium">{deletingAssessment.students?.student_name}</p>
                <p className="text-sm text-muted-foreground">LRN: {deletingAssessment.students?.lrn}</p>
                <p className="text-sm text-muted-foreground">Total: ₱{Number(deletingAssessment.total_amount).toLocaleString()}</p>
                {Number(deletingAssessment.total_paid) > 0 && (
                  <p className="text-sm text-amber-600 mt-2">⚠ This statement has ₱{Number(deletingAssessment.total_paid).toLocaleString()} in recorded payments and cannot be deleted.</p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeletingAssessment(null); }}>Cancel</Button>
            <Button 
              variant="destructive"
              onClick={() => deleteAssessment.mutate()} 
              disabled={Number(deletingAssessment?.total_paid) > 0 || deleteAssessment.isPending}
            >
              {deleteAssessment.isPending ? 'Deleting...' : 'Delete Statement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Statement Confirmation Dialog */}
      <Dialog open={closeOpen} onOpenChange={(v) => { 
        if (!v) { setCloseOpen(false); setClosingAssessment(null); } 
        else setCloseOpen(true); 
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-amber-600"><XCircle className="h-5 w-5" />Close Account Statement</DialogTitle></DialogHeader>
          
          {closingAssessment && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <p className="text-sm font-medium">Are you sure you want to close this account statement?</p>
                <p className="text-sm text-muted-foreground mt-1">Closed statements cannot be edited or receive new payments/discounts. This is the recommended action for statements with payment history.</p>
              </div>

              <div className="bg-muted/50 rounded-md p-3">
                <p className="font-medium">{closingAssessment.students?.student_name}</p>
                <p className="text-sm text-muted-foreground">LRN: {closingAssessment.students?.lrn}</p>
                <p className="text-sm text-muted-foreground">Total: ₱{Number(closingAssessment.total_amount).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Paid: ₱{Number(closingAssessment.total_paid).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Balance: ₱{Number(closingAssessment.balance).toLocaleString()}</p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setCloseOpen(false); setClosingAssessment(null); }}>Cancel</Button>
            <Button 
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => closeAssessment.mutate()} 
              disabled={closeAssessment.isPending}
            >
              {closeAssessment.isPending ? 'Closing...' : 'Close Statement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
