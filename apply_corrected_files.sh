#!/bin/bash

# Script to apply corrected model configuration files (removes pricing sections)

echo "Applying corrected model configuration files..."
echo "This script will replace the original files with versions that have pricing sections removed."
echo

# List of files to copy
declare -a files=(
    "claude-3.5-haiku.json:/home/kellen/aiportal/backend/model_config/models/anthropic/claude-3.5-haiku.json"
    "claude-4-opus.json:/home/kellen/aiportal/backend/model_config/models/anthropic/claude-4-opus.json"
    "claude-4-sonnet.json:/home/kellen/aiportal/backend/model_config/models/anthropic/claude-4-sonnet.json"
    "gemini-1.5-pro.json:/home/kellen/aiportal/backend/model_config/models/google/gemini-1.5-pro.json"
    "gemini-2.0-flash-lite.json:/home/kellen/aiportal/backend/model_config/models/google/gemini-2.0-flash-lite.json"
    "gemini-2.5-flash.json:/home/kellen/aiportal/backend/model_config/models/google/gemini-2.5-flash.json"
    "mercury.json:/home/kellen/aiportal/backend/model_config/models/inception/mercury.json"
    "mercury-coder.json:/home/kellen/aiportal/backend/model_config/models/inception/mercury-coder.json"
    "gpt-4.1-mini.json:/home/kellen/aiportal/backend/model_config/models/openai/gpt-4.1-mini.json"
    "gpt-4.5.json:/home/kellen/aiportal/backend/model_config/models/openai/gpt-4.5.json"
    "o3-mini.json:/home/kellen/aiportal/backend/model_config/models/openai/o3-mini.json"
    "o3.json:/home/kellen/aiportal/backend/model_config/models/openai/o3.json"
    "o4-mini.json:/home/kellen/aiportal/backend/model_config/models/openai/o4-mini.json"
)

temp_dir="/tmp/corrected_model_configs"
success_count=0
failed_count=0

for file_mapping in "${files[@]}"; do
    # Split the mapping into source and destination
    source_file="${file_mapping%%:*}"
    dest_file="${file_mapping#*:}"
    
    source_path="$temp_dir/$source_file"
    
    echo "Copying $source_file to $dest_file"
    
    if sudo cp "$source_path" "$dest_file"; then
        echo "  ✓ Success"
        ((success_count++))
    else
        echo "  ✗ Failed"
        ((failed_count++))
    fi
done

echo
echo "=== SUMMARY ==="
echo "Successfully applied: $success_count files"
echo "Failed: $failed_count files"

if [ $failed_count -eq 0 ]; then
    echo "All files have been successfully updated!"
    echo "Pricing sections have been removed from all model configuration files."
else
    echo "Some files failed to update. Please check the errors above."
fi