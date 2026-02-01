/**
 * Command Handler Module
 * Processes interactive user commands during runtime for manual control
 * 
 * @module CommandHandler
 * @extends EventEmitter
 * @fires CommandHandler#listenerStarted
 * @fires CommandHandler#listenerStopped
 * @fires CommandHandler#commandExecuted
 * @fires CommandHandler#unknownCommand
 * @fires CommandHandler#restart
 * @fires CommandHandler#helpDisplayed
 * @fires CommandHandler#quit
 * @fires CommandHandler#listenerClosed
 */
import { EventEmitter } from 'events';
import readline from 'readline';

/**
 * CommandHandler class for processing interactive user commands during runtime
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const logger = new Logger();
 * const commandHandler = new CommandHandler(logger);
 * 
 * // Listen for restart command
 * commandHandler.on('restart', () => {
 *   console.log('Rebuilding all functions...');
 * });
 * 
 * // Start listening for commands
 * commandHandler.startListening();
 */
export class CommandHandler extends EventEmitter {
  /**
   * Create a CommandHandler instance
   * 
   * @param {Logger} logger - Logger instance for output
   * @example
   * const logger = new Logger();
   * const handler = new CommandHandler(logger);
   */
  constructor(logger) {
    super();
    this.logger = logger;
    this.rl = null;
    this.isListening = false;
    this.commands = new Map();
    
    this._setupCommands();
  }

  /**
   * Set up available commands and their handlers
   */
  _setupCommands() {
    this.commands.set('rs', {
      aliases: ['restart'],
      description: 'Trigger a complete rebuild of all selected Lambda functions',
      handler: this._handleRestart.bind(this)
    });

    this.commands.set('help', {
      aliases: ['h'],
      description: 'Display available commands and their descriptions',
      handler: this._handleHelp.bind(this)
    });

    this.commands.set('quit', {
      aliases: ['q', 'exit'],
      description: 'Gracefully terminate the process and cleanup resources',
      handler: this._handleQuit.bind(this)
    });
  }

  /**
   * Start listening for user input commands from stdin
   * Activates the command listener and begins processing user input
   * 
   * @fires CommandHandler#listenerStarted
   * @example
   * commandHandler.startListening();
   * // User can now type commands like 'rs', 'help', or 'quit'
   */
  startListening() {
    if (this.isListening) {
      this.logger.logWarn('Command listener is already active');
      return;
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    this.rl.on('line', (input) => {
      this._processCommand(input.trim());
    });

    this.rl.on('close', () => {
      this.isListening = false;
      this.emit('listenerClosed');
    });

    this.isListening = true;
    this.emit('listenerStarted');
    this.logger.logInfo('Command listener activated. Type "help" for available commands.');
  }

  /**
   * Stop listening for user input commands and cleanup resources
   * Closes the readline interface and stops processing commands
   * 
   * @fires CommandHandler#listenerStopped
   * @example
   * commandHandler.stopListening();
   */
  stopListening() {
    if (!this.isListening || !this.rl) {
      return;
    }

    this.rl.close();
    this.rl = null;
    this.isListening = false;
    this.emit('listenerStopped');
  }

  /**
   * Check if command listener is currently active and processing input
   * 
   * @returns {boolean} True if listening for commands, false otherwise
   * @example
   * if (commandHandler.isActive()) {
   *   console.log('Command listener is running');
   * }
   */
  isActive() {
    return this.isListening;
  }

  /**
   * Process and validate user input commands
   * @param {string} input - Raw user input
   */
  _processCommand(input) {
    if (!input) {
      return;
    }

    const commandName = input.toLowerCase();
    
    // Find command by name or alias
    let command = null;
    let matchedName = null;

    for (const [name, cmd] of this.commands) {
      if (name === commandName || cmd.aliases.includes(commandName)) {
        command = cmd;
        matchedName = name;
        break;
      }
    }

    if (command) {
      this.logger.logInfo(`Executing command: ${matchedName}`);
      this.emit('commandExecuted', { command: matchedName, input });
      command.handler();
    } else {
      this.logger.logWarn(`Unknown command: ${input}. Type "help" for available commands.`);
      this.emit('unknownCommand', { input });
    }
  }

  /**
   * Handle restart command
   */
  _handleRestart() {
    this.logger.logInfo('Manual restart triggered');
    this.emit('restart');
  }

  /**
   * Handle help command
   */
  _handleHelp() {
    this.logger.logInfo('Available commands:');
    
    for (const [name, cmd] of this.commands) {
      const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
      this.logger.logInfo(`  ${name}${aliases} - ${cmd.description}`);
    }
    
    this.emit('helpDisplayed');
  }

  /**
   * Handle quit command
   */
  _handleQuit() {
    this.logger.logInfo('Graceful shutdown initiated');
    this.emit('quit');
  }

  /**
   * Get list of all available commands with their aliases and descriptions
   * 
   * @returns {Array<{name: string, aliases: string[], description: string}>} Array of command information objects
   * @example
   * const commands = commandHandler.getAvailableCommands();
   * commands.forEach(cmd => {
   *   console.log(`${cmd.name}: ${cmd.description}`);
   * });
   */
  getAvailableCommands() {
    return Array.from(this.commands.entries()).map(([name, cmd]) => ({
      name,
      aliases: cmd.aliases,
      description: cmd.description
    }));
  }
}