/**
 * Logger Module Tests
 * Tests for structured logging with function-specific formatting
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { Logger } from './logger.js';

describe('Logger', () => {
  let logger;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    logger = new Logger('info');
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Unit Tests', () => {
    it('should log verbose build step with all details', () => {
      logger.setVerbose(true);
      logger.logVerboseBuildStep('TestFunc', 'Compiling', {
        file: 'test.js',
        command: 'esbuild',
        duration: 100
      });
      
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[TestFunc]');
      expect(output).toContain('STEP');
      expect(output).toContain('Compiling');
      expect(output).toContain('test.js');
      expect(output).toContain('esbuild');
      expect(output).toContain('100ms');
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Feature: lambda-hot-reload-improvements, Property 19: Log line function identification
     * Validates: Requirements 7.1
     * 
     * For any log output during multi-function builds, each log line should be 
     * prefixed with the appropriate function name
     */
    it('should prefix all log lines with function name when provided', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 200 }),
          fc.constantFrom('info', 'warn', 'error', 'debug'),
          (functionName, message, level) => {
            // Reset spies
            consoleLogSpy.mockClear();
            consoleErrorSpy.mockClear();
            
            // Set log level to debug to ensure all messages are logged
            logger.setLogLevel('debug');
            
            // Log with function context
            logger.logBuild(functionName, message, level);
            
            // Get the logged output
            const output = level === 'error' 
              ? consoleErrorSpy.mock.calls[0]?.[0]
              : consoleLogSpy.mock.calls[0]?.[0];
            
            // Verify the output contains the function name in brackets
            const expectedPrefix = `[${functionName}]`;
            return output && output.includes(expectedPrefix);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: lambda-hot-reload-improvements, Property 22: Error message function association
     * Validates: Requirements 7.4
     * 
     * For any build error, error messages should be clearly associated with 
     * the specific function that failed
     */
    it('should associate error messages with specific function names', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.oneof(
            fc.string({ minLength: 1, maxLength: 200 }),
            fc.constant(new Error('Test error'))
          ),
          (functionName, error) => {
            // Reset spies
            consoleLogSpy.mockClear();
            consoleErrorSpy.mockClear();
            
            // Add error event listener to prevent unhandled error
            const errorListener = vi.fn();
            logger.once('error', errorListener);
            
            // Log error with function context
            logger.logError(functionName, error);
            
            // Get the logged output
            const output = consoleErrorSpy.mock.calls[0]?.[0];
            
            // Verify the output contains both the function name and error
            const expectedPrefix = `[${functionName}]`;
            const errorMessage = error instanceof Error ? error.message : error;
            
            return output && 
                   output.includes(expectedPrefix) && 
                   output.includes('ERROR') &&
                   output.includes(errorMessage);
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * Feature: lambda-hot-reload-improvements, Property 23: Verbose logging detail provision
     * Validates: Requirements 7.5
     * 
     * For any verbose logging mode activation, detailed build steps and 
     * file processing information should be provided
     */
    it('should provide detailed information when verbose mode is enabled', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 1),
          fc.record({
            file: fc.option(fc.string({ minLength: 5, maxLength: 100 })),
            command: fc.option(fc.string({ minLength: 3, maxLength: 100 })),
            duration: fc.option(fc.integer({ min: 1, max: 10000 }))
          }),
          (functionName, step, details) => {
            // Reset spies
            consoleLogSpy.mockClear();
            consoleErrorSpy.mockClear();
            
            // Enable verbose mode
            logger.setVerbose(true);
            
            // Log verbose build step
            logger.logVerboseBuildStep(functionName, step, details);
            
            // Get the logged output
            const output = consoleLogSpy.mock.calls[0]?.[0];
            
            if (!output) return false;
            
            // Verify the output contains function name, step, and STEP indicator
            const expectedPrefix = `[${functionName}]`;
            const hasBasicInfo = output.includes(expectedPrefix) && 
                                 output.includes('STEP:') &&
                                 output.includes(step);
            
            if (!hasBasicInfo) return false;
            
            // Verify details are included when provided
            if (details.file && !output.includes(details.file)) {
              return false;
            }
            if (details.command && !output.includes(details.command)) {
              return false;
            }
            if (typeof details.duration === 'number' && !output.includes('Duration:')) {
              return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not log verbose information when verbose mode is disabled', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1, maxLength: 100 }),
          (functionName, step) => {
            // Reset spies
            consoleLogSpy.mockClear();
            consoleErrorSpy.mockClear();
            
            // Disable verbose mode
            logger.setVerbose(false);
            
            // Try to log verbose build step
            logger.logVerboseBuildStep(functionName, step);
            
            // Verify nothing was logged
            return consoleLogSpy.mock.calls.length === 0;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
