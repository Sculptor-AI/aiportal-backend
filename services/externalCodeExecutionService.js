import axios from 'axios';

class ExternalCodeExecutionService {
    constructor() {
        this.apiKey = process.env.XENPAC_API_KEY || '94b3df12696e8f3e672fd40c91dc6e52';
        this.baseUrl = 'https://dev.xenpac.org/api';
    }

    async executeCode(code, language = 'python') {
        try {
            // Map language names to language IDs
            const languageMap = {
                'python': 71,
                'javascript': 63,
                'typescript': 74,
                'java': 62,
                'cpp': 54,
                'csharp': 51,
                'go': 60,
                'rust': 73,
                'php': 68,
                'ruby': 72,
                'swift': 83,
                'kotlin': 78,
                'scala': 81,
                'r': 80,
                'matlab': 58
            };

            const languageId = languageMap[language] || 71; // Default to Python
            const fileName = this.getFileName(language);

            const response = await axios.post(`${this.baseUrl}/run`, {
                mainFile: fileName,
                language_id: languageId,
                variables: {},
                files: [
                    {
                        name: fileName,
                        content: code
                    }
                ]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey
                },
                timeout: 30000 // 30 second timeout
            });

            return {
                success: true,
                result: response.data.result,
                output: response.data.output,
                error: response.data.error || null,
                executionTime: response.data.executionTime || null,
                language: language
            };
        } catch (error) {
            console.error('External code execution error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.error || error.message,
                result: null,
                output: null,
                executionTime: null,
                language: language
            };
        }
    }

    async executeCodeStream(code, language = 'python') {
        try {
            // Map language names to language IDs
            const languageMap = {
                'python': 71,
                'javascript': 63,
                'typescript': 74,
                'java': 62,
                'cpp': 54,
                'csharp': 51,
                'go': 60,
                'rust': 73,
                'php': 68,
                'ruby': 72,
                'swift': 83,
                'kotlin': 78,
                'scala': 81,
                'r': 80,
                'matlab': 58
            };

            const languageId = languageMap[language] || 71; // Default to Python
            const fileName = this.getFileName(language);

            const response = await axios.post(`${this.baseUrl}/run`, {
                mainFile: fileName,
                language_id: languageId,
                variables: {},
                files: [
                    {
                        name: fileName,
                        content: code
                    }
                ]
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey
                },
                responseType: 'stream',
                timeout: 30000
            });

            return {
                success: true,
                stream: response.data,
                language: language
            };
        } catch (error) {
            console.error('External code execution stream error:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.error || error.message,
                stream: null,
                language: language
            };
        }
    }

    getSupportedLanguages() {
        return [
            { id: 'python', name: 'Python', extension: '.py' },
            { id: 'javascript', name: 'JavaScript', extension: '.js' },
            { id: 'typescript', name: 'TypeScript', extension: '.ts' },
            { id: 'java', name: 'Java', extension: '.java' },
            { id: 'cpp', name: 'C++', extension: '.cpp' },
            { id: 'csharp', name: 'C#', extension: '.cs' },
            { id: 'go', name: 'Go', extension: '.go' },
            { id: 'rust', name: 'Rust', extension: '.rs' },
            { id: 'php', name: 'PHP', extension: '.php' },
            { id: 'ruby', name: 'Ruby', extension: '.rb' },
            { id: 'swift', name: 'Swift', extension: '.swift' },
            { id: 'kotlin', name: 'Kotlin', extension: '.kt' },
            { id: 'scala', name: 'Scala', extension: '.scala' },
            { id: 'r', name: 'R', extension: '.r' },
            { id: 'matlab', name: 'MATLAB', extension: '.m' }
        ];
    }

    detectLanguage(code) {
        // Simple language detection based on code patterns
        const patterns = {
            python: /^(import |from |def |class |print\(|if __name__|#!\/usr\/bin\/env python)/m,
            javascript: /^(function |const |let |var |console\.|import |export )/m,
            typescript: /^(interface |type |import |export |function |const |let |var )/m,
            java: /^(public class |import java|System\.out|public static void main)/m,
            cpp: /^(#include |using namespace|int main|std::|cout <<)/m,
            csharp: /^(using System|namespace |class |public static void Main)/m,
            go: /^(package |import |func main|fmt\.)/m,
            rust: /^(fn main|use |println!|let |mut )/m,
            php: /^(<\?php|echo |function |class |namespace )/m,
            ruby: /^(def |puts |require |class |module )/m,
            swift: /^(import |func |class |struct |print\(|var |let )/m,
            kotlin: /^(fun |val |var |println|import |class )/m,
            scala: /^(object |def |val |var |println|import )/m,
            r: /^(library\(|<- |print\(|function\(|data\.frame)/m,
            matlab: /^(function |disp\(|fprintf|plot\(|figure)/m
        };

        for (const [lang, pattern] of Object.entries(patterns)) {
            if (pattern.test(code)) {
                return lang;
            }
        }

        return 'python'; // Default fallback
    }

    getFileName(language) {
        const fileExtensions = {
            'python': 'main.py',
            'javascript': 'main.js',
            'typescript': 'main.ts',
            'java': 'Main.java',
            'cpp': 'main.cpp',
            'csharp': 'Program.cs',
            'go': 'main.go',
            'rust': 'main.rs',
            'php': 'main.php',
            'ruby': 'main.rb',
            'swift': 'main.swift',
            'kotlin': 'Main.kt',
            'scala': 'Main.scala',
            'r': 'main.r',
            'matlab': 'main.m'
        };
        
        return fileExtensions[language] || 'main.py';
    }
}

export default new ExternalCodeExecutionService();
