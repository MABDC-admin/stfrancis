import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Users, CheckCircle, Clock, CreditCard, Search, FileText, Building2 } from 'lucide-react';
import { useSchool } from '@/contexts/SchoolContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { useSchoolSettings } from '@/hooks/useSchoolSettings';
import { db } from '@/lib/db-client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface FinancePortalProps {
  onNavigate: (tab: string) => void;
}

export const FinancePortal = ({ onNavigate }: FinancePortalProps) => {
  const { selectedSchool, schoolTheme } = useSchool();
  const { selectedYearId } = useAcademicYear();
  const { data: schoolSettings } = useSchoolSettings(selectedSchool);

  const { data: stats } = useQuery({
    queryKey: ['finance-stats', selectedSchool, selectedYearId],
    queryFn: async () => {
      const { data: school } = await db.from('schools').select('id').eq('code', selectedSchool).single();
      if (!school) return { collections: 0, outstanding: 0, cleared: 0, pending: 0 };

      const [paymentsRes, assessmentsRes, clearanceRes] = await Promise.all([
        db.from('payments').select('amount').eq('school_id', school.id).eq('status', 'verified'),
        db.from('student_assessments').select('balance, status').eq('school_id', school.id),
        db.from('finance_clearance').select('is_cleared').eq('school_id', school.id),
      ]);

      const payments = paymentsRes.data || [];
      const totalCollections = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const assessments = assessmentsRes.data || [];
      const outstanding = assessments.reduce((sum: number, a: any) => sum + Number(a.balance || 0), 0);
      const clearances = clearanceRes.data || [];
      const clearedCount = clearances.filter((c: any) => c.is_cleared).length;
      const pendingPayments = assessments.filter((a: any) => a.status === 'pending').length;

      return { collections: totalCollections, outstanding, cleared: clearedCount, pending: pendingPayments };
    },
    enabled: !!selectedSchool,
  });

  const statCards = [
    { title: 'Total Collections', value: `₱${(stats?.collections || 0).toLocaleString()}`, icon: DollarSign, color: 'text-emerald-500' },
    { title: 'Outstanding Balance', value: `₱${(stats?.outstanding || 0).toLocaleString()}`, icon: Clock, color: 'text-amber-500' },
    { title: 'Cleared Students', value: stats?.cleared || 0, icon: CheckCircle, color: 'text-green-500' },
    { title: 'Pending Assessments', value: stats?.pending || 0, icon: Users, color: 'text-blue-500' },
  ];

  const quickActions = [
    { label: 'Accept Payment', icon: CreditCard, tab: 'cashier' },
    { label: 'View Learners', icon: Users, tab: 'finance-learners' },
    { label: 'Fee Setup', icon: FileText, tab: 'fee-setup' },
    { label: 'Year-End Close', icon: Clock, tab: 'year-end-close' },
    { label: 'Reports', icon: FileText, tab: 'finance-reports' },
  ];

  return (
    <div className="space-y-6">
      {/* School Header */}
      <div className="flex items-center gap-4 mb-2">
        <div className="w-12 h-12 lg:w-14 lg:h-14 rounded-xl overflow-hidden bg-white shadow-sm flex items-center justify-center flex-shrink-0 border">
          {schoolSettings?.logo_url ? (
            <img 
              src={schoolSettings.logo_url} 
              alt={`${schoolTheme.fullName} logo`} 
              className="w-full h-full object-contain p-1" 
            />
          ) : (
            <Building2 className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-bold text-foreground">
            {schoolSettings?.name || schoolTheme.fullName}
          </h2>
          <p className="text-sm text-muted-foreground">
            {schoolSettings?.address || 'School Finance Management'}
          </p>
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Finance Portal</h1>
        <p className="text-muted-foreground mt-1">School finance management dashboard</p>
      </motion.div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <motion.div key={stat.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.title}</p>
                    <p className="text-xl font-bold">{stat.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {quickActions.map(action => (
              <Button key={action.tab} variant="outline" className="h-20 flex-col gap-2" onClick={() => onNavigate(action.tab)}>
                <action.icon className="h-6 w-6" />
                <span className="text-xs">{action.label}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
