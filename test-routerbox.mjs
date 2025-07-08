import { RouterboxService } from './services/routerboxService.js';
import { isLocalModel } from './services/localInferenceService.js';

console.log('Testing RouterboxService...');

// Test model detection
console.log('Is local/llama3.2-1b a local model?', isLocalModel('local/llama3.2-1b'));

// Test provider detection
console.log('Provider for local/llama3.2-1b:', RouterboxService.getProviderFromModel('local/llama3.2-1b'));

try {
  console.log('Testing routeChat...');
  const result = await RouterboxService.routeChat({
    model: 'local/llama3.2-1b',
    messages: [{ role: 'user', content: 'What is 1 + 1?' }],
    temperature: 0.7,
    streaming: false
  });
  console.log('Result:', JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error);
}