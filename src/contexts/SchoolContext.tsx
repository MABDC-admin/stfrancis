import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { db } from '@/lib/db-client';
import { setSchoolIdMapping } from '@/utils/schoolIdMap';

export type SchoolType = string;

interface SchoolTheme {
  name: string;
  fullName: string;
  sidebarBg: string;
  sidebarText: string;
  menuActiveBg: string;
  menuActiveText: string;
  menuHoverBg: string;
  pageBg: string;
  accentColor: string;
  primaryHue: string;
  schoolId: string;
  region: string;
  division: string;
  district: string;
}

// Default theme for all schools
const DEFAULT_THEME = {
  sidebarBg: 'from-blue-900 to-indigo-800',
  sidebarText: 'text-blue-100',
  menuActiveBg: 'bg-blue-500',
  menuActiveText: 'text-white',
  menuHoverBg: 'hover:bg-blue-700/50',
  pageBg: 'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20',
  accentColor: '#3b82f6',
  primaryHue: '217',
  region: 'Region III',
  division: 'Tarlac',
  district: 'Capas',
};

export const SCHOOL_THEMES: Record<SchoolType, SchoolTheme> = {};

interface SchoolContextType {
  selectedSchool: SchoolType;
  setSelectedSchool: (school: SchoolType) => void;
  schoolTheme: SchoolTheme;
  canSwitchSchool: boolean;
  setCanSwitchSchool: (can: boolean) => void;
  schools: Array<{ code: string; name: string; id: string }>;
  isLoadingSchools: boolean;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export const SchoolProvider = ({ children }: { children: ReactNode }) => {
  const [schools, setSchools] = useState<Array<{ code: string; name: string; id: string }>>([]);
  const [isLoadingSchools, setIsLoadingSchools] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState<SchoolType>('');

  useEffect(() => {
    const fetchSchools = async () => {
      try {
        // Check if we're using Railway and if we have auth token
        const useRailway = import.meta.env.VITE_USE_RAILWAY === 'true';
        const hasToken = localStorage.getItem('auth_token');
        
        // Skip fetching if using Railway and no token (e.g., on login page)
        if (useRailway && !hasToken) {
          console.log('[SchoolContext] Skipping school fetch - no auth token (login page)');
          setIsLoadingSchools(false);
          // Set a default school for the login page
          setSelectedSchool('SFXSAI');
          SCHOOL_THEMES['SFXSAI'] = {
            name: 'SFXSAI',
            fullName: 'St. Francis Xavier Smart Academy Inc',
            ...DEFAULT_THEME,
            schoolId: '',
          };
          return;
        }

        const { data, error } = await db
          .from('schools')
          .select('id, code, name')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (!error && data && data.length > 0) {
          setSchools(data);
          // Auto-select first school if none selected
          if (!selectedSchool) {
            setSelectedSchool(data[0].code);
          }
          
          // Build SCHOOL_THEMES dynamically
          data.forEach((school: any) => {
            SCHOOL_THEMES[school.code] = {
              name: school.code,
              fullName: school.name,
              ...DEFAULT_THEME,
              schoolId: school.id,
            };
            // Also update the schoolIdMap
            setSchoolIdMapping(school.code, school.id);
          });
        }
      } catch (error) {
        console.error('Error loading schools:', error);
        // Fallback for login page
        setSelectedSchool('SFXSAI');
        SCHOOL_THEMES['SFXSAI'] = {
          name: 'SFXSAI',
          fullName: 'St. Francis Xavier Smart Academy Inc',
          ...DEFAULT_THEME,
          schoolId: '',
        };
      } finally {
        setIsLoadingSchools(false);
      }
    };

    fetchSchools();
  }, []);

  const schoolTheme = SCHOOL_THEMES[selectedSchool] || {
    name: selectedSchool,
    fullName: selectedSchool,
    ...DEFAULT_THEME,
    schoolId: '',
  };

  return (
    <SchoolContext.Provider value={{
      selectedSchool,
      setSelectedSchool,
      schoolTheme,
      canSwitchSchool: schools.length > 1,
      setCanSwitchSchool: () => {},
      schools,
      isLoadingSchools
    }}>
      {children}
    </SchoolContext.Provider>
  );
};

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (context === undefined) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
};
