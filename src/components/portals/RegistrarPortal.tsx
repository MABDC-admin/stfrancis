import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { StudentBirthdays } from '@/components/dashboard/StudentBirthdays';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { DashboardStatsRow } from '@/components/dashboard/DashboardStatsRow';
import { QuickActions } from '@/components/dashboard/QuickActions';
import { StudentOverview } from '@/components/dashboard/StudentOverview';
import { DashboardCalendar } from '@/components/dashboard/DashboardCalendar';
import { BottomActions } from '@/components/dashboard/BottomActions';
import { useStudents } from '@/hooks/useStudents';
import { useSchool } from '@/contexts/SchoolContext';
import { useSchoolSettings } from '@/hooks/useSchoolSettings';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useDashboardLayout } from '@/contexts/DashboardLayoutContext';
import { cn } from '@/lib/utils';

interface RegistrarPortalProps {
  onNavigate: (tab: string) => void;
  stats: {
    totalStudents: number;
    pendingEnrollments: number;
  };
}

export const RegistrarPortal = ({ onNavigate, stats }: RegistrarPortalProps) => {
  const { data: students = [] } = useStudents();
  const { layoutStyle } = useDashboardLayout();
  const { selectedSchool, schoolTheme } = useSchool();
  const { data: schoolSettings } = useSchoolSettings(selectedSchool);
  const isClassic = layoutStyle === 'classicBlue';
  const isApple = layoutStyle === 'apple';

  // Fetch teachers count
  const { data: teachersData } = useQuery({
    queryKey: ['teachers-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true });
      return count || 0;
    },
  });

  // Fetch flipbooks count
  const { data: flipbooksCount = 0 } = useQuery({
    queryKey: ['flipbooks-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('flipbooks')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);
      return count || 0;
    },
  });

  // Calculate stats
  const totalStudents = students.length;
  const totalTeachers = teachersData || 0;
  const levels = [...new Set(students.map(s => s.level))].length;

  return (
    <div className={cn(
      "space-y-6",
      isClassic && "dashboard-classic-blue dashboard-page-bg",
      isApple && "dashboard-apple apple-page-bg"
    )}>
      {/* School Branding Header */}
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
            {schoolSettings?.address || 'Registrar Portal'}
          </p>
        </div>
      </div>

      {/* Header */}
      <DashboardHeader onNavigateToMessages={() => onNavigate('messages')} />

      {/* Stats Row */}
      <DashboardStatsRow
        totalStudents={totalStudents}
        totalTeachers={totalTeachers}
        totalClasses={levels}
        libraryCount={flipbooksCount}
        onLibraryClick={() => onNavigate('library')}
        variant={layoutStyle}
      />

      {/* Quick Actions */}
      <QuickActions onNavigate={onNavigate} variant={layoutStyle} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calendar and Events Row */}
          <div className={cn(
            "grid grid-cols-1",
            isClassic && "classic-card p-4",
            isApple && "apple-card p-4"
          )}>
            <DashboardCalendar />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          <div className={cn(
            isClassic && "classic-card p-4",
            isApple && "apple-card p-4"
          )}>
            <StudentBirthdays />
          </div>
          <div className={cn(
            isClassic && "classic-card p-4",
            isApple && "apple-card p-4"
          )}>
            <StudentOverview students={students} />
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <BottomActions onNavigate={onNavigate} variant={layoutStyle} />
    </div>
  );
};
