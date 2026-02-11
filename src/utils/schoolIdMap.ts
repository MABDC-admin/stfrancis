/**
 * School ID Mapping - Dynamic loading from database
 * This mapping is now populated dynamically from the schools table
 */
export const SCHOOL_ID_MAP: Record<string, string> = {};

/**
 * Set a school code to UUID mapping (called by SchoolContext)
 */
export const setSchoolIdMapping = (schoolCode: string, uuid: string): void => {
  SCHOOL_ID_MAP[schoolCode] = uuid;
};

/**
 * Resolve a school text code to its database UUID.
 */
export const getSchoolId = (schoolCode: string): string | undefined => {
  return SCHOOL_ID_MAP[schoolCode];
};
