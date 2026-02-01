/**
 * Build Manager Module
 * Coordinates and executes builds for Lambda functions with parallel processing support
 * 
 * @module BuildManager
 * @extends EventEmitter
 * @fires BuildManager#buildStarted
 * @fires BuildManager#buildCompleted
 * @fires BuildManager#allBuildsComplete
 */
import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * BuildManager class for coordinating Lambda function builds
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const logger = new Logger();
 * const configManager = new ConfigurationManager();
 * const buildManager = new BuildManager(logger, configManager);
 * 
 * buildManager.on('buildCompleted', ({ functionName, success, duration }) => {
 *   console.log(`${functionName}: ${success ? 'SUCCESS' : 'FAILED'} (${duration}ms)`);
 * });
 * 
 * await buildManager.buildFunctions(selectedFunctions);
 */
export class BuildManager extends EventEmitter {
  /**
   * Create a BuildManager instance
   * 
   * @param {Logger} logger - Logger instance for build output
   * @param {ConfigurationManager} configManager - Configuration manager for build settings
   * @example
   * const buildManager = new BuildManager(logger, configManager);
   */
  constructor(logger, configManager) {
    super();
    this.logger = logger;
    this.configManager = configManager;
    this.buildQueue = [];
    this.activeBuildCount = 0;
    this.buildResults = new Map();
    this.maxParallelBuilds = this.configManager.get('parallelBuilds', true) ? 
      Math.max(1, Math.floor(os.cpus().length / 2)) : 1;
  }

  /**
   * Build multiple functions with parallel processing and incremental logic
   * Determines which functions need rebuilding based on file changes
   * 
   * @param {Array<Object>} functions - Array of Lambda function configurations
   * @param {Array<string>} [changedFiles=[]] - Array of changed file paths for incremental builds
   * @returns {Promise<Map<string, Object>>} Map of function names to build results
   * @throws {Error} If no functions provided
   * @fires BuildManager#buildStarted
   * @fires BuildManager#buildCompleted
   * @fires BuildManager#allBuildsComplete
   * @example
   * const results = await buildManager.buildFunctions(functions);
   * results.forEach((result, functionName) => {
   *   console.log(`${functionName}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
   * });
   * 
   * // Incremental build with changed files
   * const incrementalResults = await buildManager.buildFunctions(
   *   functions,
   *   ['src/handler.ts', 'src/utils.ts']
   * );
   */
  async buildFunctions(functions, changedFiles = []) {
    if (!Array.isArray(functions) || functions.length === 0) {
      throw new Error('No functions provided for building');
    }

    // Determine which functions need rebuilding
    const functionsToRebuild = changedFiles.length > 0 
      ? this._determineFunctionsToRebuild(functions, changedFiles)
      : functions;

    if (functionsToRebuild.length === 0) {
      this.logger.logInfo('No functions need rebuilding based on file changes');
      return new Map();
    }

    this.logger.logInfo(`Starting build for ${functionsToRebuild.length} functions (max parallel: ${this.maxParallelBuilds})`);
    
    // Reset build results and progress tracking
    this.buildResults.clear();
    this.buildQueue = [...functionsToRebuild];
    this.activeBuildCount = 0;
    this.totalFunctions = functionsToRebuild.length;
    this.completedFunctions = 0;

    // Display initial progress
    this._displayProgress();

    // Create a promise that resolves when all builds complete
    const allDone = new Promise(resolve => this.once('allBuildsComplete', resolve));

    // Start initial builds up to parallel limit
    const initialBuilds = Math.min(this.maxParallelBuilds, functionsToRebuild.length);

    for (let i = 0; i < initialBuilds; i++) {
      const func = this.buildQueue.shift();
      if (func) {
        this._buildFunction(func);
      }
    }

    // Wait for all queued builds to complete
    await allDone;

    return this.buildResults;
  }

