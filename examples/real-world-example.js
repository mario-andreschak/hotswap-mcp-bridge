#!/usr/bin/env node
/**
 * MCP Real-World Example: Code Assistant
 * 
 * This example demonstrates a practical use case for MCP: a code assistant server
 * that provides tools for code analysis, generation, and documentation.
 * 
 * Features:
 * - Code analysis tool that examines code and provides insights
 * - Code generation tool that creates code based on requirements
 * - Documentation generator that creates documentation for code
 * - Project structure analyzer that provides insights into project organization
 * 
 * Usage:
 *   node real-world-example.js [--project <project-path>]
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// Convert exec to promise-based
const execAsync = promisify(exec);

// Get the directory name
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const projectPathIndex = args.indexOf('--project');
const projectPath = projectPathIndex >= 0 
  ? path.resolve(args[projectPathIndex + 1]) 
  : path.resolve(__dirname, '..');

// Create a server
const server = new McpServer({
  name: 'code-assistant',
  version: '1.0.0'
});

// Helper function to read a file
async function readFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

// Helper function to write a file
async function writeFile(filePath, content) {
  try {
    // Ensure the directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    throw new Error(`Failed to write file ${filePath}: ${error.message}`);
  }
}

// Helper function to list files in a directory recursively
async function listFilesRecursively(dir, fileList = [], rootDir = dir) {
  const files = await fs.readdir(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and .git directories
      if (file === 'node_modules' || file === '.git') {
        continue;
      }
      
      // Recursively list files in subdirectories
      await listFilesRecursively(filePath, fileList, rootDir);
    } else {
      // Add file to the list with its relative path from the root directory
      fileList.push(path.relative(rootDir, filePath));
    }
  }
  
  return fileList;
}

// Helper function to detect the programming language from a file extension
function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  
  switch (ext) {
    case '.js':
      return 'javascript';
    case '.ts':
      return 'typescript';
    case '.jsx':
      return 'javascript (React)';
    case '.tsx':
      return 'typescript (React)';
    case '.py':
      return 'python';
    case '.java':
      return 'java';
    case '.c':
      return 'c';
    case '.cpp':
    case '.cc':
    case '.cxx':
      return 'c++';
    case '.cs':
      return 'c#';
    case '.go':
      return 'go';
    case '.rb':
      return 'ruby';
    case '.php':
      return 'php';
    case '.swift':
      return 'swift';
    case '.kt':
    case '.kts':
      return 'kotlin';
    case '.rs':
      return 'rust';
    case '.html':
      return 'html';
    case '.css':
      return 'css';
    case '.scss':
      return 'scss';
    case '.json':
      return 'json';
    case '.md':
      return 'markdown';
    case '.sh':
      return 'shell';
    case '.bat':
    case '.cmd':
      return 'batch';
    case '.ps1':
      return 'powershell';
    default:
      return 'unknown';
  }
}

// Helper function to analyze code
async function analyzeCode(code, language) {
  // In a real implementation, this would use a code analysis library or AI
  // For this example, we'll provide a simple analysis
  
  const analysis = {
    language,
    lineCount: code.split('\n').length,
    characterCount: code.length,
    imports: [],
    functions: [],
    classes: [],
    complexity: 'medium', // Placeholder
    suggestions: []
  };
  
  // Extract imports, functions, and classes based on language
  if (language === 'javascript' || language === 'typescript') {
    // Find imports
    const importRegex = /import\s+(?:{[^}]+}|\*\s+as\s+\w+|\w+)\s+from\s+['"][^'"]+['"]/g;
    const imports = code.match(importRegex) || [];
    analysis.imports = imports.map(imp => imp.trim());
    
    // Find functions
    const functionRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      analysis.functions.push(match[1] || match[2]);
    }
    
    // Find classes
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(code)) !== null) {
      analysis.classes.push(match[1]);
    }
    
    // Add suggestions
    if (code.includes('var ')) {
      analysis.suggestions.push('Consider using let or const instead of var for better scoping');
    }
    
    if (code.includes('console.log')) {
      analysis.suggestions.push('Remove console.log statements before production deployment');
    }
    
    if (!code.includes('try') && code.includes('await')) {
      analysis.suggestions.push('Consider adding try/catch blocks around async operations');
    }
  } else if (language === 'python') {
    // Find imports
    const importRegex = /(?:import\s+\w+|from\s+\w+\s+import\s+[^#\n]+)/g;
    const imports = code.match(importRegex) || [];
    analysis.imports = imports.map(imp => imp.trim());
    
    // Find functions
    const functionRegex = /def\s+(\w+)\s*\(/g;
    let match;
    while ((match = functionRegex.exec(code)) !== null) {
      analysis.functions.push(match[1]);
    }
    
    // Find classes
    const classRegex = /class\s+(\w+)/g;
    while ((match = classRegex.exec(code)) !== null) {
      analysis.classes.push(match[1]);
    }
    
    // Add suggestions
    if (code.includes('print(')) {
      analysis.suggestions.push('Consider using logging instead of print statements');
    }
    
    if (!code.includes('if __name__ == "__main__"')) {
      analysis.suggestions.push('Consider adding an if __name__ == "__main__" block for scripts');
    }
  }
  
  return analysis;
}

// Helper function to generate code documentation
async function generateDocumentation(code, language) {
  // In a real implementation, this would use a documentation generator or AI
  // For this example, we'll provide a simple documentation template
  
  let documentation = '';
  
  if (language === 'javascript' || language === 'typescript') {
    documentation = `# Code Documentation\n\n`;
    
    // Extract file description from comments
    const descriptionMatch = code.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
    if (descriptionMatch) {
      documentation += `## Overview\n\n${descriptionMatch[1].replace(/\s*\*\s*/g, '')}\n\n`;
    } else {
      documentation += `## Overview\n\nNo description provided.\n\n`;
    }
    
    // Extract functions
    documentation += `## Functions\n\n`;
    const functionRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
    let match;
    let foundFunctions = false;
    
    while ((match = functionRegex.exec(code)) !== null) {
      foundFunctions = true;
      const functionName = match[2] || match[3];
      const functionDocs = match[1] ? match[1].replace(/\s*\*\s*/g, '') : 'No documentation provided.';
      
      documentation += `### ${functionName}\n\n${functionDocs}\n\n`;
    }
    
    if (!foundFunctions) {
      documentation += `No functions found.\n\n`;
    }
    
    // Extract classes
    documentation += `## Classes\n\n`;
    const classRegex = /(?:\/\*\*\s*([\s\S]*?)\s*\*\/\s*)?class\s+(\w+)/g;
    let foundClasses = false;
    
    while ((match = classRegex.exec(code)) !== null) {
      foundClasses = true;
      const className = match[2];
      const classDocs = match[1] ? match[1].replace(/\s*\*\s*/g, '') : 'No documentation provided.';
      
      documentation += `### ${className}\n\n${classDocs}\n\n`;
    }
    
    if (!foundClasses) {
      documentation += `No classes found.\n\n`;
    }
  } else if (language === 'python') {
    documentation = `# Code Documentation\n\n`;
    
    // Extract file description from docstring
    const descriptionMatch = code.match(/^"""\s*([\s\S]*?)\s*"""/);
    if (descriptionMatch) {
      documentation += `## Overview\n\n${descriptionMatch[1].trim()}\n\n`;
    } else {
      documentation += `## Overview\n\nNo description provided.\n\n`;
    }
    
    // Extract functions
    documentation += `## Functions\n\n`;
    const functionRegex = /def\s+(\w+)\s*\([^)]*\):\s*(?:"""\s*([\s\S]*?)\s*""")?/g;
    let match;
    let foundFunctions = false;
    
    while ((match = functionRegex.exec(code)) !== null) {
      foundFunctions = true;
      const functionName = match[1];
      const functionDocs = match[2] ? match[2].trim() : 'No documentation provided.';
      
      documentation += `### ${functionName}\n\n${functionDocs}\n\n`;
    }
    
    if (!foundFunctions) {
      documentation += `No functions found.\n\n`;
    }
    
    // Extract classes
    documentation += `## Classes\n\n`;
    const classRegex = /class\s+(\w+)[^:]*:\s*(?:"""\s*([\s\S]*?)\s*""")?/g;
    let foundClasses = false;
    
    while ((match = classRegex.exec(code)) !== null) {
      foundClasses = true;
      const className = match[1];
      const classDocs = match[2] ? match[2].trim() : 'No documentation provided.';
      
      documentation += `### ${className}\n\n${classDocs}\n\n`;
    }
    
    if (!foundClasses) {
      documentation += `No classes found.\n\n`;
    }
  }
  
  return documentation;
}

