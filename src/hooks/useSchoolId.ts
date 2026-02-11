import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';

/**
 * Hook to get the database school_id for the currently selected school
 */
export const useSchoolId = () => {
  const { selectedSchool } = useSchool();
  
  return useQuery({
    queryKey: ['school-id', selectedSchool],
    queryFn: async () => {
      if (!selectedSchool) return null;

      const { data, error } = await db
        .from('schools')
        .select('id')
        .eq('code', selectedSchool)
        .maybeSingle();
      
      if (error) {
        console.warn('Could not find school:', selectedSchool, error);
        return null;
      }
      
      return data?.id || null;
    },
    enabled: !!selectedSchool,
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
  });
};
