/**
 * Functions API Client
 * Replaces Supabase Edge Functions with backend API calls
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface FunctionResponse<T = any> {
  data: T | null;
  error: Error | null;
}

/**
 * Get auth token from localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('auth_token');
}

/**
 * Make an authenticated API call to the functions endpoint
 */
async function invokeFunction<T = any>(
  functionName: string,
  options: {
    body?: any;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  } = {}
): Promise<FunctionResponse<T>> {
  const { body, method = 'POST' } = options;
  
  const token = getAuthToken();
  
  try {
    const response = await fetch(`${API_URL}/api/functions/${functionName}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        data: null,
        error: new Error(data.error || `Function ${functionName} failed: ${response.status}`),
      };
    }

    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error('Unknown error'),
    };
  }
}

/**
 * Functions client with method shortcuts
 */
export const functions = {
  /**
   * Invoke a function with POST body
   */
  invoke: <T = any>(functionName: string, options?: { body?: any }) =>
    invokeFunction<T>(functionName, { ...options, method: 'POST' }),

  /**
   * QR Code Generation
   */
  generateStudentQR: (studentId: string) =>
    invokeFunction<{ qr_data_url: string }>('generate-student-qr', {
      body: { student_id: studentId },
    }),

  /**
   * Send enrollment email
   */
  sendEnrollmentEmail: (data: {
    to: string;
    studentName: string;
    school: string;
    username: string;
    password?: string;
    qrCodeUrl?: string;
  }) =>
    invokeFunction('send-enrollment-email', { body: data }),

  /**
   * Send admission email
   */
  sendAdmissionEmail: (data: {
    to: string;
    studentName: string;
    school: string;
    status: string;
    message?: string;
  }) =>
    invokeFunction('send-admission-email', { body: data }),

  /**
   * Zoom authentication
   */
  zoomAuth: (meetingNumber: string, role: number = 0) =>
    invokeFunction<{ signature: string; zakToken: string | null; sdkKey: string }>(
      'zoom-auth',
      { body: { meetingNumber, role } }
    ),

  /**
   * AI Chat for notebooks
   */
  notebookChat: async (data: {
    messages: Array<{ role: string; content: string }>;
    systemPrompt?: string;
    model?: string;
    pdfText?: string;
    pdfFilename?: string;
  }) => {
    const token = getAuthToken();
    
    // This returns a streaming response
    const response = await fetch(`${API_URL}/api/functions/notebook-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'AI chat failed');
    }

    return response; // Return the streaming response
  },

  /**
   * Create users (credentials)
   */
  createUsers: (data: {
    username: string;
    password: string;
    role: string;
    student_id?: string;
    school_id?: string;
    name?: string;
    teacher_id?: string;
  }) =>
    invokeFunction<{ id: string; username: string }>('create-users', { body: data }),

  /**
   * TacticalRMM proxy
   */
  tacticalrmmProxy: (action: string, data?: any) =>
    invokeFunction(`tacticalrmm-proxy/${action}`, { body: data }),

  /**
   * Omada proxy
   */
  omadaProxy: (action: string, data?: any) =>
    invokeFunction(`omada-proxy/${action}`, { body: data }),

  /**
   * Document analysis
   */
  analyzeDocument: (data: { file_url: string; prompt?: string }) =>
    invokeFunction('analyze-document', { body: data }),

  /**
   * Page detection for books
   */
  detectPageNumber: (data: { image_url: string }) =>
    invokeFunction<{ page_number: number | null }>('detect-page-number', { body: data }),

  /**
   * Book search
   */
  searchBooks: (data: { query: string; school_id?: string }) =>
    invokeFunction('search-books', { body: data }),

  /**
   * OCR index book
   */
  ocrIndexBook: (data: { book_id: string; page_images: string[] }) =>
    invokeFunction('ocr-index-book', { body: data }),
};

export default functions;
