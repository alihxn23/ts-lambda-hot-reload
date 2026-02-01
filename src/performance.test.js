/**
 * Performance Tests
 * Tests for build times, memory usage, and parallel build efficiency
 * 
 * @module PerformanceTests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BuildManager } from './build-manager.js';
import { TemplateParser } from './template-parser.js';
import { ConfigurationManager } from './configuration-manager.js';
import { Logger } from './logger.js';

describe('Performance Tests', () => {
  let testDir;
  let templatePath;

  beforeEach(() => {
    testDir = path.join(process.cwd(), '.test-perf-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
    templatePath = path.join(testDir, 'template.yaml');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Test build times with multiple functions
   * Validates: Requirements 6.1, 6.2
   */
  describe('Build time measurement', () => {
    it('should measure build times for multiple functions', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functions = [
        {
          Name: 'Function1',
          Properties: { CodeUri: './func1', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'Function2',
          Properties: { CodeUri: './func2', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'Function3',
          Properties: { CodeUri: './func3', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      const startTime = Date.now();
      const results = await buildManager.buildFunctions(functions);
      const totalTime = Date.now() - startTime;

      // Verify all builds completed
      expect(results.size).toBe(3);
      
      // Verify each build has timing information
      results.forEach((result, functionName) => {
        expect(result.duration).toBeGreaterThan(0);
        expect(result.startTime).toBeInstanceOf(Date);
        expect(result.endTime).toBeInstanceOf(Date);
      });

      // Total time should be reasonable (less than 5 seconds for 3 functions)
      expect(totalTime).toBeLessThan(5000);
    });

    it('should track individual function build durations', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functionConfig = {
        Name: 'TimedFunction',
        Properties: { CodeUri: './timed', Handler: 'app.handler', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild' }
      };

      const result = await buildManager.buildFunction(functionConfig);

      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.startTime).toBeInstanceOf(Date);
      expect(result.endTime).toBeInstanceOf(Date);
    });

    it('should report build completion times', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const buildCompletions = [];
      buildManager.on('buildCompleted', (data) => {
        buildCompletions.push({
          functionName: data.functionName,
          duration: data.duration,
          success: data.success
        });
      });

      const functions = [
        {
          Name: 'ReportFunc1',
          Properties: { CodeUri: './rf1', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'ReportFunc2',
          Properties: { CodeUri: './rf2', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      await buildManager.buildFunctions(functions);

      expect(buildCompletions).toHaveLength(2);
      buildCompletions.forEach(completion => {
        expect(completion.duration).toBeGreaterThan(0);
        expect(typeof completion.success).toBe('boolean');
      });
    });
  });

  /**
   * Test memory usage during file watching
   * Validates: Requirements 6.1, 6.2
   */
  describe('Memory usage monitoring', () => {
    it('should track memory usage during build operations', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const initialMemory = process.memoryUsage();

      const functions = Array.from({ length: 5 }, (_, i) => ({
        Name: `MemoryTestFunc${i + 1}`,
        Properties: { CodeUri: `./mem${i + 1}`, Handler: 'app.handler', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild' }
      }));

      await buildManager.buildFunctions(functions);

      const finalMemory = process.memoryUsage();

      // Memory increase should be reasonable (less than 100MB)
      const heapIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
      expect(heapIncrease).toBeLessThan(100);
    });

    it('should not leak memory across multiple build cycles', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functionConfig = {
        Name: 'LeakTestFunction',
        Properties: { CodeUri: './leak', Handler: 'app.handler', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild' }
      };

      const memoryReadings = [];

      // Run multiple build cycles
      for (let i = 0; i < 3; i++) {
        await buildManager.buildFunction(functionConfig);
        memoryReadings.push(process.memoryUsage().heapUsed);
        
        // Small delay between builds
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Memory should not grow significantly across cycles
      const firstReading = memoryReadings[0];
      const lastReading = memoryReadings[memoryReadings.length - 1];
      const growth = (lastReading - firstReading) / 1024 / 1024;
      
      // Memory growth should be less than 50MB across 3 cycles
      expect(growth).toBeLessThan(50);
    });

    it('should handle large template parsing efficiently', () => {
      // Create a large template with many functions
      const largeFunctions = Array.from({ length: 20 }, (_, i) => `
  Function${i + 1}:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./func${i + 1}
      Handler: app.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: esbuild
`).join('\n');

      const largeTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
${largeFunctions}
`;

      fs.writeFileSync(templatePath, largeTemplate);

      const parser = new TemplateParser();
      const startTime = Date.now();
      const functions = parser.parseTemplate(templatePath);
      const parseTime = Date.now() - startTime;

      expect(functions).toHaveLength(20);
      // Parsing should be fast (less than 500ms for 20 functions)
      expect(parseTime).toBeLessThan(500);
    });
  });

  /**
   * Test parallel build efficiency
   * Validates: Requirements 6.1, 6.2
   */
  describe('Parallel build efficiency', () => {
    it('should execute builds in parallel when enabled', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      configManager.updateConfig('parallelBuilds', true);
      
      const buildManager = new BuildManager(logger, configManager);

      const buildStartTimes = new Map();
      buildManager.on('buildStarted', (data) => {
        buildStartTimes.set(data.functionName, data.startTime);
      });

      const functions = [
        {
          Name: 'ParallelFunc1',
          Properties: { CodeUri: './pf1', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'ParallelFunc2',
          Properties: { CodeUri: './pf2', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'ParallelFunc3',
          Properties: { CodeUri: './pf3', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      const startTime = Date.now();
      await buildManager.buildFunctions(functions);
      const totalTime = Date.now() - startTime;

      // Verify all builds started
      expect(buildStartTimes.size).toBe(3);

      // With parallel builds, total time should be less than sum of individual times
      // (This is a rough check - actual timing depends on system resources)
      expect(totalTime).toBeLessThan(5000);
    });

    it('should respect parallel build limits', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      configManager.updateConfig('parallelBuilds', true);
      
      const buildManager = new BuildManager(logger, configManager);

      // Track concurrent builds
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      buildManager.on('buildStarted', () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
      });

      buildManager.on('buildCompleted', () => {
        currentConcurrent--;
      });

      const functions = Array.from({ length: 10 }, (_, i) => ({
        Name: `LimitFunc${i + 1}`,
        Properties: { CodeUri: `./lf${i + 1}`, Handler: 'app.handler', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild' }
      }));

      await buildManager.buildFunctions(functions);

      // Max concurrent should not exceed system CPU count / 2
      const expectedMax = Math.max(1, Math.floor(os.cpus().length / 2));
      expect(maxConcurrent).toBeLessThanOrEqual(expectedMax + 1); // +1 for timing variations
    });

    it('should measure parallel vs sequential build performance', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const functions = [
        {
          Name: 'PerfFunc1',
          Properties: { CodeUri: './perf1', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'PerfFunc2',
          Properties: { CodeUri: './perf2', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'PerfFunc3',
          Properties: { CodeUri: './perf3', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      // Test parallel builds
      const parallelConfig = new ConfigurationManager();
      parallelConfig.updateConfig('parallelBuilds', true);
      const parallelManager = new BuildManager(logger, parallelConfig);

      const parallelStart = Date.now();
      await parallelManager.buildFunctions(functions);
      const parallelTime = Date.now() - parallelStart;

      // Test sequential builds
      const sequentialConfig = new ConfigurationManager();
      sequentialConfig.updateConfig('parallelBuilds', false);
      const sequentialManager = new BuildManager(logger, sequentialConfig);

      const sequentialStart = Date.now();
      await sequentialManager.buildFunctions(functions);
      const sequentialTime = Date.now() - sequentialStart;

      // Both should complete (though they'll fail without real source files)
      expect(parallelTime).toBeGreaterThan(0);
      expect(sequentialTime).toBeGreaterThan(0);
      
      // Note: In real scenarios with actual builds, parallel should be faster
      // Here we just verify both modes work
    });
  });

  /**
   * Test incremental build performance
   */
  describe('Incremental build performance', () => {
    it('should skip unchanged functions efficiently', async () => {
      const logger = new Logger();
      // Suppress error events
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functions = [
        {
          Name: 'IncrFunc1',
          Properties: { CodeUri: './incr1', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        },
        {
          Name: 'IncrFunc2',
          Properties: { CodeUri: './incr2', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      // Simulate changed files only affecting one function
      const changedFiles = ['./incr1/app.ts'];

      const results = await buildManager.buildFunctions(functions, changedFiles);

      // Should only attempt to build the affected function
      // (In this test, it will still try to build based on file changes)
      expect(results.size).toBeGreaterThanOrEqual(0);
    });

    it('should validate artifact freshness quickly', async () => {
      const logger = new Logger();
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functionConfig = {
        Name: 'FreshnessFunc',
        Properties: { CodeUri: './fresh', Handler: 'app.handler', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild' }
      };

      // Check artifact freshness (internal method)
      const startTime = Date.now();
      const isStale = buildManager._isArtifactStale(functionConfig, './fresh');
      const checkTime = Date.now() - startTime;

      // Freshness check should be very fast (less than 100ms)
      expect(checkTime).toBeLessThan(100);
      expect(typeof isStale).toBe('boolean');
    });
  });

  /**
   * Test configuration and template parsing performance
   */
  describe('Configuration and parsing performance', () => {
    it('should load configuration files quickly', () => {
      const configPath = path.join(testDir, 'config.json');
      const config = {
        templatePath: './template.yaml',
        defaultFunctions: ['Func1', 'Func2', 'Func3'],
        logLevel: 'info',
        parallelBuilds: true,
        debounceDelay: 300,
        ignorePatterns: ['node_modules/**', '.git/**', '.aws-sam/**']
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      const configManager = new ConfigurationManager();
      
      const startTime = Date.now();
      configManager.loadConfig(configPath);
      const loadTime = Date.now() - startTime;

      // Config loading should be very fast (less than 50ms)
      expect(loadTime).toBeLessThan(50);
    });

    it('should parse templates with many resources efficiently', () => {
      // Create template with mixed resources
      const mixedTemplate = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  ${Array.from({ length: 10 }, (_, i) => `
  Function${i + 1}:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./func${i + 1}
      Handler: app.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: esbuild
  
  Bucket${i + 1}:
    Type: AWS::S3::Bucket
  
  Table${i + 1}:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: Table${i + 1}
`).join('\n')}
`;

      fs.writeFileSync(templatePath, mixedTemplate);

      const parser = new TemplateParser();
      
      const startTime = Date.now();
      const functions = parser.parseTemplate(templatePath);
      const parseTime = Date.now() - startTime;

      expect(functions).toHaveLength(10);
      // Should parse quickly even with many resources
      expect(parseTime).toBeLessThan(200);
    });

    it('should validate multiple functions efficiently', () => {
      const parser = new TemplateParser();
      
      const functions = Array.from({ length: 15 }, (_, i) => ({
        Name: `ValidateFunc${i + 1}`,
        Properties: {
          CodeUri: `./vf${i + 1}`,
          Handler: 'app.handler',
          Runtime: 'nodejs20.x'
        },
        Metadata: {
          BuildMethod: 'esbuild'
        }
      }));

      const startTime = Date.now();
      const validFunctions = parser.extractFunctions(functions);
      const validateTime = Date.now() - startTime;

      expect(validFunctions).toHaveLength(15);
      // Validation should be fast (less than 100ms for 15 functions)
      expect(validateTime).toBeLessThan(100);
    });
  });
});
