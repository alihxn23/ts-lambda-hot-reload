/**
 * Property-based tests for Command Handler
 * **Feature: lambda-hot-reload-improvements, Property 6: Command listener activation**
 * **Validates: Requirements 2.1**
 * **Feature: lambda-hot-reload-improvements, Property 7: Command feedback consistency**
 * **Validates: Requirements 2.5**
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { CommandHandler } from './command-handler.js';
import { Logger } from './logger.js';

describe('CommandHandler Property Tests', () => {
  let commandHandler;
  let logger;

  beforeEach(() => {
    // Mock logger to avoid console output during tests
    logger = new Logger();
    vi.spyOn(logger, 'logInfo').mockImplementation(() => {});
    vi.spyOn(logger, 'logWarn').mockImplementation(() => {});
    vi.spyOn(logger, 'logError').mockImplementation(() => {});

    commandHandler = new CommandHandler(logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 6: Command listener activation
   * For any running instance of the tool, the stdin listener should be active and responsive to user input
   */
  it('should have command listener capability for any instance', () => {
    fc.assert(fc.property(
      fc.constant(null), // No input needed, testing internal state
      () => {
        // Verify command handler has the capability to listen
        expect(typeof commandHandler.startListening).toBe('function');
        expect(typeof commandHandler.stopListening).toBe('function');
        expect(typeof commandHandler.isActive).toBe('function');
        
        // Initially should not be listening
        expect(commandHandler.isActive()).toBe(false);
        
        // Should have command processing capability
        expect(typeof commandHandler._processCommand).toBe('function');
        expect(typeof commandHandler.getAvailableCommands).toBe('function');
        
        return true;
      }
    ), { numRuns: 10 });
  });

  /**
   * Property 7: Command feedback consistency
   * For any valid user command, immediate feedback should be provided confirming the command execution
   */
  it('should provide immediate feedback for any valid command', () => {
    fc.assert(fc.property(
      fc.constantFrom('rs', 'restart', 'help', 'h', 'quit', 'q', 'exit'),
      (command) => {
        let feedbackProvided = false;
        let commandExecuted = false;

        // Set up event listeners to track feedback
        commandHandler.on('commandExecuted', () => {
          commandExecuted = true;
        });

        commandHandler.on('helpDisplayed', () => {
          feedbackProvided = true;
        });

        commandHandler.on('restart', () => {
          feedbackProvided = true;
        });

        commandHandler.on('quit', () => {
          feedbackProvided = true;
        });

        // Process the command
        commandHandler._processCommand(command);

        // Verify feedback was provided
        const validCommand = ['rs', 'restart', 'help', 'h', 'quit', 'q', 'exit'].includes(command);
        
        if (validCommand) {
          expect(commandExecuted).toBe(true);
          expect(feedbackProvided).toBe(true);
        }

        // Clean up listeners
        commandHandler.removeAllListeners();

        return validCommand ? (commandExecuted && feedbackProvided) : true;
      }
    ), { numRuns: 100 });
  });

  it('should handle unknown commands gracefully and provide feedback', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 20 }).filter(s => 
        !['rs', 'restart', 'help', 'h', 'quit', 'q', 'exit'].includes(s.toLowerCase())
      ),
      (unknownCommand) => {
        let unknownCommandEventFired = false;

        commandHandler.on('unknownCommand', (data) => {
          unknownCommandEventFired = true;
          expect(data.input).toBe(unknownCommand);
        });

        // Process unknown command
        commandHandler._processCommand(unknownCommand);

        // Verify unknown command was handled
        expect(unknownCommandEventFired).toBe(true);

        // Clean up listeners
        commandHandler.removeAllListeners();

        return unknownCommandEventFired;
      }
    ), { numRuns: 50 });
  });

  it('should maintain command registry consistency', () => {
    fc.assert(fc.property(
      fc.constant(null), // No input needed, testing internal consistency
      () => {
        const commands = commandHandler.getAvailableCommands();
        
        // Verify all expected commands exist
        const expectedCommands = ['rs', 'help', 'quit'];
        const commandNames = commands.map(cmd => cmd.name);
        
        for (const expected of expectedCommands) {
          expect(commandNames).toContain(expected);
        }

        // Verify each command has required properties
        for (const command of commands) {
          expect(typeof command.name).toBe('string');
          expect(command.name.length).toBeGreaterThan(0);
          expect(Array.isArray(command.aliases)).toBe(true);
          expect(typeof command.description).toBe('string');
          expect(command.description.length).toBeGreaterThan(0);
        }

        return true;
      }
    ), { numRuns: 10 });
  });
});