export const OpenAIConfig = {
    provider: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    apiVersion: 'v1',
    chatEndpoint: '/v1/chat/completions',
    timeout: 30000,
    enabled: true,
    apiKeyEnvironmentVariable: 'OPENAI_API_KEY'
};
