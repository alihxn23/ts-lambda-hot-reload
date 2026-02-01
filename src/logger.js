/**
 * Logger Module
 * Provides structured logging with function-specific formatting for multi-function builds
 * 
 * @module Logger
 * @extends EventEmitter
 * @fires Logger#logLevelChanged
 * @fires Logger#verboseModeChanged
 * @fires Logger#buildLog
 * @fires Logger#buildStarted
 * @fires Logger#buildCompleted
 * @fires Logger#error
 * @fires Logger#buildError
 * @fires Logger#info
 * @fires Logger#debug
 * @fires Logger#warn
 * @fires Logger#verboseBuildStep
 * @fires Logger#verboseFileProcessing
 * @fires Logger#verboseBuildConfig
 */
import { EventEmitter } from 'events';

/**
 * Logger class for structured logging with function-specific formatting
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const logger = new Logger('info', false);
 * 
 * logger.on('buildStarted', ({ functionName }) => {
 *   console.log(`Build started for ${functionName}`);
 * });
 * 
 * logger.logBuildStart('HelloWorldFunction');
 * logger.logInfo('Build process initiated');
 */
export class Logger extends EventEmitter {
  /**
   * Create a Logger instance
   * 
   * @param {string} [logLevel='info'] - Initial log level (debug, info, warn, error)
   * @param {boolean} [verbose=false] - Enable verbose logging mode
   * @example
   * const logger = new Logger('debug', true);
   */
  constructor(logLevel = 'info', verbose = false) {
    super();
    this.logLevel = logLevel;
    this.verbose = verbose;
    this.logLevels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  /**
   * Set the logging level
   * Controls which log messages are output based on severity
   * 
   * @param {string} level - Log level: 'debug', 'info', 'warn', or 'error'
   * @throws {Error} If invalid log level provided
   * @fires Logger#logLevelChanged
   * @example
   * logger.setLogLevel('debug'); // Show all messages
   * logger.setLogLevel('error'); // Show only errors
   */
  setLogLevel(level) {
    if (!this.logLevels.hasOwnProperty(level)) {
      throw new Error(`Invalid log level: ${level}`);
    }
    this.logLevel = level;
    this.emit('logLevelChanged', { level });
  }

  /**
   * Set verbose mode for detailed build information
   * 
   * @param {boolean} verbose - Enable (true) or disable (false) verbose logging
   * @fires Logger#verboseModeChanged
   * @example
   * logger.setVerbose(true); // Enable detailed logging
   */
  setVerbose(verbose) {
    this.verbose = verbose;
    this.emit('verboseModeChanged', { verbose });
  }

  /**
   * Check if verbose mode is enabled
   * @returns {boolean} True if verbose mode is enabled
   */
  isVerbose() {
    return this.verbose;
  }

  /**
   * Check if a log level should be output
   * @param {string} level - Log level to check
   * @returns {boolean} True if should log
   */
  _shouldLog(level) {
    return this.logLevels[level] >= this.logLevels[this.logLevel];
  }

  /**
   * Format timestamp for log messages
   * @returns {string} Formatted timestamp
   */
  _getTimestamp() {
    return new Date().toISOString();
  }

  /**
   * Format function name for display
   * @param {string} functionName - Name of the Lambda function
   * @returns {string} Formatted function name
   */
  _formatFunctionName(functionName) {
    return `[${functionName}]`;
  }

  /**
   * Log a build-related message with function context
   * Prefixes messages with function name and timestamp
   * 
   * @param {string} functionName - Name of the Lambda function
   * @param {string} message - Log message content
   * @param {string} [level='info'] - Log level for this message
   * @fires Logger#buildLog
   * @example
   * logger.logBuild('HelloWorldFunction', 'Compiling TypeScript...', 'info');
   * logger.logBuild('ApiFunction', 'Build step completed', 'debug');
   */
  logBuild(functionName, message, level = 'info') {
    if (!this._shouldLog(level)) return;

    const timestamp = this._getTimestamp();
    const funcPrefix = this._formatFunctionName(functionName);
    const formattedMessage = `${timestamp} ${funcPrefix} ${message}`;
    
    this._output(level, formattedMessage);
    this.emit('buildLog', { functionName, message, level, timestamp });
  }

  /**
   * Log build start header with visual formatting
   * Displays a prominent header when a function build begins
   * 
   * @param {string} functionName - Name of the Lambda function
   * @fires Logger#buildStarted
   * @example
   * logger.logBuildStart('HelloWorldFunction');
   * // Output:
   * // ==================================================
   * // Building HelloWorldFunction
   * // Started at: 2024-01-31T10:30:45.123Z
   * // ==================================================
   */
  logBuildStart(functionName) {
    const header = `\n${'='.repeat(50)}`;
    const title = `Building ${functionName}`;
    const timestamp = this._getTimestamp();
    
    this._output('info', `${header}\n${title}\nStarted at: ${timestamp}\n${'='.repeat(50)}`);
    this.emit('buildStarted', { functionName, timestamp });
  }

  /**
   * Log build completion with timing information and status
   * 
   * @param {string} functionName - Name of the Lambda function
   * @param {boolean} success - Whether the build was successful
   * @param {number} duration - Build duration in milliseconds
   * @fires Logger#buildCompleted
   * @example
   * logger.logBuildComplete('HelloWorldFunction', true, 1234);
   * // Output: Build SUCCESS for HelloWorldFunction (1234ms)
   */
  logBuildComplete(functionName, success, duration) {
    const timestamp = this._getTimestamp();
    const status = success ? 'SUCCESS' : 'FAILED';
    const durationText = `${duration}ms`;
    
    const message = `Build ${status} for ${functionName} (${durationText})`;
    const level = success ? 'info' : 'error';
    
    this._output(level, `${timestamp} ${message}`);
    this.emit('buildCompleted', { functionName, success, duration, timestamp });
  }

  /**
   * Log an error with optional function context
   * Includes stack traces in debug mode
   * 
   * @param {string|null} functionName - Name of the Lambda function (optional)
   * @param {string|Error} error - Error message or Error object
   * @param {Object} [context={}] - Additional context information
   * @param {string} [context.buildStep] - Build step where error occurred
   * @param {string} [context.file] - File related to the error
   * @param {string} [context.suggestion] - Troubleshooting suggestion
   * @fires Logger#error
   * @example
   * logger.logError('HelloWorldFunction', new Error('Build failed'));
   * logger.logError(null, 'Configuration error');
   * logger.logError('ApiFunction', 'Compilation failed', {
   *   buildStep: 'TypeScript compilation',
   *   file: 'src/handler.ts',
   *   suggestion: 'Check for syntax errors'
   * });
   */
  logError(functionName, error, context = {}) {
    const timestamp = this._getTimestamp();
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : null;
    
    let formattedMessage;
    if (functionName) {
      const funcPrefix = this._formatFunctionName(functionName);
      formattedMessage = `${timestamp} ${funcPrefix} ERROR: ${errorMessage}`;
      
      // Add context information if provided
      if (context.buildStep) {
        formattedMessage += `\n  Build Step: ${context.buildStep}`;
      }
      if (context.file) {
        formattedMessage += `\n  File: ${context.file}`;
      }
      if (context.suggestion) {
        formattedMessage += `\n  Suggestion: ${context.suggestion}`;
      }
      
      // Add stack trace in debug mode
      if (stack && this.logLevel === 'debug') {
        formattedMessage += `\n  Stack: ${stack}`;
      }
    } else {
      formattedMessage = `${timestamp} ERROR: ${errorMessage}`;
    }
    
    this._output('error', formattedMessage);
    this.emit('error', { functionName, error: errorMessage, context, timestamp });
  }

  /**
   * Log a build error with detailed context and troubleshooting information
   * @param {string} functionName - Name of the Lambda function
   * @param {string|Error} error - Error message or Error object
   * @param {Object} buildContext - Build-specific context
   */
  logBuildError(functionName, error, buildContext = {}) {
    const context = {
      buildStep: buildContext.step || 'Build execution',
      file: buildContext.file,
      suggestion: this._getBuildErrorSuggestion(error, buildContext)
    };
    
    this.logError(functionName, error, context);
    this.emit('buildError', { functionName, error, buildContext });
  }

  /**
   * Generate troubleshooting suggestions based on error type
   * @param {string|Error} error - Error message or Error object
   * @param {Object} buildContext - Build context
   * @returns {string} Suggestion text
   */
  _getBuildErrorSuggestion(error, buildContext) {
    const errorMessage = error instanceof Error ? error.message : error;
    const lowerError = errorMessage.toLowerCase();
    
    if (lowerError.includes('enoent') || lowerError.includes('no such file')) {
      return 'Check that the file path is correct and the file exists';
    }
    if (lowerError.includes('eacces') || lowerError.includes('permission denied')) {
      return 'Check file permissions and ensure you have access to the directory';
    }
    if (lowerError.includes('esbuild')) {
      return 'Verify esbuild is installed and the build configuration is correct';
    }
    if (lowerError.includes('syntax error') || lowerError.includes('unexpected token')) {
      return 'Check for syntax errors in your source code';
    }
    if (lowerError.includes('cannot find module') || lowerError.includes('module not found')) {
      return 'Ensure all dependencies are installed (run npm install)';
    }
    if (lowerError.includes('timeout')) {
      return 'Build process timed out - consider optimizing build configuration';
    }
    
    return 'Check the error message above for details';
  }

  /**
   * Log an info message with optional function context
   * 
   * @param {string} message - Info message content
   * @param {string|null} [functionName=null] - Optional function name for context
   * @fires Logger#info
   * @example
   * logger.logInfo('Starting build process');
   * logger.logInfo('Compilation complete', 'HelloWorldFunction');
   */
  logInfo(message, functionName = null) {
    if (!this._shouldLog('info')) return;

    const timestamp = this._getTimestamp();
    let formattedMessage;
    
    if (functionName) {
      const funcPrefix = this._formatFunctionName(functionName);
      formattedMessage = `${timestamp} ${funcPrefix} ${message}`;
    } else {
      formattedMessage = `${timestamp} ${message}`;
    }
    
    this._output('info', formattedMessage);
    this.emit('info', { message, functionName, timestamp });
  }

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {string} functionName - Optional function name for context
   */
  logDebug(message, functionName = null) {
    if (!this._shouldLog('debug')) return;

    const timestamp = this._getTimestamp();
    let formattedMessage;
    
    if (functionName) {
      const funcPrefix = this._formatFunctionName(functionName);
      formattedMessage = `${timestamp} ${funcPrefix} DEBUG: ${message}`;
    } else {
      formattedMessage = `${timestamp} DEBUG: ${message}`;
    }
    
    this._output('debug', formattedMessage);
    this.emit('debug', { message, functionName, timestamp });
  }

  /**
   * Log a warning message with optional function context
   * 
   * @param {string} message - Warning message content
   * @param {string|null} [functionName=null] - Optional function name for context
   * @fires Logger#warn
   * @example
   * logger.logWarn('Configuration file not found, using defaults');
   * logger.logWarn('Build took longer than expected', 'SlowFunction');
   */
  logWarn(message, functionName = null) {
    if (!this._shouldLog('warn')) return;

    const timestamp = this._getTimestamp();
    let formattedMessage;
    
    if (functionName) {
      const funcPrefix = this._formatFunctionName(functionName);
      formattedMessage = `${timestamp} ${funcPrefix} WARN: ${message}`;
    } else {
      formattedMessage = `${timestamp} WARN: ${message}`;
    }
    
    this._output('warn', formattedMessage);
    this.emit('warn', { message, functionName, timestamp });
  }

  /**
   * Output message to appropriate stream
   * @param {string} level - Log level
   * @param {string} message - Formatted message
   */
  _output(level, message) {
    if (level === 'error') {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  /**
   * Log verbose build step information
   * @param {string} functionName - Name of the Lambda function
   * @param {string} step - Build step description
   * @param {Object} details - Additional details about the step
   */
  logVerboseBuildStep(functionName, step, details = {}) {
    if (!this.verbose) return;

    const timestamp = this._getTimestamp();
    const funcPrefix = this._formatFunctionName(functionName);
    let message = `${timestamp} ${funcPrefix} STEP: ${step}`;
    
    // Add details if provided
    if (details.file) {
      message += `\n    File: ${details.file}`;
    }
    if (details.command) {
      message += `\n    Command: ${details.command}`;
    }
    if (details.duration) {
      message += `\n    Duration: ${details.duration}ms`;
    }
    if (details.output) {
      message += `\n    Output: ${details.output}`;
    }
    
    this._output('info', message);
    this.emit('verboseBuildStep', { functionName, step, details, timestamp });
  }

  /**
   * Log verbose file processing information
   * @param {string} functionName - Name of the Lambda function
   * @param {string} file - File being processed
   * @param {string} action - Action being performed
   * @param {Object} details - Additional details
   */
  logVerboseFileProcessing(functionName, file, action, details = {}) {
    if (!this.verbose) return;

    const timestamp = this._getTimestamp();
    const funcPrefix = this._formatFunctionName(functionName);
    let message = `${timestamp} ${funcPrefix} FILE: ${action} - ${file}`;
    
    // Add details if provided
    if (details.size) {
      message += `\n    Size: ${details.size} bytes`;
    }
    if (details.dependencies) {
      message += `\n    Dependencies: ${details.dependencies.join(', ')}`;
    }
    if (details.transformations) {
      message += `\n    Transformations: ${details.transformations.join(', ')}`;
    }
    
    this._output('info', message);
    this.emit('verboseFileProcessing', { functionName, file, action, details, timestamp });
  }

  /**
   * Log verbose build configuration
   * @param {string} functionName - Name of the Lambda function
   * @param {Object} config - Build configuration
   */
  logVerboseBuildConfig(functionName, config) {
    if (!this.verbose) return;

    const timestamp = this._getTimestamp();
    const funcPrefix = this._formatFunctionName(functionName);
    let message = `${timestamp} ${funcPrefix} CONFIG:`;
    
    // Format configuration details
    Object.entries(config).forEach(([key, value]) => {
      message += `\n    ${key}: ${JSON.stringify(value)}`;
    });
    
    this._output('info', message);
    this.emit('verboseBuildConfig', { functionName, config, timestamp });
  }
}