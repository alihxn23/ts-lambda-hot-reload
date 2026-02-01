/**
 * FileWatcher Module
 * Enhanced file watcher with proper nodemon configuration and error handling
 * 
 * @module FileWatcher
 * @extends EventEmitter
 * @fires FileWatcher#watchingStarted
 * @fires FileWatcher#watchingStopped
 * @fires FileWatcher#filesChanged
 * @fires FileWatcher#watcherError
 * @fires FileWatcher#watcherRestarting
 * @fires FileWatcher#configUpdated
 * @fires FileWatcher#ignorePatternAdded
 * @fires FileWatcher#ignorePatternRemoved
 * @fires FileWatcher#restartAttemptsReset
 * @fires FileWatcher#maxRestartAttemptsChanged
 */
import { EventEmitter } from 'events';
import nodemon from 'nodemon';

/**
 * FileWatcher class for monitoring file changes with debouncing and error recovery
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const watcher = new FileWatcher({
 *   extensions: ['js', 'ts'],
 *   debounceDelay: 300,
 *   ignorePatterns: ['node_modules/**']
 * });
 * 
 * watcher.on('filesChanged', ({ files }) => {
 *   console.log('Files changed:', files);
 * });
 * 
 * watcher.startWatching();
 */
export class FileWatcher extends EventEmitter {
  /**
   * Create a FileWatcher instance
   * 
   * @param {Object} [config={}] - Watcher configuration
   * @param {string[]} [config.extensions=['js','ts','json','yaml','yml']] - File extensions to watch
   * @param {string[]} [config.ignorePatterns] - Patterns to ignore
   * @param {number} [config.debounceDelay=300] - Debounce delay in milliseconds
   * @param {boolean} [config.verbose=false] - Enable verbose logging
   * @example
   * const watcher = new FileWatcher({
   *   extensions: ['ts', 'js'],
   *   debounceDelay: 500,
   *   ignorePatterns: ['**/*.test.ts']
   * });
   */
  constructor(config = {}) {
    super();
    this.config = this._mergeConfig(config);
    this.isWatching = false;
    this.debounceTimer = null;
    this.pendingChanges = new Set();
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.restartBackoffDelay = 1000; // Start with 1 second
    
    this._setupEventListeners();
  }

  /**
   * Merge user configuration with defaults
   * @param {Object} userConfig - User-provided configuration
   * @returns {Object} Merged configuration
   */
  _mergeConfig(userConfig) {
    const defaultConfig = {
      extensions: ['js', 'ts', 'json', 'yaml', 'yml'],
      ignorePatterns: [
        'node_modules/**',
        '.git/**',
        '.aws-sam/**',
        '**/*.test.js',
        '**/*.test.ts',
        '**/test/**',
        '**/tests/**',
        '**/.DS_Store',
        '**/coverage/**'
      ],
      debounceDelay: 300,
      verbose: false,
      exec: 'echo "File changed"',
      legacyWatch: false,
      polling: false
    };

    return {
      ...defaultConfig,
      ...userConfig,
      ignorePatterns: [
        ...defaultConfig.ignorePatterns,
        ...(userConfig.ignorePatterns || [])
      ]
    };
  }

  /**
   * Set up internal event listeners
   */
  _setupEventListeners() {
    // Handle nodemon events
    this.on('nodemonStart', () => {
      this.isWatching = true;
      this.restartAttempts = 0; // Reset restart attempts on successful start
      this.emit('watchingStarted', { config: this.config });
    });

    this.on('nodemonRestart', (files) => {
      this._handleFileChanges(files);
    });

    this.on('nodemonCrash', (error) => {
      this.emit('watcherError', { error, recoverable: true });
      this._attemptRestart();
    });

    this.on('nodemonExit', () => {
      this.isWatching = false;
      this.emit('watchingStopped');
    });
  }

  /**
   * Start watching for file changes
   * Configures and starts nodemon with the current configuration
   * 
   * @param {Object} [options={}] - Additional options for this watch session
   * @fires FileWatcher#watchingStarted
   * @fires FileWatcher#watcherError
   * @example
   * watcher.startWatching();
   * 
   * // With additional options
   * watcher.startWatching({ verbose: true });
   */
  startWatching(options = {}) {
    if (this.isWatching) {
      this.emit('watcherError', { 
        error: new Error('FileWatcher is already watching'), 
        recoverable: false 
      });
      return;
    }

    try {
      const watchConfig = {
        ...this.config,
        ...options,
        ext: this.config.extensions.join(' '),
        ignore: this.config.ignorePatterns
      };

      // Configure nodemon
      nodemon(watchConfig);

      // Set up nodemon event handlers with error handling
      nodemon.on('start', () => {
        this.emit('nodemonStart');
      });

      nodemon.on('restart', (files) => {
        try {
          this.emit('nodemonRestart', files || []);
        } catch (error) {
          this.emit('watcherError', { error, recoverable: true });
        }
      });

      nodemon.on('crash', () => {
        this.emit('nodemonCrash', new Error('Nodemon process crashed'));
      });

      nodemon.on('exit', () => {
        this.emit('nodemonExit');
      });

      nodemon.on('config:update', () => {
        this.emit('configUpdated', { config: this.config });
      });

    } catch (error) {
      this.emit('watcherError', { error, recoverable: false });
      throw error; // Re-throw for caller to handle
    }
  }

  /**
   * Stop watching for file changes and cleanup resources
   * Clears pending debounce timers and stops nodemon
   * 
   * @fires FileWatcher#watchingStopped
   * @fires FileWatcher#watcherError
   * @example
   * watcher.stopWatching();
   */
  stopWatching() {
    if (!this.isWatching) {
      return;
    }

    try {
      // Clear any pending debounce timer
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
      }

      // Stop nodemon
      nodemon.emit('quit');
      
      // Clean up
      this.pendingChanges.clear();
      this.isWatching = false;
      
      this.emit('watchingStopped');
    } catch (error) {
      this.emit('watcherError', { error, recoverable: false });
    }
  }

  /**
   * Add custom ignore patterns to the watcher
   * Restarts watching if currently active
   * 
   * @param {string|string[]} patterns - Ignore pattern(s) to add
   * @fires FileWatcher#ignorePatternAdded
   * @example
   * watcher.addIgnorePattern('**/*.log');
   * watcher.addIgnorePattern(['**/*.tmp', '**/*.cache']);
   */
  addIgnorePattern(patterns) {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    
    // Only add patterns that don't already exist
    const newPatterns = patternsArray.filter(pattern => 
      !this.config.ignorePatterns.includes(pattern)
    );
    
    if (newPatterns.length > 0) {
      this.config.ignorePatterns.push(...newPatterns);
      this.emit('ignorePatternAdded', { patterns: newPatterns });
      
      // If currently watching, restart with new patterns
      if (this.isWatching) {
        this._restartWatching();
      }
    }
  }

  /**
   * Remove ignore patterns
   * @param {string|Array} patterns - Ignore patterns to remove
   */
  removeIgnorePattern(patterns) {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    
    patternsArray.forEach(pattern => {
      const index = this.config.ignorePatterns.indexOf(pattern);
      if (index > -1) {
        this.config.ignorePatterns.splice(index, 1);
      }
    });
    
    this.emit('ignorePatternRemoved', { patterns: patternsArray });
    
    // If currently watching, restart with new patterns
    if (this.isWatching) {
      this._restartWatching();
    }
  }

  /**
   * Handle file changes with debouncing
   * @param {Array} files - Array of changed file paths
   */
  _handleFileChanges(files) {
    // Add files to pending changes
    files.forEach(file => this.pendingChanges.add(file));

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this._flushPendingChanges();
    }, this.config.debounceDelay);
  }

  /**
   * Flush pending changes immediately
   */
  _flushPendingChanges() {
    if (this.pendingChanges.size > 0) {
      const changedFiles = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      this.debounceTimer = null;
      
      this.emit('filesChanged', { files: changedFiles });
    }
  }

  /**
   * Force flush pending changes (useful for testing)
   */
  flushPendingChanges() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this._flushPendingChanges();
  }

  /**
   * Attempt to restart the watcher after a crash
   */
  _attemptRestart() {
    if (this.restartAttempts >= this.maxRestartAttempts) {
      this.emit('watcherError', { 
        error: new Error(`Maximum restart attempts (${this.maxRestartAttempts}) exceeded`), 
        recoverable: false 
      });
      return;
    }

    this.restartAttempts++;
    const delay = this.restartBackoffDelay * Math.pow(2, this.restartAttempts - 1); // Exponential backoff
    
    this.emit('watcherRestarting', { 
      attempt: this.restartAttempts, 
      maxAttempts: this.maxRestartAttempts,
      delay 
    });

    setTimeout(() => {
      if (!this.isWatching) {
        try {
          this.startWatching();
        } catch (error) {
          this.emit('watcherError', { error, recoverable: true });
          this._attemptRestart(); // Try again
        }
      }
    }, delay);
  }

  /**
   * Restart watching with current configuration
   */
  _restartWatching() {
    if (this.isWatching) {
      this.stopWatching();
      // Small delay to ensure clean shutdown
      setTimeout(() => {
        this.startWatching();
      }, 100);
    }
  }

  /**
   * Get current watcher configuration as a copy
   * 
   * @returns {Object} Current configuration object
   * @example
   * const config = watcher.getConfig();
   * console.log('Debounce delay:', config.debounceDelay);
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update watcher configuration
   * Restarts watching if currently active
   * 
   * @param {Object} newConfig - New configuration to merge with current config
   * @fires FileWatcher#configUpdated
   * @example
   * watcher.updateConfig({ debounceDelay: 500, verbose: true });
   */
  updateConfig(newConfig) {
    this.config = this._mergeConfig({ ...this.config, ...newConfig });
    this.emit('configUpdated', { config: this.config });
    
    // Restart if currently watching
    if (this.isWatching) {
      this._restartWatching();
    }
  }

  /**
   * Check if currently watching for file changes
   * 
   * @returns {boolean} True if watching is active
   * @example
   * if (watcher.isCurrentlyWatching()) {
   *   console.log('Watcher is active');
   * }
   */
  isCurrentlyWatching() {
    return this.isWatching;
  }

  /**
   * Get pending changes count
   * @returns {number} Number of pending file changes
   */
  getPendingChangesCount() {
    return this.pendingChanges.size;
  }

  /**
   * Reset restart attempts counter
   */
  resetRestartAttempts() {
    this.restartAttempts = 0;
    this.emit('restartAttemptsReset');
  }

  /**
   * Get restart status
   * @returns {Object} Restart status information
   */
  getRestartStatus() {
    return {
      attempts: this.restartAttempts,
      maxAttempts: this.maxRestartAttempts,
      canRestart: this.restartAttempts < this.maxRestartAttempts
    };
  }

  /**
   * Set maximum restart attempts
   * @param {number} maxAttempts - Maximum number of restart attempts
   */
  setMaxRestartAttempts(maxAttempts) {
    if (maxAttempts < 0) {
      throw new Error('Maximum restart attempts must be non-negative');
    }
    this.maxRestartAttempts = maxAttempts;
    this.emit('maxRestartAttemptsChanged', { maxAttempts });
  }
}