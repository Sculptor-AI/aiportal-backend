#!/usr/bin/env python3
"""
Secure Code Execution Tool Controller
Executes Python code in a sandboxed environment with security restrictions
"""

import json
import sys
import io
import time
import signal
import os
import resource
from datetime import datetime
from contextlib import redirect_stdout, redirect_stderr

# Helper functions for structured progress reporting
def emit_progress(step, percentage=None, message=None):
    """Emit structured progress information"""
    progress_data = {
        'step': step,
        'percentage': percentage,
        'message': message,
        'timestamp': time.time()
    }
    print(f"PROGRESS:{json.dumps(progress_data)}", flush=True)

def emit_status(status, message=None, details=None):
    """Emit status information"""
    status_data = {
        'status': status,
        'message': message,
        'details': details,
        'timestamp': time.time()
    }
    print(f"STATUS:{json.dumps(status_data)}", flush=True)

# Security: Limit memory usage
def set_memory_limit(memory_mb=128):
    """Set memory limit for the process"""
    try:
        memory_bytes = memory_mb * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (memory_bytes, memory_bytes))
    except:
        pass

# Security: Timeout handler
def timeout_handler(signum, frame):
    raise TimeoutError("Code execution timed out")

def create_safe_builtins():
    """Create a restricted set of builtin functions"""
    safe_builtins = {
        'abs': abs, 'all': all, 'any': any, 'bool': bool, 'chr': chr,
        'dict': dict, 'enumerate': enumerate, 'filter': filter, 'float': float,
        'format': format, 'frozenset': frozenset, 'hex': hex, 'int': int,
        'isinstance': isinstance, 'issubclass': issubclass, 'iter': iter,
        'len': len, 'list': list, 'map': map, 'max': max, 'min': min,
        'next': next, 'oct': oct, 'ord': ord, 'pow': pow, 'print': print,
        'range': range, 'repr': repr, 'reversed': reversed, 'round': round,
        'set': set, 'slice': slice, 'sorted': sorted, 'str': str,
        'sum': sum, 'tuple': tuple, 'type': type, 'zip': zip,
        'Exception': Exception, 'ValueError': ValueError, 'TypeError': TypeError,
        'IndexError': IndexError, 'KeyError': KeyError, 'AttributeError': AttributeError,
        'RuntimeError': RuntimeError, 'ZeroDivisionError': ZeroDivisionError,
        'ArithmeticError': ArithmeticError, 'AssertionError': AssertionError,
        'NameError': NameError, 'StopIteration': StopIteration,
    }
    return safe_builtins

def create_safe_modules():
    """Create a restricted set of allowed modules"""
    safe_modules = {
        'math': __import__('math'),
        'statistics': __import__('statistics'),
        'random': __import__('random'),
        're': __import__('re'),
        'uuid': __import__('uuid'),
        'hashlib': __import__('hashlib'),
        'base64': __import__('base64'),
        'json': __import__('json'),
        'time': __import__('time'),
        'datetime': __import__('datetime'),
        'decimal': __import__('decimal'),
        'fractions': __import__('fractions'),
        'collections': __import__('collections'),
        'itertools': __import__('itertools'),
        'operator': __import__('operator'),
        'functools': __import__('functools'),
        'bisect': __import__('bisect'),
        'heapq': __import__('heapq'),
    }
    return safe_modules

def validate_code(code):
    """Validate that code doesn't contain dangerous operations"""
    dangerous_patterns = [
        'import os', 'import sys', 'import subprocess', 'import socket',
        'import urllib', 'import requests', 'import http',
        'open(', 'file(', 'exec(', 'eval(', 'compile(',
        '__import__', '__builtins__', '__globals__', '__locals__',
        'globals()', 'getattr(', 'setattr(', 'delattr(',
        'input(', 'raw_input(',
        'exit(', 'quit(', 'sys.exit',
        'os.', 'sys.', 'subprocess.', 'socket.',
        'urllib.', 'requests.', 'http.',
        '__file__', '__name__', '__doc__', '__package__',
        'reload(', 'importlib',
        'pickle', 'cPickle', 'marshal', 'shelve',
        'code.', 'ast.', 'compile',
    ]
    
    # Check for dangerous patterns
    code_lower = code.lower()
    for pattern in dangerous_patterns:
        if pattern.lower() in code_lower:
            return False, f"Code contains potentially dangerous operation: {pattern}"
    
    return True, None

