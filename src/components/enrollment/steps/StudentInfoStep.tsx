import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, Info, Search } from "lucide-react";
import { useMemo } from "react";
import { differenceInYears } from "date-fns";
import { SHS_STRANDS, GENDERS, requiresStrand } from "../constants";
import { useAcademicYear } from "@/contexts/AcademicYearContext";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StudentInfoStepProps {
    formData: any;
    errors: any;
    touched: any;
    handleChange: (field: string, value: string) => void;
    handleBlur: (field: string) => void;
}

export const StudentInfoStep = ({ formData, errors, touched, handleChange, handleBlur }: StudentInfoStepProps) => {
    const { selectedYear } = useAcademicYear();

    const hasLrn = formData.has_lrn === 'yes';
    const lrnDecided = formData.has_lrn === 'yes' || formData.has_lrn === 'no';

    const needsStrand = useMemo(() => {
        return requiresStrand(formData.level);
    }, [formData.level]);

    const calculatedAge = useMemo(() => {
        if (!formData.birth_date) return null;
        const birthDate = new Date(formData.birth_date);
        const age = differenceInYears(new Date(), birthDate);
        return age >= 0 ? age : null;
    }, [formData.birth_date]);

    const FieldError = ({ error }: { error?: string }) => {
        if (!error) return null;
        return (
            <div className="flex items-center gap-1 text-destructive text-sm mt-1">
                <AlertCircle className="h-3 w-3" />
                <span>{error}</span>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Academic Year Info Alert */}
            {selectedYear && (
                <Alert className="bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800">
                        <strong>Academic Year:</strong> {selectedYear.name} - Student will be enrolled in this academic year
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Grade Level — FIRST field */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">
                        Grade Level <span className="text-destructive">*</span>
                    </Label>
                    <Select value={formData.level} onValueChange={(v) => {
                        handleChange('level', v);
                        // Clear strand if switching away from Grade 11/12
                        if (!requiresStrand(v) && formData.strand) {
                            handleChange('strand', '');
                        }
                    }}>
                        <SelectTrigger className={`bg-secondary/50 ${errors.level && touched.level ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder="Select grade level" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value="Kindergarten">Kindergarten</SelectItem>
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                                <SelectLabel>Elementary (Grades 1-6)</SelectLabel>
                                {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'].map(level => (
                                    <SelectItem key={level} value={level}>{level}</SelectItem>
                                ))}
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                                <SelectLabel>Junior High School (Grades 7-10)</SelectLabel>
                                {['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10'].map(level => (
                                    <SelectItem key={level} value={level}>{level}</SelectItem>
                                ))}
                            </SelectGroup>
                            <SelectSeparator />
                            <SelectGroup>
                                <SelectLabel>Senior High School (Grades 11-12)</SelectLabel>
                                {['Grade 11', 'Grade 12'].map(level => (
                                    <SelectItem key={level} value={level}>{level}</SelectItem>
                                ))}
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    {touched.level && <FieldError error={errors.level} />}
                    {needsStrand && (
                        <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                            <Info className="h-3 w-3" />
                            <span>Senior High School requires strand selection below</span>
                        </p>
                    )}
                </div>
                
                {/* SHS Strand Selection (only for Grade 11 & 12) */}
                {needsStrand ? (
                    <div className="space-y-2">
                        <Label className="text-stat-purple">
                            SHS Strand <span className="text-destructive">*</span>
                        </Label>
                        <Select value={formData.strand || ''} onValueChange={(v) => handleChange('strand', v)}>
                            <SelectTrigger className={`bg-secondary/50 ${errors.strand && touched.strand ? 'border-destructive' : ''}`}>
                                <SelectValue placeholder="Select strand" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectGroup>
                                    <SelectLabel>Academic Track</SelectLabel>
                                    {SHS_STRANDS.filter(s => ['ABM', 'STEM', 'HUMSS', 'GAS'].includes(s.value)).map(strand => (
                                        <SelectItem key={strand.value} value={strand.value}>{strand.label}</SelectItem>
                                    ))}
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectGroup>
                                    <SelectLabel>Technical-Vocational-Livelihood (TVL)</SelectLabel>
                                    {SHS_STRANDS.filter(s => s.value.startsWith('TVL')).map(strand => (
                                        <SelectItem key={strand.value} value={strand.value}>{strand.label}</SelectItem>
                                    ))}
                                </SelectGroup>
                                <SelectSeparator />
                                <SelectGroup>
                                    <SelectLabel>Arts & Sports Track</SelectLabel>
                                    {SHS_STRANDS.filter(s => ['SPORTS', 'ARTS-DESIGN'].includes(s.value)).map(strand => (
                                        <SelectItem key={strand.value} value={strand.value}>{strand.label}</SelectItem>
                                    ))}
                                </SelectGroup>
                            </SelectContent>
                        </Select>
                        {touched.strand && <FieldError error={errors.strand} />}
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label className="text-stat-purple">
                            Academic Year <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            value={selectedYear?.name || 'No academic year selected'}
                            disabled
                            className="bg-secondary/30 text-muted-foreground cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">
                            Synced with current academic year selection
                        </p>
                    </div>
                )}

                {/* Full Name */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">
                        Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        placeholder="Enter learner's full name"
                        value={formData.student_name}
                        onChange={(e) => handleChange('student_name', e.target.value)}
                        onBlur={() => handleBlur('student_name')}
                        className={`bg-secondary/50 ${errors.student_name && touched.student_name ? 'border-destructive' : ''}`}
                    />
                    {touched.student_name && <FieldError error={errors.student_name} />}
                </div>

                {/* LRN Availability Toggle */}
                <div className="space-y-3 md:col-span-2">
                    <Label className="text-stat-purple">
                        Does the learner have an LRN? <span className="text-destructive">*</span>
                    </Label>
                    <RadioGroup
                        value={formData.has_lrn}
                        onValueChange={(v) => {
                            handleChange('has_lrn', v);
                            // Clear LRN value and errors when switching to "No"
                            if (v === 'no') {
                                handleChange('lrn', '');
                            }
                        }}
                        className="flex gap-6"
                    >
                        <div className="flex items-center gap-2">
                            <RadioGroupItem value="yes" id="has_lrn_yes" />
                            <Label htmlFor="has_lrn_yes" className="cursor-pointer font-normal">Yes, I have an LRN</Label>
                        </div>
                        <div className="flex items-center gap-2">
                            <RadioGroupItem value="no" id="has_lrn_no" />
                            <Label htmlFor="has_lrn_no" className="cursor-pointer font-normal">No LRN yet</Label>
                        </div>
                    </RadioGroup>
                    {touched.has_lrn && <FieldError error={errors.has_lrn} />}

                    {/* LRN Input — visible only when "Yes" is selected */}
                    {hasLrn && (
                        <div className="space-y-2 mt-2">
                            <Label className="text-stat-purple">
                                LRN (Learner Reference Number) <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Enter 12-digit LRN"
                                    value={formData.lrn}
                                    onChange={(e) => handleChange('lrn', e.target.value)}
                                    onBlur={() => handleBlur('lrn')}
                                    className={`pl-9 bg-secondary/50 ${errors.lrn && touched.lrn ? 'border-destructive' : ''}`}
                                    maxLength={12}
                                />
                            </div>
                            {touched.lrn && <FieldError error={errors.lrn} />}
                        </div>
                    )}

                    {/* Info note when "No" is selected */}
                    {formData.has_lrn === 'no' && (
                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                            <Info className="h-3 w-3" />
                            <span>A temporary reference will be generated. LRN can be updated later.</span>
                        </p>
                    )}
                </div>

                {/* Academic Year (shown when SHS strand occupies the second slot) */}
                {needsStrand && (
                    <div className="space-y-2">
                        <Label className="text-stat-purple">
                            Academic Year <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            value={selectedYear?.name || 'No academic year selected'}
                            disabled
                            className="bg-secondary/30 text-muted-foreground cursor-not-allowed"
                        />
                        <p className="text-xs text-muted-foreground">
                            Synced with current academic year selection
                        </p>
                    </div>
                )}

                {/* Birth Date */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">
                        Birth Date <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        type="date"
                        value={formData.birth_date}
                        onChange={(e) => handleChange('birth_date', e.target.value)}
                        onBlur={() => handleBlur('birth_date')}
                        className={`bg-secondary/50 ${errors.birth_date && touched.birth_date ? 'border-destructive' : ''}`}
                    />
                    {touched.birth_date && <FieldError error={errors.birth_date} />}
                </div>

                {/* Age */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">Age</Label>
                    <Input
                        value={calculatedAge !== null ? `${calculatedAge} years old` : ''}
                        placeholder="Auto-calculated from birth date"
                        disabled
                        className="bg-secondary/30 text-muted-foreground"
                    />
                </div>

                {/* Gender */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">
                        Gender <span className="text-destructive">*</span>
                    </Label>
                    <Select value={formData.gender} onValueChange={(v) => handleChange('gender', v)}>
                        <SelectTrigger className={`bg-secondary/50 ${errors.gender && touched.gender ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent>
                            {GENDERS.map(gender => (
                                <SelectItem key={gender} value={gender}>{gender}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {touched.gender && <FieldError error={errors.gender} />}
                </div>

                {/* Mother Tongue */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">Mother Tongue</Label>
                    <Input
                        placeholder="e.g. Cebuano"
                        value={formData.mother_tongue}
                        onChange={(e) => handleChange('mother_tongue', e.target.value)}
                        className="bg-secondary/50"
                    />
                </div>

                {/* Dialects */}
                <div className="space-y-2">
                    <Label className="text-stat-purple">Dialects</Label>
                    <Input
                        placeholder="e.g. English, Tagalog"
                        value={formData.dialects}
                        onChange={(e) => handleChange('dialects', e.target.value)}
                        className="bg-secondary/50"
                    />
                </div>
            </div>
        </div>
    );
};
