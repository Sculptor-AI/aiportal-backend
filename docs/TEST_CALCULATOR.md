# Test Calculator

A simple calculator tool for testing

## Parameters

```json
{
  "type": "object",
  "properties": {},
  "required": [],
  "additionalProperties": false
}
```

## Returns

```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation was successful"
    },
    "result": {
      "description": "The result of the operation"
    },
    "error": {
      "type": "string",
      "description": "Error message if operation failed"
    }
  }
}
```

## Usage

This tool can be executed through the AI Portal's tools system.

## Development

To test this tool locally:

```bash
echo '{"parameter": "value"}' | python3 controller.py
```

## Security

✅ Sandboxed execution
✅ No file system access
✅ No network access
✅ Memory limited to 128MB
✅ Execution timeout: 30s
