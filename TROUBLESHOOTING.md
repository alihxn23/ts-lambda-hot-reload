# Troubleshooting Guide

This guide covers common issues you might encounter when using the Lambda Hot-Reload Tool and their solutions.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Template Parsing Errors](#template-parsing-errors)
- [Build Failures](#build-failures)
- [File Watching Issues](#file-watching-issues)
- [Performance Problems](#performance-problems)
- [Configuration Issues](#configuration-issues)
- [Runtime Errors](#runtime-errors)

## Installation Issues

### npm install fails with permission errors

**Problem**: Getting EACCES or permission denied errors during installation

**Solution**:
```bash
# Option 1: Use npx without installation
npx @alihxn/ts-lambda-hot-reload

# Option 2: Fix npm permissions (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.profile
source ~/.profile

# Option 3: Use sudo (not recommended)
sudo npm install -g @alihxn/ts-lambda-hot-reload
```

### Command not found after global installation

**Problem**: `ts-lambda-hot-reload` command not found after installation

**Solution**:
```bash
# Check if npm global bin is in PATH
npm config get prefix

# Add to PATH if needed
export PATH="$(npm config get prefix)/bin:$PATH"

# Or use npx
npx @alihxn/ts-lambda-hot-reload
```

## Template Parsing Errors

### "Failed to parse template" error

**Problem**: Tool cannot parse your SAM template file

**Diagnosis**:
```bash
# Validate your template
sam validate

# Check YAML syntax
cat template.yaml | python -c 'import yaml, sys; yaml.safe_load(sys.stdin)'
```

**Common Causes**:
1. Invalid YAML syntax (tabs instead of spaces, incorrect indentation)
2. Template file not found
3. Unsupported template format

**Solutions**:
```yaml
# Ensure proper YAML formatting
# Use spaces, not tabs
# Check indentation is consistent

# Verify template path in config
{
  "templatePath": "./template.yaml"  // Correct path
}
```

### "No valid Lambda functions found" error

**Problem**: Tool finds no functions with valid build metadata

**Solution**: Add required metadata to your functions:

```yaml
Resources:
  MyFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: my-function/
      Handler: app.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: esbuild  # Required!
      BuildProperties:
        Target: es2020
```

**Required Metadata**:
- `BuildMethod`: Must be either `esbuild` or `makefile`
- `Handler`: Function handler path
- `Runtime`: Node.js runtime version

### "Unsupported build method" error

**Problem**: BuildMethod is not recognized

**Solution**: Use only supported build methods:
```yaml
Metadata:
  BuildMethod: esbuild  # Supported
  # OR
  BuildMethod: makefile  # Supported
  # NOT: webpack, custom, etc.
```

## Build Failures

### esbuild: "Cannot find module" error

**Problem**: esbuild cannot find dependencies

**Solutions**:
```bash
# 1. Install all dependencies
npm install

# 2. Check package.json includes the missing module
npm install <missing-module> --save

# 3. Verify node_modules exists
ls -la node_modules/

# 4. Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### esbuild: "Syntax error" or "Unexpected token"

**Problem**: TypeScript/JavaScript syntax errors

**Solutions**:
```bash
# 1. Check for syntax errors
npx tsc --noEmit  # For TypeScript projects

# 2. Verify esbuild target matches your code
# In template.yaml:
Metadata:
  BuildProperties:
    Target: es2020  # Use appropriate target for your code

# 3. Check for unsupported syntax
# Ensure you're not using features not supported by your target
```

### makefile: "make: command not found"

**Problem**: make is not installed

**Solutions**:
```bash
# macOS
xcode-select --install

# Linux (Ubuntu/Debian)
sudo apt-get install build-essential

# Linux (CentOS/RHEL)
sudo yum groupinstall "Development Tools"
```

### makefile: "No rule to make target 'build'"

**Problem**: Makefile doesn't have a build target

**Solution**: Add a build target to your Makefile:
```makefile
build:
	npm install
	npm run build
	cp -r dist/* $(ARTIFACTS_DIR)/
```

### Build fails with "ENOSPC: System limit for number of file watchers reached"

**Problem**: Linux system has too many file watchers

**Solution**:
```bash
# Increase the limit
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# Or temporarily
sudo sysctl fs.inotify.max_user_watches=524288
```

### Permission denied errors during build

**Problem**: Cannot write to build directory

**Solutions**:
```bash
# 1. Check permissions
ls -la .aws-sam/build

# 2. Fix permissions
chmod -R 755 .aws-sam/build

# 3. Remove and recreate
rm -rf .aws-sam/build
mkdir -p .aws-sam/build
```

## File Watching Issues

### Changes not triggering rebuilds

**Problem**: Modifying files doesn't trigger a rebuild

**Diagnosis**:
```bash
# Check if files are being ignored
# Look at your configuration
cat lambda-hot-reload.json
```

**Solutions**:

1. **Check ignore patterns**:
```json
{
  "ignorePatterns": [
    "node_modules/**",
    ".git/**",
    // Remove patterns that might be blocking your files
  ]
}
```

2. **Verify file extensions are watched**:
```json
{
  "extensions": ["js", "ts", "json"]  // Add your file extensions
}
```

3. **Check debounce delay**:
```json
{
  "debounceDelay": 300  // Increase if changes are too rapid
}
```

4. **Restart the tool**:
```bash
# Use the restart command
rs
# Or quit and restart
q
npx @alihxn/ts-lambda-hot-reload
```

### Too many rebuilds triggered

**Problem**: Small changes trigger multiple rebuilds

**Solutions**:

1. **Increase debounce delay**:
```json
{
  "debounceDelay": 500  // Wait longer before rebuilding
}
```

2. **Add more ignore patterns**:
```json
{
  "ignorePatterns": [
    "**/*.log",
    "**/*.tmp",
    "**/coverage/**",
    "**/.DS_Store"
  ]
}
```

3. **Disable parallel builds temporarily**:
```json
{
  "parallelBuilds": false
}
```

### File watcher crashes or stops working

**Problem**: File watcher stops responding

**Solutions**:

1. **Use manual restart**:
```bash
# Type in the running tool
rs
```

2. **Check system resources**:
```bash
# Check available memory
free -h  # Linux
vm_stat  # macOS

# Check CPU usage
top
```

3. **Reduce watched functions**:
- Select fewer functions to watch
- This reduces the number of files being monitored

## Performance Problems

### Builds are very slow

**Problem**: Build process takes too long

**Solutions**:

1. **Enable parallel builds** (if not already):
```json
{
  "parallelBuilds": true
}
```

2. **Optimize esbuild configuration**:
```yaml
Metadata:
  BuildProperties:
    Minify: false      # Disable in development
    Sourcemap: false   # Disable if not needed
    Target: es2020     # Use newer target
```

3. **Use incremental builds**:
- The tool automatically does this
- Ensure you're not forcing full rebuilds

4. **Reduce number of watched functions**:
- Only watch functions you're actively developing

5. **Check for large dependencies**:
```bash
# Analyze bundle size
npx esbuild src/app.ts --bundle --analyze
```

### High memory usage

**Problem**: Tool consumes too much memory

**Solutions**:

1. **Reduce parallel builds**:
```json
{
  "parallelBuilds": false
}
```

2. **Watch fewer functions**:
- Select only the functions you need

3. **Increase Node.js memory limit**:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npx @alihxn/ts-lambda-hot-reload
```

4. **Clear build cache**:
```bash
rm -rf .aws-sam/build
```

### CPU usage is very high

**Problem**: Tool uses excessive CPU

**Solutions**:

1. **Increase debounce delay**:
```json
{
  "debounceDelay": 1000  // Reduce rebuild frequency
}
```

2. **Add more ignore patterns**:
```json
{
  "ignorePatterns": [
    "node_modules/**",
    "**/*.log",
    "**/coverage/**"
  ]
}
```

3. **Disable verbose logging**:
```json
{
  "logLevel": "info"  // Not "debug"
}
```

## Configuration Issues

### Configuration file not found

**Problem**: Tool doesn't load your configuration

**Solutions**:

1. **Verify file location**:
```bash
ls -la lambda-hot-reload.json
```

2. **Specify config path explicitly**:
```bash
npx @alihxn/ts-lambda-hot-reload --config ./path/to/config.json
```

3. **Check file format**:
```bash
# Validate JSON
cat lambda-hot-reload.json | python -m json.tool

# Validate YAML
cat lambda-hot-reload.yaml | python -c 'import yaml, sys; yaml.safe_load(sys.stdin)'
```

### Invalid configuration errors

**Problem**: Configuration validation fails

**Common Issues**:

1. **Invalid log level**:
```json
{
  "logLevel": "info"  // Must be: debug, info, warn, or error
}
```

2. **Invalid debounce delay**:
```json
{
  "debounceDelay": 300  // Must be a positive number
}
```

3. **Invalid array values**:
```json
{
  "ignorePatterns": ["**/*.log"],  // Must be an array
  "defaultFunctions": ["MyFunction"]  // Must be an array
}
```

### Configuration changes not taking effect

**Problem**: Updating config doesn't change behavior

**Solutions**:

1. **Restart the tool**:
```bash
# Quit and restart
q
npx @alihxn/ts-lambda-hot-reload
```

2. **Verify config file is being loaded**:
- Check the startup logs for "Configuration loaded from..."

3. **Clear any cached settings**:
```bash
rm -rf node_modules/.cache
```

## Runtime Errors

### "EADDRINUSE" error

**Problem**: Port already in use

**Solution**:
```bash
# Find and kill the process using the port
lsof -ti:3000 | xargs kill -9

# Or use a different port in your SAM template
```

### "Module not found" at runtime

**Problem**: Built Lambda function missing dependencies

**Solutions**:

1. **Check build output**:
```bash
ls -la .aws-sam/build/YourFunction/
```

2. **Verify esbuild is bundling dependencies**:
```yaml
Metadata:
  BuildProperties:
    # Don't externalize required dependencies
```

3. **Check for native dependencies**:
```bash
# Some dependencies need to be installed in the build environment
npm install --platform=linux --arch=x64
```

### Process crashes with "Out of memory"

**Problem**: Node.js runs out of memory

**Solutions**:

1. **Increase memory limit**:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npx @alihxn/ts-lambda-hot-reload
```

2. **Reduce parallel builds**:
```json
{
  "parallelBuilds": false
}
```

3. **Watch fewer functions**

### "EPERM" or "EBUSY" errors on Windows

**Problem**: File system permission errors on Windows

**Solutions**:

1. **Run as Administrator**:
- Right-click Command Prompt
- Select "Run as Administrator"

2. **Disable antivirus temporarily**:
- Some antivirus software blocks file operations

3. **Close other programs**:
- Ensure no other programs have files open

4. **Use WSL (Windows Subsystem for Linux)**:
```bash
wsl
cd /mnt/c/your/project
npx @alihxn/ts-lambda-hot-reload
```

## Getting More Help

If you're still experiencing issues:

1. **Enable debug logging**:
```json
{
  "logLevel": "debug"
}
```

2. **Check the GitHub issues**:
https://github.com/alihxn23/ts-lambda-hot-reload/issues

3. **Create a new issue** with:
- Your configuration file
- Template.yaml (relevant parts)
- Error messages and logs
- Node.js and npm versions
- Operating system

4. **Provide reproduction steps**:
```bash
# Include commands that reproduce the issue
npm --version
node --version
cat lambda-hot-reload.json
cat template.yaml
npx @alihxn/ts-lambda-hot-reload
```

## Common Error Messages Reference

| Error Message | Likely Cause | Quick Fix |
|--------------|--------------|-----------|
| "Cannot find module" | Missing dependency | `npm install` |
| "ENOENT: no such file" | File path incorrect | Check paths in template |
| "EACCES: permission denied" | Permission issue | `chmod 755` or run as admin |
| "Invalid log level" | Config validation | Use: debug, info, warn, error |
| "No valid Lambda functions" | Missing Metadata | Add BuildMethod to functions |
| "esbuild failed" | Build error | Check source code syntax |
| "Template parse error" | Invalid YAML | Run `sam validate` |
| "ENOSPC: no space" | File watcher limit | Increase fs.inotify.max_user_watches |
| "Port already in use" | Port conflict | Kill process or change port |
| "Out of memory" | Memory limit | Increase NODE_OPTIONS memory |
