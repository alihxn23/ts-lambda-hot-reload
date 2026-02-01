/**
 * Property-based tests for Template Parser
 * **Feature: lambda-hot-reload-improvements, Property 9: Template parsing with global merging**
 * **Validates: Requirements 5.1**
 * **Feature: lambda-hot-reload-improvements, Property 10: CDK template parsing accuracy**
 * **Validates: Requirements 5.2**
 * **Feature: lambda-hot-reload-improvements, Property 11: Build metadata validation**
 * **Validates: Requirements 5.3**
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { TemplateParser } from './template-parser.js';

describe('TemplateParser Property Tests', () => {
  let templateParser;
  let tempFiles = [];

  beforeEach(() => {
    templateParser = new TemplateParser();
  });

  afterEach(() => {
    // Clean up temporary files
    tempFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    tempFiles = [];
  });

  /**
   * Property 9: Template parsing with global merging
   * For any SAM template with global properties, individual function properties should correctly inherit and override global settings
   */
  it('should correctly merge global properties with individual function properties', () => {
    fc.assert(fc.property(
      // Generate global function properties
      fc.record({
        Timeout: fc.integer({ min: 1, max: 900 }),
        MemorySize: fc.integer({ min: 128, max: 10240 }),
        Runtime: fc.constantFrom('nodejs18.x', 'nodejs20.x', 'python3.9', 'python3.11'),
        Environment: fc.record({
          Variables: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }),
            { maxKeys: 3 }
          )
        })
      }),
      // Generate individual function properties that may override globals
      fc.record({
        CodeUri: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
        Handler: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
        Runtime: fc.option(fc.constantFrom('nodejs18.x', 'nodejs20.x', 'python3.9', 'python3.11')),
        Timeout: fc.option(fc.integer({ min: 1, max: 900 })),
        MemorySize: fc.option(fc.integer({ min: 128, max: 10240 }))
      }),
      // Generate build metadata
      fc.record({
        BuildMethod: fc.constantFrom('esbuild', 'makefile'),
        BuildProperties: fc.record({
          Minify: fc.boolean(),
          Target: fc.constantFrom('es2020', 'es2022'),
          EntryPoints: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 3 })
        })
      }),
      (globalProps, functionProps, metadata) => {
        const functionName = 'TestFunction';
        
        // Create SAM template with globals and function
        const template = {
          AWSTemplateFormatVersion: '2010-09-09',
          Transform: 'AWS::Serverless-2016-10-31',
          Globals: {
            Function: globalProps
          },
          Resources: {
            [functionName]: {
              Type: 'AWS::Serverless::Function',
              Properties: functionProps,
              Metadata: metadata
            }
          }
        };

        const tempFile = path.join(process.cwd(), `test-template-${Date.now()}-${Math.random()}.yaml`);
        tempFiles.push(tempFile);

        try {
          // Write template file
          const yamlContent = YAML.stringify(template);
          fs.writeFileSync(tempFile, yamlContent, 'utf8');

          // Parse template
          const functions = templateParser.parseTemplate(tempFile);

          expect(functions).toHaveLength(1);
          const parsedFunction = functions[0];

          // Verify function name
          expect(parsedFunction.Name).toBe(functionName);

          // Verify global properties are inherited
          expect(parsedFunction.Properties.Timeout).toBe(
            functionProps.Timeout !== undefined ? functionProps.Timeout : globalProps.Timeout
          );
          expect(parsedFunction.Properties.MemorySize).toBe(
            functionProps.MemorySize !== undefined ? functionProps.MemorySize : globalProps.MemorySize
          );
          expect(parsedFunction.Properties.Runtime).toBe(
            functionProps.Runtime !== undefined ? functionProps.Runtime : globalProps.Runtime
          );

          // Verify individual properties are preserved
          expect(parsedFunction.Properties.CodeUri).toBe(functionProps.CodeUri);
          expect(parsedFunction.Properties.Handler).toBe(functionProps.Handler);

          // Verify metadata is preserved
          expect(parsedFunction.Metadata.BuildMethod).toBe(metadata.BuildMethod);
          expect(parsedFunction.Metadata.BuildProperties).toEqual(metadata.BuildProperties);

          // Verify environment variables are merged correctly
          if (globalProps.Environment && globalProps.Environment.Variables) {
            if (functionProps.Environment && functionProps.Environment.Variables) {
              // Function has its own environment variables
              expect(parsedFunction.Properties.Environment.Variables).toEqual(functionProps.Environment.Variables);
            } else {
              // Function should inherit global environment variables
              expect(parsedFunction.Properties.Environment).toBeDefined();
              expect(parsedFunction.Properties.Environment.Variables).toEqual(globalProps.Environment.Variables);
            }
          }

          return true;
        } catch (error) {
          console.log('Template parsing error:', error.message);
          return false;
        }
      }
    ), { numRuns: 100 });
  });

  it('should validate build metadata correctly', () => {
    fc.assert(fc.property(
      fc.record({
        BuildMethod: fc.option(fc.constantFrom('esbuild', 'makefile', 'unsupported')),
        BuildProperties: fc.option(fc.record({
          Minify: fc.boolean(),
          Target: fc.string({ minLength: 1, maxLength: 20 })
        }))
      }),
      (metadata) => {
        const functionConfig = {
          Name: 'TestFunction',
          Type: 'AWS::Serverless::Function',
          Properties: {
            CodeUri: 'test/',
            Handler: 'index.handler',
            Runtime: 'nodejs20.x'
          },
          Metadata: metadata.BuildMethod ? metadata : undefined
        };

        try {
          const isValid = templateParser.validateBuildMetadata(functionConfig);
          
          // If validation passes, metadata should be valid
          expect(functionConfig.Metadata).toBeDefined();
          expect(functionConfig.Metadata.BuildMethod).toBeDefined();
          expect(['esbuild', 'makefile']).toContain(functionConfig.Metadata.BuildMethod);
          expect(isValid).toBe(true);
          
          return true;
        } catch (error) {
          // If validation fails, metadata should be invalid
          const hasNoMetadata = !functionConfig.Metadata;
          const hasNoBuildMethod = functionConfig.Metadata && !functionConfig.Metadata.BuildMethod;
          const hasUnsupportedMethod = functionConfig.Metadata && 
            functionConfig.Metadata.BuildMethod && 
            !['esbuild', 'makefile'].includes(functionConfig.Metadata.BuildMethod);
          
          expect(hasNoMetadata || hasNoBuildMethod || hasUnsupportedMethod).toBe(true);
          return true;
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * Property 10: CDK template parsing accuracy
   * For any valid CDK-generated template, Lambda function configurations should be correctly extracted and parsed
   */
  it('should correctly parse CDK-generated templates and extract Lambda configurations', () => {
    fc.assert(fc.property(
      // Generate CDK Lambda function properties
      fc.record({
        Handler: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0')),
        Runtime: fc.constantFrom('nodejs18.x', 'nodejs20.x', 'python3.9', 'python3.11', 'python3.12'),
        Timeout: fc.integer({ min: 1, max: 900 }),
        MemorySize: fc.integer({ min: 128, max: 10240 }),
        Code: fc.oneof(
          fc.record({
            S3Bucket: fc.string({ minLength: 3, maxLength: 63 }).filter(s => /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(s)),
            S3Key: fc.string({ minLength: 1, maxLength: 50 }).filter(s => !s.includes('\0'))
          }),
          fc.record({
            ImageUri: fc.string({ minLength: 10, maxLength: 100 }).filter(s => s.includes(':'))
          })
        ),
        Environment: fc.option(fc.record({
          Variables: fc.dictionary(
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)),
            fc.string({ minLength: 1, maxLength: 50 }),
            { maxKeys: 3 }
          )
        }))
      }),
      // Generate CDK metadata
      fc.record({
        'aws:cdk:path': fc.string({ minLength: 10, maxLength: 100 }),
        BuildMethod: fc.constantFrom('esbuild', 'makefile'),
        BuildProperties: fc.option(fc.record({
          Minify: fc.boolean(),
          Target: fc.constantFrom('es2020', 'es2022')
        }))
      }),
      (functionProps, metadata) => {
        const functionName = 'TestCDKFunction';
        
        // Create CDK template with Lambda function
        const template = {
          AWSTemplateFormatVersion: '2010-09-09',
          Resources: {
            [functionName]: {
              Type: 'AWS::Lambda::Function',
              Properties: functionProps,
              Metadata: metadata
            }
          }
        };

        const tempFile = path.join(process.cwd(), `test-cdk-template-${Date.now()}-${Math.random()}.yaml`);
        tempFiles.push(tempFile);

        try {
          // Write template file
          const yamlContent = YAML.stringify(template);
          fs.writeFileSync(tempFile, yamlContent, 'utf8');

          // Parse template
          const functions = templateParser.parseTemplate(tempFile);

          expect(functions).toHaveLength(1);
          const parsedFunction = functions[0];

          // Verify function name
          expect(parsedFunction.Name).toBe(functionName);

          // Verify properties are correctly extracted
          expect(parsedFunction.Properties.Handler).toBe(functionProps.Handler);
          expect(parsedFunction.Properties.Runtime).toBe(functionProps.Runtime);
          expect(parsedFunction.Properties.Timeout).toBe(functionProps.Timeout);
          expect(parsedFunction.Properties.MemorySize).toBe(functionProps.MemorySize);

          // Verify CodeUri is constructed correctly
          if (functionProps.Code.S3Bucket) {
            expect(parsedFunction.Properties.CodeUri).toBe(
              `s3://${functionProps.Code.S3Bucket}/${functionProps.Code.S3Key}`
            );
          } else if (functionProps.Code.ImageUri) {
            expect(parsedFunction.Properties.CodeUri).toBe(functionProps.Code.ImageUri);
          }

          // Verify environment variables are preserved
          if (functionProps.Environment) {
            expect(parsedFunction.Properties.Environment).toEqual(functionProps.Environment);
          }

          // Verify metadata is preserved
          expect(parsedFunction.Metadata).toBeDefined();
          expect(parsedFunction.Metadata['aws:cdk:path']).toBe(metadata['aws:cdk:path']);
          expect(parsedFunction.Metadata.BuildMethod).toBe(metadata.BuildMethod);

          return true;
        } catch (error) {
          console.log('CDK template parsing error:', error.message);
          return false;
        }
      }
    ), { numRuns: 100 });
  });

  /**
   * Property 11: Build metadata validation
   * For any selected Lambda function, required build metadata should be validated before attempting to build
   */
  it('should validate required build metadata exists for selected functions', () => {
    fc.assert(fc.property(
      fc.record({
        Name: fc.string({ minLength: 1, maxLength: 50 }),
        Properties: fc.option(fc.record({
          Handler: fc.option(fc.string({ minLength: 1, maxLength: 50 })),
          Runtime: fc.option(fc.constantFrom('nodejs18.x', 'nodejs20.x', 'python3.9')),
          CodeUri: fc.string({ minLength: 1, maxLength: 50 })
        })),
        Metadata: fc.option(fc.record({
          BuildMethod: fc.option(fc.oneof(
            fc.constantFrom('esbuild', 'makefile'),
            fc.string({ minLength: 1, maxLength: 20 }).filter(s => !['esbuild', 'makefile'].includes(s))
          )),
          BuildProperties: fc.option(fc.record({
            Minify: fc.boolean()
          }))
        }))
      }),
      (functionConfig) => {
        try {
          const isValid = templateParser.validateBuildMetadata(functionConfig);
          
          // If validation passes, all required metadata must be present and valid
          expect(functionConfig.Metadata).toBeDefined();
          expect(functionConfig.Metadata.BuildMethod).toBeDefined();
          expect(['esbuild', 'makefile']).toContain(functionConfig.Metadata.BuildMethod);
          expect(functionConfig.Properties).toBeDefined();
          expect(functionConfig.Properties.Handler).toBeDefined();
          expect(functionConfig.Properties.Runtime).toBeDefined();
          expect(isValid).toBe(true);
          
          return true;
        } catch (error) {
          // If validation fails, check that the error is appropriate
          const hasNoMetadata = !functionConfig.Metadata;
          const hasNoBuildMethod = functionConfig.Metadata && !functionConfig.Metadata.BuildMethod;
          const hasUnsupportedMethod = functionConfig.Metadata && 
            functionConfig.Metadata.BuildMethod && 
            !['esbuild', 'makefile'].includes(functionConfig.Metadata.BuildMethod);
          const hasNoProperties = !functionConfig.Properties;
          const missingRequiredProps = functionConfig.Properties && 
            (!functionConfig.Properties.Handler || !functionConfig.Properties.Runtime);
          
          // Error should occur for one of these reasons
          const validError = hasNoMetadata || hasNoBuildMethod || hasUnsupportedMethod || 
                            hasNoProperties || missingRequiredProps;
          
          expect(validError).toBe(true);
          expect(error.message).toContain(functionConfig.Name);
          
          return true;
        }
      }
    ), { numRuns: 100 });
  });
});