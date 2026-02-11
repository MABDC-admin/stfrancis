import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db-client';
import { Student, StudentFormData } from '@/types/student';
import { toast } from 'sonner';
import { useSchool } from '@/contexts/SchoolContext';
import { useAcademicYear } from '@/contexts/AcademicYearContext';
import { useSchoolId } from '@/hooks/useSchoolId';

export const useStudents = () => {
  const { data: schoolId, isLoading: isLoadingSchoolId, isError: isSchoolIdError } = useSchoolId();
  const { selectedYearId, isLoading: isLoadingYear } = useAcademicYear();

  // Determine if we're still waiting for context values
  const isContextsReady = !isLoadingSchoolId && !isLoadingYear && !!schoolId && !!selectedYearId;

  const query = useQuery({
    queryKey: ['students', schoolId, selectedYearId],
    queryFn: async (): Promise<Student[]> => {
      if (!schoolId || !selectedYearId) {
        console.warn('[useStudents] Missing required context:', { schoolId, selectedYearId });
        return [];
      }

      const { data, error } = await db
        .from('students')
        .select('*')
        .eq('school_id', schoolId)
        .eq('academic_year_id', selectedYearId)
        .order('student_name', { ascending: true });

      if (error) {
        console.error('Error fetching students:', error);
        throw error;
      }

      return (data || []) as Student[];
    },
    retry: 2,
    staleTime: 30000,
    enabled: isContextsReady,
    // Refetch when window regains focus if data might be stale
    refetchOnWindowFocus: true,
  });

  // Return combined loading state: true if contexts are loading OR query is loading/fetching
  return {
    ...query,
    isLoading: isLoadingSchoolId || isLoadingYear || query.isLoading || query.isFetching,
    // Expose whether contexts are ready for debugging
    isContextsReady,
  };
};

export const useCreateStudent = () => {
  const queryClient = useQueryClient();
  const { data: schoolId } = useSchoolId();
  const { selectedYearId, isReadOnly } = useAcademicYear();

  return useMutation({
    mutationFn: async (student: StudentFormData) => {
      if (isReadOnly) {
        throw new Error('Cannot add students to a read-only academic year. Switch to the current academic year.');
      }

      const enriched: any = {
        ...student,
        school_id: schoolId,
        academic_year_id: selectedYearId,
      };

      const { data, error } = await (db
        .from('students') as any)
        .insert(enriched);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Learner added successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to add learner: ' + error.message);
    },
  });
};

export const useUpdateStudent = () => {
  const queryClient = useQueryClient();
  const { isReadOnly } = useAcademicYear();

  return useMutation({
    mutationFn: async ({ id, ...student }: StudentFormData & { id: string }) => {
      if (isReadOnly) {
        throw new Error('Cannot modify students in a read-only academic year. Switch to the current academic year.');
      }

      const { data, error } = await db
        .from('students')
        .update(student)
        .eq('id', id);

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Learner updated successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to update learner: ' + error.message);
    },
  });
};

export const useDeleteStudent = () => {
  const queryClient = useQueryClient();
  const { isReadOnly } = useAcademicYear();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isReadOnly) {
        throw new Error('Cannot delete students from a read-only academic year.');
      }

      const { error } = await db
        .from('students')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success('Learner deleted successfully');
    },
    onError: (error: Error) => {
      toast.error('Failed to delete learner: ' + error.message);
    },
  });
};

export const useBulkCreateStudents = () => {
  const queryClient = useQueryClient();
  const { data: schoolId } = useSchoolId();
  const { selectedYearId, isReadOnly } = useAcademicYear();

  return useMutation({
    mutationFn: async (students: StudentFormData[]) => {
      if (isReadOnly) {
        throw new Error('Cannot import students to a read-only academic year.');
      }

      if (!schoolId || !selectedYearId) {
        throw new Error('School or academic year not selected. Please select both before importing.');
      }

      // Enrich each record with school_id and academic_year_id from current context
      const results = [];
      for (const student of students) {
        const enriched: any = {
          ...student,
          school_id: schoolId,
          academic_year_id: selectedYearId,
        };

        const { data, error } = await (db
          .from('students') as any)
          .insert(enriched);

        if (error) throw error;
        results.push(data);
      }
      return results;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      toast.success(`${data.length} learners imported successfully`);
    },
    onError: (error: Error) => {
      toast.error('Failed to import learners: ' + error.message);
    },
  });
};
