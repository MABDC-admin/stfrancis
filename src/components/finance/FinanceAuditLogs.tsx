import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search } from 'lucide-react';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';
import { useQuery } from '@tanstack/react-query';

export const FinanceAuditLogs = () => {
  const { selectedSchool } = useSchool();
  const [search, setSearch] = useState('');

  const { data: schoolData } = useQuery({
    queryKey: ['school-id', selectedSchool],
    queryFn: async () => {
      const { data } = await db.from('schools').select('id').eq('code', selectedSchool).single();
      return data;
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['finance-audit-logs', schoolData?.id],
    queryFn: async () => {
      // Client-side join: fetch logs + profiles separately
      const { data: rawLogs } = await db.from('finance_audit_logs').select('*').eq('school_id', schoolData!.id).order('created_at', { ascending: false }).limit(100);
      if (!rawLogs || (rawLogs as any[]).length === 0) return [];
      const userIds = [...new Set((rawLogs as any[]).map((l: any) => l.user_id).filter(Boolean))];
      let profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profilesData } = await db.from('profiles').select('id, full_name').in('id', userIds);
        ((profilesData || []) as any[]).forEach((p: any) => { profileMap[p.id] = p; });
      }
      return (rawLogs as any[]).map((l: any) => ({ ...l, profiles: profileMap[l.user_id] || null }));
    },
    enabled: !!schoolData?.id,
  });

  const filtered = logs.filter((l: any) => {
    const action = l.action?.toLowerCase() || '';
    const table = l.table_name?.toLowerCase() || '';
    return action.includes(search.toLowerCase()) || table.includes(search.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Finance Audit Logs</h1>
        <p className="text-muted-foreground">Track all finance-related actions</p>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search action or table..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="text-sm">{new Date(l.created_at).toLocaleString()}</TableCell>
                  <TableCell>{l.profiles?.full_name || l.user_id?.slice(0, 8)}</TableCell>
                  <TableCell className="font-medium">{l.action}</TableCell>
                  <TableCell>{l.table_name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.reason || '—'}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit logs found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
