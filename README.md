# TS-Lambda-Hot-Reload

A powerful CLI tool for selective hot-reloading of AWS Lambda functions during local development. Build and watch only the functions you're actively working on, avoiding the overhead of rebuilding your entire SAM application.

## Features

- 🔥 **Selective Hot-Reload**: Choose which Lambda functions to watch and rebuild
- ⚡ **Fast Incremental Builds**: Only rebuilds functions with changed source files
- 🔄 **Parallel Processing**: Builds multiple functions simultaneously for faster feedback
- 🎯 **Smart File Watching**: Debounced file changes with intelligent ignore patterns
- 💬 **Interactive Commands**: Manual restart, help, and quit commands during runtime
- 📊 **Enhanced Logging**: Function-specific log formatting for multi-function builds
- ⚙️ **Flexible Configuration**: Persistent settings via JSON or YAML config files
- 🏗️ **Multiple Build Methods**: Supports both esbuild and makefile build processes
- 📦 **Template Support**: Works with SAM and CDK-generated templates

## Installation

### Global Installation

```bash
npm install -g @alihxn/ts-lambda-hot-reload
```

### Local Installation (Project-specific)

```bash
npm install --save-dev @alihxn/ts-lambda-hot-reload
```

### Run Without Installation

```bash
npx @alihxn/ts-lambda-hot-reload
```

## Prerequisites

- Node.js 14.x or higher
- AWS SAM CLI (for local Lambda testing)
- esbuild (if using esbuild build method)
- make (if using makefile build method)

## Quick Start

1. Navigate to your SAM project directory:
```bash
cd my-sam-project
```

2. Run the hot-reload tool:
```bash
npx @alihxn/ts-lambda-hot-reload
```

3. Select the Lambda functions you want to watch from the interactive prompt

4. Start coding! The tool will automatically rebuild your functions when files change

## Usage

### Basic Usage

```bash
ts-lambda-hot-reload
```

This will:
1. Parse your `template.yaml` file
2. Present an interactive list of Lambda functions
3. Start watching selected functions for file changes
4. Rebuild automatically when source files are modified

### With Configuration File

```bash
ts-lambda-hot-reload --config lambda-hot-reload.json
```

### Interactive Commands

While the tool is running, you can use these commands:

- `rs` or `restart` - Manually trigger a complete rebuild of all selected functions
- `help` or `h` - Display available commands
- `quit` or `q` - Gracefully exit the tool

## Configuration

Create a `lambda-hot-reload.json` (or `.yaml`) file in your project root:

```json
{
  "templatePath": "./template.yaml",
  "defaultFunctions": ["HelloWorldFunction", "ApiFunction"],
  "ignorePatterns": [
    "**/*.test.ts",
    "**/test/**",
    "**/__mocks__/**"
  ],
  "buildSettings": {
    "global": {
      "Minify": true,
      "Sourcemap": true
    },
    "HelloWorldFunction": {
      "Target": "es2022"
    }
  },
  "logLevel": "info",
  "parallelBuilds": true,
  "debounceDelay": 300
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `templatePath` | string | `"./template.yaml"` | Path to your SAM template file |
| `defaultFunctions` | array | `[]` | Functions to pre-select in the interactive prompt |
| `ignorePatterns` | array | See below | File patterns to ignore during watching |
| `buildSettings` | object | `{}` | Custom build parameters (global or per-function) |
| `logLevel` | string | `"info"` | Logging level: `debug`, `info`, `warn`, `error` |
| `parallelBuilds` | boolean | `true` | Enable parallel function builds |
| `debounceDelay` | number | `300` | Milliseconds to wait before triggering rebuild |

### Default Ignore Patterns

```javascript
[
  "node_modules/**",
  ".git/**",
  ".aws-sam/**",
  "**/*.test.js",
  "**/*.test.ts",
  "**/test/**",
  "**/tests/**",
  "**/.DS_Store",
  "**/coverage/**"
]
```

## SAM Template Configuration

### Using esbuild

```yaml
Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: hello-world/
      Handler: app.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Target: es2020
        Minify: true
        Sourcemap: true
```

### Using Makefile

```yaml
Resources:
  CustomFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: custom-function/
      Handler: index.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: makefile
```

### Global Function Properties

```yaml
Globals:
  Function:
    Timeout: 30
    MemorySize: 256
    Runtime: nodejs20.x
    Environment:
      Variables:
        NODE_ENV: development

Resources:
  Function1:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: function1/
      Handler: app.handler
    Metadata:
      BuildMethod: esbuild
```

## Example SAM Template

Here's a complete example template:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Example SAM Application

Globals:
  Function:
    Timeout: 30
    Runtime: nodejs20.x

Resources:
  HelloWorldFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: hello-world/
      Handler: app.handler
      Events:
        HelloWorld:
          Type: Api
          Properties:
            Path: /hello
            Method: get
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Target: es2020
        Minify: false
        Sourcemap: true

  DataProcessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: data-processor/
      Handler: index.handler
      MemorySize: 512
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Target: es2022
        Minify: true
```

