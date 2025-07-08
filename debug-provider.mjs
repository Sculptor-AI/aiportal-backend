import { RouterboxService } from './services/routerboxService.js';
import modelConfigService from './services/modelConfigService.js';

console.log('Testing provider detection...');

await modelConfigService.initialize();

const testModels = [
  'local/llama3.2-1b',
  'local/llama-3.2-1b', 
  'llama3.2-1b',
  'llama-3.2-1b'
];

for (const model of testModels) {
  console.log(`\nModel: ${model}`);
  console.log(`  Provider: ${RouterboxService.getProviderFromModel(model)}`);
  console.log(`  Config exists: ${!!modelConfigService.getModelConfig(model)}`);
  
  const config = modelConfigService.getModelConfig(model);
  if (config) {
    console.log(`  Config provider: ${config.provider}`);
    console.log(`  Config routing service: ${config.routing?.service}`);
  }
}