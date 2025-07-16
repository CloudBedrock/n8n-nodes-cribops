module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['plugin:n8n-nodes-base/nodes'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // Add custom rules here
    'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
    'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
  },
};