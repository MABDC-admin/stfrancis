import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Copy } from 'lucide-react';
import { FeeTemplateManager } from './FeeTemplateManager';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const CATEGORIES = ['tuition', 'misc', 'books', 'uniform', 'lab', 'id', 'other'];

export const FeeSetup = () => {
  const { selectedSchool } = useSchool();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '', category: 'other', amount: '', is_mandatory: true, is_recurring: false, allow_installments: true });

  const { data: schoolData } = useQuery({
    queryKey: ['school-id', selectedSchool],
    queryFn: async () => {
      const { data } = await db.from('schools').select('id').eq('code', selectedSchool).single();
      return data;
    },
  });

  const { data: fees = [] } = useQuery({
    queryKey: ['fee-catalog', schoolData?.id],
    queryFn: async () => {
      const { data } = await db.from('fee_catalog').select('*').eq('school_id', schoolData!.id).order('category');
      return data || [];
    },
    enabled: !!schoolData?.id,
  });

  const saveFee = useMutation({
    mutationFn: async (fee: any) => {
      if (editingItem) {
        const { error } = await db.from('fee_catalog').update(fee).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await (db.from('fee_catalog') as any).insert({ ...fee, school_id: schoolData!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-catalog'] });
      toast.success(editingItem ? 'Fee updated' : 'Fee created');
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteFee = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('fee_catalog').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fee-catalog'] });
      toast.success('Fee deleted');
    },
  });

  const resetForm = () => {
    setForm({ name: '', description: '', category: 'other', amount: '', is_mandatory: true, is_recurring: false, allow_installments: true });
    setEditingItem(null);
    setIsOpen(false);
  };

  const handleEdit = (fee: any) => {
    setEditingItem(fee);
    setForm({ name: fee.name, description: fee.description || '', category: fee.category, amount: String(fee.amount), is_mandatory: fee.is_mandatory, is_recurring: fee.is_recurring, allow_installments: fee.allow_installments ?? true });
    setIsOpen(true);
  };

  const handleClone = (fee: any) => {
    // Clone opens as a new item (no editingItem) with data pre-filled
    setEditingItem(null);
    setForm({
      name: `${fee.name} - Copy`,
      description: fee.description || '',
      category: fee.category,
      amount: String(fee.amount),
      is_mandatory: fee.is_mandatory,
      is_recurring: fee.is_recurring,
      allow_installments: fee.allow_installments ?? true,
    });
    setIsOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name || !form.amount) return toast.error('Name and amount are required');
    saveFee.mutate({ name: form.name, description: form.description, category: form.category, amount: Number(form.amount), is_mandatory: form.is_mandatory, is_recurring: form.is_recurring, allow_installments: form.allow_installments });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fee Setup</h1>
          <p className="text-muted-foreground">Manage fee catalog items</p>
        </div>
        <Dialog open={isOpen} onOpenChange={(v) => { if (!v) resetForm(); setIsOpen(v); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Fee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingItem ? 'Edit Fee' : 'Add Fee'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div><Label>Description</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Amount (₱)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2"><Switch checked={form.is_mandatory} onCheckedChange={v => setForm(f => ({ ...f, is_mandatory: v }))} /><Label>Required</Label></div>
                <div className="flex items-center gap-2"><Switch checked={form.is_recurring} onCheckedChange={v => setForm(f => ({ ...f, is_recurring: v }))} /><Label>Recurring</Label></div>
                <div className="flex items-center gap-2"><Switch checked={form.allow_installments} onCheckedChange={v => setForm(f => ({ ...f, allow_installments: v }))} /><Label>Allow Installments</Label></div>
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={saveFee.isPending}>{editingItem ? 'Update' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </motion.div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="h-9">
                <TableHead className="py-1.5">Name</TableHead>
                <TableHead className="py-1.5">Category</TableHead>
                <TableHead className="py-1.5">Amount</TableHead>
                <TableHead className="py-1.5">Required</TableHead>
                <TableHead className="py-1.5">Recurring</TableHead>
                <TableHead className="py-1.5">Installments</TableHead>
                <TableHead className="w-[100px] py-1.5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fees.map((fee: any) => (
                <TableRow key={fee.id} className="h-9">
                  <TableCell className="py-1.5 font-medium text-sm">{fee.name}</TableCell>
                  <TableCell className="py-1.5 capitalize text-sm">{fee.category}</TableCell>
                  <TableCell className="py-1.5 text-sm">₱{Number(fee.amount).toLocaleString()}</TableCell>
                  <TableCell className="py-1.5 text-sm">{fee.is_mandatory ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="py-1.5 text-sm">{fee.is_recurring ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="py-1.5 text-sm">{fee.allow_installments !== false ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(fee)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleClone(fee)} title="Clone"><Copy className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteFee.mutate(fee.id)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {fees.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No fee items yet. Click "Add Fee" to create one.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <FeeTemplateManager />
    </div>
  );
};
