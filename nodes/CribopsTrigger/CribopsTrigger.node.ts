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

import { CribopsHttp, CribopsWebhookEntity } from '../../utils/CribopsHttp';

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
        description: 'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
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
          // Organization is automatically determined from API key
          const webhooks = await cribopsHttp.getWebhooks();
          
          // Filter for N8N type webhooks that are active and not linked
          const availableWebhooks = webhooks.filter((webhook: CribopsWebhookEntity) => 
            webhook.type === 'N8N' && 
            webhook.status === 'active' && 
            !webhook.linked_workflow_id
          );
          
          return availableWebhooks.map((webhook: CribopsWebhookEntity) => ({
            name: webhook.name,
            value: webhook.id,
            description: webhook.description || `Type: ${webhook.type}`,
          }));
        } catch (error) {
          let errorMessage = 'Failed to load webhooks';
          
          if (error instanceof Error) {
            errorMessage += `: ${error.message}`;
            
            // Check for common issues
            if (error.message.includes('HTTP 401') || error.message.includes('Unauthorized')) {
              errorMessage = 'Authentication failed. Please check your API token in the credentials.';
            } else if (error.message.includes('HTTP 404')) {
              errorMessage = 'Webhook endpoint not found. Please check the API base URL in credentials.';
            } else if (error.message.includes('HTTP 403')) {
              errorMessage = 'Access forbidden. Your API token may not have permission to access webhooks.';
            } else if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
              errorMessage = 'Network error. Please check the API base URL and ensure the Cribops API is accessible.';
            } else if (error.message.includes('HTTP 400')) {
              errorMessage = 'Bad request. Please check that the API endpoint is correct and your API token has the necessary permissions.';
            }
          }
          
          throw new NodeOperationError(this.getNode(), errorMessage);
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
        const credentials = await this.getCredentials('cribopsApi');
        const workflowId = this.getWorkflow().id;
        const workflowName = this.getWorkflow().name;

        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Link this workflow to the webhook entity
          const body = {
            workflow_id: workflowId,
            webhook_url: webhookUrl,
            test_webhook_url: webhookUrl.replace('/webhook/', '/webhook-test/'),
            workflow_name: workflowName || 'Unnamed Workflow',
          };

          // Link the n8n workflow to the webhook entity
          await cribopsHttp.request('POST', `/api/v1/webhooks/${webhookId}/link`, body);
          
          // Store webhook data for later use
          const webhookData = this.getWorkflowStaticData('node');
          webhookData.webhookId = webhookId;
          webhookData.webhookUrl = webhookUrl;

          return true;
        } catch (error) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to link webhook: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },

      async delete(this: IHookFunctions): Promise<boolean> {
        const webhookData = this.getWorkflowStaticData('node');
        const credentials = await this.getCredentials('cribopsApi');

        if (!webhookData.webhookId) {
          return true;
        }

        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Unlink the workflow from the webhook entity
          await cribopsHttp.request('DELETE', `/api/v1/webhooks/${webhookData.webhookId}/link`);

          delete webhookData.webhookId;
          delete webhookData.webhookUrl;

          return true;
        } catch (error) {
          // Log error but don't fail
          console.error('Failed to unlink webhook:', error);
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