  /**
   * Build a single Lambda function
   * 
   * @param {Object} functionConfig - Lambda function configuration
   * @param {string} functionConfig.Name - Function name
   * @param {Object} functionConfig.Metadata - Function metadata with BuildMethod
   * @param {Object} functionConfig.Properties - Function properties
   * @returns {Promise<Object>} Build result with success status, duration, and errors
   * @example
   * const result = await buildManager.buildFunction(functionConfig);
   * if (result.success) {
   *   console.log(`Build completed in ${result.duration}ms`);
   * } else {
   *   console.error('Build failed:', result.errors);
   * }
   */
  async buildFunction(functionConfig) {
    return await this._buildFunction(functionConfig);
  }

  /**
   * Internal method to build a single function
   * @param {Object} functionConfig - Lambda function configuration
   * @returns {Promise<Object>} Build result
   */
  async _buildFunction(functionConfig) {
    const startTime = Date.now();
    this.activeBuildCount++;
    
    const buildResult = {
      functionName: functionConfig.Name,
      success: false,
      duration: 0,
      startTime: new Date(startTime),
      endTime: null,
      errors: [],
      warnings: []
    };

    try {
      this.logger.logBuildStart(functionConfig.Name);
      this.emit('buildStarted', { functionName: functionConfig.Name, startTime });

      // Determine build method and execute
      const buildMethod = functionConfig.Metadata.BuildMethod;
      
      if (buildMethod === 'esbuild') {
        await this._executeEsbuild(functionConfig, buildResult);
      } else if (buildMethod === 'makefile') {
        await this._executeMakefile(functionConfig, buildResult);
      } else {
        throw new Error(`Unsupported build method: ${buildMethod}`);
      }

      buildResult.success = true;
      
    } catch (error) {
      buildResult.success = false;
      buildResult.errors.push(error.message);
      this.logger.logError(functionConfig.Name, error);
    } finally {
      const endTime = Date.now();
      buildResult.endTime = new Date(endTime);
      buildResult.duration = endTime - startTime;
      
      this.logger.logBuildComplete(functionConfig.Name, buildResult.success, buildResult.duration);
      this.buildResults.set(functionConfig.Name, buildResult);
      
      this.activeBuildCount--;
      this.completedFunctions++;
      
      // Update progress display
      this._displayProgress();
      
      this.emit('buildCompleted', buildResult);

      // Start next build if queue has items
      if (this.buildQueue.length > 0) {
        const nextFunction = this.buildQueue.shift();
        setImmediate(() => this._buildFunction(nextFunction));
      }

      // Check if all builds are complete
      if (this.completedFunctions === this.totalFunctions) {
        this._displayBuildSummary();
        this.emit('allBuildsComplete', { 
          results: this.buildResults,
          totalFunctions: this.totalFunctions,
          successCount: Array.from(this.buildResults.values()).filter(r => r.success).length
        });
      }
    }

    return buildResult;
  }

