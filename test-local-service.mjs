import { LocalInferenceService } from './services/localInferenceService.js';

const service = new LocalInferenceService();
console.log('Testing local inference service...');

try {
  console.log('Starting server for llama3.2-1b...');
  const port = await service.startModelServer('llama3.2-1b');
  console.log('Server started on port:', port);
  
  console.log('Testing chat completion...');
  const result = await service.processChat('local/llama3.2-1b', 'What is 1 + 1?');
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error);
}