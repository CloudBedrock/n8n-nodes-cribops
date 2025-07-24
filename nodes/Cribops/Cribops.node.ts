import {
  IExecuteFunctions,
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  IHttpRequestOptions,
  ILoadOptionsFunctions,
  INodeListSearchResult,
  NodeConnectionType,
} from 'n8n-workflow';

import { CribopsHttp, CribopsAgent, CribopsWebhookMessage, CribopsQueueMessage } from '../../utils/CribopsHttp';

export class Cribops implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Cribops',
    name: 'cribops',
    icon: 'file:cribops.svg',
    group: ['communication'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Interact with Cribops AI agents',
    defaults: {
      name: 'Cribops',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'cribopsApi',
        required: true,
      },
    ],
    requestDefaults: {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    },
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Get Agent',
            value: 'getAgent',
            description: 'Get information about a specific agent',
            action: 'Get information about a specific agent',
          },
          {
            name: 'List Agents',
            value: 'listAgents',
            description: 'List all available agents',
            action: 'List all available agents',
          },
          {
            name: 'Poll Queue',
            value: 'pollQueue',
            description: 'Poll messages from the queue',
            action: 'Poll messages from the queue',
          },
          {
            name: 'Reply to Conversation',
            value: 'replyToConversation',
            description: 'Reply to an existing conversation',
            action: 'Reply to an existing conversation',
          },
          {
            name: 'Send Message',
            value: 'sendMessage',
            description: 'Send a message to a Cribops agent',
            action: 'Send a message to a cribops agent',
          },
          {
            name: 'Send Typing Indicator',
            value: 'sendTypingIndicator',
            description: 'Send typing indicator to a conversation',
            action: 'Send typing indicator to a conversation',
          },
        ],
        default: 'sendMessage',
      },
      {
        displayName: 'Agent',
        name: 'agentId',
        type: 'resourceLocator',
        default: { mode: 'list', value: '' },
        required: true,
        displayOptions: {
          show: {
            operation: ['sendMessage', 'replyToConversation', 'getAgent', 'sendTypingIndicator'],
          },
        },
        modes: [
          {
            displayName: 'From List',
            name: 'list',
            type: 'list',
            placeholder: 'Select an agent...',
            typeOptions: {
              searchListMethod: 'searchAgents',
              searchable: true,
            },
          },
          {
            displayName: 'By ID',
            name: 'id',
            type: 'string',
            placeholder: 'agent_123',
            validation: [
              {
                type: 'regex',
                properties: {
                  regex: '^[a-zA-Z0-9_-]+$',
                  errorMessage: 'Agent ID must contain only letters, numbers, hyphens, and underscores',
                },
              },
            ],
          },
        ],
      },
      {
        displayName: 'Conversation ID',
        name: 'conversationId',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'conversation_123',
        displayOptions: {
          show: {
            operation: ['replyToConversation'],
          },
        },
        description: 'ID of the conversation to reply to',
      },
      {
        displayName: 'Conversation ID',
        name: 'conversationId',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'conversation_123',
        displayOptions: {
          show: {
            operation: ['sendTypingIndicator'],
          },
        },
        description: 'ID of the conversation to send typing indicator to',
      },
      {
        displayName: 'Typing',
        name: 'typing',
        type: 'boolean',
        required: true,
        default: true,
        displayOptions: {
          show: {
            operation: ['sendTypingIndicator'],
          },
        },
        description: 'Whether to show typing indicator (true) or stop typing (false)',
      },
      {
        displayName: 'Tenant ID',
        name: 'tenantId',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'my-tenant',
        displayOptions: {
          show: {
            operation: ['pollQueue'],
          },
        },
        description: 'The tenant ID for your Cribops organization',
      },
      {
        displayName: 'Batch Size',
        name: 'batchSize',
        type: 'number',
        default: 10,
        displayOptions: {
          show: {
            operation: ['pollQueue'],
          },
        },
        description: 'Number of messages to retrieve (max 100)',
      },
      {
        displayName: 'Queue Name',
        name: 'queueName',
        type: 'string',
        default: '',
        placeholder: 'e.g., stripe_events',
        displayOptions: {
          show: {
            operation: ['pollQueue'],
          },
        },
        description: 'Specific queue to poll (optional). Leave empty to poll all queues.',
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'Hello, how can you help me?',
        displayOptions: {
          show: {
            operation: ['sendMessage', 'replyToConversation'],
          },
        },
        description: 'The message to send',
      },
      {
        displayName: 'Conversation ID',
        name: 'conversationId',
        type: 'string',
        default: '',
        placeholder: 'conversation_123',
        displayOptions: {
          show: {
            operation: ['sendMessage'],
          },
        },
        description: 'ID of the conversation (leave empty to start a new conversation)',
      },
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        default: '',
        placeholder: 'user_123',
        displayOptions: {
          show: {
            operation: ['sendMessage'],
          },
        },
        description: 'ID of the user sending the message',
      },
      {
        displayName: 'File Attachment',
        name: 'fileAttachment',
        type: 'fixedCollection',
        default: {},
        placeholder: 'Add file attachment',
        displayOptions: {
          show: {
            operation: ['sendMessage'],
          },
        },
        typeOptions: {
          multipleValues: false,
        },
        options: [
          {
            name: 'file',
            displayName: 'File',
            values: [
              {
                displayName: 'File URL',
                name: 'url',
                type: 'string',
                default: '',
                placeholder: 'https://example.com/file.pdf',
                description: 'URL of the file to attach',
              },
              {
                displayName: 'File Name',
                name: 'name',
                type: 'string',
                default: '',
                placeholder: 'document.pdf',
                description: 'Name of the file (optional)',
              },
              {
                displayName: 'File Type',
                name: 'type',
                type: 'string',
                default: '',
                placeholder: 'application/pdf',
                description: 'MIME type of the file (optional)',
              },
            ],
          },
        ],
      },
      {
        displayName: 'Additional Fields',
        name: 'additionalFields',
        type: 'collection',
        placeholder: 'Add Field',
        default: {},
        options: [
          {
            displayName: 'Metadata',
            name: 'metadata',
            type: 'fixedCollection',
            placeholder: 'Add Metadata',
            default: {},
            typeOptions: {
              multipleValues: true,
            },
            options: [
              {
                name: 'metadataValues',
                displayName: 'Metadata',
                values: [
                  {
                    displayName: 'Key',
                    name: 'key',
                    type: 'string',
                    default: '',
                    description: 'Metadata key',
                  },
                  {
                    displayName: 'Value',
                    name: 'value',
                    type: 'string',
                    default: '',
                    description: 'Metadata value',
                  },
                ],
              },
            ],
          },
          {
            displayName: 'Timeout',
            name: 'timeout',
            type: 'number',
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
        ],
      },
    ],
  };

  methods = {
    listSearch: {
      searchAgents: async function (
        this: ILoadOptionsFunctions,
        filter?: string,
      ): Promise<INodeListSearchResult> {
        const credentials = await this.getCredentials('cribopsApi');
        const cribopsHttp = new CribopsHttp({
          baseUrl: credentials.baseUrl as string,
          apiToken: credentials.apiToken as string,
        });

        try {
          const agents = await cribopsHttp.getAgents();
          const results = agents
            .filter((agent: CribopsAgent) => 
              !filter || agent.name.toLowerCase().includes(filter.toLowerCase())
            )
            .map((agent: CribopsAgent) => ({
              name: `${agent.name} (${agent.id})`,
              value: agent.id,
            }));
          
          return {
            results,
          };
        } catch (error) {
          throw new NodeOperationError(this.getNode(), `Failed to load agents: ${error}`, {
            description: 'Make sure your API credentials are correct and the Cribops API is accessible',
          });
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const results: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('cribopsApi');
    const cribopsHttp = new CribopsHttp({
      baseUrl: credentials.baseUrl as string,
      apiToken: credentials.apiToken as string,
    });

    for (let i = 0; i < items.length; i++) {
      const operation = this.getNodeParameter('operation', i) as string;

      try {
        let responseData: any;

        switch (operation) {
          case 'replyToConversation':
            responseData = await replyToConversation(this, cribopsHttp, i);
            break;
          case 'sendMessage':
            responseData = await sendMessage(this, cribopsHttp, i);
            break;
          case 'sendTypingIndicator':
            responseData = await sendTypingIndicator(this, cribopsHttp, i);
            break;
          case 'getAgent':
            responseData = await getAgent(this, cribopsHttp, i);
            break;
          case 'listAgents':
            responseData = await listAgents(this, cribopsHttp, i);
            break;
          case 'pollQueue':
            responseData = await pollQueue(this, cribopsHttp, i);
            break;
          default:
            throw new NodeOperationError(
              this.getNode(),
              `Unknown operation: ${operation}`,
              { itemIndex: i }
            );
        }

        results.push({
          json: responseData,
          pairedItem: { item: i },
        });
      } catch (error: any) {
        if (this.continueOnFail()) {
          results.push({
            json: {
              error: error.message,
            },
            pairedItem: { item: i },
          });
        } else {
          throw error;
        }
      }
    }

    return [results];
  }

}

// Simple UUID v4 generator
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function replyToConversation(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const agentId = executeFunctions.getNodeParameter('agentId', itemIndex, '', { extractValue: true }) as string;
    const conversationId = executeFunctions.getNodeParameter('conversationId', itemIndex) as string;
    const message = executeFunctions.getNodeParameter('message', itemIndex) as string;
    
    // Get the response webhook URL from the input data
    const inputData = executeFunctions.getInputData()[itemIndex];
    let responseWebhook = inputData.json.response_webhook as string;
    
    // If not found directly, check if it's in the original trigger data (passed through by typing indicator)
    if (!responseWebhook && inputData.json._originalTriggerData) {
      const originalTriggerData = inputData.json._originalTriggerData as IDataObject;
      responseWebhook = originalTriggerData.response_webhook as string;
    }
    
    // If still not found, try to find it in the workflow execution data from the CribopsTrigger node
    if (!responseWebhook) {
      try {
        const workflowData = executeFunctions.getWorkflowDataProxy(itemIndex);
        const cribopsTriggerData = workflowData.$('Cribops Trigger');
        if (cribopsTriggerData && cribopsTriggerData.item && cribopsTriggerData.item.json) {
          responseWebhook = cribopsTriggerData.item.json.response_webhook as string;
        }
      } catch (error) {
        // Ignore errors if Cribops Trigger node is not found
      }
    }
    
    // Log the raw values to debug expression evaluation
    console.log('Debug - agentId:', agentId);
    console.log('Debug - conversationId:', conversationId);
    console.log('Debug - message:', message);
    console.log('Debug - responseWebhook:', responseWebhook);
    
    // Check if expressions were not evaluated (contain literal expression syntax)
    if (conversationId.includes('{{') || conversationId.includes('}}')) {
      throw new NodeOperationError(
        executeFunctions.getNode(),
        `Conversation ID contains unevaluated expression: ${conversationId}. Please ensure the expression is properly formatted.`,
        { itemIndex }
      );
    }
    
    if (!conversationId || conversationId.trim() === '') {
      throw new NodeOperationError(
        executeFunctions.getNode(),
        'Conversation ID is required but was empty',
        { itemIndex }
      );
    }
    
    if (!responseWebhook) {
      console.log('Warning: response_webhook not found in input data:', JSON.stringify(inputData.json, null, 2));
      
      // Fallback: try to use the agent webhook endpoint
      console.log('Falling back to agent webhook endpoint');
      
      const fallbackMessageData: Partial<CribopsWebhookMessage> = {
        id: generateUUID(),
        content: message,
        conversationId: conversationId,
        agentId: agentId,
        type: 'agent_response',
        timestamp: new Date().toISOString(),
      };
      
      return await cribopsHttp.sendMessage(agentId, fallbackMessageData);
    }
    
    // Try to get user_id and organization_id from trigger data
    let userId = inputData.json.user_id as string || '';
    let organizationId = inputData.json.organization_id as string || '';
    
    // If not found, try to get from workflow data
    if ((!userId || !organizationId) && responseWebhook) {
      try {
        const workflowData = executeFunctions.getWorkflowDataProxy(itemIndex);
        const cribopsTriggerData = workflowData.$('Cribops Trigger');
        if (cribopsTriggerData && cribopsTriggerData.item && cribopsTriggerData.item.json) {
          userId = userId || (cribopsTriggerData.item.json.user_id as string) || '';
          organizationId = organizationId || (cribopsTriggerData.item.json.organization_id as string) || '';
        }
      } catch (error) {
        // Ignore errors
      }
    }
    
    const messageData: IDataObject = {
      conversation_id: conversationId,
      content: message,
      message_id: generateUUID(),
      timestamp: new Date().toISOString(),
      // Include additional fields that might be needed
      user_id: userId,
      organization_id: organizationId,
    };

    try {
      console.log('Debug - Response webhook URL:', responseWebhook);
      console.log('Debug - Request body:', JSON.stringify(messageData, null, 2));
      
      // Send to the response webhook URL
      // Note: The standard workflow uses form parameters, not JSON
      const formData = new URLSearchParams();
      Object.keys(messageData).forEach(key => {
        formData.append(key, String(messageData[key]));
      });
      
      const requestOptions: IHttpRequestOptions = {
        method: 'POST',
        url: responseWebhook,
        headers: {
          'Authorization': `Bearer ${cribopsHttp['config'].apiToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        json: false,
      };
      
      const response = await executeFunctions.helpers.httpRequest(requestOptions);
      return response;
    } catch (error: any) {
      // Enhanced error logging for 422 errors
      if (error.response?.status === 422) {
        console.error('422 Error Details:');
        console.error('Response body:', JSON.stringify(error.response.body, null, 2));
        console.error('Request that failed:', {
          agentId: agentId,
          body: messageData,
          conversationId: conversationId
        });
        
        const errorDetails = error.response.body?.errors || error.response.body?.message || 'Unknown validation error';
        throw new NodeOperationError(
          executeFunctions.getNode(),
          `Validation error (422): ${JSON.stringify(errorDetails)}. ConversationId: "${conversationId}"`,
          { itemIndex, description: `Full error: ${JSON.stringify(error.response.body)}` }
        );
      }
      
      throw new NodeOperationError(
        executeFunctions.getNode(),
        `Failed to reply to conversation: ${error instanceof Error ? error.message : String(error)}`,
        { itemIndex }
      );
    }
  }

async function sendMessage(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const agentId = executeFunctions.getNodeParameter('agentId', itemIndex, '', { extractValue: true }) as string;
    const message = executeFunctions.getNodeParameter('message', itemIndex) as string;
    const conversationId = executeFunctions.getNodeParameter('conversationId', itemIndex, '') as string;
    const userId = executeFunctions.getNodeParameter('userId', itemIndex, '') as string;
    const fileAttachment = executeFunctions.getNodeParameter('fileAttachment', itemIndex, {}) as IDataObject;
    const additionalFields = executeFunctions.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;

    const messageData: Partial<CribopsWebhookMessage> = {
      id: generateUUID(),
      content: message,
      conversationId: conversationId || `conversation_${Date.now()}`,
      userId: userId || undefined,
      type: 'user_message',
      timestamp: new Date().toISOString(),
    };

    // Add file attachment if provided
    if (fileAttachment.file) {
      const file = fileAttachment.file as IDataObject;
      if (file.url) {
        messageData.fileUrl = file.url as string;
        messageData.fileName = file.name as string || 'file';
        messageData.fileType = file.type as string || 'application/octet-stream';
      }
    }

    // Add metadata if provided
    if (additionalFields.metadata) {
      const metadata = additionalFields.metadata as IDataObject;
      const metadataValues = metadata.metadataValues as IDataObject[];
      if (metadataValues && metadataValues.length > 0) {
        messageData.metadata = {};
        metadataValues.forEach((item) => {
          messageData.metadata![item.key as string] = item.value;
        });
      }
    }

    return await cribopsHttp.sendMessage(agentId, messageData);
  }

async function getAgent(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const agentId = executeFunctions.getNodeParameter('agentId', itemIndex, '', { extractValue: true }) as string;
    return await cribopsHttp.getAgent(agentId);
  }

async function listAgents(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const agents = await cribopsHttp.getAgents();
    return { agents, count: agents.length };
  }

async function pollQueue(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const tenantId = executeFunctions.getNodeParameter('tenantId', itemIndex) as string;
    const batchSize = executeFunctions.getNodeParameter('batchSize', itemIndex, 10) as number;
    const queueName = executeFunctions.getNodeParameter('queueName', itemIndex, '') as string || undefined;
    
    const messages = await cribopsHttp.pollQueue(tenantId, batchSize, queueName);
    
    // Process each message to parse the data if it's JSON
    const processedMessages = messages.map(message => {
      let parsedData = message.data.data;
      try {
        parsedData = JSON.parse(message.data.data);
      } catch (e) {
        // Keep as string if not valid JSON
      }
      
      return {
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
      };
    });
    
    // Auto-acknowledge messages after processing
    if (messages.length > 0) {
      const messageIds = messages.map(msg => msg.id);
      try {
        await cribopsHttp.acknowledgeMessages(tenantId, messageIds);
      } catch (ackError) {
        // Log error but don't fail the operation
        console.error('Failed to acknowledge messages:', ackError);
      }
    }
    
    return { messages: processedMessages, count: processedMessages.length };
  }


async function sendTypingIndicator(executeFunctions: IExecuteFunctions, cribopsHttp: CribopsHttp, itemIndex: number): Promise<any> {
    const agentId = executeFunctions.getNodeParameter('agentId', itemIndex, '', { extractValue: true }) as string;
    const conversationId = executeFunctions.getNodeParameter('conversationId', itemIndex) as string;
    const typing = executeFunctions.getNodeParameter('typing', itemIndex) as boolean;
    
    // Check if we have a response_webhook in the input data to extract the correct base URL
    const inputData = executeFunctions.getInputData()[itemIndex];
    const responseWebhook = inputData.json.response_webhook as string;
    
    let typingResult;
    
    if (responseWebhook) {
      // Extract base URL from response webhook
      const webhookUrl = new URL(responseWebhook);
      const baseUrl = `${webhookUrl.protocol}//${webhookUrl.host}`;
      
      // Create a temporary HTTP client with the correct base URL
      const dynamicCribopsHttp = new CribopsHttp({
        baseUrl: baseUrl,
        apiToken: cribopsHttp['config'].apiToken,
      });
      
      typingResult = await dynamicCribopsHttp.sendTypingIndicator(agentId, conversationId, typing);
    } else {
      // Fallback to the configured base URL
      typingResult = await cribopsHttp.sendTypingIndicator(agentId, conversationId, typing);
    }
    
    // Preserve the original trigger data for subsequent nodes
    return {
      ...typingResult,
      // Pass through the original trigger data so replyToConversation can access it
      _originalTriggerData: inputData.json
    };
  }