import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Loader2, Calendar, Edit, Trash2, Check, CalendarCheck, Archive, Lock, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useSchoolId } from '@/hooks/useSchoolId';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { db } from '@/lib/db-client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  archived_at?: string;
  archived_by?: string;
  school_id: string;
}

export const AcademicYearsSettings = () => {
  const { data: schoolId, isLoading: schoolIdLoading } = useSchoolId();
  const { refetch: refetchGlobalYears, setSelectedYearId: setGlobalYearId } = useAcademicYear();
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingYear, setEditingYear] = useState<AcademicYear | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<AcademicYear | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<AcademicYear | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [sortBy, setSortBy] = useState<'current_first' | 'newest' | 'oldest' | 'name_asc' | 'name_desc'>('name_asc');
  
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    end_date: '',
    is_current: false,
  });

  const sortYears = (data: AcademicYear[], sort: typeof sortBy): AcademicYear[] => {
    const sorted = [...data];
    switch (sort) {
      case 'current_first':
        return sorted.sort((a, b) => {
          if (a.is_current && !b.is_current) return -1;
          if (!a.is_current && b.is_current) return 1;
          return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
        });
      case 'newest':
        return sorted.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
      case 'name_asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name_desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      default:
        return sorted;
    }
  };

  const handleSortChange = (value: typeof sortBy) => {
    setSortBy(value);
    setYears(prev => sortYears([...prev], value));
  };

  const fetchYears = async () => {
    console.log('[AcademicYearsSettings] fetchYears called, schoolId:', schoolId);
    
    if (!schoolId) {
      console.log('[AcademicYearsSettings] No schoolId available, skipping fetch');
      return;
    }
    
    // Check if we have auth token for Railway
    const useRailway = import.meta.env.VITE_USE_RAILWAY === 'true';
    const hasToken = localStorage.getItem('auth_token');
    
    console.log('[AcademicYearsSettings] useRailway:', useRailway, 'hasToken:', !!hasToken);
    
    if (useRailway && !hasToken) {
      setServerError('Not authenticated with Railway. Please log out and log back in.');
      toast.error('Please log out and log back in to use Railway backend');
      return;
    }
    
    setIsLoading(true);
    setServerError(null);
    console.log('[AcademicYearsSettings] Fetching academic years for school:', schoolId);
    
    try {
      const { data, error } = await db
        .from('academic_years')
        .select('*')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: false });

      console.log('[AcademicYearsSettings] Academic years response:', { data, error });

      if (error) {
        console.error('Error fetching academic years:', error);
        const errorMsg = error.message || 'Unknown error';
        setServerError(errorMsg);
        toast.error(`Failed to load academic years: ${errorMsg}`);
        setYears([]);
      } else if (data) {
        console.log('Successfully loaded academic years:', data.length);
        setYears(sortYears(data as AcademicYear[], sortBy));
      } else {
        console.warn('No data returned');
        setYears([]);
      }
    } catch (error: any) {
      console.error('Exception fetching academic years:', error);
      const errorMsg = error.message || 'Network error - is the backend server running?';
      setServerError(errorMsg);
      toast.error(`Failed to load academic years: ${errorMsg}`);
      setYears([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchYears();
  }, [schoolId]);

  const handleOpenForm = (year?: AcademicYear) => {
    if (year) {
      setEditingYear(year);
      setFormData({
        name: year.name,
        start_date: year.start_date,
        end_date: year.end_date,
        is_current: year.is_current,
      });
    } else {
      setEditingYear(null);
      setFormData({
        name: '',
        start_date: '',
        end_date: '',
        is_current: false,
      });
    }
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    if (!schoolId || !formData.name || !formData.start_date || !formData.end_date) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);
    try {
      // If setting as current, unset others first
      if (formData.is_current) {
        const { error: unsetError } = await db
          .from('academic_years')
          .update({ is_current: false })
          .eq('is_current', true)
          .eq('school_id', schoolId);

        if (unsetError) {
          console.error('Error unsetting current year:', unsetError);
          throw unsetError;
        }
      }

      if (editingYear) {
        // Update existing year
        const { error } = await db
          .from('academic_years')
          .update({
            name: formData.name,
            start_date: formData.start_date,
            end_date: formData.end_date,
            is_current: formData.is_current,
          })
          .eq('id', editingYear.id);

        if (error) {
          console.error('Error updating academic year:', error);
          throw error;
        }
        toast.success('Academic year updated successfully');
      } else {
        // Create new year
        const { error } = await (db
          .from('academic_years') as any)
          .insert({
            name: formData.name,
            start_date: formData.start_date,
            end_date: formData.end_date,
            is_current: formData.is_current,
            school_id: schoolId,
          });

        if (error) {
          console.error('Error creating academic year:', error);
          throw error;
        }
        toast.success('Academic year created successfully');
      }

      await fetchYears();
      setIsFormOpen(false);
      setEditingYear(null);
      setFormData({ name: '', start_date: '', end_date: '', is_current: false });
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error('Failed to save academic year');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetCurrent = async (year: AcademicYear) => {
    if (!schoolId) return;

    try {
      // Use dedicated activation endpoint - handles auto-freeze of previous years via DB trigger
      const useRailway = import.meta.env.VITE_USE_RAILWAY === 'true';
      
      if (useRailway) {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/data/academic_years/${year.id}/activate`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to activate year');
        }
        
        const result = await response.json();
        toast.success(result.message);
      } else {
        // Supabase fallback
        const { error: unsetError } = await db
          .from('academic_years')
          .update({ is_current: false })
          .eq('is_current', true)
          .eq('school_id', schoolId);

        if (unsetError) throw unsetError;

        const { error: setError } = await db
          .from('academic_years')
          .update({ is_current: true })
          .eq('id', year.id);

        if (setError) throw setError;
        toast.success(`${year.name} is now the current academic year`);
      }

      await fetchYears();
      // Refresh the global academic year context so the dropdown selector updates immediately
      await refetchGlobalYears();
      // Auto-select the newly activated year in the global dropdown
      setGlobalYearId(year.id);
    } catch (error: any) {
      console.error('Set current error:', error);
      toast.error('Failed to set current year: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      const { error } = await db
        .from('academic_years')
        .delete()
        .eq('id', deleteConfirm.id);

      if (error) {
        console.error('Error deleting academic year:', error);
        throw error;
      }

      toast.success('Academic year deleted successfully');
      await fetchYears();
      setDeleteConfirm(null);
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error('Failed to delete academic year');
    }
  };

  const handleArchive = async () => {
    if (!archiveConfirm) return;
    
    setIsArchiving(true);
    try {
      const useRailway = import.meta.env.VITE_USE_RAILWAY === 'true';
      
      if (useRailway) {
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_URL}/data/academic_years/${archiveConfirm.id}/archive`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to archive year');
        }
        
        const result = await response.json();
        toast.success(result.message);
      } else {
        // Supabase fallback
        const { data: { user } } = await db.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data: grades, error: gradesError } = await db
          .from('student_grades')
          .select('*')
          .eq('academic_year_id', archiveConfirm.id);

        if (gradesError) throw gradesError;

        if (grades && grades.length > 0) {
          for (const g of grades as any[]) {
            const { error: snapshotError } = await (db
              .from('grade_snapshots') as any)
              .insert({
                student_id: g.student_id,
                subject_id: g.subject_id,
                academic_year_id: g.academic_year_id,
                quarter: g.quarter,
                written_work: g.written_work,
                performance_task: g.performance_task,
                quarterly_assessment: g.quarterly_assessment,
                final_grade: g.final_grade,
                remarks: g.remarks,
              });
            if (snapshotError) throw snapshotError;
          }
        }

        const { error: archiveError } = await db
          .from('academic_years')
          .update({
            is_archived: true,
            is_current: false,
            archived_at: new Date().toISOString(),
            archived_by: user.id,
          })
          .eq('id', archiveConfirm.id);

        if (archiveError) throw archiveError;
        toast.success(`Academic year archived. ${grades?.length || 0} grade records preserved.`);
      }

      await fetchYears();
      // Refresh the global dropdown to reflect archive state change
      await refetchGlobalYears();
      setArchiveConfirm(null);
    } catch (error: any) {
      console.error('Archive error:', error);
      toast.error('Failed to archive academic year: ' + (error.message || 'Unknown error'));
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Academic Years</h2>
            <p className="text-muted-foreground mt-1">Manage school academic year periods</p>
          </div>
          <Button onClick={() => handleOpenForm()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Academic Year
          </Button>
        </div>
      </motion.div>

      {serverError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Cannot Load Academic Years</AlertTitle>
          <AlertDescription>
            <p className="mb-2">{serverError}</p>
            {serverError.includes('authenticated') && (
              <div className="mt-3 p-3 bg-destructive/10 rounded border border-destructive/20">
                <p className="font-semibold mb-2">🔑 Authentication Required:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Click the profile menu (top right)</li>
                  <li>Click "Logout"</li>
                  <li>Log back in with your credentials</li>
                  <li>This will authenticate you with the Railway backend</li>
                </ol>
              </div>
            )}
            {serverError.includes('Network') && (
              <div className="mt-3 p-3 bg-destructive/10 rounded border border-destructive/20">
                <p className="font-semibold mb-2">🖥️ Backend Server Not Running:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Open terminal in <code className="bg-muted px-1 py-0.5 rounded">server</code> directory</li>
                  <li>Run: <code className="bg-muted px-1 py-0.5 rounded">npm install</code> (first time only)</li>
                  <li>Run: <code className="bg-muted px-1 py-0.5 rounded">npm run dev</code></li>
                  <li>Backend should start on port 3001</li>
                </ol>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {schoolIdLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading school information...</span>
          </CardContent>
        </Card>
      ) : !schoolId ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No School Selected</AlertTitle>
          <AlertDescription>
            Unable to determine school ID. Please ensure you are logged in and have a school assigned.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Academic Years List</CardTitle>
                  <CardDescription>View and manage all academic year periods for your school</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                  <Select value={sortBy} onValueChange={(v) => handleSortChange(v as typeof sortBy)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Sort by..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current_first">Current First</SelectItem>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="name_asc">Name A-Z</SelectItem>
                      <SelectItem value="name_desc">Name Z-A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : years.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No academic years found. Click "Add Academic Year" to create one.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Academic Year</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {years.map((year) => (
                  <TableRow key={year.id}>
                    <TableCell className="font-medium">{year.name}</TableCell>
                    <TableCell>{format(new Date(year.start_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>{format(new Date(year.end_date), 'MMM dd, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {year.is_current && (
                          <Badge className="bg-green-500">
                            <Check className="h-3 w-3 mr-1" />
                            Current
                          </Badge>
                        )}
                        {year.is_archived && (
                          <Badge variant="secondary">
                            <Archive className="h-3 w-3 mr-1" />
                            Archived
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {!year.is_archived && (
                          <>
                            {!year.is_current && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSetCurrent(year)}
                              >
                                <CalendarCheck className="h-4 w-4 mr-1" />
                                Set as Current
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenForm(year)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setArchiveConfirm(year)}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => setDeleteConfirm(year)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {year.is_archived && (
                          <Badge variant="outline">
                            <Lock className="h-3 w-3 mr-1" />
                            Locked
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingYear ? 'Edit Academic Year' : 'Add Academic Year'}
            </DialogTitle>
            <DialogDescription>
              {editingYear
                ? 'Update the academic year information.'
                : 'Create a new academic year period for your school.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="name">Academic Year Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., 2024-2025"
              />
            </div>
            <div>
              <Label htmlFor="start_date">Start Date *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="end_date">End Date *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_current"
                checked={formData.is_current}
                onChange={(e) => setFormData({ ...formData, is_current: e.target.checked })}
                className="h-4 w-4"
              />
              <Label htmlFor="is_current" className="cursor-pointer">
                Set as current academic year
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingYear ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Academic Year?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Confirmation */}
      <AlertDialog open={!!archiveConfirm} onOpenChange={() => setArchiveConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Academic Year?</AlertDialogTitle>
            <AlertDialogDescription>
              This will preserve all grade records and mark "{archiveConfirm?.name}" as archived. Archived years cannot be modified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} disabled={isArchiving}>
              {isArchiving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}
    </div>
  );
};
