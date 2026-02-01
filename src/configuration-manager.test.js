/**
 * Property-based tests for Configuration Manager
 * **Feature: lambda-hot-reload-improvements, Property 24: Configuration file format support**
 * **Validates: Requirements 8.1**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import { ConfigurationManager } from './configuration-manager.js';

describe('ConfigurationManager Property Tests', () => {
  let configManager;
  let tempFiles = [];

  beforeEach(() => {
    configManager = new ConfigurationManager();
  });

  afterEach(() => {
    // Clean up temporary files
    tempFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    tempFiles = [];
  });

  /**
   * Property 24: Configuration file format support
   * For any valid JSON or YAML configuration file, the tool should successfully load and apply the configuration
   */
  it('should successfully load and apply any valid configuration file format', () => {
    fc.assert(fc.property(
      fc.record({
        templatePath: fc.string({ minLength: 1, maxLength: 100 }).filter(s => !s.includes('\0')),
        defaultFunctions: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 10 }),
        ignorePatterns: fc.array(fc.string({ minLength: 1, maxLength: 100 }), { maxLength: 10 }),
        logLevel: fc.constantFrom('debug', 'info', 'warn', 'error'),
        parallelBuilds: fc.boolean(),
        debounceDelay: fc.integer({ min: 0, max: 10000 })
      }),
      fc.constantFrom('.json', '.yaml', '.yml'),
      (config, extension) => {
        const tempFile = path.join(process.cwd(), `test-config-${Date.now()}-${Math.random()}${extension}`);
        tempFiles.push(tempFile);

        try {
          // Write configuration file
          let content;
          if (extension === '.json') {
            content = JSON.stringify(config, null, 2);
          } else {
            // For YAML, we'll use a simple format that works with the YAML parser
            content = Object.entries(config).map(([key, value]) => {
              if (Array.isArray(value)) {
                if (value.length === 0) {
                  return `${key}: []`;
                }
                const arrayItems = value.map(item => `  - ${JSON.stringify(item)}`).join('\n');
                return `${key}:\n${arrayItems}`;
              } else {
                return `${key}: ${JSON.stringify(value)}`;
              }
            }).join('\n');
          }
          
          fs.writeFileSync(tempFile, content, 'utf8');

          // Load configuration
          const loadedConfig = configManager.loadConfig(tempFile);

          // Verify configuration was loaded correctly
          expect(loadedConfig.templatePath).toBe(config.templatePath);
          expect(loadedConfig.defaultFunctions).toEqual(config.defaultFunctions);
          expect(loadedConfig.ignorePatterns).toEqual(config.ignorePatterns);
          expect(loadedConfig.logLevel).toBe(config.logLevel);
          expect(loadedConfig.parallelBuilds).toBe(config.parallelBuilds);
          expect(loadedConfig.debounceDelay).toBe(config.debounceDelay);

          return true;
        } catch (error) {
          // If there's an error, it should be due to invalid configuration values
          // not due to file format issues
          console.log('Configuration loading error:', error.message);
          return false;
        }
      }
    ), { numRuns: 100 });
  });

  it('should handle invalid configuration files gracefully and fall back to defaults', () => {
    fc.assert(fc.property(
      fc.constantFrom('.json', '.yaml', '.yml'),
      fc.string({ minLength: 1, maxLength: 100 }),
      (extension, invalidContent) => {
        const tempFile = path.join(process.cwd(), `invalid-config-${Date.now()}-${Math.random()}${extension}`);
        tempFiles.push(tempFile);

        try {
          // Write invalid configuration file
          fs.writeFileSync(tempFile, invalidContent, 'utf8');

          // Load configuration - should fall back to defaults
          const loadedConfig = configManager.loadConfig(tempFile);
          const defaultConfig = configManager._getDefaultConfig();

          // Should have default values
          expect(loadedConfig.templatePath).toBe(defaultConfig.templatePath);
          expect(loadedConfig.logLevel).toBe(defaultConfig.logLevel);
          expect(loadedConfig.parallelBuilds).toBe(defaultConfig.parallelBuilds);
          expect(loadedConfig.debounceDelay).toBe(defaultConfig.debounceDelay);

          return true;
        } catch (error) {
          // Should not throw errors, should handle gracefully
          return false;
        }
      }
    ), { numRuns: 50 });
  });

  it('should validate configuration settings correctly', () => {
    fc.assert(fc.property(
      fc.record({
        logLevel: fc.string({ minLength: 1, maxLength: 20 }),
        parallelBuilds: fc.anything(),
        debounceDelay: fc.anything(),
        ignorePatterns: fc.anything(),
        defaultFunctions: fc.anything()
      }),
      (config) => {
        const validLogLevels = ['debug', 'info', 'warn', 'error'];
        
        configManager.config = { ...configManager._getDefaultConfig(), ...config };
        
        try {
          configManager.validateConfig();
          
          // If validation passes, config should be valid
          expect(validLogLevels).toContain(config.logLevel);
          expect(typeof config.parallelBuilds).toBe('boolean');
          expect(typeof config.debounceDelay).toBe('number');
          expect(config.debounceDelay).toBeGreaterThanOrEqual(0);
          expect(Array.isArray(config.ignorePatterns)).toBe(true);
          expect(Array.isArray(config.defaultFunctions)).toBe(true);
          
          return true;
        } catch (error) {
          // If validation fails, at least one constraint should be violated
          const hasInvalidLogLevel = !validLogLevels.includes(config.logLevel);
          const hasInvalidParallelBuilds = typeof config.parallelBuilds !== 'boolean';
          const hasInvalidDebounceDelay = typeof config.debounceDelay !== 'number' || config.debounceDelay < 0;
          const hasInvalidIgnorePatterns = !Array.isArray(config.ignorePatterns);
          const hasInvalidDefaultFunctions = !Array.isArray(config.defaultFunctions);
          
          expect(
            hasInvalidLogLevel || 
            hasInvalidParallelBuilds || 
            hasInvalidDebounceDelay || 
            hasInvalidIgnorePatterns || 
            hasInvalidDefaultFunctions
          ).toBe(true);
          
          return true;
        }
      }
    ), { numRuns: 100 });
  });
});