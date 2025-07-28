import { IDataObject, IHttpRequestMethods, IHttpRequestOptions } from 'n8n-workflow';

export interface CribopsHttpConfig {
  baseUrl: string;
  apiToken: string;
  timeout?: number;
}

export interface CribopsAgent {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive';
  tenantId: string;
  organizationId: string;
  metadata?: IDataObject;
}

export interface CribopsWebhookMessage {
  id: string;
  type: 'user_message' | 'agent_response';
  content: string;
  conversationId: string;
  userId?: string;
  agentId: string;
  timestamp: string;
  metadata?: IDataObject;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

export interface CribopsQueueMessage {
  id: number;
  correlation_id: string;
  queue_name: string;
  data: {
    data: string;
    params: IDataObject;
    headers: IDataObject;
  };
  inserted_at: string;
}

export interface CribopsWebhookEntity {
  id: string;
  name: string;
  description?: string;
  type: 'N8N' | 'GHL_API' | 'GENERIC';
  status: 'active' | 'inactive';
  linked_workflow_id?: string;
  linked_workflow_name?: string;
  organization_id: string;
  created_at: string;
  updated_at: string;
}


export class CribopsHttp {
  private config: CribopsHttpConfig;

  constructor(config: CribopsHttpConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  private async makeRequest<T>(
    method: IHttpRequestMethods,
    endpoint: string,
    data?: IDataObject,
    options?: Partial<IHttpRequestOptions>
  ): Promise<T> {
    let url = `${this.config.baseUrl}${endpoint}`;
    
    // Handle query parameters for GET requests
    if (method === 'GET' && data && Object.keys(data).length > 0) {
      const params = new URLSearchParams();
      Object.entries(data as Record<string, any>).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
      // Clear data for GET requests as params are in URL
      data = undefined;
    }
    
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${this.config.apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (options?.headers) {
      Object.keys(options.headers).forEach(key => {
        requestHeaders[key] = String(options.headers![key]);
      });
    }

    try {
      const response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: (method !== 'GET' && data) ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        let errorText = await response.text();
        let errorDetail = '';
        
        // Try to parse error response as JSON
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.error || errorText;
        } catch {
          errorDetail = errorText;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorDetail}`);
      }

      const result = await response.json();
      return result as T;
    } catch (error) {
      throw new Error(`Request failed: ${error}`);
    }
  }

  async getAgents(): Promise<CribopsAgent[]> {
    try {
      const response = await this.makeRequest<{ agents: CribopsAgent[] }>('GET', '/api/v1/agents');
      return response.agents || [];
    } catch (error) {
      throw new Error(`Failed to fetch agents: ${error}`);
    }
  }

  async getAgent(agentId: string): Promise<CribopsAgent> {
    try {
      const response = await this.makeRequest<{ agent: CribopsAgent }>('GET', `/api/v1/agents/${agentId}`);
      return response.agent;
    } catch (error) {
      throw new Error(`Failed to fetch agent ${agentId}: ${error}`);
    }
  }

  async sendMessage(agentId: string, message: Partial<CribopsWebhookMessage>): Promise<CribopsWebhookMessage> {
    try {
      const response = await this.makeRequest<{ message: CribopsWebhookMessage }>(
        'POST',
        `/webhooks/agents/${agentId}/message`,
        message
      );
      return response.message;
    } catch (error) {
      throw new Error(`Failed to send message to agent ${agentId}: ${error}`);
    }
  }


  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.apiToken}`,
        },
      });

