import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/db-client';
import { useSchool } from '@/contexts/SchoolContext';
import { useSchoolId } from '@/hooks/useSchoolId';

export interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  is_archived: boolean;
  school_id: string;
}

interface AcademicYearContextType {
  academicYears: AcademicYear[];
  selectedYearId: string | null;
  selectedYear: AcademicYear | null;
  setSelectedYearId: (id: string) => void;
  isLoading: boolean;
  refetch: () => Promise<void>;
  /** Whether the selected year is read-only (archived or not current) */
  isReadOnly: boolean;
  /** Whether the selected year is the current active year */
  isCurrentYear: boolean;
}

const AcademicYearContext = createContext<AcademicYearContextType | undefined>(undefined);

export const AcademicYearProvider = ({ children }: { children: ReactNode }) => {
  const { data: schoolId, isLoading: isLoadingSchoolId } = useSchoolId();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [selectedYearId, setSelectedYearIdState] = useState<string | null>(() => {
    return localStorage.getItem('selected-academic-year');
  });
  const [isFetchingYears, setIsFetchingYears] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchAcademicYears = async () => {
    if (!schoolId) return;
    setIsFetchingYears(true);
    try {
      const { data, error } = await db
        .from('academic_years')
        .select('*')
        .eq('school_id', schoolId)
        .order('start_date', { ascending: true });

      if (error) throw error;

      const years = (data || []) as AcademicYear[];
      setAcademicYears(years);

      // If no year is selected or the selected year doesn't exist in this school, select the current one
      const savedYearExists = years.some(y => y.id === selectedYearId);
      if (!selectedYearId || !savedYearExists) {
        const currentYear = years.find(y => y.is_current);
        if (currentYear) {
          setSelectedYearIdState(currentYear.id);
          localStorage.setItem('selected-academic-year', currentYear.id);
        } else if (years.length > 0) {
          setSelectedYearIdState(years[0].id);
          localStorage.setItem('selected-academic-year', years[0].id);
        }
      }
      setHasFetched(true);
    } catch (error) {
      console.error('Error fetching academic years:', error);
      setHasFetched(true); // Mark as fetched even on error to prevent stuck loading
    } finally {
      setIsFetchingYears(false);
    }
  };

  useEffect(() => {
    if (schoolId) {
      fetchAcademicYears();
    } else if (!isLoadingSchoolId) {
      // schoolId is null/undefined and not loading - no school found
      setHasFetched(true);
      setIsFetchingYears(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, isLoadingSchoolId]);

  const setSelectedYearId = (id: string) => {
    setSelectedYearIdState(id);
    localStorage.setItem('selected-academic-year', id);
  };

  const selectedYear = academicYears.find(y => y.id === selectedYearId) || null;
  const isCurrentYear = selectedYear?.is_current === true;
  const isReadOnly = selectedYear ? (selectedYear.is_archived || !selectedYear.is_current) : false;

  // Combined loading: true if schoolId is loading OR we're fetching years OR we haven't fetched yet (and schoolId exists)
  const isLoading = isLoadingSchoolId || isFetchingYears || (!hasFetched && !!schoolId);

  return (
    <AcademicYearContext.Provider value={{ 
      academicYears,
      selectedYearId,
      selectedYear,
      setSelectedYearId,
      isLoading,
      refetch: fetchAcademicYears,
      isReadOnly,
      isCurrentYear
    }}>
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => {
  const context = useContext(AcademicYearContext);
  if (context === undefined) {
    throw new Error('useAcademicYear must be used within an AcademicYearProvider');
  }
  return context;
};
