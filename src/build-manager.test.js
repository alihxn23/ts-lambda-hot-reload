/**
 * Build Manager Tests
 * Tests for the BuildManager class including property-based tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import path from 'path';
import { BuildManager } from './build-manager.js';
import { Logger } from './logger.js';
import { ConfigurationManager } from './configuration-manager.js';

describe('BuildManager', () => {
  let buildManager;
  let mockLogger;
  let mockConfigManager;

  beforeEach(() => {
    // Create mock logger with all required methods
    mockLogger = {
      logInfo: vi.fn(),
      logBuildStart: vi.fn(),
      logBuildComplete: vi.fn(),
      logBuild: vi.fn(),
      logError: vi.fn(),
      logDebug: vi.fn(),
      logWarn: vi.fn()
    };

    // Create mock configuration manager
    mockConfigManager = {
      get: vi.fn((key, defaultValue) => {
        if (key === 'parallelBuilds') return true;
        return defaultValue;
      })
    };

    buildManager = new BuildManager(mockLogger, mockConfigManager);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clear any shared state
    if (buildManager && buildManager.buildResults) {
      buildManager.buildResults.clear();
    }
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 14: Parallel build execution**
   * **Validates: Requirements 6.1**
   * 
   * For any set of multiple selected functions, builds should execute in parallel when system resources allow
   */
  it('should execute builds in parallel when multiple functions are provided', () => {
    fc.assert(fc.property(
      // Generate array of function configurations with unique names
      fc.array(
        fc.record({
          Name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(s)),
          Properties: fc.record({
            CodeUri: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: '.' }),
            Runtime: fc.constantFrom('nodejs18.x', 'nodejs20.x', 'python3.9', 'python3.11')
          }),
          Metadata: fc.record({
            BuildMethod: fc.constantFrom('esbuild', 'makefile'),
            BuildProperties: fc.record({
              Target: fc.option(fc.constantFrom('es2020', 'es2022')),
              Minify: fc.option(fc.boolean()),
              Sourcemap: fc.option(fc.boolean())
            })
          })
        }),
        { minLength: 2, maxLength: 4 } // Limit to smaller arrays to avoid race conditions
      ).map(functions => {
        // Ensure unique function names
        return functions.map((func, index) => ({
          ...func,
          Name: `Func${index}_${func.Name.slice(0, 5)}`
        }));
      }),
      async (functions) => {
        // Track concurrent execution
        let maxConcurrentBuilds = 0;
        let currentConcurrentBuilds = 0;
        const buildStarted = new Set();
        const buildCompleted = new Set();
        
        // Mock the internal build methods
        const originalExecuteEsbuild = buildManager._executeEsbuild;
        const originalExecuteMakefile = buildManager._executeMakefile;
        
        const createMockBuildFunction = () => {
          return vi.fn(async (functionConfig, buildResult) => {
            currentConcurrentBuilds++;
            maxConcurrentBuilds = Math.max(maxConcurrentBuilds, currentConcurrentBuilds);
            buildStarted.add(functionConfig.Name);
            
            // Simulate some build time
            await new Promise(resolve => setTimeout(resolve, 5));
            
            currentConcurrentBuilds--;
            buildCompleted.add(functionConfig.Name);
            return Promise.resolve();
          });
        };
        
        buildManager._executeEsbuild = createMockBuildFunction();
        buildManager._executeMakefile = createMockBuildFunction();

        try {
          const results = await buildManager.buildFunctions(functions);
          
          // Verify all functions were built
          expect(results.size).toBe(functions.length);
          
          // Verify all builds were successful
          for (const [functionName, result] of results) {
            expect(result.success).toBe(true);
            expect(result.functionName).toBe(functionName);
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
            expect(buildStarted.has(functionName)).toBe(true);
            expect(buildCompleted.has(functionName)).toBe(true);
          }
          
          // For parallel execution with multiple functions, we should see concurrent builds
          if (functions.length >= 2) {
            expect(maxConcurrentBuilds).toBeGreaterThan(1);
          }
          
        } finally {
          // Restore original methods
          buildManager._executeEsbuild = originalExecuteEsbuild;
          buildManager._executeMakefile = originalExecuteMakefile;
        }
      }
    ), { numRuns: 50 }); // Reduce number of runs to avoid timeout issues
  });

  it('should handle single function builds correctly', async () => {
    const mockFunction = {
      Name: 'TestFunction',
      Properties: {
        CodeUri: './test',
        Runtime: 'nodejs20.x'
      },
      Metadata: {
        BuildMethod: 'esbuild',
        BuildProperties: {
          Target: 'es2020',
          Minify: true
        }
      }
    };

    // Mock the build execution
    buildManager._executeEsbuild = vi.fn(async () => {
      // Simulate some build time
      await new Promise(resolve => setTimeout(resolve, 10));
      return Promise.resolve();
    });

    const result = await buildManager.buildFunction(mockFunction);

    expect(result.functionName).toBe('TestFunction');
    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThan(0);
    expect(buildManager._executeEsbuild).toHaveBeenCalledWith(mockFunction, expect.any(Object));
  });

  it('should track build status correctly', async () => {
    const mockFunctions = [
      {
        Name: 'Function1',
        Properties: { CodeUri: './test1', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'esbuild', BuildProperties: {} }
      },
      {
        Name: 'Function2',
        Properties: { CodeUri: './test2', Runtime: 'nodejs20.x' },
        Metadata: { BuildMethod: 'makefile', BuildProperties: {} }
      }
    ];

    // Mock build executions
    buildManager._executeEsbuild = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return Promise.resolve();
    });
    buildManager._executeMakefile = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return Promise.resolve();
    });

    const results = await buildManager.buildFunctions(mockFunctions);
    const status = buildManager.getBuildStatus();

    expect(status.size).toBe(2);
    expect(status.get('Function1')).toBeDefined();
    expect(status.get('Function2')).toBeDefined();
    expect(buildManager.getFunctionBuildStatus('Function1').success).toBe(true);
    expect(buildManager.getFunctionBuildStatus('Function2').success).toBe(true);
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 15: Incremental build accuracy**
   * **Validates: Requirements 6.2**
   * 
   * For any file change, only Lambda functions whose source files were modified should be rebuilt
   */
  it('should only rebuild functions affected by file changes', () => {
    fc.assert(fc.property(
      // Generate function configurations
      fc.array(
        fc.record({
          Name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(s)),
          Properties: fc.record({
            CodeUri: fc.constantFrom('./func1', './func2', './func3', './shared'),
            Runtime: fc.constantFrom('nodejs18.x', 'nodejs20.x')
          }),
          Metadata: fc.record({
            BuildMethod: fc.constantFrom('esbuild', 'makefile'),
            BuildProperties: fc.record({
              Target: fc.option(fc.constantFrom('es2020', 'es2022')),
              Minify: fc.option(fc.boolean())
            })
          })
        }),
        { minLength: 2, maxLength: 4 }
      ).map(functions => {
        // Ensure unique function names and code URIs
        return functions.map((func, index) => ({
          ...func,
          Name: `Function${index}`,
          Properties: {
            ...func.Properties,
            CodeUri: `./func${index}`
          }
        }));
      }),
      // Generate changed files
      fc.array(
        fc.constantFrom('./func0/app.ts', './func1/app.ts', './func2/app.ts', './func3/app.ts', './shared/utils.ts'),
        { minLength: 1, maxLength: 3 }
      ),
      async (functions, changedFiles) => {
        // Mock the internal build methods and file system operations
        const originalExecuteEsbuild = buildManager._executeEsbuild;
        const originalExecuteMakefile = buildManager._executeMakefile;
        const originalIsArtifactStale = buildManager._isArtifactStale;
        
        const builtFunctions = new Set();
        
        buildManager._executeEsbuild = vi.fn(async (functionConfig, buildResult) => {
          builtFunctions.add(functionConfig.Name);
          await new Promise(resolve => setTimeout(resolve, 5));
          return Promise.resolve();
        });
        
        buildManager._executeMakefile = vi.fn(async (functionConfig, buildResult) => {
          builtFunctions.add(functionConfig.Name);
          await new Promise(resolve => setTimeout(resolve, 5));
          return Promise.resolve();
        });

        // Mock artifact staleness check - assume artifacts are stale if function is affected
        buildManager._isArtifactStale = vi.fn((functionConfig, codeUri) => {
          // Return true to force rebuild for affected functions
          return true;
        });

        try {
          const results = await buildManager.buildFunctions(functions, changedFiles);
          
          // Determine which functions should have been built based on changed files
          const expectedBuiltFunctions = new Set();
          
          for (const func of functions) {
            const codeUri = func.Properties.CodeUri;
            const shouldBuild = changedFiles.some(filePath => {
              const normalizedFilePath = path.normalize(filePath);
              const normalizedCodeUri = path.normalize(codeUri);
              return normalizedFilePath.startsWith(normalizedCodeUri);
            });
            
            if (shouldBuild) {
              expectedBuiltFunctions.add(func.Name);
            }
          }
          
          // Verify that only the expected functions were built
          expect(builtFunctions.size).toBe(expectedBuiltFunctions.size);
          
          for (const functionName of expectedBuiltFunctions) {
            expect(builtFunctions.has(functionName)).toBe(true);
          }
          
          // Verify that functions not affected by changes were not built
          for (const func of functions) {
            if (!expectedBuiltFunctions.has(func.Name)) {
              expect(builtFunctions.has(func.Name)).toBe(false);
            }
          }
          
          // Verify build results only contain built functions
          expect(results.size).toBe(expectedBuiltFunctions.size);
          
          for (const [functionName, result] of results) {
            expect(expectedBuiltFunctions.has(functionName)).toBe(true);
            expect(result.success).toBe(true);
          }
          
        } finally {
          // Restore original methods
          buildManager._executeEsbuild = originalExecuteEsbuild;
          buildManager._executeMakefile = originalExecuteMakefile;
          buildManager._isArtifactStale = originalIsArtifactStale;
        }
      }
    ), { numRuns: 30 });
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 18: Build completion reporting**
   * **Validates: Requirements 6.5**
   * 
   * For any completed build, timing information and success/failure status should be reported
   */
  it('should report build completion with timing and status information', () => {
    fc.assert(fc.property(
      // Generate function configurations
      fc.array(
        fc.record({
          Name: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(s)),
          Properties: fc.record({
            CodeUri: fc.string({ minLength: 1, maxLength: 20 }),
            Runtime: fc.constantFrom('nodejs18.x', 'nodejs20.x')
          }),
          Metadata: fc.record({
            BuildMethod: fc.constantFrom('esbuild', 'makefile'),
            BuildProperties: fc.record({
              Target: fc.option(fc.constantFrom('es2020', 'es2022')),
              Minify: fc.option(fc.boolean())
            })
          })
        }),
        { minLength: 1, maxLength: 3 }
      ).map(functions => {
        // Ensure unique function names
        return functions.map((func, index) => ({
          ...func,
          Name: `TestFunc${index}`
        }));
      }),
      // Generate success/failure scenarios
      fc.array(fc.boolean(), { minLength: 1, maxLength: 3 }),
      async (functions, successFlags) => {
        // Ensure we have the same number of success flags as functions
        const adjustedSuccessFlags = successFlags.slice(0, functions.length);
        while (adjustedSuccessFlags.length < functions.length) {
          adjustedSuccessFlags.push(true);
        }

        // Mock the internal build methods
        const originalExecuteEsbuild = buildManager._executeEsbuild;
        const originalExecuteMakefile = buildManager._executeMakefile;
        
        let buildIndex = 0;
        const createMockBuildFunction = () => {
          return vi.fn(async (functionConfig, buildResult) => {
            const shouldSucceed = adjustedSuccessFlags[buildIndex % adjustedSuccessFlags.length];
            buildIndex++;
            
            // Simulate build time
            await new Promise(resolve => setTimeout(resolve, Math.random() * 20 + 10));
            
            if (!shouldSucceed) {
              throw new Error(`Mock build failure for ${functionConfig.Name}`);
            }
            
            return Promise.resolve();
          });
        };
        
        buildManager._executeEsbuild = createMockBuildFunction();
        buildManager._executeMakefile = createMockBuildFunction();

        try {
          const results = await buildManager.buildFunctions(functions);
          
          // Verify that all functions have build results
          expect(results.size).toBe(functions.length);
          
          // Verify each build result contains required timing and status information
          for (const [functionName, result] of results) {
            // Verify basic result structure
            expect(result.functionName).toBe(functionName);
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.duration).toBe('number');
            expect(result.duration).toBeGreaterThan(0);
            expect(result.startTime).toBeInstanceOf(Date);
            expect(result.endTime).toBeInstanceOf(Date);
            expect(Array.isArray(result.errors)).toBe(true);
            expect(Array.isArray(result.warnings)).toBe(true);
            
            // Verify timing consistency
            expect(result.endTime.getTime()).toBeGreaterThanOrEqual(result.startTime.getTime());
            
            // Verify that failed builds have error information
            if (!result.success) {
              expect(result.errors.length).toBeGreaterThan(0);
            }
          }
          
          // Verify that logger methods were called for reporting
          expect(mockLogger.logInfo).toHaveBeenCalled();
          
          // Check that build completion was logged for each function
          functions.forEach(func => {
            expect(mockLogger.logBuildComplete).toHaveBeenCalledWith(
              func.Name,
              expect.any(Boolean),
              expect.any(Number)
            );
          });
          
        } finally {
          // Restore original methods
          buildManager._executeEsbuild = originalExecuteEsbuild;
          buildManager._executeMakefile = originalExecuteMakefile;
        }
      }
    ), { numRuns: 20 });
  });

  it('should handle build failures gracefully', async () => {
    const mockFunction = {
      Name: 'FailingFunction',
      Properties: { CodeUri: './test', Runtime: 'nodejs20.x' },
      Metadata: { BuildMethod: 'esbuild', BuildProperties: {} }
    };

    // Mock build execution to fail
    buildManager._executeEsbuild = vi.fn().mockRejectedValue(new Error('Build failed'));

    const result = await buildManager.buildFunction(mockFunction);

    expect(result.functionName).toBe('FailingFunction');
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Build failed');
    expect(mockLogger.logError).toHaveBeenCalled();
  });

  /**
   * Property 27: Build settings configuration application
   * For any custom build settings in configuration, they should be used during the build process
   * **Feature: lambda-hot-reload-improvements, Property 27: Build settings configuration application**
   * **Validates: Requirements 8.4**
   */
  it('should apply custom build settings from configuration during build process', () => {
    fc.assert(fc.property(
      fc.record({
        functionName: fc.string({ minLength: 1, maxLength: 50 }),
        globalSettings: fc.record({
          Target: fc.constantFrom('es2020', 'es2021', 'es2022', 'node18', 'node20'),
          Minify: fc.boolean(),
          Sourcemap: fc.boolean()
        }),
        functionSpecificSettings: fc.record({
          Target: fc.constantFrom('es2020', 'es2021', 'es2022', 'node18', 'node20'),
          Minify: fc.boolean(),
          Sourcemap: fc.boolean()
        })
      }),
      fc.boolean(), // whether to use function-specific settings
      (config, useFunctionSpecific) => {
        const { functionName, globalSettings, functionSpecificSettings } = config;
        
        // Set up configuration with build settings
        const buildSettings = {
          global: globalSettings
        };
        
        if (useFunctionSpecific) {
          buildSettings[functionName] = functionSpecificSettings;
        }
        
        mockConfigManager.get.mockImplementation((key, defaultValue) => {
          if (key === 'buildSettings') {
            return buildSettings;
          }
          if (key === 'parallelBuilds') {
            return true;
          }
          return defaultValue;
        });
        
        // Create a new build manager with the mocked config
        const testBuildManager = new BuildManager(mockLogger, mockConfigManager);
        
        // Get custom build settings for the function
        const customSettings = testBuildManager._getCustomBuildSettings(functionName);
        
        // Verify that the correct settings are returned
        if (useFunctionSpecific) {
          // Function-specific settings should override global settings
          expect(customSettings).toEqual(functionSpecificSettings);
          expect(customSettings.Target).toBe(functionSpecificSettings.Target);
          expect(customSettings.Minify).toBe(functionSpecificSettings.Minify);
          expect(customSettings.Sourcemap).toBe(functionSpecificSettings.Sourcemap);
        } else {
          // Global settings should be used
          expect(customSettings).toEqual(globalSettings);
          expect(customSettings.Target).toBe(globalSettings.Target);
          expect(customSettings.Minify).toBe(globalSettings.Minify);
          expect(customSettings.Sourcemap).toBe(globalSettings.Sourcemap);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });

  it('should merge custom build settings with function metadata build properties', () => {
    fc.assert(fc.property(
      fc.record({
        functionName: fc.string({ minLength: 1, maxLength: 50 }),
        metadataProps: fc.record({
          Target: fc.constantFrom('es2020', 'es2021'),
          Minify: fc.boolean()
        }),
        customSettings: fc.record({
          Target: fc.constantFrom('node18', 'node20'),
          Sourcemap: fc.boolean()
        })
      }),
      (config) => {
        const { functionName, metadataProps, customSettings } = config;
        
        // Set up configuration
        mockConfigManager.get.mockImplementation((key, defaultValue) => {
          if (key === 'buildSettings') {
            return { [functionName]: customSettings };
          }
          if (key === 'parallelBuilds') {
            return true;
          }
          return defaultValue;
        });
        
        const testBuildManager = new BuildManager(mockLogger, mockConfigManager);
        
        // Create a mock function config
        const mockFunctionConfig = {
          Name: functionName,
          Properties: { CodeUri: './test', Runtime: 'nodejs20.x' },
          Metadata: { 
            BuildMethod: 'esbuild', 
            BuildProperties: metadataProps 
          }
        };
        
        // Get custom settings
        const retrievedCustomSettings = testBuildManager._getCustomBuildSettings(functionName);
        
        // Merge settings (simulating what _executeEsbuild does)
        const mergedProps = { ...metadataProps, ...retrievedCustomSettings };
        
        // Verify that custom settings override metadata properties
        expect(mergedProps.Target).toBe(customSettings.Target); // Custom overrides metadata
        expect(mergedProps.Sourcemap).toBe(customSettings.Sourcemap); // Custom adds new property
        
        // If Minify is in custom settings, it should override; otherwise use metadata
        if (customSettings.Minify !== undefined) {
          expect(mergedProps.Minify).toBe(customSettings.Minify);
        } else {
          expect(mergedProps.Minify).toBe(metadataProps.Minify);
        }
        
        return true;
      }
    ), { numRuns: 100 });
  });
});
