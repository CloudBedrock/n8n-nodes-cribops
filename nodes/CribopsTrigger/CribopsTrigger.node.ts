import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  IWebhookFunctions,
  IWebhookResponseData,
  IHookFunctions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  NodeConnectionType,
  NodeOperationError,
} from 'n8n-workflow';

import { CribopsHttp } from '../../utils/CribopsHttp';

export class CribopsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cribops Trigger',
    name: 'cribopsTrigger',
    icon: 'file:cribopstrigger.svg',
    group: ['trigger'],
    version: 1,
    description: 'Triggers when receiving messages via Cribops webhook',
    defaults: {
      name: 'Cribops Trigger',
    },
    inputs: [],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'cribopsApi',
        required: true,
      },
    ],
    webhooks: [
      {
        name: 'default',
        httpMethod: 'POST',
        responseMode: 'onReceived',
        path: '={{$parameter["webhookId"]}}',
        isFullPath: false,
      },
    ],
    properties: [
      {
        displayName: 'Webhook Name or ID',
        name: 'webhookId',
        type: 'options',
        required: true,
        typeOptions: {
          loadOptionsMethod: 'getWebhooks',
        },
        default: '',
        description: 'The Cribops webhook to use. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Event Types',
        name: 'eventTypes',
        type: 'multiOptions',
        options: [
          {
            name: 'Agent Response',
            value: 'agent_response',
            description: 'Responses from agents',
          },
          {
            name: 'User Message',
            value: 'user_message',
            description: 'Messages from users',
          },
          {
            name: 'File Attachment',
            value: 'file_attachment',
            description: 'File attachments',
          },
          {
            name: 'System Event',
            value: 'system_event',
            description: 'System events and notifications',
          },
        ],
        default: ['user_message', 'agent_response'],
        description: 'Types of events to trigger on',
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
          {
            displayName: 'Secret Token',
            name: 'secretToken',
            type: 'string',
            typeOptions: {
              password: true,
            },
            default: '',
            description: 'Secret token for webhook signature validation',
          },
          {
            displayName: 'Include Headers',
            name: 'includeHeaders',
            type: 'boolean',
            default: false,
            description: 'Whether to include the webhook headers in the output',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      async getWebhooks(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials('cribopsApi');
        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Call the API to get available webhooks
          // The API endpoint would be something like GET /api/v1/webhooks
          const response = await cribopsHttp.request('GET', '/api/v1/webhooks');
          const webhooks = response.data || [];
          
          return webhooks.map((webhook: any) => ({
            name: webhook.name || webhook.id,
            value: webhook.id,
            description: webhook.description || `Webhook ID: ${webhook.id}`,
          }));
        } catch (error) {
          throw new NodeOperationError(this.getNode(), `Failed to load webhooks: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        // Always return false to create webhook registration
        // The actual webhook already exists in Cribops backend
        return false;
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const webhookId = this.getNodeParameter('webhookId') as string;
        const eventTypes = this.getNodeParameter('eventTypes', []) as string[];
        const additionalFields = this.getNodeParameter('additionalFields', {}) as IDataObject;
        const credentials = await this.getCredentials('cribopsApi');

        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Register this n8n webhook URL with the Cribops webhook
          const body = {
            webhook_id: webhookId,
            target_url: webhookUrl,
            event_types: eventTypes,
            secret: additionalFields.secretToken || undefined,
          };

          // Register the n8n webhook URL with Cribops
          await cribopsHttp.request('POST', `/api/v1/webhooks/${webhookId}/targets`, body);
          
          // Store webhook data for later use
          const webhookData = this.getWorkflowStaticData('node');
          webhookData.webhookId = webhookId;
          webhookData.targetUrl = webhookUrl;

          return true;
        } catch (error) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to register webhook target: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const credentials = await this.getCredentials('cribopsApi');

        if (!webhookData.webhookId || !webhookData.targetUrl) {
          return true;
        }

        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Unregister the n8n webhook URL from Cribops
          await cribopsHttp.request('DELETE', `/api/v1/webhooks/${webhookData.webhookId}/targets`, {
            target_url: webhookData.targetUrl,
          });

          delete webhookData.webhookId;
          delete webhookData.targetUrl;

          return true;
        } catch (error) {
          // Log error but don't fail
          console.error('Failed to unregister webhook target:', error);
          return true;
        }
      },
    },
  };


  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    const headers = this.getHeaderData() as IDataObject;
    const eventTypes = this.getNodeParameter('eventTypes', []) as string[];
    const additionalFields = this.getNodeParameter('additionalFields', {}) as IDataObject;
    const webhookId = this.getNodeParameter('webhookId') as string;

    // Validate secret token if provided
    if (additionalFields.secretToken) {
      // Check for signature in headers (could be HMAC signature or bearer token)
      const signature = headers['x-cribops-signature'] || headers['x-webhook-signature'];
      const authHeader = headers['authorization'];
      
      // You can implement HMAC signature validation here if needed
      // For now, simple token comparison
      if (additionalFields.secretToken !== signature && `Bearer ${additionalFields.secretToken}` !== authHeader) {
        return {
          webhookResponse: {
            status: 401,
            body: { error: 'Unauthorized' },
          },
        };
      }
    }

    // Filter by event type if specified
    const eventType = body.event_type || body.type || body.eventType;
    if (eventTypes.length > 0 && eventType && !eventTypes.includes(eventType as string)) {
      return {
        webhookResponse: {
          status: 200,
          body: { received: true, filtered: true },
        },
      };
    }

    // Prepare output data with all relevant fields
    const outputData = {
      // Core webhook data
      webhook_id: webhookId,
      event_type: eventType,
      
      // Message content
      message: body.message || body.content || body.text,
      
      // Conversation/thread tracking
      conversation_id: body.conversation_id || body.conversationId || body.thread_id || body.threadId,
      
      // User/agent identification
      user_id: body.user_id || body.userId || body.from_user || body.fromUser,
      agent_id: body.agent_id || body.agentId || body.to_agent || body.toAgent,
      
      // Response handling
      response_webhook: body.response_webhook || body.responseWebhook || body.callback_url || body.callbackUrl,
      
      // Metadata
      metadata: body.metadata || {},
      
      // File attachments if any
      attachments: body.attachments || body.files || [],
      
      // Timestamp
      timestamp: body.timestamp || body.created_at || body.createdAt || new Date().toISOString(),
      
      // Include any other fields from the webhook
      ...body,
    };
    
    // Include headers if requested
    const workflowData = additionalFields.includeHeaders 
      ? { json: outputData, headers }
      : { json: outputData };

    // Return the data to the workflow
    return {
      workflowData: [[workflowData]],
      webhookResponse: {
        status: 200,
        body: { received: true },
      },
    };
  }
}