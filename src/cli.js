/**
 * CLI Interface Module
 * Main entry point that orchestrates all components using event-driven architecture
 * 
 * @module CLI
 * @extends EventEmitter
 * @fires CLI#initialized
 * @fires CLI#initializationError
 * @fires CLI#ready
 * @fires CLI#error
 */
import { EventEmitter } from 'events';
import { checkbox } from '@inquirer/prompts';
import { TemplateParser } from './template-parser.js';
import { ConfigurationManager } from './configuration-manager.js';
import { Logger } from './logger.js';

/**
 * CLI class that orchestrates the Lambda hot-reload tool
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const cli = new CLI();
 * 
 * cli.on('ready', ({ functions }) => {
 *   console.log(`Watching ${functions.length} functions`);
 * });
 * 
 * await cli.run();
 */
export class CLI extends EventEmitter {
  /**
   * Create a CLI instance
   * Initializes configuration manager, template parser, and logger
   * 
   * @example
   * const cli = new CLI();
   */
  constructor() {
    super();
    this.configManager = new ConfigurationManager();
    this.templateParser = new TemplateParser();
    this.logger = new Logger();
    this.selectedFunctions = [];
    
    this._setupEventListeners();
  }

  /**
   * Set up event listeners for inter-component communication
   */
  _setupEventListeners() {
    // Configuration events
    this.configManager.on('configLoaded', (data) => {
      this.logger.setLogLevel(data.config.logLevel);
      this.logger.logInfo(`Configuration loaded from ${data.path}`);
    });

    this.configManager.on('configError', (data) => {
      this.logger.logError(null, `Configuration error: ${data.error.message}`);
    });

    // Template parser events
    this.templateParser.on('templateParsed', (data) => {
      this.logger.logInfo(`Parsed template: ${data.templatePath}, found ${data.functions.length} functions`);
    });

    this.templateParser.on('parseError', (data) => {
      this.logger.logError(null, `Template parse error: ${data.error.message}`);
    });

    this.templateParser.on('validationError', (data) => {
      this.logger.logError(data.function, `Validation error: ${data.error.message}`);
    });
  }

  /**
   * Initialize the CLI application
   * Loads configuration, parses template, and presents function selection interface
   * 
   * @param {Object} [options={}] - CLI initialization options
   * @param {string} [options.config] - Path to configuration file
   * @returns {Promise<Array>} Promise resolving to array of selected Lambda functions
   * @throws {Error} If initialization fails (no valid functions, template errors, etc.)
   * @fires CLI#initialized
   * @fires CLI#initializationError
   * @example
   * const cli = new CLI();
   * const functions = await cli.initialize({ config: './my-config.json' });
   * console.log(`Selected ${functions.length} functions`);
   */
  async initialize(options = {}) {
    try {
      // Load configuration
      const configPath = options.config || './lambda-hot-reload.json';
      this.configManager.loadConfig(configPath);
      
      // Parse template
      const templatePath = this.configManager.get('templatePath');
      const functions = this.templateParser.parseTemplate(templatePath);
      const validFunctions = this.templateParser.extractFunctions(functions);

      if (validFunctions.length === 0) {
        throw new Error('No valid Lambda functions found in template');
      }

      // Select functions to watch
      await this._selectFunctions(validFunctions);
      
      this.emit('initialized', { 
        functions: this.selectedFunctions,
        config: this.configManager.getConfig()
      });

      return this.selectedFunctions;
    } catch (error) {
      this.logger.logError(null, `Initialization failed: ${error.message}`);
      this.emit('initializationError', { error });
      throw error;
    }
  }

  /**
   * Present function selection interface to user
   * @param {Array} functions - Available Lambda functions
   */
  async _selectFunctions(functions) {
    const defaultFunctions = this.configManager.get('defaultFunctions', []);
    
    const choices = functions.map(func => ({
      value: func.Name,
      checked: defaultFunctions.includes(func.Name)
    }));

    const selectedNames = await checkbox({
      message: 'Which functions do you want to watch for hot-reload?',
      choices,
      required: true
    });

    this.selectedFunctions = functions.filter(func => 
      selectedNames.includes(func.Name)
    );

    this.logger.logInfo(`Selected ${this.selectedFunctions.length} functions for hot-reload`);
  }

  /**
   * Get selected Lambda functions
   * Returns a copy of the selected functions array
   * 
   * @returns {Array<Object>} Array of selected Lambda function configurations
   * @example
   * const functions = cli.getSelectedFunctions();
   * functions.forEach(func => {
   *   console.log(`Function: ${func.Name}`);
   * });
   */
  getSelectedFunctions() {
    return [...this.selectedFunctions];
  }

  /**
   * Get configuration manager instance
   * Provides access to the configuration manager for reading/updating settings
   * 
   * @returns {ConfigurationManager} Configuration manager instance
   * @example
   * const configManager = cli.getConfigManager();
   * const logLevel = configManager.get('logLevel');
   */
  getConfigManager() {
    return this.configManager;
  }

  /**
   * Get template parser instance
   * Provides access to the template parser for parsing SAM/CDK templates
   * 
   * @returns {TemplateParser} Template parser instance
   * @example
   * const parser = cli.getTemplateParser();
   * const functions = parser.parseTemplate('./template.yaml');
   */
  getTemplateParser() {
    return this.templateParser;
  }

  /**
   * Get logger instance
   * Provides access to the logger for custom logging
   * 
   * @returns {Logger} Logger instance
   * @example
   * const logger = cli.getLogger();
   * logger.logInfo('Custom message');
   */
  getLogger() {
    return this.logger;
  }

  /**
   * Run the CLI application
   * Initializes and starts the hot-reload tool
   * 
   * @param {Object} [options={}] - CLI options
   * @param {string} [options.config] - Path to configuration file
   * @returns {Promise<Array>} Promise resolving to array of selected Lambda functions
   * @fires CLI#ready
   * @fires CLI#error
   * @example
   * const cli = new CLI();
   * await cli.run({ config: './lambda-hot-reload.json' });
   */
  async run(options = {}) {
    try {
      await this.initialize(options);
      this.emit('ready', { functions: this.selectedFunctions });
      return this.selectedFunctions;
    } catch (error) {
      this.emit('error', { error });
      process.exit(1);
    }
  }
}