/**
 * External Code Execution Service
 * Integrates with external code execution APIs like Judge0
 */

class ExternalCodeExecutionService {
    constructor() {
        this.apiBaseUrl = process.env.EXTERNAL_CODE_API_URL || 'https://dev.xenpac.org/api';
        this.apiKey = process.env.EXTERNAL_CODE_API_KEY || '94b3df12696e8f3e672fd40c91dc6e52';
        this.appId = process.env.EXTERNAL_CODE_APP_ID || '6';
        
        // Language ID mappings for common languages
        this.languageMappings = {
            'python': 71,      // Python (3.8.1)
            'javascript': 63,   // JavaScript (Node.js 12.14.0)
            'java': 62,         // Java (OpenJDK 13.0.1)
            'cpp': 54,          // C++ (GCC 9.2.0)
            'c': 50,            // C (GCC 9.2.0)
            'csharp': 51,       // C# (Mono 6.6.0.161)
            'php': 68,          // PHP (7.4.1)
            'ruby': 72,         // Ruby (2.7.0)
            'go': 60,           // Go (1.13.5)
            'rust': 73,         // Rust (1.40.0)
            'swift': 83,        // Swift (5.2.3)
            'kotlin': 78,       // Kotlin (1.3.70)
            'scala': 81,        // Scala (2.13.2)
            'r': 80,            // R (4.0.0)
            'bash': 46,         // Bash (5.0.0)
            'sql': 82,          // SQL (SQLite 3.27.2)
            'typescript': 74,   // TypeScript (3.7.4)
            'perl': 85,         // Perl (5.28.1)
            'haskell': 61,      // Haskell (GHC 8.8.1)
            'lua': 64,          // Lua (5.3.5)
            'assembly': 45,     // Assembly (NASM 2.14.02)
            'fortran': 58,      // Fortran (GFortran 9.2.0)
            'pascal': 67,       // Pascal (FPC 3.0.4)
            'cobol': 77,        // COBOL (GnuCOBOL 2.2)
            'brainfuck': 44,    // Brainfuck (bf 20041219)
            'lolcode': 89,      // LOLCODE (lci 0.11.2)
            'scheme': 86,       // Scheme (Gauche 0.9.9)
            'erlang': 88,       // Erlang (OTP 22.2)
            'elixir': 57,       // Elixir (1.9.4)
            'clojure': 86,      // Clojure (1.10.1)
            'fsharp': 87,       // F# (.NET Core SDK 3.1.202)
            'dart': 49,         // Dart (2.7.2)
            'nim': 75,          // Nim (1.0.6)
            'ocaml': 79,        // OCaml (4.09.0)
            'crystal': 84,      // Crystal (0.33.0)
            'groovy': 3,        // Groovy (3.0.3)
            'julia': 4,         // Julia (1.3.1)
            'nasm': 45,         // NASM (2.14.02)
            'unlambda': 5,      // Unlambda (2.0.0)
            'picolisp': 6,      // PicoLisp (3.1.11.1)
            'spidermonkey': 7,  // SpiderMonkey (60.9.0)
            'rhino': 8,         // Rhino JS (1.7.7.2)
            'bc': 9,            // BC (1.07.1)
            'tcl': 10,          // Tcl (8.6)
            'moon': 11,         // MoonScript (0.5.0)
            'cps': 12,          // CPS (1.0.0)
            'd': 13,            // D (GDC 9.2.0)
            'chicken': 14,      // Chicken (5.2.0)
            'elisp': 15,        // Emacs Lisp (26.3)
            'asm2bf': 16,       // Asm2bf (1.0.0)
            'clisp': 17,        // CLISP (2.49.93)
            'hack': 18,         // Hack (HipHop VM 3.13.0)
            'factor': 19,       // Factor (0.98)
            'falcon': 20,       // Falcon (0.9.6.8)
            'sed': 21,          // Sed (4.7)
            'awk': 22,          // Awk (GNU Awk 4.2.1)
            'jq': 23,           // JQ (jq-1.6)
            'dc': 24,           // DC (dc 1.4.1)
            'hexagony': 25,     // Hexagony (0.2.0)
            'piet': 26,         // Piet (npiet 1.3a)
            'befunge': 27,      // Befunge-93 (bef 1.1)
            'alk': 28,          // ALK (1.0.0)
            'jsx': 29,          // JSX (0.9.20)
            'lambda': 30,       // Lambda Calculus (1.0.0)
            'idris': 31,        // Idris (1.3.2)
            'ats': 32,          // ATS (Postiats 0.3.11)
            'sage': 33,         // SageMath (9.0)
            'unlambda2': 34,    // Unlambda (2.0.0)
            'malbolge': 35,     // Malbolge (2.0.0)
            'whitespace': 36,   // Whitespace (0.3)
            'esolang': 37,      // Esolang (1.0.0)
            'visual_basic': 84, // Visual Basic.Net (vbnc 0.0.0.5943)
            'cobol85': 77,      // COBOL 85 (GnuCOBOL 2.2)
            'fobol': 77,        // FreeBASIC (1.07.1)
            'tbas': 39,         // ThinBASIC (1.9.16.25)
            'cobol2002': 77,    // COBOL 2002 (GnuCOBOL 2.2)
            'cobol2014': 77,    // COBOL 2014 (GnuCOBOL 2.2)
            'netrexx': 88,      // NetRexx (3.04)
            'netrexx_console': 88, // NetRexx (3.04)
            'lolcode_1_3': 89,  // LOLCODE (lci 0.11.2)
            'as400': 90,        // AS400 (AS400)
            'algol68': 91,      // ALGOL 68 (gcc 9.2.0)
            'seed7': 92,        // Seed7 (Seed7 3.2.1)
            'tcl_tk': 10,       // Tcl (8.6)
            'mercury': 93,      // Mercury (14.01.1)
            'vlang': 94,        // V (0.1.29)
            'zig': 95,          // Zig (0.6.0)
            'odin': 96,         // Odin (odin version dev-2021-07)
            'zsh': 97,          // Zsh (5.8)
            'fish': 98,         // Fish (3.1.2)
            'nushell': 99,      // Nushell (0.20.0)
            'moon': 100,        // MoonScript (0.5.0)
            'dx': 101,          // DX (1.0.0)
            'deno': 102,        // Deno (1.4.6)
            'bqn': 103,         // BQN (0.1.0)
            'ponylang': 104,    // Pony (0.38.0)
            'c3': 105,          // C3 (0.4.0)
            'vlang_2': 94,      // V (0.2.4)
            'zig_2': 95,        // Zig (0.8.1)
            'odin_2': 96,       // Odin (odin version dev-2021-12)
            'vlang_3': 94,      // V (0.3.0)
            'zig_3': 95,        // Zig (0.9.1)
            'odin_3': 96,       // Odin (odin version dev-2022-06)
            'vlang_4': 94,      // V (0.4.0)
            'zig_4': 95,        // Zig (0.10.0)
            'odin_4': 96,       // Odin (odin version dev-2022-12)
            'vlang_5': 94,      // V (0.5.0)
            'zig_5': 95,        // Zig (0.11.0)
            'odin_5': 96,       // Odin (odin version dev-2023-06)
            'vlang_6': 94,      // V (0.6.0)
            'zig_6': 95,        // Zig (0.12.0)
            'odin_6': 96,       // Odin (odin version dev-2023-12)
        };
    }

