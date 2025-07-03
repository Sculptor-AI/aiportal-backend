#!/usr/bin/env python3
"""
Test Tool Controller
A simple tool to test the tools system functionality
"""

import json
import sys
import time
from datetime import datetime

def execute_tool(parameters):
    """
    Execute the test tool with the given parameters
    
    Args:
        parameters (dict): Tool parameters
        
    Returns:
        dict: Tool execution result
    """
    try:
        # Validate required parameters
        if 'message' not in parameters:
            return {
                'success': False,
                'error': 'Missing required parameter: message'
            }
        
        message = parameters['message']
        
        # Simulate some processing time
        time.sleep(0.1)
        
        # Return success response
        return {
            'success': True,
            'message': f'✅ Tools system working! Received: {message}',
            'timestamp': datetime.now().isoformat(),
            'toolId': 'test-tool',
            'executionTime': 0.1,
            'status': 'Tool execution completed successfully',
            'systemHealth': 'All systems operational'
        }
        
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

def main():
    """Main entry point for the tool"""
    try:
        # Read parameters from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {'success': False, 'error': 'No input data provided'}
        else:
            parameters = json.loads(input_data)
            result = execute_tool(parameters)
        
        # Output result as JSON
        print(json.dumps(result))
        
    except json.JSONDecodeError:
        result = {'success': False, 'error': 'Invalid JSON input'}
        print(json.dumps(result))
    except Exception as e:
        result = {'success': False, 'error': f'Unexpected error: {str(e)}'}
        print(json.dumps(result))

if __name__ == '__main__':
    main()