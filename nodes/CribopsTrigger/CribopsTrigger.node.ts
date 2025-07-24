import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
  IWebhookFunctions,
  IWebhookResponseData,
  IHookFunctions,
  ILoadOptionsFunctions,
  INodePropertyOptions,
  NodeConnectionType,
  NodeOperationError,
} from 'n8n-workflow';

import { CribopsHttp, CribopsAgent, CribopsQueueMessage } from '../../utils/CribopsHttp';

export class CribopsTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cribops Trigger',
    name: 'cribopsTrigger',
    icon: 'file:cribopstrigger.svg',
    group: ['trigger'],
    version: 1,
    description: 'Triggers when receiving messages from Cribops agents',
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
        // Dynamic path to trigger UUID generation
        path: '={{$parameter["agentId"]}}',
        isFullPath: true,
      },
    ],
    polling: true,
    properties: [
      {
        displayName: 'Trigger Mode',
        name: 'triggerMode',
        type: 'options',
        options: [
          {
            name: 'Polling',
            value: 'polling',
            description: 'Poll the queue for messages at regular intervals',
          },
          {
            name: 'Webhook',
            value: 'webhook',
            description: 'Receive messages via webhook',
          },
        ],
        default: 'polling',
        description: 'How to receive messages from Cribops',
      },
      {
        displayName: 'Tenant ID',
        name: 'tenantId',
        type: 'string',
        required: true,
        default: '',
        description: 'The tenant ID for your Cribops organization',
      },
      {
        displayName: 'Agent Name or ID',
        name: 'agentId',
        type: 'options',
        required: true,
        displayOptions: {
          show: {
            triggerMode: ['webhook'],
          },
        },
        typeOptions: {
          loadOptionsMethod: 'getAgents',
        },
        default: '',
        description: 'The Cribops agent to receive messages from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
      },
      {
        displayName: 'Queue Name',
        name: 'queueName',
        type: 'string',
        displayOptions: {
          show: {
            triggerMode: ['polling'],
          },
        },
        default: '',
        placeholder: 'e.g., stripe_events',
        description: 'Specific queue to poll (optional). Leave empty to poll all queues.',
      },
      {
        displayName: 'Poll Interval',
        name: 'pollInterval',
        type: 'number',
        displayOptions: {
          show: {
            triggerMode: ['polling'],
          },
        },
        default: 30,
        description: 'How often to poll for messages in seconds',
      },
      {
        displayName: 'Batch Size',
        name: 'batchSize',
        type: 'number',
        displayOptions: {
          show: {
            triggerMode: ['polling'],
          },
        },
        default: 10,
        description: 'Number of messages to retrieve per poll (max 100)',
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
        ],
        default: ['user_message'],
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
            description: 'Secret token for webhook authentication',
          },
        ],
      },
    ],
  };

  methods = {
    loadOptions: {
      async getAgents(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        const credentials = await this.getCredentials('cribopsApi');
        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          const agents = await cribopsHttp.getAgents();
          return agents.map((agent: CribopsAgent) => ({
            name: agent.name,
            value: agent.id,
            description: `ID: ${agent.id}`,
          }));
        } catch (error) {
          throw new NodeOperationError(this.getNode(), `Failed to load agents: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
    },
  };

  webhookMethods = {
    default: {
      async checkExists(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default');
        const agentId = this.getNodeParameter('agentId') as string;
        const credentials = await this.getCredentials('cribopsApi');
        
        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Check if webhook exists for this agent
          // This would need to be implemented in your Cribops API
          // For now, return false to always create
          return false;
        } catch (error) {
          return false;
        }
      },

      async create(this: IHookFunctions): Promise<boolean> {
        const webhookUrl = this.getNodeWebhookUrl('default') as string;
        const agentId = this.getNodeParameter('agentId') as string;
        const eventTypes = this.getNodeParameter('eventTypes', []) as string[];
        const additionalFields = this.getNodeParameter('additionalFields', {}) as IDataObject;
        const credentials = await this.getCredentials('cribopsApi');

        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          // Register webhook with Cribops
          // This is a placeholder - implement actual API call
          const body = {
            url: webhookUrl,
            agent_id: agentId,
            event_types: eventTypes,
            secret: additionalFields.secretToken || undefined,
          };

          // TODO: Make actual API call to register webhook
          // await cribopsHttp.registerWebhook(agentId, body);
          
          // Store webhook data for later use
          const webhookData = this.getWorkflowStaticData('node');
          webhookData.webhookId = `webhook_${agentId}_${Date.now()}`;
          webhookData.agentId = agentId;

          return true;
        } catch (error) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to register webhook: ${error instanceof Error ? error.message : String(error)}`,
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
          // Unregister webhook from Cribops
          // TODO: Make actual API call to unregister webhook
          // await cribopsHttp.deleteWebhook(webhookData.agentId, webhookData.webhookId);

          delete webhookData.webhookId;
          delete webhookData.agentId;

          return true;
        } catch (error) {
          return false;
        }
      },
    },
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const triggerMode = this.getNodeParameter('triggerMode') as string;
    
    if (triggerMode === 'webhook') {
      // Webhook mode - minimal implementation as webhooks are handled by webhook() method
      return {
        closeFunction: async () => {},
        manualTriggerFunction: async () => {
          throw new NodeOperationError(
            this.getNode(),
            'This node only works with webhooks in webhook mode. Please activate the workflow.',
          );
        },
      };
    }
    
    // Polling mode
    const credentials = await this.getCredentials('cribopsApi');
    const tenantId = this.getNodeParameter('tenantId') as string;
    const pollInterval = this.getNodeParameter('pollInterval', 30) as number;
    const batchSize = this.getNodeParameter('batchSize', 10) as number;
    const queueName = this.getNodeParameter('queueName', '') as string || undefined;
    
    const cribopsHttp = new CribopsHttp({
      baseUrl: credentials.baseUrl as string,
      apiToken: credentials.apiToken as string,
    });
    
    let intervalId: NodeJS.Timeout | undefined;
    
    const poll = async () => {
      try {
        const messages = await cribopsHttp.pollQueue(tenantId, batchSize, queueName);
        
        if (messages.length > 0) {
          const messageIds = messages.map(msg => msg.id);
          
          // Process each message
          for (const message of messages) {
            // Parse the webhook data if it's JSON
            let parsedData = message.data.data;
            try {
              parsedData = JSON.parse(message.data.data);
            } catch (e) {
              // Keep as string if not valid JSON
            }
            
            // Emit the message
            this.emit([
              [
                {
                  json: {
                    id: message.id,
                    correlation_id: message.correlation_id,
                    queue_name: message.queue_name,
                    data: parsedData,
                    headers: message.data.headers,
                    params: message.data.params,
                    inserted_at: message.inserted_at,
                    // Extract useful fields from headers
                    tenant_id: message.data.headers['x-cribops-tenant-id'] || tenantId,
                    path: message.data.headers['x-cribops-path'],
                  },
                },
              ],
            ]);
          }
          
          // Acknowledge messages after processing
          try {
            await cribopsHttp.acknowledgeMessages(tenantId, messageIds);
          } catch (ackError) {
            console.error('Failed to acknowledge messages:', ackError);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
        // Don't throw - continue polling
      }
    };
    
    // Start polling
    poll(); // Initial poll
    intervalId = setInterval(poll, pollInterval * 1000);
    
    // Manual trigger function for testing
    const manualTriggerFunction = async () => {
      await poll();
    };
    
    // Cleanup function
    const closeFunction = async () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
    
    return {
      closeFunction,
      manualTriggerFunction,
    };
  }

  async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
    const body = this.getBodyData() as IDataObject;
    const headers = this.getHeaderData() as IDataObject;
    const eventTypes = this.getNodeParameter('eventTypes', []) as string[];
    const additionalFields = this.getNodeParameter('additionalFields', {}) as IDataObject;
    const agentId = this.getNodeParameter('agentId') as string;

    // Validate secret token if provided
    if (additionalFields.secretToken) {
      const receivedToken = headers['x-cribops-signature'] || headers['authorization'];
      if (receivedToken !== additionalFields.secretToken) {
        return {
          webhookResponse: {
            status: 401,
            body: { error: 'Unauthorized' },
          },
        };
      }
    }

    // Filter by event type
    if (eventTypes.length > 0 && body.type && !eventTypes.includes(body.type as string)) {
      return {
        webhookResponse: {
          status: 200,
          body: { received: true, filtered: true },
        },
      };
    }

    // Enrich the output with agent_id and other useful metadata
    const outputData = {
      ...body,
      agent_id: agentId,
      // Ensure conversation_id is available (handle different field names)
      conversation_id: body.conversation_id || body.conversationId || body.thread_id,
      // Ensure response_webhook is available if it exists
      response_webhook: body.response_webhook || body.responseWebhook || body.callback_url,
    };
    
    // Log what we're outputting for debugging
    console.log('CribopsTrigger output:', JSON.stringify(outputData, null, 2));

    // Return the data to the workflow
    return {
      workflowData: [
        [
          {
            json: outputData,
            headers,
          },
        ],
      ],
    };
  }
}