// Register a code analysis tool
server.tool(
  'analyzeCode',
  'Analyze code and provide insights',
  {
    code: z.string().describe('Code to analyze'),
    language: z.string().describe('Programming language of the code')
  },
  async ({ code, language }) => {
    console.error(`Analyzing ${language} code (${code.length} characters)`);
    
    try {
      const analysis = await analyzeCode(code, language);
      
      return {
        content: [
          {
            type: 'text',
            text: `# Code Analysis Results

## Overview
- Language: ${analysis.language}
- Line count: ${analysis.lineCount}
- Character count: ${analysis.characterCount}
- Complexity: ${analysis.complexity}

## Structure
- Imports: ${analysis.imports.length > 0 ? '\n  - ' + analysis.imports.join('\n  - ') : 'None found'}
- Functions: ${analysis.functions.length > 0 ? '\n  - ' + analysis.functions.join('\n  - ') : 'None found'}
- Classes: ${analysis.classes.length > 0 ? '\n  - ' + analysis.classes.join('\n  - ') : 'None found'}

## Suggestions
${analysis.suggestions.length > 0 ? analysis.suggestions.map(s => `- ${s}`).join('\n') : '- No suggestions available'}
`
          }
        ]
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error analyzing code: ${error.message}`
          }
        ]
      };
    }
  }
);

// Register a code generation tool
server.tool(
  'generateCode',
  'Generate code based on requirements',
  {
    language: z.enum(['javascript', 'typescript', 'python']).describe('Programming language for the generated code'),
    type: z.enum(['function', 'class', 'module']).describe('Type of code to generate'),
    name: z.string().describe('Name for the function, class, or module'),
    description: z.string().describe('Description of what the code should do'),
    parameters: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string().optional()
    })).optional().describe('Parameters for functions or methods')
  },
  async ({ language, type, name, description, parameters = [] }) => {
    console.error(`Generating ${language} ${type} named "${name}"`);
    
    try {
      let code = '';
      
      if (language === 'javascript') {
        if (type === 'function') {
          // Generate JSDoc comment
          code += `/**\n * ${description}\n`;
          parameters.forEach(param => {
            code += ` * @param {${param.type}} ${param.name} ${param.description || ''}\n`;
          });
          code += ` * @returns {any} The result\n */\n`;
          
          // Generate function
          code += `function ${name}(${parameters.map(p => p.name).join(', ')}) {\n`;
          code += `  // TODO: Implement ${description}\n`;
          code += `  console.log('Function ${name} called');\n`;
          parameters.forEach(param => {
            code += `  console.log('Parameter ${param.name}:', ${param.name});\n`;
          });
          code += `  \n  // Return a placeholder value\n`;
          code += `  return null;\n`;
          code += `}\n\n`;
          code += `module.exports = ${name};\n`;
        } else if (type === 'class') {
          // Generate JSDoc comment
          code += `/**\n * ${description}\n */\n`;
          code += `class ${name} {\n`;
          
          // Generate constructor
          code += `  /**\n   * Create a new ${name} instance\n`;
          parameters.forEach(param => {
            code += `   * @param {${param.type}} ${param.name} ${param.description || ''}\n`;
          });
          code += `   */\n`;
          code += `  constructor(${parameters.map(p => p.name).join(', ')}) {\n`;
          parameters.forEach(param => {
            code += `    this.${param.name} = ${param.name};\n`;
          });
          code += `  }\n\n`;
          
          // Generate a sample method
          code += `  /**\n   * Sample method\n   * @returns {string} A message\n   */\n`;
          code += `  getMessage() {\n`;
          code += `    return 'Hello from ${name}';\n`;
          code += `  }\n`;
          code += `}\n\n`;
          code += `module.exports = ${name};\n`;
        } else if (type === 'module') {
          // Generate module
          code += `/**\n * ${description}\n * @module ${name}\n */\n\n`;
          
          // Generate a sample function
          code += `/**\n * Sample function\n * @returns {string} A message\n */\n`;
          code += `function getMessage() {\n`;
          code += `  return 'Hello from ${name} module';\n`;
          code += `}\n\n`;
          
          // Export module functions
          code += `module.exports = {\n`;
          code += `  getMessage\n`;
          code += `};\n`;
        }
      } else if (language === 'typescript') {
        if (type === 'function') {
          // Generate TSDoc comment
          code += `/**\n * ${description}\n`;
          parameters.forEach(param => {
            code += ` * @param ${param.name} ${param.description || ''}\n`;
          });
          code += ` * @returns The result\n */\n`;
          
          // Generate function with types
          code += `function ${name}(${parameters.map(p => `${p.name}: ${p.type}`).join(', ')}): any {\n`;
          code += `  // TODO: Implement ${description}\n`;
          code += `  console.log('Function ${name} called');\n`;
          parameters.forEach(param => {
            code += `  console.log('Parameter ${param.name}:', ${param.name});\n`;
          });
          code += `  \n  // Return a placeholder value\n`;
          code += `  return null;\n`;
          code += `}\n\n`;
          code += `export default ${name};\n`;
        } else if (type === 'class') {
          // Generate TSDoc comment
          code += `/**\n * ${description}\n */\n`;
          code += `class ${name} {\n`;
          
          // Generate class properties
          parameters.forEach(param => {
            code += `  private ${param.name}: ${param.type};\n`;
          });
          code += `\n`;
          
          // Generate constructor
          code += `  /**\n   * Create a new ${name} instance\n`;
          parameters.forEach(param => {
            code += `   * @param ${param.name} ${param.description || ''}\n`;
          });
          code += `   */\n`;
          code += `  constructor(${parameters.map(p => `${p.name}: ${p.type}`).join(', ')}) {\n`;
          parameters.forEach(param => {
            code += `    this.${param.name} = ${param.name};\n`;
          });
          code += `  }\n\n`;
          
          // Generate a sample method
          code += `  /**\n   * Sample method\n   * @returns A message\n   */\n`;
          code += `  getMessage(): string {\n`;
          code += `    return 'Hello from ${name}';\n`;
          code += `  }\n`;
          code += `}\n\n`;
          code += `export default ${name};\n`;
        } else if (type === 'module') {
          // Generate module
          code += `/**\n * ${description}\n * @module ${name}\n */\n\n`;
          
          // Generate a sample interface
          code += `/**\n * Sample interface\n */\n`;
          code += `export interface ${name}Data {\n`;
          code += `  id: string;\n`;
          code += `  name: string;\n`;
          code += `  value: number;\n`;
          code += `}\n\n`;
          
          // Generate a sample function
          code += `/**\n * Sample function\n * @returns A message\n */\n`;
          code += `export function getMessage(): string {\n`;
          code += `  return 'Hello from ${name} module';\n`;
          code += `}\n\n`;
          
          // Generate a default export
          code += `export default {\n`;
          code += `  getMessage\n`;
          code += `};\n`;
        }
      } else if (language === 'python') {
        if (type === 'function') {
          // Generate docstring
          code += `def ${name}(${parameters.map(p => p.name).join(', ')}):\n`;
          code += `    \"\"\"\n    ${description}\n\n`;
          parameters.forEach(param => {
            code += `    Args:\n        ${param.name}: ${param.description || param.type}\n`;
          });
          code += `\n    Returns:\n        The result\n    \"\"\"\n`;
          code += `    # TODO: Implement ${description}\n`;
          code += `    print(f"Function ${name} called")\n`;
          parameters.forEach(param => {
            code += `    print(f"Parameter ${param.name}: {${param.name}}")\n`;
          });
          code += `    \n    # Return a placeholder value\n`;
          code += `    return None\n`;
        } else if (type === 'class') {
          // Generate class with docstring
          code += `class ${name}:\n`;
          code += `    \"\"\"\n    ${description}\n    \"\"\"\n\n`;
          
          // Generate constructor
          code += `    def __init__(self, ${parameters.map(p => p.name).join(', ')}):\n`;
          code += `        \"\"\"\n        Create a new ${name} instance\n\n`;
          parameters.forEach(param => {
            code += `        Args:\n            ${param.name}: ${param.description || param.type}\n`;
          });
          code += `        \"\"\"\n`;
          parameters.forEach(param => {
            code += `        self.${param.name} = ${param.name}\n`;
          });
          code += `\n`;
          
          // Generate a sample method
          code += `    def get_message(self):\n`;
          code += `        \"\"\"\n        Sample method\n\n`;
          code += `        Returns:\n            str: A message\n        \"\"\"\n`;
          code += `        return f"Hello from {name}"\n`;
        } else if (type === 'module') {
          // Generate module docstring
          code += `\"\"\"\n${description}\n\"\"\"\n\n`;
          
          // Import some common modules
          code += `import os\n`;
          code += `import sys\n`;
          code += `from typing import Dict, List, Optional\n\n`;
          
          // Generate a sample function
          code += `def get_message() -> str:\n`;
          code += `    \"\"\"\n    Sample function\n\n`;
          code += `    Returns:\n        str: A message\n    \"\"\"\n`;
          code += `    return f"Hello from ${name} module"\n\n`;
          
          // Generate a sample class
          code += `class ${name}Helper:\n`;
          code += `    \"\"\"\n    Helper class for the ${name} module\n    \"\"\"\n\n`;
          code += `    def __init__(self, name: str):\n`;
          code += `        \"\"\"\n        Initialize the helper\n\n`;
          code += `        Args:\n            name: The name to use\n        \"\"\"\n`;
          code += `        self.name = name\n\n`;
          code += `    def greet(self) -> str:\n`;
          code += `        \"\"\"\n        Generate a greeting\n\n`;
          code += `        Returns:\n            str: The greeting message\n        \"\"\"\n`;
          code += `        return f"Hello, {self.name}!"\n\n`;
          
          // Add a main block
          code += `if __name__ == "__main__":\n`;
          code += `    print(get_message())\n`;
          code += `    helper = ${name}Helper("World")\n`;
          code += `    print(helper.greet())\n`;
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: `# Generated ${language} ${type}: ${name}\n\n\`\`\`${language}\n${code}\n\`\`\``
          }
        ]
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error generating code: ${error.message}`
          }
        ]
      };
    }
  }
);

// Register a documentation generator tool
server.tool(
  'generateDocumentation',
  'Generate documentation for code',
  {
    code: z.string().describe('Code to document'),
    language: z.string().describe('Programming language of the code'),
    outputFormat: z.enum(['markdown', 'html']).default('markdown').describe('Output format for the documentation')
  },
  async ({ code, language, outputFormat }) => {
    console.error(`Generating documentation for ${language} code (${code.length} characters)`);
    
    try {
      const documentation = await generateDocumentation(code, language);
      
      // Convert to HTML if requested
      if (outputFormat === 'html') {
        // In a real implementation, this would use a proper Markdown to HTML converter
        // For this example, we'll do a simple conversion
        const html = documentation
          .replace(/^# (.*?)$/gm, '<h1>$1</h1>')
          .replace(/^## (.*?)$/gm, '<h2>$1</h2>')
          .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
          .replace(/^- (.*?)$/gm, '<li>$1</li>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>');
        
        return {
          content: [
            {
              type: 'text',
              text: `<!DOCTYPE html>
<html>
<head>
  <title>Code Documentation</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; }
    h2 { color: #444; border-bottom: 1px solid #eee; padding-bottom: 5px; }
    h3 { color: #555; }
    p { line-height: 1.5; }
    li { margin-bottom: 5px; }
  </style>
</head>
<body>
  <p>${html}</p>
</body>
</html>`
            }
          ]
        };
      }
      
      return {
        content: [
          {
            type: 'text',
            text: documentation
          }
        ]
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error generating documentation: ${error.message}`
          }
        ]
      };
    }
  }
);

