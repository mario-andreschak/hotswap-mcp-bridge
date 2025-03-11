#!/usr/bin/env node
/**
 * MCP Prompt Server Example
 * 
 * This example demonstrates how to create an MCP server that provides various prompt templates
 * with different arguments and use cases.
 */
import { McpServer } from '../mcp-protocol/src/server/mcp.js';
import { StdioServerTransport } from '../mcp-protocol/src/server/stdio.js';
import { z } from 'zod';

// Create a server
const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0'
});

// Register a simple greeting prompt
server.prompt(
  'greeting',
  'Generate a greeting message',
  {
    name: z.string().describe('Name of the person to greet'),
    formal: z.boolean().optional().describe('Whether to use formal language')
  },
  async ({ name, formal = false }) => {
    console.error(`Generating greeting for ${name} (formal: ${formal})`);
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Generate a ${formal ? 'formal' : 'casual'} greeting for ${name}.`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: formal 
              ? `Dear ${name},\n\nI hope this message finds you well. It is a pleasure to make your acquaintance.`
              : `Hey ${name}! Great to meet you! How's it going?`
          }
        }
      ]
    };
  }
);

// Register a code review prompt
server.prompt(
  'codeReview',
  'Generate a code review for a given code snippet',
  {
    language: z.enum(['javascript', 'typescript', 'python', 'java', 'csharp', 'go']).describe('Programming language of the code'),
    code: z.string().describe('Code snippet to review'),
    focus: z.enum(['security', 'performance', 'readability', 'all']).optional().describe('Focus area for the review')
  },
  async ({ language, code, focus = 'all' }) => {
    console.error(`Generating code review for ${language} code (focus: ${focus})`);
    
    // Create a prompt that instructs how to review the code
    let reviewInstructions = 'Please review the following code and provide feedback';
    
    switch (focus) {
      case 'security':
        reviewInstructions += ' focusing on security vulnerabilities, input validation, and potential exploits.';
        break;
      case 'performance':
        reviewInstructions += ' focusing on performance optimizations, algorithmic efficiency, and resource usage.';
        break;
      case 'readability':
        reviewInstructions += ' focusing on code clarity, naming conventions, and documentation.';
        break;
      case 'all':
        reviewInstructions += ' covering security, performance, readability, and best practices.';
        break;
    }
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${reviewInstructions}\n\n\`\`\`${language}\n${code}\n\`\`\``
          }
        }
      ]
    };
  }
);

// Register a multi-turn conversation prompt
server.prompt(
  'interview',
  'Simulate a job interview conversation',
  {
    role: z.string().describe('Job role being interviewed for'),
    experience: z.number().describe('Years of experience of the candidate'),
    skills: z.array(z.string()).describe('List of skills the candidate has')
  },
  async ({ role, experience, skills }) => {
    console.error(`Generating interview prompt for ${role} role`);
    
    const skillsList = skills.join(', ');
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are an interviewer for a ${role} position. The candidate has ${experience} years of experience and skills in ${skillsList}. Start the interview with an introduction and your first question.`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `Hello! Thanks for joining us today for this ${role} interview. I see you have ${experience} years of experience and expertise in ${skillsList}. That's impressive!\n\nTo get started, could you tell me about a challenging project you worked on recently and how you approached it?`
          }
        },
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'I recently worked on a distributed system that needed to handle high throughput while maintaining data consistency. I implemented a combination of optimistic concurrency control and a custom caching layer that reduced latency by 40% while ensuring data integrity.'
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `That sounds like a complex challenge! A 40% latency reduction is significant. Could you elaborate on how you designed the caching layer and what specific techniques you used to maintain consistency across the distributed system?`
          }
        }
      ]
    };
  }
);

// Register a prompt that includes a resource
server.prompt(
  'documentAnalysis',
  'Analyze a document based on specific criteria',
  {
    documentUri: z.string().describe('URI of the document to analyze'),
    analysisType: z.enum(['summary', 'sentiment', 'key_points', 'critique']).describe('Type of analysis to perform')
  },
  async ({ documentUri, analysisType }) => {
    console.error(`Generating document analysis prompt for ${documentUri} (type: ${analysisType})`);
    
    // In a real implementation, you would fetch the document content from the URI
    // For this example, we'll simulate it with a placeholder
    const documentContent = "This is a placeholder for the document content that would be fetched from the provided URI.";
    
    let instructions = '';
    switch (analysisType) {
      case 'summary':
        instructions = 'Please provide a concise summary of the following document.';
        break;
      case 'sentiment':
        instructions = 'Please analyze the sentiment of the following document, identifying positive, negative, and neutral elements.';
        break;
      case 'key_points':
        instructions = 'Please extract the key points and main arguments from the following document.';
        break;
      case 'critique':
        instructions = 'Please provide a critical analysis of the following document, evaluating its strengths and weaknesses.';
        break;
    }
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `${instructions}\n\nDocument: ${documentContent}`
          }
        }
      ]
    };
  }
);

// Register a system prompt template
server.prompt(
  'systemPrompt',
  'Generate a system prompt for a specific assistant role',
  {
    role: z.string().describe('Role of the assistant'),
    constraints: z.array(z.string()).optional().describe('List of constraints or rules for the assistant'),
    tone: z.enum(['professional', 'friendly', 'academic', 'technical']).optional().describe('Tone of the assistant')
  },
  async ({ role, constraints = [], tone = 'professional' }) => {
    console.error(`Generating system prompt for ${role} role (tone: ${tone})`);
    
    let toneDescription = '';
    switch (tone) {
      case 'professional':
        toneDescription = 'Use a professional, business-like tone.';
        break;
      case 'friendly':
        toneDescription = 'Use a friendly, conversational tone.';
        break;
      case 'academic':
        toneDescription = 'Use an academic, scholarly tone with precise language.';
        break;
      case 'technical':
        toneDescription = 'Use a technical tone with appropriate terminology.';
        break;
    }
    
    const constraintsText = constraints.length > 0 
      ? `\n\nYou must follow these constraints:\n${constraints.map(c => `- ${c}`).join('\n')}`
      : '';
    
    return {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Create a system prompt for an AI assistant that will act as a ${role}.`
          }
        },
        {
          role: 'assistant',
          content: {
            type: 'text',
            text: `You are an expert ${role}. Your goal is to provide helpful, accurate, and relevant assistance to users. ${toneDescription}${constraintsText}\n\nRespond to user queries with thoughtful and informative answers based on your expertise as a ${role}.`
          }
        }
      ]
    };
  }
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Prompt Server running...');
