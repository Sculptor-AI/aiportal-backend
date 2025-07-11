#!/usr/bin/env python3
"""
Secure Code Execution Sandbox
Uses process isolation and restricted execution environment
"""

import json
import sys
import io
import time
import signal
import os
import resource
import tempfile
import subprocess
import multiprocessing
from datetime import datetime
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

class SecureSandbox:
    def __init__(self):
        self.max_memory = 64 * 1024 * 1024  # 64MB
        self.max_cpu_time = 10  # 10 seconds
        self.max_wall_time = 15  # 15 seconds total
        self.temp_dir = None
        
    def create_isolated_process(self, code, context_data=None):
        """Create an isolated process to execute code"""
        # Create a temporary directory for this execution
        self.temp_dir = tempfile.mkdtemp(prefix='sandbox_')
        
        # Write the code to a temporary file
        code_file = Path(self.temp_dir) / 'user_code.py'
        with open(code_file, 'w') as f:
            f.write(code)
            
        # Create the execution script
        exec_script = Path(self.temp_dir) / 'execute.py'
        self._create_execution_script(exec_script, code_file, context_data)
        
        return exec_script
    
    def _create_execution_script(self, script_path, code_file, context_data):
        """Create the execution script with all security measures"""
        exec_code = f'''
import sys
import os
import resource
import signal
import json
import io
from contextlib import redirect_stdout, redirect_stderr

# Security: Remove dangerous modules from sys.modules
dangerous_modules = [
    'os', 'sys', 'subprocess', 'socket', 'urllib', 'requests', 'http',
    'shutil', 'tempfile', 'threading', 'multiprocessing', 'ctypes',
    'platform', 'inspect', 'importlib', 'pickle', 'marshal', 'shelve',
    'code', 'ast', 'compile', 'builtins', 'warnings', 'traceback',
    'signal', 'atexit', 'resource', 'pwd', 'grp', 'spwd', 'sqlite3'
]

for module in dangerous_modules:
    if module in sys.modules:
        del sys.modules[module]

# Set resource limits
def set_limits():
    # Memory limit
    resource.setrlimit(resource.RLIMIT_AS, ({self.max_memory}, {self.max_memory}))
    # CPU time limit
    resource.setrlimit(resource.RLIMIT_CPU, ({self.max_cpu_time}, {self.max_cpu_time}))
    # No file creation
    resource.setrlimit(resource.RLIMIT_FSIZE, (0, 0))
    # No additional processes
    resource.setrlimit(resource.RLIMIT_NPROC, (1, 1))

# Timeout handler
def timeout_handler(signum, frame):
    raise TimeoutError("Execution timed out")

# Set up signal handler
signal.signal(signal.SIGALRM, timeout_handler)
signal.alarm({self.max_wall_time})

try:
    set_limits()
    
    # Create restricted builtins
    safe_builtins = {{
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
    }}
    
    # Safe modules - only allow specific, pre-imported modules
    safe_modules = {{}}
    try:
        import math
        safe_modules['math'] = math
    except: pass
    try:
        import statistics
        safe_modules['statistics'] = statistics
    except: pass
    try:
        import random
        safe_modules['random'] = random
    except: pass
    try:
        import re
        safe_modules['re'] = re
    except: pass
    try:
        import json
        safe_modules['json'] = json
    except: pass
    try:
        import time
        safe_modules['time'] = time
    except: pass
    try:
        import datetime
        safe_modules['datetime'] = datetime
    except: pass
    
    # Restricted import function
    def safe_import(name, *args, **kwargs):
        if name in safe_modules:
            return safe_modules[name]
        else:
            available = list(safe_modules.keys())
            raise ImportError(f"Module '{{name}}' not available. Available: {{available}}")
    
    # Create execution namespace
    namespace = {{
        '__builtins__': safe_builtins,
        '__import__': safe_import,
        '__name__': '__main__',
    }}
    
    # Add safe modules to namespace
    namespace.update(safe_modules)
    
    # Add context data if provided
    context_data = {json.dumps(context_data) if context_data else 'None'}
    if context_data and context_data != 'None':
        context = json.loads(context_data)
        if 'variables' in context:
            namespace.update(context['variables'])
        if 'data' in context:
            namespace['data'] = context['data']
    
    # Read and execute user code
    with open('{code_file}', 'r') as f:
        user_code = f.read()
    
    # Capture output
    stdout_capture = io.StringIO()
    stderr_capture = io.StringIO()
    
    result = None
    
    with redirect_stdout(stdout_capture), redirect_stderr(stderr_capture):
        try:
            # Try as expression first
            try:
                result = eval(user_code, {{"__builtins__": safe_builtins}}, namespace)
            except SyntaxError:
                # If that fails, execute as statements
                exec(user_code, {{"__builtins__": safe_builtins}}, namespace)
                result = namespace.get('result', None)
        except Exception as e:
            print(json.dumps({{
                'success': False,
                'error': str(e),
                'output': stdout_capture.getvalue(),
                'stderr': stderr_capture.getvalue()
            }}))
            sys.exit(1)
    
    # Cancel alarm
    signal.alarm(0)
    
    # Output results
    output = stdout_capture.getvalue()
    stderr_output = stderr_capture.getvalue()
    
    print(json.dumps({{
        'success': True,
        'output': output,
        'result': result,
        'stderr': stderr_output
    }}, default=str))
    
except TimeoutError:
    print(json.dumps({{
        'success': False,
        'error': 'Execution timed out',
        'output': '',
        'stderr': ''
    }}))
    sys.exit(1)
except MemoryError:
    print(json.dumps({{
        'success': False,
        'error': 'Memory limit exceeded',
        'output': '',
        'stderr': ''
    }}))
    sys.exit(1)
except Exception as e:
    print(json.dumps({{
        'success': False,
        'error': f'Security error: {{str(e)}}',
        'output': '',
        'stderr': ''
    }}))
    sys.exit(1)
'''
        
        with open(script_path, 'w') as f:
            f.write(exec_code)
    
    def execute_safely(self, code, context_data=None):
        """Execute code in isolated process"""
        try:
            # Create isolated execution environment
            exec_script = self.create_isolated_process(code, context_data)
            
            # Execute in completely separate process with restrictions
            process = subprocess.Popen(
                [sys.executable, str(exec_script)],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE,
                cwd=self.temp_dir,
                env={},  # Empty environment
                preexec_fn=os.setsid if hasattr(os, 'setsid') else None
            )
            
            try:
                stdout, stderr = process.communicate(timeout=self.max_wall_time + 5)
                
                if process.returncode == 0:
                    result = json.loads(stdout.decode())
                    return result
                else:
                    return {
                        'success': False,
                        'error': f'Process failed with code {process.returncode}',
                        'output': stdout.decode() if stdout else '',
                        'stderr': stderr.decode() if stderr else ''
                    }
                    
            except subprocess.TimeoutExpired:
                # Kill the process group to ensure no child processes survive
                if hasattr(os, 'killpg'):
                    os.killpg(os.getpgid(process.pid), signal.SIGKILL)
                else:
                    process.kill()
                process.wait()
                return {
                    'success': False,
                    'error': 'Execution timeout - process terminated',
                    'output': '',
                    'stderr': ''
                }
                
        except Exception as e:
            return {
                'success': False,
                'error': f'Sandbox error: {str(e)}',
                'output': '',
                'stderr': ''
            }
        finally:
            # Clean up temporary directory
            if self.temp_dir:
                try:
                    import shutil
                    shutil.rmtree(self.temp_dir)
                except:
                    pass

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

def main():
    """Main entry point"""
    try:
        # Read parameters from stdin
        input_data = sys.stdin.read()
        if not input_data.strip():
            result = {'success': False, 'error': 'No input data provided'}
        else:
            parameters = json.loads(input_data)
            
            if 'code' not in parameters:
                result = {'success': False, 'error': 'Missing required parameter: code'}
            else:
                emit_progress('initializing', 0, 'Starting secure code execution')
                
                sandbox = SecureSandbox()
                code = parameters['code']
                context_data = parameters.get('context_data', None)
                
                emit_progress('executing', 50, 'Executing code in secure sandbox')
                result = sandbox.execute_safely(code, context_data)
                
                if result['success']:
                    emit_progress('completed', 100, 'Code execution completed successfully')
                    emit_status('completed', 'Execution finished successfully')
                else:
                    emit_status('failed', result.get('error', 'Unknown error'))
        
        # Add timestamp to result
        result['timestamp'] = datetime.now().isoformat()
        result['execution_time'] = 0  # Will be calculated by the service
        
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