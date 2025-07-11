import externalCodeExecutionService from './services/externalCodeExecutionService.js';

async function testCodeExecution() {
    console.log('🧪 Testing External Code Execution Service\n');

    // Test 1: Python code
    console.log('📝 Test 1: Python Code Execution');
    const pythonCode = `
print("Hello from Python!")
print("2 + 2 =", 2 + 2)
import math
print("Square root of 16:", math.sqrt(16))
`;

    try {
        const result = await externalCodeExecutionService.executeCode(pythonCode, 'python');
        console.log('✅ Python Result:', result);
    } catch (error) {
        console.log('❌ Python Error:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 2: JavaScript code
    console.log('📝 Test 2: JavaScript Code Execution');
    const jsCode = `
console.log("Hello from JavaScript!");
console.log("2 + 2 =", 2 + 2);
console.log("Current timestamp:", Date.now());
`;

    try {
        const result = await externalCodeExecutionService.executeCode(jsCode, 'javascript');
        console.log('✅ JavaScript Result:', result);
    } catch (error) {
        console.log('❌ JavaScript Error:', error.message);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 3: Language detection
    console.log('📝 Test 3: Language Detection');
    const testCodes = [
        { code: 'print("Hello")', expected: 'python' },
        { code: 'console.log("Hello")', expected: 'javascript' },
        { code: 'public class Test { }', expected: 'java' },
        { code: '#include <iostream>', expected: 'cpp' }
    ];

    for (const test of testCodes) {
        const detected = externalCodeExecutionService.detectLanguage(test.code);
        const status = detected === test.expected ? '✅' : '❌';
        console.log(`${status} Expected: ${test.expected}, Detected: ${detected}`);
    }

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 4: Supported languages
    console.log('📝 Test 4: Supported Languages');
    const languages = externalCodeExecutionService.getSupportedLanguages();
    console.log(`✅ Found ${languages.length} supported languages:`);
    languages.forEach(lang => {
        console.log(`   - ${lang.name} (${lang.id})`);
    });

    console.log('\n' + '='.repeat(50) + '\n');

    // Test 5: Error handling
    console.log('📝 Test 5: Error Handling');
    try {
        const result = await externalCodeExecutionService.executeCode('', 'python');
        console.log('✅ Empty code result:', result);
    } catch (error) {
        console.log('❌ Empty code error:', error.message);
    }

    console.log('\n🎉 Testing completed!');
}

// Run the tests
testCodeExecution().catch(console.error);
