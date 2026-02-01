#!/usr/bin/env node
/**
 * Lambda Hot-Reload Tool
 * Entry point for the modular hot-reload CLI application
 */
import { CLI } from './src/cli.js';
import { CommandHandler } from './src/command-handler.js';
import { execFile } from 'child_process';
import { buildSync } from 'esbuild';
import nodemon from 'nodemon';
import { exit } from 'process';
import path from 'path';

const artifacts_directory = `${process.cwd()}/.aws-sam/build`;

// Initialize CLI application
const cli = new CLI();
let commandHandler = null;

// Build function implementation
function buildTheThings(functionsToBuild, logger) {
  for (let f of functionsToBuild) {
    const { BuildMethod: buildMethod, BuildProperties: buildProperties = {} } = f.Metadata ?? {};

    logger.logBuildStart(f.Name);
    const startTime = Date.now();

    try {
      if (buildMethod === 'esbuild') {
        // Convert keys to camelCase
        let buildProps = {};
        Object.keys(buildProperties).forEach((k) => {
          buildProps[k.charAt(0).toLowerCase() + k.slice(1)] = buildProperties[k];
        });
        
        const entryPoints = Array.isArray(buildProps.entryPoints) && buildProps.entryPoints.length
          ? buildProps.entryPoints
          : ['app.ts'];
        
        buildSync({
          ...buildProps,
          entryPoints: entryPoints.map((e) => path.join(f.Properties.CodeUri, e)),
          outdir: path.join(artifacts_directory, f.Name),
        });
        
        const duration = Date.now() - startTime;
        logger.logBuildComplete(f.Name, true, duration);
      } else if (buildMethod === 'makefile') {
        execFile(
          'make',
          [`build-${f.Name}`],
          { env: { ...process.env, ARTIFACTS_DIR: path.join(artifacts_directory, f.Name) } },
          (err, stdout, stderr) => {
            const duration = Date.now() - startTime;
            if (err) {
              logger.logError(f.Name, `Build failed: ${stderr || err.message}`);
              logger.logBuildComplete(f.Name, false, duration);
            } else {
              logger.logBuild(f.Name, `Make output: ${stdout}`);
              logger.logBuildComplete(f.Name, true, duration);
            }
          }
        );
      } else {
        logger.logError(f.Name, `Unsupported build method: ${buildMethod}`);
        logger.logBuildComplete(f.Name, false, Date.now() - startTime);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.logError(f.Name, `Build failed: ${error.message}`);
      logger.logBuildComplete(f.Name, false, duration);
    }
  }
}

// Main execution
async function main() {
  try {
    const selectedFunctions = await cli.run();
    const logger = cli.getLogger();
    
    // Initialize command handler
    commandHandler = new CommandHandler(logger);
    
    // Set up command handler events
    commandHandler.on('restart', () => {
      logger.logInfo('Manual restart triggered - rebuilding all functions');
      buildTheThings(selectedFunctions, logger);
    });

    commandHandler.on('quit', () => {
      logger.logInfo('Shutting down hot-reload watcher...');
      commandHandler.stopListening();
      nodemon.emit('quit');
      exit(0);
    });

    // Start command handler
    commandHandler.startListening();
    
    // Start nodemon with improved configuration
    nodemon({ 
      exec: 'echo', 
      ext: 'js ts',
      ignore: ['node_modules/**', '.git/**', '.aws-sam/**']
    });

    nodemon.on('start', () => {
      logger.logInfo('Hot-reload watcher started');
      buildTheThings(selectedFunctions, logger);
    });

    nodemon.on('restart', (files) => {
      logger.logInfo(`Files changed: ${files.join(', ')}`);
      buildTheThings(selectedFunctions, logger);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.logInfo('Shutting down hot-reload watcher...');
      if (commandHandler) {
        commandHandler.stopListening();
      }
      nodemon.emit('quit');
      exit(0);
    });

  } catch (error) {
    console.error('Failed to start hot-reload tool:', error.message);
    exit(1);
  }
}

main();