## Build Output

The tool provides detailed build information:

```
2024-01-31T10:30:45.123Z Starting build for 2 functions (max parallel: 4)
2024-01-31T10:30:45.124Z Build Progress: 0/2 (0%) [░░░░░░░░░░░░░░░░░░░░]

==================================================
Building HelloWorldFunction
Started at: 2024-01-31T10:30:45.125Z
==================================================

2024-01-31T10:30:46.234Z Build SUCCESS for HelloWorldFunction (1109ms)
2024-01-31T10:30:46.235Z Build Progress: 1/2 (50%) [██████████░░░░░░░░░░]

==================================================
Building DataProcessorFunction
Started at: 2024-01-31T10:30:46.236Z
==================================================

2024-01-31T10:30:47.456Z Build SUCCESS for DataProcessorFunction (1220ms)
2024-01-31T10:30:47.457Z Build Progress: 2/2 (100%) [████████████████████]

============================================================
BUILD SUMMARY
============================================================
Total Functions: 2
Successful: 2
Failed: 0
Total Duration: 2329ms
Average Duration: 1165ms
============================================================

Function Build Results:
  HelloWorldFunction: ✅ SUCCESS (1109ms)
  DataProcessorFunction: ✅ SUCCESS (1220ms)
```

## Troubleshooting

### Build Failures

**Problem**: esbuild fails with "Cannot find module"
```
Solution: Ensure all dependencies are installed:
npm install
```

**Problem**: Permission denied errors
```
Solution: Check file permissions:
chmod -R 755 .aws-sam/build
```

**Problem**: Template parsing fails
```
Solution: Validate your template:
sam validate
```

### File Watching Issues

**Problem**: Changes not triggering rebuilds
```
Solution: Check ignore patterns in your configuration
```

**Problem**: Too many rebuilds triggered
```
Solution: Increase debounceDelay in configuration:
{
  "debounceDelay": 500
}
```

### Performance Issues

**Problem**: Builds are slow
```
Solutions:
1. Enable parallel builds (default: true)
2. Use incremental builds (automatic)
3. Optimize esbuild configuration
4. Reduce number of watched functions
```

## Advanced Usage

### Verbose Logging

Enable detailed build information:

```json
{
  "logLevel": "debug"
}
```

### Custom Build Settings Per Function

```json
{
  "buildSettings": {
    "global": {
      "Minify": true
    },
    "PerformanceFunction": {
      "Target": "es2022",
      "Minify": true,
      "Sourcemap": false
    },
    "DebugFunction": {
      "Target": "es2020",
      "Minify": false,
      "Sourcemap": true
    }
  }
}
```

### CDK Template Support

The tool automatically detects and parses CDK-generated templates:

```yaml
Resources:
  MyFunction:
    Type: AWS::Lambda::Function
    Properties:
      Code:
        S3Bucket: my-bucket
        S3Key: my-function.zip
      Handler: index.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: esbuild
```

## Development

### Running Tests

```bash
npm test
```

### Running Tests in Watch Mode

```bash
npm run test:watch
```

### Project Structure

```
ts-lambda-hot-reload/
├── src/
│   ├── cli.js                    # Main CLI interface
│   ├── configuration-manager.js  # Configuration handling
│   ├── template-parser.js        # SAM/CDK template parsing
│   ├── build-manager.js          # Build coordination
│   ├── file-watcher.js           # File watching with nodemon
│   ├── command-handler.js        # Interactive command processing
│   └── logger.js                 # Structured logging
├── index.js                      # Entry point
├── template.yaml                 # Example SAM template
└── lambda-hot-reload.json        # Example configuration
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Write tests for your changes
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Submit a pull request

### Development Setup

```bash
# Clone the repository
git clone https://github.com/alihxn23/ts-lambda-hot-reload.git
cd ts-lambda-hot-reload

# Install dependencies
npm install

# Run tests
npm test

# Run in development mode
node index.js
```

### Code Style

- Use ES6+ features
- Follow existing code formatting
- Add JSDoc comments for public APIs
- Write unit tests for new functionality
- Ensure property-based tests pass

## License

ISC

## Author

Muhammad Ali Hasan

## Repository

https://github.com/alihxn23/ts-lambda-hot-reload

## Issues

Report issues at: https://github.com/alihxn23/ts-lambda-hot-reload/issues

## Changelog

### v1.1.1
- Enhanced file watching with debouncing
- Added interactive command support (restart, help, quit)
- Improved logging with function-specific formatting
- Added configuration file support (JSON/YAML)
- Implemented parallel builds
- Added incremental build logic
- Enhanced template parsing (SAM + CDK support)
- Comprehensive error handling and recovery

### v1.0.0
- Initial release
- Basic hot-reload functionality
- esbuild support