// Register a project structure analyzer tool
server.tool(
  'analyzeProject',
  'Analyze project structure and provide insights',
  {
    projectPath: z.string().optional().describe('Path to the project directory (defaults to current project)'),
    includePatterns: z.array(z.string()).optional().describe('File patterns to include (e.g., ["*.js", "*.ts"])'),
    excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude (e.g., ["*.test.js"])')
  },
  async ({ projectPath = projectPath, includePatterns = [], excludePatterns = [] }) => {
    console.error(`Analyzing project structure at ${projectPath}`);
    
    try {
      // List all files in the project
      const allFiles = await listFilesRecursively(projectPath);
      
      // Filter files based on patterns
      let filteredFiles = allFiles;
      
      if (includePatterns.length > 0) {
        const patterns = includePatterns.map(p => new RegExp(p.replace(/\*/g, '.*')));
        filteredFiles = filteredFiles.filter(file => 
          patterns.some(pattern => pattern.test(file))
        );
      }
      
      if (excludePatterns.length > 0) {
        const patterns = excludePatterns.map(p => new RegExp(p.replace(/\*/g, '.*')));
        filteredFiles = filteredFiles.filter(file => 
          !patterns.some(pattern => pattern.test(file))
        );
      }
      
      // Group files by directory
      const filesByDirectory = {};
      filteredFiles.forEach(file => {
        const dir = path.dirname(file);
        if (!filesByDirectory[dir]) {
          filesByDirectory[dir] = [];
        }
        filesByDirectory[dir].push(path.basename(file));
      });
      
      // Group files by language
      const filesByLanguage = {};
      filteredFiles.forEach(file => {
        const language = detectLanguage(file);
        if (!filesByLanguage[language]) {
          filesByLanguage[language] = [];
        }
        filesByLanguage[language].push(file);
      });
      
      // Generate project statistics
      const stats = {
        totalFiles: filteredFiles.length,
        totalDirectories: Object.keys(filesByDirectory).length,
        languageBreakdown: Object.entries(filesByLanguage).map(([language, files]) => ({
          language,
          count: files.length,
          percentage: Math.round((files.length / filteredFiles.length) * 100)
        })).sort((a, b) => b.count - a.count)
      };
      
      // Check for common project files
      const hasPackageJson = allFiles.includes('package.json');
      const hasTsConfig = allFiles.includes('tsconfig.json');
      const hasReadme = allFiles.includes('README.md');
      const hasGitIgnore = allFiles.includes('.gitignore');
      const hasTests = allFiles.some(file => file.includes('test') || file.includes('spec'));
      
      // Generate project insights
      const insights = [];
      
      if (!hasReadme) {
        insights.push('No README.md file found. Consider adding documentation for your project.');
      }
      
      if (!hasGitIgnore) {
        insights.push('No .gitignore file found. Consider adding one to exclude unnecessary files from version control.');
      }
      
      if (!hasTests) {
        insights.push('No test files found. Consider adding tests to ensure code quality and prevent regressions.');
      }
      
      if (hasPackageJson && !allFiles.includes('package-lock.json') && !allFiles.includes('yarn.lock')) {
        insights.push('No lock file found (package-lock.json or yarn.lock). Consider committing your lock file for consistent dependencies.');
      }
      
      // Generate the result
      return {
        content: [
          {
            type: 'text',
            text: `# Project Structure Analysis

## Project Overview
- Total Files: ${stats.totalFiles}
- Total Directories: ${stats.totalDirectories}
- Project Path: ${projectPath}

## Language Breakdown
${stats.languageBreakdown.map(lang => `- ${lang.language}: ${lang.count} files (${lang.percentage}%)`).join('\n')}

## Directory Structure
${Object.entries(filesByDirectory)
  .map(([dir, files]) => `- ${dir}/: ${files.length} files`)
  .join('\n')}

## Project Insights
${insights.length > 0 ? insights.map(insight => `- ${insight}`).join('\n') : '- No specific insights available'}
`
          }
        ]
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error analyzing project: ${error.message}`
          }
        ]
      };
    }
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Code Assistant Server running...');