    /**
     * Detect programming language from code content
     */
    detectLanguage(code) {
        const firstLine = code.trim().split('\n')[0].toLowerCase();
        
        // Check for shebang
        if (firstLine.startsWith('#!')) {
            if (firstLine.includes('python')) return 'python';
            if (firstLine.includes('node')) return 'javascript';
            if (firstLine.includes('bash')) return 'bash';
            if (firstLine.includes('perl')) return 'perl';
            if (firstLine.includes('ruby')) return 'ruby';
            if (firstLine.includes('php')) return 'php';
        }

        // Check for language-specific patterns
        if (code.includes('import ') && code.includes('print(')) return 'python';
        if (code.includes('console.log') || code.includes('function') || code.includes('const ') || code.includes('let ')) return 'javascript';
        if (code.includes('public class') || code.includes('System.out.println')) return 'java';
        if (code.includes('#include <iostream>') || code.includes('std::cout')) return 'cpp';
        if (code.includes('#include <stdio.h>') || code.includes('printf(')) return 'c';
        if (code.includes('using System;') || code.includes('Console.WriteLine')) return 'csharp';
        if (code.includes('<?php') || code.includes('echo ')) return 'php';
        if (code.includes('puts ') || code.includes('def ')) return 'ruby';
        if (code.includes('package main') || code.includes('fmt.Println')) return 'go';
        if (code.includes('fn main') || code.includes('println!')) return 'rust';
        if (code.includes('import Swift') || code.includes('print(')) return 'swift';
        if (code.includes('fun main') || code.includes('println(')) return 'kotlin';
        if (code.includes('object ') && code.includes('def ')) return 'scala';
        if (code.includes('cat(') || code.includes('print(')) return 'r';
        if (code.includes('#!/bin/bash') || code.includes('echo ')) return 'bash';
        if (code.includes('SELECT ') || code.includes('CREATE TABLE')) return 'sql';
        if (code.includes('interface ') || code.includes('type ')) return 'typescript';

        // Default to Python if no clear pattern
        return 'python';
    }

