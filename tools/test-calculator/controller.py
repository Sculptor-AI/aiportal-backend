#!/usr/bin/env python3
"""
Calculator Tool Controller
A calculator tool powered by Wolfram Alpha for mathematical expressions and equations
"""

import json
import sys
import os
import re
from datetime import datetime
import urllib.request
import urllib.parse
import urllib.error

def parse_wolfram_response(response_text):
    """
    Parse the Wolfram Alpha LLM API response
    The response is in a specific text format, not JSON
    """
    result = {
        'query': '',
        'interpretation': '',
        'result': '',
        'images': [],
        'websiteUrl': '',
        'fullResponse': response_text
    }
    
    # Extract sections using regex patterns
    lines = response_text.strip().split('\n')
    current_section = None
    section_content = []
    
    for line in lines:
        # Check for section headers
        if line.startswith('Query:'):
            current_section = 'query'
            # Extract query value directly from the line
            query_match = re.match(r'^Query:\s*"(.+)"$', line)
            if query_match:
                result['query'] = query_match.group(1)
                continue
        elif line.startswith('Input interpretation:'):
            if section_content and current_section == 'result':
                result['result'] = '\n'.join(section_content).strip()
            current_section = 'interpretation'
            section_content = []
            continue
        elif line.startswith('Result:'):
            if section_content and current_section == 'interpretation':
                result['interpretation'] = '\n'.join(section_content).strip()
            current_section = 'result'
            section_content = []
            continue
        elif line.startswith('Images:') or line.startswith('image:'):
            if section_content and current_section == 'result':
                result['result'] = '\n'.join(section_content).strip()
            current_section = 'images'
            # Extract image URL if it's on the same line
            if line.startswith('image:'):
                img_match = re.match(r'^image:\s*(.+)$', line)
                if img_match:
                    result['images'].append(img_match.group(1).strip())
            continue
        elif line.startswith('Wolfram|Alpha website result'):
            if section_content:
                if current_section == 'result':
                    result['result'] = '\n'.join(section_content).strip()
                elif current_section == 'images':
                    # Process any remaining image content
                    pass
            # Extract website URL
            url_match = re.search(r'https://[^\s]+', line)
            if url_match:
                result['websiteUrl'] = url_match.group(0)
            current_section = None
            continue
        
        # Add line to current section content
        if current_section:
            if current_section == 'images' and line.strip().startswith('image:'):
                # Extract image URL
                img_match = re.match(r'^image:\s*(.+)$', line.strip())
                if img_match:
                    result['images'].append(img_match.group(1).strip())
            else:
                section_content.append(line)
    
    # Handle any remaining content
    if section_content and current_section == 'result':
        result['result'] = '\n'.join(section_content).strip()
    elif section_content and current_section == 'interpretation':
        result['interpretation'] = '\n'.join(section_content).strip()
    
    # If we didn't parse specific sections, include the full response as the result
    if not result['result'] and not result['interpretation']:
        result['result'] = response_text.strip()
    
    return result

def solve_expression(expression):
    """
    Solve a mathematical expression using Wolfram Alpha
    
    Args:
        expression (str): Mathematical expression to solve
        
    Returns:
        dict: Result of the calculation
    """
    try:
        # Get API key from environment
        api_key = os.environ.get('WOLFRAM_APP_ID')
        if not api_key:
            return {
                'success': False,
                'error': 'WOLFRAM_APP_ID not configured in environment variables',
                'expression': expression
            }
        
        # Build API URL
        base_url = 'https://www.wolframalpha.com/api/v1/llm-api'
        params = {
            'input': expression,
            'appid': api_key,
            'maxchars': '6800'
        }
        
        # URL encode the parameters
        encoded_params = urllib.parse.urlencode(params)
        url = f"{base_url}?{encoded_params}"
        
        # Make the API request
        request = urllib.request.Request(url)
        request.add_header('User-Agent', 'AIPortal-Calculator/1.0')
        
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                if response.status == 200:
                    response_text = response.read().decode('utf-8')
                    
                    # Parse the response
                    parsed_result = parse_wolfram_response(response_text)
                    
                    return {
                        'success': True,
                        'result': parsed_result['result'],
                        'expression': expression,
                        'interpretation': parsed_result['interpretation'],
                        'images': parsed_result['images'],
                        'websiteUrl': parsed_result['websiteUrl']
                    }
                else:
                    return {
                        'success': False,
                        'error': f'API returned status code {response.status}',
                        'expression': expression
                    }
                    
        except urllib.error.HTTPError as e:
            if e.code == 501:
                # Input cannot be interpreted
                error_message = e.read().decode('utf-8')
                return {
                    'success': False,
                    'error': f'Query could not be interpreted: {error_message}',
                    'expression': expression,
                    'suggestions': 'Try rephrasing your query or checking for typos'
                }
            elif e.code == 403:
                return {
                    'success': False,
                    'error': 'Invalid or missing API key',
                    'expression': expression
                }
            elif e.code == 400:
                return {
                    'success': False,
                    'error': 'Bad request - missing input parameter',
                    'expression': expression
                }
            else:
                return {
                    'success': False,
                    'error': f'HTTP error {e.code}: {e.reason}',
                    'expression': expression
                }
                
        except urllib.error.URLError as e:
            return {
                'success': False,
                'error': f'Network error: {str(e)}',
                'expression': expression
            }
        
    except Exception as e:
        return {
            'success': False,
            'error': f'Calculation error: {str(e)}',
            'expression': expression
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
            
            # Get the expression to solve
            expression = parameters.get('expression', '')
            if not expression:
                result = {'success': False, 'error': 'Missing required parameter: expression'}
            else:
                result = solve_expression(expression)
                result['timestamp'] = datetime.now().isoformat()
        
        # Output result as JSON
        print(json.dumps(result, default=str))
        
    except json.JSONDecodeError:
        result = {'success': False, 'error': 'Invalid JSON input'}
        print(json.dumps(result))
    except Exception as e:
        result = {'success': False, 'error': f'Unexpected error: {str(e)}'}
        print(json.dumps(result))

if __name__ == '__main__':
    main()
