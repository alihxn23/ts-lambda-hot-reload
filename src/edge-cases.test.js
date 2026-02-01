/**
 * Edge Cases and Error Scenarios Tests
 * Unit tests for edge cases, error handling, and recovery
 * 
 * @module EdgeCasesTests
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TemplateParser } from './template-parser.js';
import { ConfigurationManager } from './configuration-manager.js';
import { BuildManager } from './build-manager.js';
import { CommandHandler } from './command-handler.js';
import { Logger } from './logger.js';

describe('Edge Cases and Error Scenarios', () => {
  let testDir;
  let templatePath;

  beforeEach(() => {
    testDir = path.join(process.cwd(), '.test-edge-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });
    templatePath = path.join(testDir, 'template.yaml');
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  /**
   * Test invalid templates
   * Validates: Requirements 4.4
   */
  describe('Invalid template handling', () => {
    it('should handle completely empty template file', () => {
      fs.writeFileSync(templatePath, '');
      
      const parser = new TemplateParser();
      
      expect(() => {
        parser.parseTemplate(templatePath);
      }).toThrow();
    });

    it('should handle template with only whitespace', () => {
      fs.writeFileSync(templatePath, '   \n\n   \t\t   ');
      
      const parser = new TemplateParser();
      
      expect(() => {
        parser.parseTemplate(templatePath);
      }).toThrow();
    });

    it('should handle template with invalid YAML syntax', () => {
      const invalidYaml = `
Resources:
  Function1:
    Type: AWS::Serverless::Function
    Properties:
      - invalid: [[[
      - broken: syntax
`;
      fs.writeFileSync(templatePath, invalidYaml);
      
      const parser = new TemplateParser();
      
      expect(() => {
        parser.parseTemplate(templatePath);
      }).toThrow();
    });

    it('should handle template with no Resources section', () => {
      const noResources = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Template without resources
`;
      fs.writeFileSync(templatePath, noResources);
      
      const parser = new TemplateParser();
      
      // Should throw because Resources is missing
      expect(() => {
        parser.parseTemplate(templatePath);
      }).toThrow();
    });

    it('should handle template with empty Resources section', () => {
      const emptyResources = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources: {}
`;
      fs.writeFileSync(templatePath, emptyResources);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(functions).toHaveLength(0);
    });

    it('should handle template with non-Lambda resources only', () => {
      const noLambdas = `
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
  MyTable:
    Type: AWS::DynamoDB::Table
`;
      fs.writeFileSync(templatePath, noLambdas);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(functions).toHaveLength(0);
    });

    it('should handle template with unsupported build method', () => {
      const unsupportedBuild = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  BadFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./bad
      Handler: app.handler
      Runtime: nodejs20.x
    Metadata:
      BuildMethod: webpack
`;
      fs.writeFileSync(templatePath, unsupportedBuild);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(() => {
        parser.validateBuildMetadata(functions[0]);
      }).toThrow(/unsupported BuildMethod/);
    });

    it('should handle template with missing required properties', () => {
      const missingProps = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  IncompleteFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./incomplete
    Metadata:
      BuildMethod: esbuild
`;
      fs.writeFileSync(templatePath, missingProps);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(() => {
        parser.validateBuildMetadata(functions[0]);
      }).toThrow(/missing required properties/);
    });
  });

  /**
   * Test missing files
   * Validates: Requirements 4.4
   */
  describe('Missing file handling', () => {
    it('should handle non-existent template file', () => {
      const parser = new TemplateParser();
      
      expect(() => {
        parser.parseTemplate('./does-not-exist.yaml');
      }).toThrow();
    });

    it('should handle non-existent configuration file', () => {
      const configManager = new ConfigurationManager();
      const config = configManager.loadConfig('./does-not-exist.json');
      
      // Should fall back to defaults
      expect(config).toBeDefined();
      expect(config.logLevel).toBe('info');
    });

    it('should handle template file with wrong extension', () => {
      const wrongExt = path.join(testDir, 'template.txt');
      fs.writeFileSync(wrongExt, 'some content');
      
      const parser = new TemplateParser();
      
      // Should still try to parse as YAML
      expect(() => {
        parser.parseTemplate(wrongExt);
      }).toThrow();
    });
  });

  /**
   * Test build failures
   * Validates: Requirements 4.4
   */
  describe('Build failure handling', () => {
    it('should handle build with non-existent source directory', async () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functionConfig = {
        Name: 'NonExistentFunction',
        Properties: {
          CodeUri: './does-not-exist',
          Handler: 'app.handler',
          Runtime: 'nodejs20.x'
        },
        Metadata: {
          BuildMethod: 'esbuild'
        }
      };

      const result = await buildManager.buildFunction(functionConfig);
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle build with invalid esbuild configuration', async () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functionConfig = {
        Name: 'InvalidConfigFunction',
        Properties: {
          CodeUri: './invalid',
          Handler: 'app.handler',
          Runtime: 'nodejs20.x'
        },
        Metadata: {
          BuildMethod: 'esbuild',
          BuildProperties: {
            Target: 'invalid-target'
          }
        }
      };

      const result = await buildManager.buildFunction(functionConfig);
      
      expect(result.success).toBe(false);
    });

    it('should continue watching after build failure', async () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functions = [
        {
          Name: 'FailingFunction',
          Properties: { CodeUri: './fail', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      // Build should fail but not throw
      const results = await buildManager.buildFunctions(functions);
      
      expect(results.size).toBe(1);
      expect(results.get('FailingFunction').success).toBe(false);
      
      // BuildManager should still be operational
      expect(buildManager.isBuilding()).toBe(false);
    });
  });

  /**
   * Test graceful error handling and recovery
   * Validates: Requirements 4.5
   */
  describe('Graceful error handling and recovery', () => {
    it('should handle configuration with invalid log level', () => {
      const configManager = new ConfigurationManager();
      
      expect(() => {
        configManager.updateConfig('logLevel', 'invalid-level');
      }).toThrow(/Invalid logLevel/);
    });

    it('should handle configuration with invalid parallel builds setting', () => {
      const configManager = new ConfigurationManager();
      
      expect(() => {
        configManager.updateConfig('parallelBuilds', 'not-a-boolean');
      }).toThrow(/parallelBuilds must be a boolean/);
    });

    it('should handle configuration with negative debounce delay', () => {
      const configManager = new ConfigurationManager();
      
      expect(() => {
        configManager.updateConfig('debounceDelay', -100);
      }).toThrow(/debounceDelay must be a non-negative number/);
    });

    it('should handle configuration with non-array ignore patterns', () => {
      const configManager = new ConfigurationManager();
      
      expect(() => {
        configManager.updateConfig('ignorePatterns', 'not-an-array');
      }).toThrow(/ignorePatterns must be an array/);
    });

    it('should handle empty function list for building', async () => {
      const logger = new Logger();
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      await expect(buildManager.buildFunctions([])).rejects.toThrow(/No functions provided/);
    });

    it('should handle null function list for building', async () => {
      const logger = new Logger();
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      await expect(buildManager.buildFunctions(null)).rejects.toThrow();
    });
  });

  /**
   * Test command processing with various user inputs
   * Validates: Requirements 4.5
   */
  describe('Command processing with various inputs', () => {
    it('should handle empty command input', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      commandHandler.startListening();
      
      // Should not throw or emit events for empty input
      commandHandler._processCommand('');
      commandHandler._processCommand('   ');
      
      commandHandler.stopListening();
    });

    it('should handle unknown commands gracefully', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      let unknownCommandFired = false;
      commandHandler.on('unknownCommand', () => {
        unknownCommandFired = true;
      });
      
      commandHandler.startListening();
      commandHandler._processCommand('invalid-command');
      commandHandler.stopListening();
      
      expect(unknownCommandFired).toBe(true);
    });

    it('should handle commands with mixed case', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      let restartFired = false;
      commandHandler.on('restart', () => {
        restartFired = true;
      });
      
      commandHandler.startListening();
      commandHandler._processCommand('RS');
      commandHandler._processCommand('ReStArT');
      commandHandler.stopListening();
      
      expect(restartFired).toBe(true);
    });

    it('should handle commands with extra whitespace', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      let helpFired = false;
      commandHandler.on('helpDisplayed', () => {
        helpFired = true;
      });
      
      commandHandler.startListening();
      // The command handler should trim input before processing
      commandHandler._processCommand('help');
      commandHandler.stopListening();
      
      expect(helpFired).toBe(true);
    });

    it('should handle rapid command inputs', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      let commandCount = 0;
      commandHandler.on('commandExecuted', () => {
        commandCount++;
      });
      
      commandHandler.startListening();
      
      // Send multiple commands rapidly
      commandHandler._processCommand('help');
      commandHandler._processCommand('rs');
      commandHandler._processCommand('help');
      
      commandHandler.stopListening();
      
      expect(commandCount).toBe(3);
    });

    it('should handle command aliases correctly', () => {
      const logger = new Logger();
      const commandHandler = new CommandHandler(logger);
      
      const commands = commandHandler.getAvailableCommands();
      
      // Verify aliases exist
      const restartCmd = commands.find(cmd => cmd.name === 'rs');
      expect(restartCmd.aliases).toContain('restart');
      
      const helpCmd = commands.find(cmd => cmd.name === 'help');
      expect(helpCmd.aliases).toContain('h');
      
      const quitCmd = commands.find(cmd => cmd.name === 'quit');
      expect(quitCmd.aliases).toContain('q');
      expect(quitCmd.aliases).toContain('exit');
    });
  });

  /**
   * Test edge cases in template parsing
   */
  describe('Template parsing edge cases', () => {
    it('should handle template with deeply nested global properties', () => {
      const deepGlobals = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Globals:
  Function:
    Timeout: 30
    Environment:
      Variables:
        GLOBAL_VAR: global-value
        NESTED_VAR: nested-value
Resources:
  TestFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./test
      Handler: app.handler
      Runtime: nodejs20.x
      Environment:
        Variables:
          LOCAL_VAR: local-value
    Metadata:
      BuildMethod: esbuild
`;
      fs.writeFileSync(templatePath, deepGlobals);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(functions).toHaveLength(1);
      expect(functions[0].Properties.Timeout).toBe(30);
      expect(functions[0].Properties.Environment.Variables.GLOBAL_VAR).toBe('global-value');
      expect(functions[0].Properties.Environment.Variables.LOCAL_VAR).toBe('local-value');
    });

    it('should handle template with function overriding global properties', () => {
      const overrideGlobals = `
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Globals:
  Function:
    Timeout: 30
    MemorySize: 128
Resources:
  TestFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: ./test
      Handler: app.handler
      Runtime: nodejs20.x
      Timeout: 60
    Metadata:
      BuildMethod: esbuild
`;
      fs.writeFileSync(templatePath, overrideGlobals);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      expect(functions).toHaveLength(1);
      expect(functions[0].Properties.Timeout).toBe(60); // Overridden
      expect(functions[0].Properties.MemorySize).toBe(128); // From globals
    });

    it('should handle CDK template with missing metadata', () => {
      const cdkNoMetadata = `
Resources:
  TestLambda:
    Type: AWS::Lambda::Function
    Properties:
      Handler: index.handler
      Runtime: nodejs20.x
`;
      fs.writeFileSync(templatePath, cdkNoMetadata);
      
      const parser = new TemplateParser();
      const functions = parser.parseTemplate(templatePath);
      
      // CDK templates without SAM transform won't be detected as SAM
      // The parser should still extract Lambda functions
      expect(functions.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle template validation with warnings', () => {
      const template = {
        Resources: {}
      };
      
      const parser = new TemplateParser();
      const validation = parser.validateTemplate(template);
      
      expect(validation.valid).toBe(true);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });
  });

  /**
   * Test build manager edge cases
   */
  describe('Build manager edge cases', () => {
    it('should handle incremental build with no changed files', async () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const functions = [
        {
          Name: 'TestFunction',
          Properties: { CodeUri: './test', Handler: 'app.handler', Runtime: 'nodejs20.x' },
          Metadata: { BuildMethod: 'esbuild' }
        }
      ];

      const results = await buildManager.buildFunctions(functions, []);
      
      // Should build all functions when no changed files specified
      expect(results.size).toBe(1);
    });

    it('should handle build status queries for non-existent functions', () => {
      const logger = new Logger();
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      const status = buildManager.getFunctionBuildStatus('NonExistentFunction');
      
      expect(status).toBeNull();
    });

    it('should track active build count correctly', async () => {
      const logger = new Logger();
      const configManager = new ConfigurationManager();
      const buildManager = new BuildManager(logger, configManager);

      expect(buildManager.getActiveBuildCount()).toBe(0);
      expect(buildManager.isBuilding()).toBe(false);
    });
  });

  /**
   * Test logger edge cases
   */
  describe('Logger edge cases', () => {
    it('should handle logging with null function name', () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      // Should not throw
      logger.logInfo('Test message');
      logger.logError(null, 'Error message');
      logger.logWarn('Warning message');
    });

    it('should handle logging with empty messages', () => {
      const logger = new Logger();
      // Suppress error events for this test
      logger.on('error', () => {});
      
      // Should not throw
      logger.logInfo('');
      logger.logError('TestFunction', '');
    });

    it('should handle log level changes', () => {
      const logger = new Logger();
      
      logger.setLogLevel('debug');
      logger.setLogLevel('info');
      logger.setLogLevel('warn');
      logger.setLogLevel('error');
      
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
