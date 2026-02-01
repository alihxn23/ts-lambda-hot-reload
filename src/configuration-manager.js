/**
 * Configuration Manager Module
 * Handles loading, validation, and management of configuration settings
 * 
 * @module ConfigurationManager
 * @extends EventEmitter
 * @fires ConfigurationManager#configLoaded
 * @fires ConfigurationManager#configNotFound
 * @fires ConfigurationManager#configError
 * @fires ConfigurationManager#configSaved
 * @fires ConfigurationManager#configSaveError
 * @fires ConfigurationManager#configUpdated
 */
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { EventEmitter } from 'events';

/**
 * ConfigurationManager class for managing application configuration
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const configManager = new ConfigurationManager();
 * 
 * configManager.on('configLoaded', ({ config }) => {
 *   console.log('Configuration loaded:', config);
 * });
 * 
 * configManager.loadConfig('./lambda-hot-reload.json');
 */
export class ConfigurationManager extends EventEmitter {
  /**
   * Create a ConfigurationManager instance
   * Initializes with default configuration settings
   * 
   * @example
   * const configManager = new ConfigurationManager();
   */
  constructor() {
    super();
    this.config = this._getDefaultConfig();
  }

  /**
   * Get default configuration settings
   * @returns {Object} Default configuration
   */
  _getDefaultConfig() {
    return {
      templatePath: './template.yaml',
      defaultFunctions: [],
      ignorePatterns: ['node_modules/**', '.git/**', '.aws-sam/**'],
      buildSettings: {},
      logLevel: 'info',
      parallelBuilds: true,
      debounceDelay: 300
    };
  }

  /**
   * Load configuration from file (JSON or YAML format)
   * Falls back to default configuration if file doesn't exist or is invalid
   * 
   * @param {string} configPath - Path to configuration file
   * @returns {Object} Loaded configuration object
   * @fires ConfigurationManager#configLoaded
   * @fires ConfigurationManager#configNotFound
   * @fires ConfigurationManager#configError
   * @example
   * const config = configManager.loadConfig('./lambda-hot-reload.json');
   * console.log('Template path:', config.templatePath);
   */
  loadConfig(configPath) {
    const previousConfig = this.config;
    try {
      if (!fs.existsSync(configPath)) {
        this.emit('configNotFound', { path: configPath });
        return this.config;
      }

      const fileContent = fs.readFileSync(configPath, 'utf8');
      const ext = path.extname(configPath).toLowerCase();
      
      let loadedConfig;
      if (ext === '.json') {
        loadedConfig = JSON.parse(fileContent);
      } else if (ext === '.yaml' || ext === '.yml') {
        loadedConfig = YAML.parse(fileContent);
      } else {
        throw new Error(`Unsupported configuration file format: ${ext}`);
      }

      this.config = { ...previousConfig, ...loadedConfig };
      this.validateConfig();
      this.emit('configLoaded', { config: this.config, path: configPath });
      
      return this.config;
    } catch (error) {
      this.config = previousConfig;
      this.emit('configError', { error, path: configPath });
      console.warn(`Failed to load configuration from ${configPath}: ${error.message}`);
      console.warn('Falling back to default configuration');
      return this.config;
    }
  }

  /**
   * Validate configuration settings
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(this.config.logLevel)) {
      throw new Error(`Invalid logLevel: ${this.config.logLevel}. Must be one of: ${validLogLevels.join(', ')}`);
    }

    if (typeof this.config.parallelBuilds !== 'boolean') {
      throw new Error('parallelBuilds must be a boolean value');
    }

    if (typeof this.config.debounceDelay !== 'number' || this.config.debounceDelay < 0) {
      throw new Error('debounceDelay must be a non-negative number');
    }

    if (!Array.isArray(this.config.ignorePatterns)) {
      throw new Error('ignorePatterns must be an array');
    }

    if (!Array.isArray(this.config.defaultFunctions)) {
      throw new Error('defaultFunctions must be an array');
    }
  }

  /**
   * Get current configuration as a copy
   * Returns a shallow copy to prevent external modifications
   * 
   * @returns {Object} Current configuration object
   * @example
   * const config = configManager.getConfig();
   * console.log('Parallel builds:', config.parallelBuilds);
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Save configuration to file (JSON or YAML format based on extension)
   * 
   * @param {string} configPath - Path to save configuration file
   * @param {Object} [config=this.config] - Configuration object to save
   * @throws {Error} If file cannot be written or format is unsupported
   * @fires ConfigurationManager#configSaved
   * @fires ConfigurationManager#configSaveError
   * @example
   * configManager.saveConfig('./lambda-hot-reload.json');
   */
  saveConfig(configPath, config = this.config) {
    try {
      const ext = path.extname(configPath).toLowerCase();
      let content;
      
      if (ext === '.json') {
        content = JSON.stringify(config, null, 2);
      } else if (ext === '.yaml' || ext === '.yml') {
        content = YAML.stringify(config);
      } else {
        throw new Error(`Unsupported configuration file format: ${ext}`);
      }

      fs.writeFileSync(configPath, content, 'utf8');
      this.emit('configSaved', { config, path: configPath });
    } catch (error) {
      this.emit('configSaveError', { error, path: configPath });
      throw error;
    }
  }

  /**
   * Update a configuration setting and validate the new configuration
   * 
   * @param {string} key - Configuration key to update
   * @param {*} value - New value for the configuration key
   * @throws {Error} If validation fails after update
   * @fires ConfigurationManager#configUpdated
   * @example
   * configManager.updateConfig('logLevel', 'debug');
   * configManager.updateConfig('parallelBuilds', false);
   */
  updateConfig(key, value) {
    const previousConfig = this.config;
    this.config = { ...this.config, [key]: value };
    try {
      this.validateConfig();
      this.emit('configUpdated', { key, value });
    } catch (error) {
      this.config = previousConfig;
      throw error;
    }
  }

  /**
   * Get a configuration value by key with optional default
   * 
   * @param {string} key - Configuration key to retrieve
   * @param {*} [defaultValue=undefined] - Default value if key doesn't exist
   * @returns {*} Configuration value or default value
   * @example
   * const logLevel = configManager.get('logLevel', 'info');
   * const customSetting = configManager.get('customKey', 'defaultValue');
   */
  get(key, defaultValue = undefined) {
    return this.config[key] !== undefined ? this.config[key] : defaultValue;
  }
}