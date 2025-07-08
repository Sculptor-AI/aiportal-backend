import { LocalInferenceService } from './services/localInferenceService.js';

const service = new LocalInferenceService();
console.log('Checking available local models...');

try {
  const models = await service.getAvailableModels();
  console.log('Available models:', JSON.stringify(models, null, 2));
} catch (error) {
  console.error('Error:', error);
}