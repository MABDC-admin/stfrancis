// Railway PostgreSQL API Client
// Replaces Supabase client

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage
    this.token = localStorage.getItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Request failed' };
      }

      return { data };
    } catch (error) {
      console.error('API request error:', error);
      return { error: error instanceof Error ? error.message : 'Network error' };
    }
  }

  // Auth methods
  async signIn(email: string, password: string) {
    const response = await this.request<{ token: string; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.data?.token) {
      this.token = response.data.token;
      localStorage.setItem('auth_token', response.data.token);
    }

    return response;
  }

  async signOut() {
    this.token = null;
    localStorage.removeItem('auth_token');
    await this.request('/auth/logout', { method: 'POST' });
    return { data: null, error: null };
  }

  async getUser() {
    return this.request<{ user: any }>('/auth/me');
  }

  getToken() {
    return this.token;
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  // Database query methods
  async query<T>(table: string, options: {
    select?: string;
    eq?: [string, any];
    neq?: [string, any];
    in?: [string, any[]];
    gte?: [string, any];
    lte?: [string, any];
    order?: [string, { ascending?: boolean }];
    limit?: number;
    single?: boolean;
  } = {}): Promise<ApiResponse<T>> {
    const params = new URLSearchParams();
    
    if (options.select) params.append('select', options.select);
    if (options.eq) params.append('eq', JSON.stringify(options.eq));
    if (options.neq) params.append('neq', JSON.stringify(options.neq));
    if (options.in) params.append('in', JSON.stringify(options.in));
    if (options.gte) params.append('gte', JSON.stringify(options.gte));
    if (options.lte) params.append('lte', JSON.stringify(options.lte));
    if (options.order) params.append('order', JSON.stringify(options.order));
    if (options.limit) params.append('limit', options.limit.toString());
    if (options.single) params.append('single', 'true');

    return this.request<T>(`/data/${table}?${params.toString()}`);
  }

  async insert<T>(table: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(`/data/${table}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async update<T>(table: string, id: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(`/data/${table}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(table: string, id: string): Promise<ApiResponse<null>> {
    return this.request<null>(`/data/${table}/${id}`, {
      method: 'DELETE',
    });
  }

  // Storage methods
  async uploadFile(folder: string, file: File): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${API_URL}/storage/upload/${folder}`, {
        method: 'POST',
        headers,
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        return { error: data.error || 'Upload failed' };
      }

      return { data };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Upload failed' };
    }
  }

  async deleteFile(folder: string, filename: string): Promise<ApiResponse<null>> {
    return this.request<null>(`/storage/${folder}/${filename}`, {
      method: 'DELETE',
    });
  }

  getFileUrl(path: string): string {
    return `${API_URL}/storage/files${path}`;
  }
}

export const apiClient = new ApiClient();
export default apiClient;