def execute_code_safely(code, context_data=None):
    """Execute code in a restricted environment"""
    start_time = time.time()
    
    try:
        # Emit initial progress
        emit_progress('initializing', 0, 'Starting code execution')
        
        # Validate code first
        emit_progress('validating', 10, 'Validating code security')
        is_valid, error_msg = validate_code(code)
        if not is_valid:
            emit_status('failed', f"Security validation failed: {error_msg}")
            return {
                'success': False,
                'error': f"Security validation failed: {error_msg}",
                'execution_time': (time.time() - start_time) * 1000
            }
        
        # Set up security restrictions
        emit_progress('setting_up', 20, 'Setting up security restrictions')
        set_memory_limit(128)
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(15)  # 15 second timeout
        
        # Create restricted execution environment
        emit_progress('preparing_environment', 30, 'Preparing execution environment')
        safe_builtins = create_safe_builtins()
        safe_modules = create_safe_modules()
        
        # Add __import__ function for safe modules
        def safe_import(name, *args):
            if name in safe_modules:
                return safe_modules[name]
            else:
                raise ImportError(f"Module '{name}' is not available in this environment")
        
        # Add __import__ to safe builtins
        safe_builtins['__import__'] = safe_import
        
        # Create execution namespace
        exec_namespace = {
            '__builtins__': safe_builtins,
            '__name__': '__main__',
        }
        
        # Add safe modules to namespace
        exec_namespace.update(safe_modules)
        
        # Add context data if provided
        if context_data:
            emit_progress('loading_context', 40, 'Loading context data')
            if 'variables' in context_data:
                for key, value in context_data['variables'].items():
                    exec_namespace[key] = value
            if 'data' in context_data:
                exec_namespace['data'] = context_data['data']
        
        # Capture stdout and stderr
        emit_progress('executing', 50, 'Executing code')
        stdout_capture = io.StringIO()
        stderr_capture = io.StringIO()
        
        result = None
        
        with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
            # Execute the code
            try:
                # Use exec for statements, eval for expressions
                if '\n' in code or any(keyword in code for keyword in ['if ', 'for ', 'while ', 'def ', 'class ', 'try:', 'with ']):
                    # Multi-line code or statements
                    exec(code, exec_namespace)
                    # Try to get the result from the last expression
                    result = exec_namespace.get('result', None)
                else:
                    # Single expression
                    result = eval(code, exec_namespace)
            except Exception as e:
                # Cancel alarm before handling exception
                signal.alarm(0)
                return {
                    'success': False,
                    'error': f"Execution error: {str(e)}",
                    'output': stdout_capture.getvalue(),
                    'execution_time': (time.time() - start_time) * 1000
                }
        
        # Cancel alarm
        signal.alarm(0)
        
        # Process results
        emit_progress('processing_results', 90, 'Processing execution results')
        
        # Get output
        output = stdout_capture.getvalue()
        stderr_output = stderr_capture.getvalue()
        
        if stderr_output:
            output += f"\nSTDERR: {stderr_output}"
        
        execution_time = (time.time() - start_time) * 1000
        
        # Emit completion status
        emit_progress('completed', 100, 'Code execution completed successfully')
        emit_status('completed', 'Execution finished successfully', {'execution_time': execution_time})
        
        return {
            'success': True,
            'output': output,
            'result': result,
            'execution_time': execution_time,
            'timestamp': datetime.now().isoformat()
        }
        
    except TimeoutError:
        emit_status('failed', 'Code execution timed out (15 seconds)')
        return {
            'success': False,
            'error': "Code execution timed out (15 seconds)",
            'execution_time': (time.time() - start_time) * 1000
        }
    except MemoryError:
        emit_status('failed', 'Code execution exceeded memory limit (128MB)')
        return {
            'success': False,
            'error': "Code execution exceeded memory limit (128MB)",
            'execution_time': (time.time() - start_time) * 1000
        }
    except Exception as e:
        emit_status('failed', f"Unexpected error: {str(e)}")
        return {
            'success': False,
            'error': f"Unexpected error: {str(e)}",
            'execution_time': (time.time() - start_time) * 1000
        }
    finally:
        # Make sure to cancel any pending alarm
        try:
            signal.alarm(0)
        except:
            pass

def main():
    """Main entry point for the tool"""
    try:
        # Read parameters from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {'success': False, 'error': 'No input data provided'}
        else:
            parameters = json.loads(input_data)
            
            # Validate required parameters
            if 'code' not in parameters:
                result = {'success': False, 'error': 'Missing required parameter: code'}
            else:
                code = parameters['code']
                context_data = parameters.get('context_data', None)
                
                # Execute the code
                result = execute_code_safely(code, context_data)
        
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