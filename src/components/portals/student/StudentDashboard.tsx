import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStudentDashboardStats } from '@/hooks/useStudentPortalData';
import {
  Award,
  Calendar,
  ClipboardList,
  GraduationCap,
  Clock,
  AlertTriangle,
  Megaphone,
  CheckCircle
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { format, differenceInDays, isPast } from 'date-fns';
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  computeQuarterlyGeneralAverage,
  computeAnnualGeneralAverage,
  isPassing,
  getGradeDescriptor,
  GradeRecordWithMetadata,
} from '@/utils/gradeComputation';
import { DAY_NAMES, EXAM_TYPE_COLORS, PRIORITY_COLORS } from '@/types/studentPortal';
import { AnimatedStudentAvatar } from '@/components/students/AnimatedStudentAvatar';
import { StudentAcademicInsights } from './widgets/StudentAcademicInsights';

interface StudentDashboardProps {
  studentId: string;
  gradeLevel: string;
  schoolId: string;
  academicYearId: string;
  grades: any[];
  schedule?: any[];
  studentName?: string;
  studentPhotoUrl?: string | null;
}

import { useZoomSession } from '@/hooks/useZoomSession';
import { Video, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const StudentDashboard = ({
  studentId,
  gradeLevel,
  schoolId,
  academicYearId,
  grades,
  studentName,
  studentPhotoUrl,
}: StudentDashboardProps) => {
  const { attendance, assignments, exams, announcements, isLoading } = useStudentDashboardStats(
    studentId,
    gradeLevel,
    schoolId,
    academicYearId
  );

  const { settings, inSession, countdown } = useZoomSession(schoolId);

  // Compute General Averages
  const generalAverages = useMemo(() => {
    if (!grades || grades.length === 0) return null;
    return {
      q1: computeQuarterlyGeneralAverage(grades, 'q1'),
      q2: computeQuarterlyGeneralAverage(grades, 'q2'),
      q3: computeQuarterlyGeneralAverage(grades, 'q3'),
      q4: computeQuarterlyGeneralAverage(grades, 'q4'),
      annual: computeAnnualGeneralAverage(grades),
    };
  }, [grades]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Virtual Classroom Banner */}
      {settings && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative overflow-hidden group"
        >
          <Card className={`border-none shadow-md ${inSession ? 'bg-gradient-to-r from-emerald-600 to-teal-600 border-none' : 'bg-muted/50'}`}>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row items-center justify-between p-4 sm:p-6 gap-4">
                <div className="flex items-center gap-4 text-center sm:text-left">
                  <div className={`p-3 rounded-full ${inSession ? 'bg-white/20' : 'bg-muted'}`}>
                    <Video className={`h-6 w-6 ${inSession ? 'text-white' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${inSession ? 'text-white' : 'text-foreground'}`}>
                      {inSession ? 'Your Classroom is Live!' : 'Virtual Classroom'}
                    </h3>
                    <p className={`text-sm ${inSession ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {inSession ? 'Tap join to enter the session' : countdown || 'Scheduled for school hours'}
                    </p>
                  </div>
                </div>

                <Button
                  size="lg"
                  variant={inSession ? 'secondary' : 'outline'}
                  disabled={!inSession || !settings.meeting_url}
                  onClick={() => settings.meeting_url && window.open(settings.meeting_url, '_blank')}
                  className={`${inSession ? 'bg-white text-emerald-700 hover:bg-white/90 shadow-lg' : ''} px-8`}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {inSession ? 'Join Class Now' : 'Class Offline'}
                </Button>
              </div>

              {/* Decorative side badge */}
              <div className={`absolute top-0 right-0 p-1 px-3 text-[10px] font-bold uppercase tracking-wider ${inSession ? 'bg-emerald-500 text-white' : 'bg-muted-foreground text-white'}`}>
                {inSession ? 'Live' : 'Scheduled'}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* General Average */}
        <Card className={`bg-gradient-to-br ${generalAverages?.annual && isPassing(generalAverages.annual)
          ? 'from-purple-500/10 to-purple-600/5 border-purple-200/50'
          : generalAverages?.annual
            ? 'from-red-500/10 to-red-600/5 border-red-200/50'
            : 'from-muted to-muted/50'
          }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${generalAverages?.annual && isPassing(generalAverages.annual)
                ? 'bg-purple-500/20'
                : 'bg-red-500/20'
                }`}>
                <Award className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Gen. Average</p>
                <p className={`text-xl font-bold ${generalAverages?.annual && isPassing(generalAverages.annual)
                  ? 'text-purple-600'
                  : generalAverages?.annual
                    ? 'text-red-600'
                    : ''
                  }`}>
                  {generalAverages?.annual?.toFixed(2) || 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Attendance */}
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/20">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Attendance</p>
                <p className="text-xl font-bold text-green-600">
                  {attendance.summary?.percentage.toFixed(1) || 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Assignments */}
        <Card className={`bg-gradient-to-br ${assignments.overdue.length > 0
          ? 'from-red-500/10 to-red-600/5 border-red-200/50'
          : 'from-blue-500/10 to-blue-600/5 border-blue-200/50'
          }`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${assignments.overdue.length > 0 ? 'bg-red-500/20' : 'bg-blue-500/20'
                }`}>
                <ClipboardList className={`h-5 w-5 ${assignments.overdue.length > 0 ? 'text-red-600' : 'text-blue-600'
                  }`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tasks</p>
                <p className={`text-xl font-bold ${assignments.overdue.length > 0 ? 'text-red-600' : 'text-blue-600'
                  }`}>
                  {assignments.pending.length + assignments.overdue.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Exams */}
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-amber-500/20">
                <GraduationCap className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Exams</p>
                <p className="text-xl font-bold text-amber-600">
                  {exams.upcoming.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Academic Insights & Visualizations */}
      {generalAverages && (
        <StudentAcademicInsights
          grades={grades}
          quarterlyAverages={generalAverages}
        />
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Upcoming Deadlines */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Upcoming Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.pending.length === 0 && assignments.overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No pending assignments 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {/* Overdue first */}
                {assignments.overdue.slice(0, 2).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-red-50 border border-red-200">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.title}</p>
                      <p className="text-xs text-red-600">Overdue</p>
                    </div>
                  </div>
                ))}
                {/* Pending */}
                {assignments.pending.slice(0, 3).map((a) => {
                  const dueDate = new Date(a.due_date);
                  const daysLeft = differenceInDays(dueDate, new Date());
                  return (
                    <div key={a.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                      <ClipboardList className="h-4 w-4 text-blue-500" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {daysLeft === 0 ? 'Due today' : daysLeft === 1 ? 'Due tomorrow' : `${daysLeft} days left`}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {a.subjects?.code}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Exams */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Upcoming Exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exams.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No upcoming exams 🎉
              </p>
            ) : (
              <div className="space-y-3">
                {exams.upcoming.slice(0, 4).map((exam) => {
                  const examDate = new Date(exam.exam_date);
                  const daysLeft = differenceInDays(examDate, new Date());
                  const typeColors = EXAM_TYPE_COLORS[exam.exam_type];
                  return (
                    <div key={exam.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge className={`${typeColors.bg} ${typeColors.text} text-xs`}>
                            {exam.exam_type}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {exam.subjects?.name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(examDate, 'MMM d')} • {daysLeft === 0 ? 'Today!' : `${daysLeft} days`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Announcements */}
      {announcements.data && announcements.data.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Recent Announcements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {announcements.data.slice(0, 3).map((a) => {
                const priorityColors = PRIORITY_COLORS[a.priority];
                return (
                  <div key={a.id} className={`p-3 rounded-lg border ${priorityColors.border} ${priorityColors.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {a.is_pinned && <Badge variant="secondary" className="text-xs">Pinned</Badge>}
                      {a.priority !== 'normal' && (
                        <Badge className={`${priorityColors.bg} ${priorityColors.text} text-xs`}>
                          {a.priority}
                        </Badge>
                      )}
                    </div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{a.content}</p>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
