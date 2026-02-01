# Contributing to Lambda Hot-Reload Tool

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## Code of Conduct

This project follows a code of conduct to ensure a welcoming environment for all contributors:

- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive feedback
- Respect differing viewpoints and experiences
- Accept responsibility and apologize for mistakes

## Getting Started

### Prerequisites

- Node.js 14.x or higher
- npm 6.x or higher
- Git
- Basic knowledge of JavaScript/Node.js
- Familiarity with AWS Lambda and SAM

### Finding Issues to Work On

1. Check the [Issues](https://github.com/alihxn23/ts-lambda-hot-reload/issues) page
2. Look for issues labeled:
   - `good first issue` - Great for newcomers
   - `help wanted` - We need community help
   - `bug` - Bug fixes needed
   - `enhancement` - New features

3. Comment on the issue to let others know you're working on it

## Development Setup

### 1. Fork and Clone

```bash
# Fork the repository on GitHub, then:
git clone https://github.com/YOUR_USERNAME/ts-lambda-hot-reload.git
cd ts-lambda-hot-reload
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create a Branch

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/my-bugfix
```

### 4. Verify Setup

```bash
# Run tests
npm test

# Run the tool locally
node index.js
```

## Project Structure

```
ts-lambda-hot-reload/
├── src/                          # Source code
│   ├── cli.js                    # Main CLI interface
│   ├── configuration-manager.js  # Configuration handling
│   ├── template-parser.js        # SAM/CDK template parsing
│   ├── build-manager.js          # Build coordination
│   ├── file-watcher.js           # File watching with nodemon
│   ├── command-handler.js        # Interactive commands
│   ├── logger.js                 # Structured logging
│   ├── *.test.js                 # Unit tests
│   └── *.test.js                 # Property-based tests
├── index.js                      # Entry point
├── template.yaml                 # Example SAM template
├── lambda-hot-reload.json        # Example configuration
├── README.md                     # User documentation
├── TROUBLESHOOTING.md            # Troubleshooting guide
├── CONTRIBUTING.md               # This file
└── package.json                  # Project metadata
```

### Key Modules

- **CLI**: Entry point and orchestration
- **ConfigurationManager**: Loads and validates configuration
- **TemplateParser**: Parses SAM/CDK templates
- **BuildManager**: Coordinates parallel builds
- **FileWatcher**: Monitors file changes with debouncing
- **CommandHandler**: Processes interactive user commands
- **Logger**: Provides structured, function-specific logging

## Development Workflow

### 1. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update JSDoc comments for public APIs

### 2. Add Tests

All new features and bug fixes should include tests:

```javascript
// Unit test example
describe('MyFeature', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expected);
  });
});

// Property-based test example
import fc from 'fast-check';

describe('MyFeature Properties', () => {
  it('Property: should maintain invariant', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = myFunction(input);
        return result.length >= 0; // Invariant
      }),
      { numRuns: 100 }
    );
  });
});
```

### 3. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/my-feature.test.js
```

### 4. Update Documentation

- Update README.md if adding user-facing features
- Update TROUBLESHOOTING.md if fixing common issues
- Add JSDoc comments to all public functions
- Update examples if changing APIs

### 5. Test Manually

```bash
# Test with a real SAM project
cd /path/to/sam/project
node /path/to/ts-lambda-hot-reload/index.js

# Test with different configurations
node index.js --config test-config.json
```

## Testing

### Test Types

1. **Unit Tests**: Test individual functions and classes
2. **Property-Based Tests**: Test universal properties across many inputs
3. **Integration Tests**: Test component interactions
4. **Manual Tests**: Test with real SAM projects

### Writing Tests

#### Unit Tests

```javascript
import { describe, it, expect } from 'vitest';
import { MyClass } from './my-class.js';

describe('MyClass', () => {
  it('should initialize with defaults', () => {
    const instance = new MyClass();
    expect(instance.config).toBeDefined();
  });

  it('should handle errors gracefully', () => {
    const instance = new MyClass();
    expect(() => instance.invalidMethod()).toThrow();
  });
});
```

#### Property-Based Tests

```javascript
import fc from 'fast-check';

describe('MyClass Properties', () => {
  it('Property: output length should never exceed input length', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const output = myFunction(input);
        return output.length <= input.length;
      }),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage

- Aim for high test coverage (>80%)
- Focus on critical paths and edge cases
- Test error handling and recovery
- Test with various configurations

### Running Specific Tests

```bash
# Run all tests
npm test

# Run specific file
npm test -- src/build-manager.test.js

# Run tests matching pattern
npm test -- --grep "BuildManager"

# Run with coverage
npm test -- --coverage
```

## Code Style

### JavaScript Style

- Use ES6+ features
- Use `const` and `let`, not `var`
- Use arrow functions for callbacks
- Use template literals for strings
- Use async/await for asynchronous code

### Naming Conventions

```javascript
// Classes: PascalCase
class BuildManager {}

// Functions/Methods: camelCase
function buildFunction() {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Private methods: prefix with _
_internalMethod() {}

// Files: kebab-case
build-manager.js
```

### Code Organization

```javascript
// 1. Imports
import fs from 'fs';
import { EventEmitter } from 'events';

// 2. Constants
const DEFAULT_CONFIG = {};

// 3. Class definition
export class MyClass extends EventEmitter {
  // 4. Constructor
  constructor() {}
  
  // 5. Public methods
  publicMethod() {}
  
  // 6. Private methods
  _privateMethod() {}
}
```

### JSDoc Comments

All public APIs must have comprehensive JSDoc:

```javascript
/**
 * Build a Lambda function with the specified configuration
 * 
 * @param {Object} functionConfig - Lambda function configuration
 * @param {string} functionConfig.Name - Function name
 * @param {Object} functionConfig.Metadata - Build metadata
 * @returns {Promise<Object>} Build result with success status and duration
 * @throws {Error} If build fails
 * @example
 * const result = await buildManager.buildFunction({
 *   Name: 'MyFunction',
 *   Metadata: { BuildMethod: 'esbuild' }
 * });
 */
async buildFunction(functionConfig) {
  // Implementation
}
```

### Error Handling

```javascript
// Use try-catch for async operations
try {
  await riskyOperation();
} catch (error) {
  this.logger.logError('MyFunction', error);
  throw new Error(`Operation failed: ${error.message}`);
}

// Emit events for errors
this.emit('error', { error, context });

// Provide helpful error messages
throw new Error(
  `Build failed for ${functionName}. ` +
  `Check that BuildMethod is set to 'esbuild' or 'makefile'.`
);
```

### Event-Driven Architecture

```javascript
// Emit events for important actions
this.emit('buildStarted', { functionName, timestamp });
this.emit('buildCompleted', { functionName, success, duration });

// Listen to events from other components
this.configManager.on('configLoaded', (data) => {
  this.handleConfigLoaded(data);
});
```

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(build): add support for webpack build method

Add webpack as a third build method alongside esbuild and makefile.
Includes configuration options for webpack-specific settings.

Closes #123

---

fix(watcher): prevent excessive rebuilds on rapid file changes

Increase default debounce delay from 100ms to 300ms to prevent
multiple rebuilds when saving multiple files quickly.

Fixes #456

---

docs(readme): add troubleshooting section for Windows users

Add specific instructions for Windows users experiencing EPERM errors.

---

test(parser): add property tests for template parsing

Add property-based tests to verify template parsing works correctly
across various template structures.
```

### Commit Best Practices

- Keep commits focused and atomic
- Write clear, descriptive commit messages
- Reference issues in commit messages
- Don't commit commented-out code
- Don't commit console.log statements
- Run tests before committing

## Pull Request Process

### Before Submitting

1. **Update your branch**:
```bash
git fetch upstream
git rebase upstream/main
```

2. **Run all tests**:
```bash
npm test
```

3. **Check code style**:
```bash
# Ensure no linting errors
npm run lint  # if available
```

4. **Update documentation**:
- README.md for user-facing changes
- JSDoc comments for API changes
- TROUBLESHOOTING.md for bug fixes

### Submitting a Pull Request

1. **Push your branch**:
```bash
git push origin feature/my-feature
```

2. **Create Pull Request** on GitHub

3. **Fill out the PR template**:
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Property tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows project style
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

### PR Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, maintainers will merge

### After Merge

1. Delete your branch:
```bash
git branch -d feature/my-feature
git push origin --delete feature/my-feature
```

2. Update your fork:
```bash
git checkout main
git pull upstream main
git push origin main
```

## Reporting Bugs

### Before Reporting

1. Check if the bug is already reported
2. Try the latest version
3. Verify it's not a configuration issue

### Bug Report Template

```markdown
**Describe the bug**
Clear description of what the bug is

**To Reproduce**
Steps to reproduce:
1. Run command '...'
2. With configuration '...'
3. See error

**Expected behavior**
What you expected to happen

**Actual behavior**
What actually happened

**Environment**
- OS: [e.g., macOS 12.0]
- Node.js version: [e.g., 18.0.0]
- Tool version: [e.g., 1.1.1]

**Configuration**
```json
{
  "templatePath": "./template.yaml",
  ...
}
```

**Template (relevant parts)**
```yaml
Resources:
  MyFunction:
    ...
```

**Error messages/logs**
```
Paste error messages here
```

**Additional context**
Any other relevant information
```

## Suggesting Features

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
Clear description of the problem

**Describe the solution you'd like**
What you want to happen

**Describe alternatives you've considered**
Other solutions you've thought about

**Additional context**
Any other relevant information

**Would you be willing to implement this?**
Yes/No
```

### Feature Discussion

1. Open an issue with your feature request
2. Discuss with maintainers and community
3. Get approval before starting implementation
4. Follow the development workflow above

## Questions?

- Open an issue with the `question` label
- Check existing issues and documentation
- Be specific about what you need help with

## License

By contributing, you agree that your contributions will be licensed under the ISC License.

## Thank You!

Your contributions make this project better for everyone. Thank you for taking the time to contribute!
