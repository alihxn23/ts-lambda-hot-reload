# CommandHandler Usage Guide

## Overview

The CommandHandler provides interactive runtime control for the Lambda Hot-Reload Tool. It allows users to manually trigger rebuilds, view help information, and gracefully shutdown the tool without restarting the entire process.

## Integration

The CommandHandler is integrated into the main application (`index.js`) and provides the following functionality:

### Available Commands

1. **Restart Commands**: `rs`, `restart`
   - Triggers a complete rebuild of all selected Lambda functions
   - Useful when you want to force a rebuild without file changes
   - Example: Type `rs` and press Enter

2. **Help Commands**: `help`, `h`
   - Displays all available commands with descriptions
   - Shows command aliases
   - Example: Type `help` and press Enter

3. **Quit Commands**: `quit`, `q`, `exit`
   - Gracefully terminates the hot-reload process
   - Cleans up resources and file watchers
   - Example: Type `quit` and press Enter

## How It Works

When you run the Lambda Hot-Reload Tool:

1. The tool starts and prompts you to select Lambda functions to watch
2. After selection, the CommandHandler starts listening for user input
3. You can type commands at any time while the tool is running
4. The tool continues to watch for file changes AND responds to your commands

## Example Session

```bash
$ npx ts-lambda-hot-reload

# Select your functions...
✔ Which functions do you want to watch for hot-reload? › HelloWorldFunction

# Tool starts watching
2025-01-31T19:24:13.000Z Hot-reload watcher started
2025-01-31T19:24:13.000Z Command listener activated. Type "help" for available commands.

# You can now type commands:
help
2025-01-31T19:24:15.000Z Available commands:
2025-01-31T19:24:15.000Z   rs (restart) - Trigger a complete rebuild of all selected Lambda functions
2025-01-31T19:24:15.000Z   help (h) - Display available commands and their descriptions
2025-01-31T19:24:15.000Z   quit (q, exit) - Gracefully terminate the process and cleanup resources

# Trigger a manual rebuild:
rs
2025-01-31T19:24:20.000Z Executing command: rs
2025-01-31T19:24:20.000Z Manual restart triggered - rebuilding all functions

# Exit gracefully:
quit
2025-01-31T19:24:25.000Z Executing command: quit
2025-01-31T19:24:25.000Z Graceful shutdown initiated
2025-01-31T19:24:25.000Z Shutting down hot-reload watcher...
```

## Event-Driven Architecture

The CommandHandler uses Node.js EventEmitter to integrate with the main application:

```javascript
// Initialize command handler
commandHandler = new CommandHandler(logger);

// Listen for restart events
commandHandler.on('restart', () => {
  logger.logInfo('Manual restart triggered - rebuilding all functions');
  buildTheThings(selectedFunctions, logger);
});

// Listen for quit events
commandHandler.on('quit', () => {
  logger.logInfo('Shutting down hot-reload watcher...');
  commandHandler.stopListening();
  nodemon.emit('quit');
  exit(0);
});

// Start listening for user input
commandHandler.startListening();
```

## Testing

You can test the CommandHandler integration using the test script:

```bash
node test-restart-integration.js
```

This will start a simple test environment where you can try all the commands and see the events being fired.

## Requirements Satisfied

The CommandHandler implementation satisfies the following requirements:

- **Requirement 2.1**: Command listener is active and responsive to user input
- **Requirement 2.2**: "rs" and "restart" commands trigger complete rebuilds
- **Requirement 2.3**: "help" and "h" commands display available commands
- **Requirement 2.4**: "quit" and "q" commands gracefully terminate the process
- **Requirement 2.5**: All commands provide immediate feedback

## Property-Based Testing

The CommandHandler includes comprehensive property-based tests that verify:

- **Property 6**: Command listener activation for any running instance
- **Property 7**: Command feedback consistency for all valid commands

Run the tests with:

```bash
npm test -- src/command-handler.test.js
```
