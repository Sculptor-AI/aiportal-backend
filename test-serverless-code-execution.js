#!/usr/bin/env node

/**
 * Test script for serverless code execution endpoints
 * Run with: node test-serverless-code-execution.js
 */

const API_BASE = 'http://localhost:3000/api/v1/tools';

async function testNonStreamingExecution() {
    console.log('🧪 Testing non-streaming code execution...');
    
    try {
        const response = await fetch(`${API_BASE}/execute-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: `
import math
import time

print("Starting calculation...")
time.sleep(0.1)  # Simulate some work

radius = 5
area = math.pi * radius ** 2
circumference = 2 * math.pi * radius

print(f"Circle with radius {radius}:")
print(f"  Area: {area:.2f}")
print(f"  Circumference: {circumference:.2f}")

result = {
    "radius": radius,
    "area": area,
    "circumference": circumference
}
                `,
                context_data: {
                    variables: {
                        test_var: "Hello from context!"
                    }
                }
            })
        });

        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Non-streaming execution successful!');
            console.log('Execution ID:', result.execution_id);
            console.log('Execution time:', result.execution_time, 'ms');
            console.log('Output:', result.result.output);
            console.log('Return value:', result.result.result);
        } else {
            console.error('❌ Non-streaming execution failed:', result.error);
        }
    } catch (error) {
        console.error('❌ Request failed:', error.message);
    }
}

async function testStreamingExecution() {
    console.log('\n🧪 Testing streaming code execution...');
    
    try {
        const response = await fetch(`${API_BASE}/execute-code/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                code: `
import time
import random

print("Starting streaming test...")

for i in range(3):
    print(f"Step {i+1}/3: Processing...")
    time.sleep(0.2)  # Simulate work
    progress = ((i + 1) / 3) * 100
    print(f"Progress: {progress:.1f}%")

numbers = [random.randint(1, 100) for _ in range(5)]
print(f"Generated numbers: {numbers}")
print(f"Sum: {sum(numbers)}")
print(f"Average: {sum(numbers)/len(numbers):.2f}")

result = {
    "numbers": numbers,
    "sum": sum(numbers),
    "average": sum(numbers)/len(numbers)
}
                `
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        console.log('📡 Connected to streaming endpoint');

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                console.log('📡 Stream ended');
                break;
            }

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        switch (data.type) {
                            case 'connected':
                                console.log('✅ Stream connected:', data.message);
                                break;
                                
                            case 'execution_started':
                                console.log('🚀 Execution started');
                                break;
                                
                            case 'execution_progress_structured':
                                console.log(`📊 Progress: ${data.percentage}% - ${data.message}`);
                                break;
                                
                            case 'execution_completed':
                                console.log('✅ Execution completed!');
                                console.log('Execution time:', data.execution_time, 'ms');
                                console.log('Output:', data.result.output);
                                console.log('Return value:', data.result.result);
                                return;
                                
                            case 'execution_failed':
                                console.error('❌ Execution failed:', data.error);
                                return;
                                
                            case 'ping':
                                // Ignore keep-alive pings
                                break;
                                
                            default:
                                console.log('📨 Event:', data.type, data);
                        }
                    } catch (parseError) {
                        console.log('📨 Raw data:', line);
                    }
                }
            }
        }
    } catch (error) {
        console.error('❌ Streaming test failed:', error.message);
    }
}

async function testErrorHandling() {
    console.log('\n🧪 Testing error handling...');
    
    const testCases = [
        {
            name: 'Empty code',
            code: '',
            expectedError: 'Code parameter is required and must be a string'
        },
        {
            name: 'Invalid code (import os)',
            code: 'import os\nprint("This should fail")',
            expectedError: 'Security validation failed'
        },
        {
            name: 'Code too long',
            code: 'print("x" * 15000)',
            expectedError: 'Code length exceeds maximum limit'
        }
    ];

    for (const testCase of testCases) {
        console.log(`\nTesting: ${testCase.name}`);
        
        try {
            const response = await fetch(`${API_BASE}/execute-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    code: testCase.code
                })
            });

            const result = await response.json();
            
            if (!result.success && result.error.includes(testCase.expectedError)) {
                console.log(`✅ Correctly caught error: ${result.error}`);
            } else {
                console.log(`❌ Unexpected result:`, result);
            }
        } catch (error) {
            console.error(`❌ Request failed:`, error.message);
        }
    }
}

async function runAllTests() {
    console.log('🚀 Starting serverless code execution tests...\n');
    
    await testNonStreamingExecution();
    await testStreamingExecution();
    await testErrorHandling();
    
    console.log('\n✨ All tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllTests().catch(console.error);
}

export { testNonStreamingExecution, testStreamingExecution, testErrorHandling, runAllTests }; 