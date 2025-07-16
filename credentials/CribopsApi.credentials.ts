import {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class CribopsApi implements ICredentialType {
  name = 'cribopsApi';
  displayName = 'Cribops API';
  documentationUrl = 'https://github.com/CloudBedrock/n8n-nodes-cribops/wiki';
  properties: INodeProperties[] = [
    {
      displayName: 'API Token',
      name: 'apiToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'The API token for authenticating with Cribops platform',
    },
    {
      displayName: 'Base URL',
      name: 'baseUrl',
      type: 'string',
      default: 'https://api.cribops.com',
      required: true,
      description: 'Base URL of the Cribops API',
    },
    {
      displayName: 'Account ID',
      name: 'accountId',
      type: 'string',
      default: '',
      required: false,
      description: 'Account ID for cloud service integration',
    },
    {
      displayName: 'Account Secret',
      name: 'accountSecret',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: false,
      description: 'Account secret key for cloud service integration',
    },
    {
      displayName: 'Region',
      name: 'region',
      type: 'string',
      default: 'us-east-1',
      required: false,
      description: 'Region for cloud service integration',
    },
  ];

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '=Bearer {{$credentials.apiToken}}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.baseUrl}}',
      url: '/api/v1/agents',
      method: 'GET',
    },
  };
}