      if (!response.ok) {
        let errorText = await response.text();
        let errorDetail = '';
        
        // Try to parse error response as JSON
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.message || errorJson.error || errorText;
        } catch {
          errorDetail = errorText;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorDetail}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw new Error(`Failed to download file: ${error}`);
    }
  }

  async validateWebhook(payload: any, signature: string): Promise<boolean> {
    // Implement webhook signature validation if needed
    // This would typically use HMAC verification
    return true;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getAgents();
      return true;
    } catch (error) {
      return false;
    }
  }

  async sendTypingIndicator(agentId: string, conversationId: string, typing: boolean): Promise<any> {
    try {
      const response = await this.makeRequest<any>(
        'POST',
        `/api/agents/${agentId}/callback`,
        {
          data: {
            typing: typing,
          },
          conversation_id: conversationId,
          callback_type: 'typing',
        }
      );
      return response;
    } catch (error) {
      throw new Error(`Failed to send typing indicator for agent ${agentId}: ${error}`);
    }
  }

  async pollQueue(tenantId: string, limit: number = 10, queueName?: string): Promise<CribopsQueueMessage[]> {
    try {
      const params: IDataObject = { limit };
      if (queueName) {
        params.queue_name = queueName;
      }
      
      const url = `/api/queue/${tenantId}/poll?${new URLSearchParams(params as any).toString()}`;
      const response = await this.makeRequest<CribopsQueueMessage[]>('GET', url);
      return response;
    } catch (error) {
      throw new Error(`Failed to poll queue for tenant ${tenantId}: ${error}`);
    }
  }

  async acknowledgeMessages(tenantId: string, messageIds: number[]): Promise<{ status: string; deleted_count: number }> {
    try {
      const response = await this.makeRequest<{ status: string; deleted_count: number }>(
        'POST',
        `/api/queue/${tenantId}/acknowledge`,
        { message_ids: messageIds }
      );
      return response;
    } catch (error) {
      throw new Error(`Failed to acknowledge messages for tenant ${tenantId}: ${error}`);
    }
  }

  async failMessages(tenantId: string, messageIds: number[], errorMessage: string): Promise<{ status: string; updated_count: number }> {
    try {
      const response = await this.makeRequest<{ status: string; updated_count: number }>(
        'POST',
        `/api/queue/${tenantId}/fail`,
        { message_ids: messageIds, error_message: errorMessage }
      );
      return response;
    } catch (error) {
      throw new Error(`Failed to mark messages as failed for tenant ${tenantId}: ${error}`);
    }
  }

  // Webhook-specific methods
  async getWebhooks(): Promise<CribopsWebhookEntity[]> {
    try {
      // Organization is automatically determined from API key
      const response = await this.makeRequest<any>('GET', '/api/v1/webhooks');
      
      // Handle different response structures
      // The API might return webhooks directly as array or wrapped in data property
      if (Array.isArray(response)) {
        return response as CribopsWebhookEntity[];
      } else if (response.data && Array.isArray(response.data)) {
        return response.data as CribopsWebhookEntity[];
      } else if (response.webhooks && Array.isArray(response.webhooks)) {
        return response.webhooks as CribopsWebhookEntity[];
      } else {
        // If we can't find webhooks, return empty array
        return [];
      }
    } catch (error) {
      throw new Error(`Failed to fetch webhooks: ${error}`);
    }
  }

  async linkWebhook(webhookId: string, linkData: {
    workflow_id: string;
    webhook_url: string;
    test_webhook_url: string;
    workflow_name: string;
  }): Promise<any> {
    try {
      return await this.makeRequest('POST', `/api/v1/webhooks/${webhookId}/link`, linkData);
    } catch (error) {
      throw new Error(`Failed to link webhook: ${error}`);
    }
  }

  async unlinkWebhook(webhookId: string): Promise<any> {
    try {
      return await this.makeRequest('DELETE', `/api/v1/webhooks/${webhookId}/link`);
    } catch (error) {
      throw new Error(`Failed to unlink webhook: ${error}`);
    }
  }

  // Generic request method for custom API calls
  async request<T = any>(method: IHttpRequestMethods, endpoint: string, data?: IDataObject, options?: Partial<IHttpRequestOptions>): Promise<T> {
    return this.makeRequest<T>(method, endpoint, data, options);
  }
}