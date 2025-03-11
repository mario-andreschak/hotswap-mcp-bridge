# MCP Transport Bridge Utilities

This directory contains utility functions and helpers used throughout the MCP Transport Bridge.

## Files

- `errors.ts` - Error classes and error handling utilities
- `logging.ts` - Logging infrastructure for consistent logging across the application
- `process.ts` - Utilities for process management and lifecycle

## Purpose

The utilities in this directory provide common functionality that is used by multiple components of the MCP Transport Bridge. They help ensure consistency, reduce code duplication, and simplify error handling and logging.

### Logging

The logging utilities provide a structured logging system with:

- Configurable log levels
- Consistent formatting
- Context-aware logging with prefixes
- Support for different output destinations

### Error Handling

The error utilities include:

- Custom error classes for different error types
- Error wrapping and propagation
- Standardized error formatting
- Utilities for handling async errors

### Process Management

The process utilities provide:

- Process lifecycle management
- Signal handling
- Child process management
- Cleanup and shutdown handling

## Usage

These utilities are imported and used throughout the codebase to provide consistent behavior and reduce duplication. They are designed to be simple, focused, and reusable.