  /**
   * Execute esbuild for a function
   * @param {Object} functionConfig - Lambda function configuration
   * @param {Object} buildResult - Build result object to update
   */
  async _executeEsbuild(functionConfig, buildResult) {
    const buildProps = functionConfig.Metadata.BuildProperties || {};
    
    // Apply custom build settings from configuration
    const customBuildSettings = this._getCustomBuildSettings(functionConfig.Name);
    const mergedBuildProps = { ...buildProps, ...customBuildSettings };
    
    const codeUri = functionConfig.Properties.CodeUri || '.';
    const outputDir = path.join('.aws-sam', 'build', functionConfig.Name);

    // Ensure output directory exists
    fs.mkdirSync(outputDir, { recursive: true });

    const entryPoint = path.join(codeUri, 'app.ts');
    const outputFile = path.join(outputDir, 'app.js');

    const esbuildArgs = [
      entryPoint,
      '--bundle',
      '--platform=node',
      `--target=${mergedBuildProps.Target || 'es2020'}`,
      `--outfile=${outputFile}`,
      '--external:aws-sdk'
    ];

    if (mergedBuildProps.Minify) {
      esbuildArgs.push('--minify');
    }

    if (mergedBuildProps.Sourcemap) {
      esbuildArgs.push('--sourcemap');
    }

    return new Promise((resolve, reject) => {
      const esbuild = spawn('npx', ['esbuild', ...esbuildArgs], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      esbuild.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.logBuild(functionConfig.Name, data.toString().trim(), 'debug');
      });

      esbuild.stderr.on('data', (data) => {
        stderr += data.toString();
        const message = data.toString().trim();
        if (message.includes('warning')) {
          buildResult.warnings.push(message);
          this.logger.logBuild(functionConfig.Name, `WARNING: ${message}`, 'warn');
        } else {
          this.logger.logBuild(functionConfig.Name, message, 'debug');
        }
      });

      esbuild.on('close', (code) => {
        if (code === 0) {
          this.logger.logBuild(functionConfig.Name, 'esbuild completed successfully', 'debug');
          resolve();
        } else {
          reject(new Error(`esbuild failed with exit code ${code}: ${stderr}`));
        }
      });

      esbuild.on('error', (error) => {
        reject(new Error(`Failed to spawn esbuild: ${error.message}`));
      });
    });
  }

  /**
   * Execute makefile build for a function
   * @param {Object} functionConfig - Lambda function configuration
   * @param {Object} buildResult - Build result object to update
   */
  async _executeMakefile(functionConfig, buildResult) {
    const codeUri = functionConfig.Properties.CodeUri || '.';
    const makefilePath = path.join(codeUri, 'Makefile');

    if (!fs.existsSync(makefilePath)) {
      throw new Error(`Makefile not found at ${makefilePath}`);
    }

    return new Promise((resolve, reject) => {
      const make = spawn('make', ['build'], {
        cwd: codeUri,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      make.stdout.on('data', (data) => {
        stdout += data.toString();
        this.logger.logBuild(functionConfig.Name, data.toString().trim(), 'debug');
      });

      make.stderr.on('data', (data) => {
        stderr += data.toString();
        const message = data.toString().trim();
        if (message.includes('warning')) {
          buildResult.warnings.push(message);
          this.logger.logBuild(functionConfig.Name, `WARNING: ${message}`, 'warn');
        } else {
          this.logger.logBuild(functionConfig.Name, message, 'debug');
        }
      });

      make.on('close', (code) => {
        if (code === 0) {
          this.logger.logBuild(functionConfig.Name, 'make build completed successfully', 'debug');
          resolve();
        } else {
          reject(new Error(`make build failed with exit code ${code}: ${stderr}`));
        }
      });

      make.on('error', (error) => {
        reject(new Error(`Failed to spawn make: ${error.message}`));
      });
    });
  }

  /**
   * Get build status for all functions
   * Returns a copy of the build results map
   * 
   * @returns {Map<string, Object>} Map of function names to build results
   * @example
   * const status = buildManager.getBuildStatus();
   * status.forEach((result, functionName) => {
   *   console.log(`${functionName}: ${result.success ? 'OK' : 'FAILED'}`);
   * });
   */
  getBuildStatus() {
    return new Map(this.buildResults);
  }

  /**
   * Get build status for a specific function
   * 
   * @param {string} functionName - Name of the function
   * @returns {Object|null} Build result object or null if not found
   * @example
   * const result = buildManager.getFunctionBuildStatus('HelloWorldFunction');
   * if (result) {
   *   console.log(`Duration: ${result.duration}ms`);
   * }
   */
  getFunctionBuildStatus(functionName) {
    return this.buildResults.get(functionName) || null;
  }

  /**
   * Check if any builds are currently active
   * 
   * @returns {boolean} True if one or more builds are in progress
   * @example
   * if (buildManager.isBuilding()) {
   *   console.log('Builds in progress...');
   * }
   */
  isBuilding() {
    return this.activeBuildCount > 0;
  }

  /**
   * Determine which functions need rebuilding based on changed files
   * @param {Array} functions - Array of Lambda function configurations
   * @param {Array} changedFiles - Array of changed file paths
   * @returns {Array} Functions that need rebuilding
   */
  _determineFunctionsToRebuild(functions, changedFiles) {
    const functionsToRebuild = [];

    for (const func of functions) {
      const codeUri = func.Properties.CodeUri || '.';
      const needsRebuild = this._functionNeedsRebuild(func, changedFiles, codeUri);
      
      if (needsRebuild) {
        functionsToRebuild.push(func);
        this.logger.logInfo(`Function ${func.Name} needs rebuilding due to file changes`);
      } else {
        this.logger.logInfo(`Function ${func.Name} is up to date, skipping build`);
      }
    }

    return functionsToRebuild;
  }

  /**
   * Check if a function needs rebuilding based on file changes and artifact freshness
   * @param {Object} functionConfig - Lambda function configuration
   * @param {Array} changedFiles - Array of changed file paths
   * @param {string} codeUri - Function's source code directory
   * @returns {boolean} True if function needs rebuilding
   */
  _functionNeedsRebuild(functionConfig, changedFiles, codeUri) {
    // Check if any changed files affect this function
    const functionAffected = changedFiles.some(filePath => {
      // Normalize paths for comparison
      const normalizedFilePath = path.normalize(filePath);
      const normalizedCodeUri = path.normalize(codeUri);
      
      // Check if the changed file is within the function's code directory
      return normalizedFilePath.startsWith(normalizedCodeUri) || 
             normalizedFilePath.startsWith(path.join(normalizedCodeUri, '/'));
    });

    if (!functionAffected) {
      return false;
    }

    // Check artifact freshness
    return this._isArtifactStale(functionConfig, codeUri);
  }

  /**
   * Check if build artifacts are stale compared to source files
   * @param {Object} functionConfig - Lambda function configuration
   * @param {string} codeUri - Function's source code directory
   * @returns {boolean} True if artifacts are stale and need rebuilding
   */
  _isArtifactStale(functionConfig, codeUri) {
    try {
      const outputDir = path.join('.aws-sam', 'build', functionConfig.Name);
      
      // Check if output directory exists
      if (!fs.existsSync(outputDir)) {
        this.logger.logDebug(`Build output directory ${outputDir} does not exist`, functionConfig.Name);
        return true;
      }

      // Get the most recent modification time of source files
      const sourceModTime = this._getLatestSourceModTime(codeUri);
      
      // Get the modification time of the build artifact
      const artifactModTime = this._getArtifactModTime(outputDir);

      if (!artifactModTime) {
        this.logger.logDebug(`No build artifacts found in ${outputDir}`, functionConfig.Name);
        return true;
      }

      // Compare timestamps
      const isStale = sourceModTime > artifactModTime;
      
      if (isStale) {
        this.logger.logDebug(
          `Artifacts are stale: source=${new Date(sourceModTime).toISOString()}, artifact=${new Date(artifactModTime).toISOString()}`,
          functionConfig.Name
        );
      }

      return isStale;
    } catch (error) {
      this.logger.logWarn(`Error checking artifact freshness: ${error.message}`, functionConfig.Name);
      // If we can't determine freshness, rebuild to be safe
      return true;
    }
  }

  /**
   * Get the latest modification time of source files in a directory
   * @param {string} sourceDir - Source directory path
   * @returns {number} Latest modification time in milliseconds
   */
  _getLatestSourceModTime(sourceDir) {
    let latestModTime = 0;

    const scanDirectory = (dir) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          // Skip node_modules and other build directories
          if (entry.isDirectory() && !['node_modules', '.git', '.aws-sam', 'dist', 'build'].includes(entry.name)) {
            scanDirectory(fullPath);
          } else if (entry.isFile()) {
            const stats = fs.statSync(fullPath);
            latestModTime = Math.max(latestModTime, stats.mtime.getTime());
          }
        }
      } catch (error) {
        // Directory might not exist or be accessible
        this.logger.logDebug(`Could not scan directory ${dir}: ${error.message}`);
      }
    };

    scanDirectory(sourceDir);
    return latestModTime;
  }

  /**
   * Get the modification time of build artifacts
   * @param {string} outputDir - Build output directory
   * @returns {number|null} Modification time in milliseconds, or null if no artifacts found
   */
  _getArtifactModTime(outputDir) {
    try {
      const entries = fs.readdirSync(outputDir, { withFileTypes: true });
      let latestModTime = 0;
      let hasArtifacts = false;

      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(outputDir, entry.name);
          const stats = fs.statSync(fullPath);
          latestModTime = Math.max(latestModTime, stats.mtime.getTime());
          hasArtifacts = true;
        }
      }

      return hasArtifacts ? latestModTime : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Display progress indicators during build execution
   */
  _displayProgress() {
    if (this.totalFunctions > 1) {
      const percentage = Math.round((this.completedFunctions / this.totalFunctions) * 100);
      const progressBar = this._createProgressBar(percentage);
      
      this.logger.logInfo(
        `Build Progress: ${this.completedFunctions}/${this.totalFunctions} (${percentage}%) ${progressBar}`
      );
    }
  }

  /**
   * Create a visual progress bar
   * @param {number} percentage - Completion percentage (0-100)
   * @returns {string} Progress bar string
   */
  _createProgressBar(percentage) {
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const emptyLength = Math.max(0, barLength - filledLength); // Ensure non-negative
    
    const filled = '█'.repeat(Math.max(0, filledLength));
    const empty = '░'.repeat(emptyLength);
    
    return `[${filled}${empty}]`;
  }

  /**
   * Display comprehensive build summary
   */
  _displayBuildSummary() {
    const results = Array.from(this.buildResults.values());
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const averageDuration = results.length > 0 ? Math.round(totalDuration / results.length) : 0;

    this.logger.logInfo('\n' + '='.repeat(60));
    this.logger.logInfo('BUILD SUMMARY');
    this.logger.logInfo('='.repeat(60));
    this.logger.logInfo(`Total Functions: ${results.length}`);
    this.logger.logInfo(`Successful: ${successCount}`);
    this.logger.logInfo(`Failed: ${failureCount}`);
    this.logger.logInfo(`Total Duration: ${totalDuration}ms`);
    this.logger.logInfo(`Average Duration: ${averageDuration}ms`);
    this.logger.logInfo('='.repeat(60));

    // Display individual function results
    if (results.length > 0) {
      this.logger.logInfo('\nFunction Build Results:');
      results.forEach(result => {
        const status = result.success ? '✅ SUCCESS' : '❌ FAILED';
        const duration = `${result.duration}ms`;
        this.logger.logInfo(`  ${result.functionName}: ${status} (${duration})`);
        
        if (!result.success && result.errors.length > 0) {
          result.errors.forEach(error => {
            this.logger.logInfo(`    Error: ${error}`);
          });
        }
        
        if (result.warnings.length > 0) {
          result.warnings.forEach(warning => {
            this.logger.logInfo(`    Warning: ${warning}`);
          });
        }
      });
    }

    this.logger.logInfo('');
  }

  /**
   * Get custom build settings for a function from configuration
   * @param {string} functionName - Name of the function
   * @returns {Object} Custom build settings for the function
   */
  _getCustomBuildSettings(functionName) {
    const buildSettings = this.configManager.get('buildSettings', {});
    
    // Check for function-specific settings
    if (buildSettings[functionName]) {
      return buildSettings[functionName];
    }
    
    // Check for global build settings
    if (buildSettings.global) {
      return buildSettings.global;
    }
    
    return {};
  }

  /**
   * Get the number of active builds
   * @returns {number} Number of active builds
   */
  getActiveBuildCount() {
    return this.activeBuildCount;
  }
}