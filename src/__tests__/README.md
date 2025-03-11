# MCP Transport Bridge Tests

This directory contains test files for the MCP Transport Bridge application.

## Files

- `app.test.ts` - Tests for the main application functionality

## Purpose

The tests in this directory verify the correct behavior of the MCP Transport Bridge components and ensure that the application works as expected. They help catch regressions, validate new features, and document expected behavior.

## Testing Approach

The MCP Transport Bridge uses Jest as its testing framework. Tests are written using TypeScript and follow these principles:

- Unit tests for individual components
- Integration tests for component interactions
- End-to-end tests for complete workflows
- Mocking of external dependencies when appropriate

## Running Tests

Tests can be run using the npm test script defined in the project's package.json:

```bash
npm test
```

For more specific test runs, you can use Jest's filtering capabilities:

```bash
# Run tests with a specific name pattern
npm test -- -t "specific test name"

# Run tests in a specific file
npm test -- app.test.ts
```

## Writing Tests

When adding new features or fixing bugs, corresponding tests should be added or updated. Tests should:

1. Be clear and descriptive
2. Test both success and failure cases
3. Mock external dependencies appropriately
4. Be independent and not rely on the state from other tests
5. Clean up any resources they create
