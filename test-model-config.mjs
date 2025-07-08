import modelConfigService from './services/modelConfigService.js';

console.log('Testing model configuration service...');

try {
  await modelConfigService.initialize();
  
  console.log('Checking model configuration for local/llama3.2-1b...');
  const config = modelConfigService.getModelConfig('local/llama3.2-1b');
  console.log('Config found:', !!config);
  console.log('Config details:', JSON.stringify(config, null, 2));
  
  console.log('Checking alternative formats...');
  console.log('llama3.2-1b:', !!modelConfigService.getModelConfig('llama3.2-1b'));
  console.log('llama-3.2-1b:', !!modelConfigService.getModelConfig('llama-3.2-1b'));
  
  console.log('Rate limiting enabled:', modelConfigService.isRateLimitingEnabled());
} catch (error) {
  console.error('Error:', error);
}