    /**
     * Execute code using external API
     */
    async executeCode(code, language = null, variables = {}) {
        try {
            // Detect language if not provided
            const detectedLanguage = language || this.detectLanguage(code);
            const languageId = this.languageMappings[detectedLanguage.toLowerCase()];

            if (!languageId) {
                throw new Error(`Unsupported language: ${detectedLanguage}`);
            }

            // Prepare the request payload
            const payload = {
                appId: this.appId,
                mainFile: this.getMainFileName(detectedLanguage),
                language_id: languageId,
                variables: variables
            };

            // Add the code to the appropriate field based on the API
            if (this.apiBaseUrl.includes('xenpac.org')) {
                // For xenpac.org API, we need to send the code in the request body
                payload.code = code;
            } else {
                // For other APIs, we might need to send it differently
                payload.source_code = code;
            }

            console.log(`🚀 Executing ${detectedLanguage} code via external API...`);
            console.log(`📡 API URL: ${this.apiBaseUrl}/run`);
            console.log(`🔧 Language ID: ${languageId} (${detectedLanguage})`);

            // Make the API request
            const response = await fetch(`${this.apiBaseUrl}/run`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`External API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            
            console.log(`✅ External code execution completed`);
            
            // Transform the response to match our expected format
            return this.transformResponse(result, detectedLanguage);

        } catch (error) {
            console.error('❌ External code execution failed:', error);
            throw error;
        }
    }

    /**
     * Get the main file name for a given language
     */
    getMainFileName(language) {
        const fileNames = {
            'python': 'main.py',
            'javascript': 'main.js',
            'java': 'Main.java',
            'cpp': 'main.cpp',
            'c': 'main.c',
            'csharp': 'Program.cs',
            'php': 'main.php',
            'ruby': 'main.rb',
            'go': 'main.go',
            'rust': 'main.rs',
            'swift': 'main.swift',
            'kotlin': 'Main.kt',
            'scala': 'Main.scala',
            'r': 'main.R',
            'bash': 'main.sh',
            'sql': 'main.sql',
            'typescript': 'main.ts',
            'perl': 'main.pl',
            'haskell': 'Main.hs',
            'lua': 'main.lua',
            'assembly': 'main.asm',
            'fortran': 'main.f90',
            'pascal': 'main.pas',
            'cobol': 'main.cob',
            'brainfuck': 'main.bf',
            'lolcode': 'main.lol',
            'scheme': 'main.scm',
            'erlang': 'main.erl',
            'elixir': 'main.exs',
            'clojure': 'main.clj',
            'fsharp': 'main.fs',
            'dart': 'main.dart',
            'nim': 'main.nim',
            'ocaml': 'main.ml',
            'crystal': 'main.cr',
            'groovy': 'main.groovy',
            'julia': 'main.jl',
            'nasm': 'main.asm',
            'unlambda': 'main.unl',
            'picolisp': 'main.l',
            'spidermonkey': 'main.js',
            'rhino': 'main.js',
            'bc': 'main.bc',
            'tcl': 'main.tcl',
            'moon': 'main.moon',
            'cps': 'main.cps',
            'd': 'main.d',
            'chicken': 'main.scm',
            'elisp': 'main.el',
            'asm2bf': 'main.asm',
            'clisp': 'main.lisp',
            'hack': 'main.hack',
            'factor': 'main.factor',
            'falcon': 'main.fal',
            'sed': 'main.sed',
            'awk': 'main.awk',
            'jq': 'main.jq',
            'dc': 'main.dc',
            'hexagony': 'main.hex',
            'piet': 'main.png',
            'befunge': 'main.bf',
            'alk': 'main.alk',
            'jsx': 'main.jsx',
            'lambda': 'main.lambda',
            'idris': 'main.idr',
            'ats': 'main.dats',
            'sage': 'main.sage',
            'unlambda2': 'main.unl',
            'malbolge': 'main.mal',
            'whitespace': 'main.ws',
            'esolang': 'main.esolang',
            'visual_basic': 'Program.vb',
            'cobol85': 'main.cob',
            'fobol': 'main.bas',
            'tbas': 'main.bas',
            'cobol2002': 'main.cob',
            'cobol2014': 'main.cob',
            'netrexx': 'main.nrx',
            'netrexx_console': 'main.nrx',
            'lolcode_1_3': 'main.lol',
            'as400': 'main.rpgle',
            'algol68': 'main.a68',
            'seed7': 'main.sd7',
            'tcl_tk': 'main.tcl',
            'mercury': 'main.m',
            'vlang': 'main.v',
            'zig': 'main.zig',
            'odin': 'main.odin',
            'zsh': 'main.zsh',
            'fish': 'main.fish',
            'nushell': 'main.nu',
            'moon': 'main.moon',
            'dx': 'main.dx',
            'deno': 'main.ts',
            'bqn': 'main.bqn',
            'ponylang': 'main.pony',
            'c3': 'main.c3',
            'vlang_2': 'main.v',
            'zig_2': 'main.zig',
            'odin_2': 'main.odin',
            'vlang_3': 'main.v',
            'zig_3': 'main.zig',
            'odin_3': 'main.odin',
            'vlang_4': 'main.v',
            'zig_4': 'main.zig',
            'odin_4': 'main.odin',
            'vlang_5': 'main.v',
            'zig_5': 'main.zig',
            'odin_5': 'main.odin',
            'vlang_6': 'main.v',
            'zig_6': 'main.zig',
            'odin_6': 'main.odin'
        };

        return fileNames[language.toLowerCase()] || 'main.txt';
    }

    /**
     * Transform external API response to our format
     */
    transformResponse(externalResult, language) {
        // Handle different response formats from external APIs
        if (externalResult.stdout !== undefined || externalResult.output !== undefined) {
            // Standard Judge0-like format
            return {
                success: true,
                output: externalResult.stdout || externalResult.output || '',
                error: externalResult.stderr || externalResult.error || '',
                execution_time: externalResult.time || externalResult.execution_time || 0,
                memory: externalResult.memory || 0,
                exit_code: externalResult.exit_code || externalResult.exitCode || 0,
                language: language,
                result: externalResult.stdout || externalResult.output || ''
            };
        } else if (externalResult.result) {
            // Custom API format
            return {
                success: true,
                output: externalResult.result.output || '',
                error: externalResult.result.error || '',
                execution_time: externalResult.result.execution_time || externalResult.result.time || 0,
                memory: externalResult.result.memory || 0,
                exit_code: externalResult.result.exit_code || 0,
                language: language,
                result: externalResult.result.output || externalResult.result
            };
        } else {
            // Fallback - return as-is
            return {
                success: true,
                output: JSON.stringify(externalResult),
                error: '',
                execution_time: 0,
                memory: 0,
                exit_code: 0,
                language: language,
                result: externalResult
            };
        }
    }

    /**
     * Get supported languages
     */
    getSupportedLanguages() {
        return Object.keys(this.languageMappings).map(lang => ({
            name: lang,
            id: this.languageMappings[lang],
            mainFile: this.getMainFileName(lang)
        }));
    }
}

export default new ExternalCodeExecutionService(); 