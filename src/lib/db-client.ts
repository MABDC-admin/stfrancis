// Unified database client that switches between Supabase and Railway
import { supabase } from '@/integrations/supabase/client';

const USE_RAILWAY = import.meta.env.VITE_USE_RAILWAY === 'true';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Railway API helper
class RailwayClient {
  private getToken() {
    return localStorage.getItem('auth_token');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const token = this.getToken();
    
    console.log(`[Railway] Request: ${endpoint}`);
    console.log(`[Railway] Token present: ${!!token}`);
    
    try {
      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      console.log(`[Railway] Response status: ${response.status}`);
      
      if (!response.ok) {
        let errorText = '';
        let errorObj: any = null;
        
        try {
          // Try to parse as JSON first
          errorObj = await response.json();
          errorText = errorObj.error || JSON.stringify(errorObj);
        } catch {
          // If not JSON, get as text
          errorText = await response.text();
        }
        
        console.error(`[Railway] Error response:`, errorText);
        throw new Error(errorText || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[Railway] Success:`, data);
      return data;
    } catch (error: any) {
      console.error(`[Railway] Request failed:`, error);
      throw error;
    }
  }

  // Supabase-like query builder
  from(table: string) {
    return {
      select: (columns: string = '*') => {
        const filters: any = { eqs: [] };

        const builder: any = {
          eq: (column: string, value: any) => {
            filters.eqs.push([column, value]);
            return builder;
          },
          neq: (column: string, value: any) => {
            filters.neq = [column, value];
            return builder;
          },
          in: (column: string, values: any[]) => {
            filters.in = [column, values];
            return builder;
          },
          gt: (column: string, value: any) => {
            filters.gt = [column, value];
            return builder;
          },
          gte: (column: string, value: any) => {
            filters.gte = [column, value];
            return builder;
          },
          lt: (column: string, value: any) => {
            filters.lt = [column, value];
            return builder;
          },
          lte: (column: string, value: any) => {
            filters.lte = [column, value];
            return builder;
          },
          order: (column: string, options?: { ascending?: boolean }) => {
            filters.order = [column, options?.ascending ? 'asc' : 'desc'];
            return builder;
          },
          limit: (count: number) => {
            filters.limit = count;
            return builder;
          },
          single: async () => {
            filters.single = true;
            return await builder.execute();
          },
          maybeSingle: async () => {
            filters.single = true;
            return await builder.execute();
          },
          execute: async () => {
            try {
              const params = new URLSearchParams();
              if (columns !== '*') params.append('select', columns);
              // Support multiple eq filters
              for (const eq of filters.eqs) {
                params.append('eq', JSON.stringify(eq));
              }
              if (filters.neq) params.append('neq', JSON.stringify(filters.neq));
              if (filters.in) params.append('in', JSON.stringify(filters.in));
              if (filters.gt) params.append('gt', JSON.stringify(filters.gt));
              if (filters.gte) params.append('gte', JSON.stringify(filters.gte));
              if (filters.lt) params.append('lt', JSON.stringify(filters.lt));
              if (filters.lte) params.append('lte', JSON.stringify(filters.lte));
              if (filters.order) params.append('order', JSON.stringify(filters.order));
              if (filters.limit) params.append('limit', filters.limit.toString());
              if (filters.single) params.append('single', 'true');

              const data = await this.request(`/data/${table}?${params}`);
              return { data, error: null };
            } catch (error: any) {
              return { data: null, error };
            }
          }
        };

        // Make the builder thenable
        builder.then = (resolve: any, reject: any) => {
          return builder.execute().then(resolve, reject);
        };

        return builder;
      },

      insert: (data: any) => {
        // Support both single objects and arrays for Railway.
        // Single-item arrays are unwrapped for backward compatibility (RETURNING single row).
        const isArray = Array.isArray(data);
        const isBulk = isArray && data.length > 1;
        const payload = isArray && data.length === 1 ? data[0] : data;
        let _selectCols: string | null = null;

        const builder: any = {
          // Supabase-compatible .select() chaining after insert
          select: (columns?: string) => {
            _selectCols = columns || '*';
            return builder;
          },
          single: async () => {
            const result = await builder.execute();
            // Result.data is already a single row from RETURNING *
            return result;
          },
          execute: async () => {
            try {
              const result = await this.request(`/data/${table}`, {
                method: 'POST',
                body: JSON.stringify(payload)
              });
              // If specific columns were requested, filter the result
              if (_selectCols && _selectCols !== '*' && result && !isBulk) {
                const cols = _selectCols.split(',').map((c: string) => c.trim());
                const filtered: any = {};
                for (const col of cols) {
                  if (col in result) filtered[col] = result[col];
                }
                return { data: filtered, error: null };
              }
              return { data: result, error: null };
            } catch (error: any) {
              return { data: null, error };
            }
          }
        };

        builder.then = (resolve: any, reject: any) => {
          return builder.execute().then(resolve, reject);
        };

        return builder;
      },

      update: (data: any) => {
        const filters: any = { eqs: [] };

        const builder: any = {
          eq: (column: string, value: any) => {
            filters.eqs.push([column, value]);
            return builder;
          },
          neq: (column: string, value: any) => {
            filters.neq = [column, value];
            return builder;
          },
          in: (column: string, values: any[]) => {
            filters.in = [column, values];
            return builder;
          },
          execute: async () => {
            try {
              const params = new URLSearchParams();
              for (const eq of filters.eqs) {
                params.append('eq', JSON.stringify(eq));
              }
              if (filters.neq) params.append('neq', JSON.stringify(filters.neq));
              if (filters.in) params.append('in', JSON.stringify(filters.in));

              const result = await this.request(`/data/${table}?${params}`, {
                method: 'PUT',
                body: JSON.stringify(data)
              });
              return { data: result, error: null };
            } catch (error: any) {
              return { data: null, error };
            }
          }
        };

        builder.then = (resolve: any, reject: any) => {
          return builder.execute().then(resolve, reject);
        };

        return builder;
      },

      delete: () => {
        const filters: any = { eqs: [] };

        const builder: any = {
          eq: (column: string, value: any) => {
            filters.eqs.push([column, value]);
            return builder;
          },
          neq: (column: string, value: any) => {
            filters.neq = [column, value];
            return builder;
          },
          in: (column: string, values: any[]) => {
            filters.in = [column, values];
            return builder;
          },
          execute: async () => {
            try {
              const params = new URLSearchParams();
              for (const eq of filters.eqs) {
                params.append('eq', JSON.stringify(eq));
              }
              if (filters.neq) params.append('neq', JSON.stringify(filters.neq));
              if (filters.in) params.append('in', JSON.stringify(filters.in));

              await this.request(`/data/${table}?${params}`, {
                method: 'DELETE'
              });
              return { error: null };
            } catch (error: any) {
              return { error };
            }
          }
        };

        builder.then = (resolve: any, reject: any) => {
          return builder.execute().then(resolve, reject);
        };

        return builder;
      }
    };
  }

  // Auth methods
  auth = {
    getUser: async () => {
      if (!this.getToken()) {
        return { data: { user: null }, error: null };
      }
      try {
        const user = await this.request('/auth/me');
        return { data: { user }, error: null };
      } catch (error: any) {
        return { data: { user: null }, error };
      }
    }
  };
}

// Export unified client
export const db = USE_RAILWAY ? new RailwayClient() : supabase;
