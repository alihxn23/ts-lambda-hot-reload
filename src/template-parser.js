/**
 * Template Parser Module
 * Handles parsing of SAM and CDK templates to extract Lambda function configurations
 * 
 * @module TemplateParser
 * @extends EventEmitter
 * @fires TemplateParser#templateParsed
 * @fires TemplateParser#parseError
 * @fires TemplateParser#validationError
 */
import fs from 'fs';
import YAML from 'yaml';
import { EventEmitter } from 'events';

/**
 * TemplateParser class for parsing SAM and CDK templates
 * 
 * @class
 * @extends EventEmitter
 * @example
 * const parser = new TemplateParser();
 * 
 * parser.on('templateParsed', ({ functions, templateType }) => {
 *   console.log(`Found ${functions.length} functions in ${templateType} template`);
 * });
 * 
 * const functions = parser.parseTemplate('./template.yaml');
 */
export class TemplateParser extends EventEmitter {
  /**
   * Create a TemplateParser instance
   * 
   * @example
   * const parser = new TemplateParser();
   */
  constructor() {
    super();
  }

  /**
   * Parse a SAM or CDK template file and extract Lambda functions
   * Automatically detects template format and applies appropriate parsing logic
   * 
   * @param {string} [templatePath='./template.yaml'] - Path to the template file
   * @returns {Array<Object>} Array of Lambda function configurations
   * @throws {Error} If template cannot be read or parsed
   * @fires TemplateParser#templateParsed
   * @fires TemplateParser#parseError
   * @example
   * const parser = new TemplateParser();
   * const functions = parser.parseTemplate('./template.yaml');
   * functions.forEach(func => {
   *   console.log(`Function: ${func.Name}, Runtime: ${func.Properties.Runtime}`);
   * });
   */
  parseTemplate(templatePath = './template.yaml') {
    try {
      const file = fs.readFileSync(templatePath, 'utf8');
      const yaml = YAML.parse(file, { logLevel: 'error' });
      
      // Auto-detect template format
      const templateType = this._detectTemplateType(yaml);
      
      let functions = [];
      if (templateType === 'SAM') {
        functions = this._parseSAMTemplate(yaml);
      } else if (templateType === 'CDK') {
        functions = this._parseCDKTemplate(yaml);
      } else {
        throw new Error('Unsupported template format. Expected SAM or CDK template.');
      }

      this.emit('templateParsed', { functions, templatePath, templateType });
      return functions;
    } catch (error) {
      this.emit('parseError', { error, templatePath });
      throw new Error(`Failed to parse template ${templatePath}: ${error.message}`);
    }
  }

  /**
   * Auto-detect template type (SAM or CDK)
   * @param {Object} template - Parsed template object
   * @returns {string} Template type: 'SAM' or 'CDK'
   */
  _detectTemplateType(template) {
    // SAM templates have Transform: AWS::Serverless-2016-10-31
    if (template.Transform && 
        (template.Transform === 'AWS::Serverless-2016-10-31' || 
         (Array.isArray(template.Transform) && template.Transform.includes('AWS::Serverless-2016-10-31')))) {
      return 'SAM';
    }

    // CDK templates have specific metadata
    if (template.Resources) {
      const resources = Object.values(template.Resources);
      // Check for CDK-specific patterns
      const hasCDKMetadata = resources.some(resource => 
        resource.Metadata && 
        (resource.Metadata['aws:cdk:path'] || resource.Metadata['aws:asset:path'])
      );
      
      if (hasCDKMetadata) {
        return 'CDK';
      }
    }

    // Default to SAM if we can't determine
    return 'SAM';
  }

  /**
   * Parse SAM template and extract Lambda functions
   * @param {Object} template - Parsed SAM template
   * @returns {Array} Array of Lambda function configurations
   */
  _parseSAMTemplate(template) {
    const functions = [];
    const globals = template.Globals?.Function || {};
    
    Object.entries(template.Resources).forEach(([name, resource]) => {
      if (resource.Type === 'AWS::Serverless::Function') {
        // Merge global properties with function-specific properties
        const mergedFunction = this._mergeGlobalProperties(resource, globals);
        functions.push({ 
          ...mergedFunction, 
          Name: name 
        });
      }
    });

    return functions;
  }

  /**
   * Parse CDK template and extract Lambda functions
   * @param {Object} template - Parsed CDK template
   * @returns {Array} Array of Lambda function configurations
   */
  _parseCDKTemplate(template) {
    const functions = [];
    
    if (!template.Resources) {
      return functions;
    }

    Object.entries(template.Resources).forEach(([name, resource]) => {
      // CDK generates AWS::Lambda::Function resources
      if (resource.Type === 'AWS::Lambda::Function') {
        // Convert CDK Lambda function to SAM-like format
        const samLikeFunction = {
          Type: 'AWS::Serverless::Function',
          Name: name,
          Properties: {
            CodeUri: resource.Properties?.Code?.S3Bucket ? 
              `s3://${resource.Properties.Code.S3Bucket}/${resource.Properties.Code.S3Key}` :
              resource.Properties?.Code?.ImageUri || './src',
            Handler: resource.Properties?.Handler || 'index.handler',
            Runtime: resource.Properties?.Runtime || 'nodejs20.x',
            Timeout: resource.Properties?.Timeout,
            MemorySize: resource.Properties?.MemorySize,
            Environment: resource.Properties?.Environment
          },
          Metadata: resource.Metadata || {}
        };

        functions.push(samLikeFunction);
      }
      
      // Also support AWS::Serverless::Function in CDK templates
      if (resource.Type === 'AWS::Serverless::Function') {
        functions.push({ 
          ...resource, 
          Name: name 
        });
      }
    });

    return functions;
  }

  /**
   * Merge global function properties with individual function properties
   * Function-specific properties override global properties
   * Nested objects like Environment are merged deeply
   * @param {Object} functionResource - Individual function resource
   * @param {Object} globals - Global function properties
   * @returns {Object} Merged function configuration
   */
  _mergeGlobalProperties(functionResource, globals) {
    const merged = JSON.parse(JSON.stringify(functionResource));
    
    if (!globals || Object.keys(globals).length === 0) {
      return merged;
    }

    // Deep merge properties with function properties taking precedence
    merged.Properties = this._deepMerge(globals, merged.Properties || {});

    return merged;
  }

  /**
   * Deep merge two objects, with target properties overriding source properties
   * @param {Object} source - Source object (globals)
   * @param {Object} target - Target object (function-specific)
   * @returns {Object} Merged object
   */
  _deepMerge(source, target) {
    const result = { ...source };

    for (const key in target) {
      if (target.hasOwnProperty(key)) {
        if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          // Deep merge nested objects
          result[key] = this._deepMerge(result[key] || {}, target[key]);
        } else {
          // Override with target value
          result[key] = target[key];
        }
      }
    }

    return result;
  }

  /**
   * Validate that a function has required build metadata
   * Checks for BuildMethod and required properties
   * 
   * @param {Object} functionConfig - Function configuration object
   * @param {string} functionConfig.Name - Function name
   * @param {Object} functionConfig.Metadata - Function metadata
   * @param {string} functionConfig.Metadata.BuildMethod - Build method (esbuild or makefile)
   * @param {Object} functionConfig.Properties - Function properties
   * @returns {boolean} True if valid
   * @throws {Error} If validation fails with specific error message
   * @example
   * try {
   *   parser.validateBuildMetadata(functionConfig);
   *   console.log('Function is valid');
   * } catch (error) {
   *   console.error('Validation failed:', error.message);
   * }
   */
  validateBuildMetadata(functionConfig) {
    const functionName = functionConfig.Name || 'Unknown';

    if (!functionConfig.Metadata) {
      throw new Error(
        `Function '${functionName}' is missing Metadata section. ` +
        `Add a Metadata section with BuildMethod property (esbuild or makefile).`
      );
    }

    if (!functionConfig.Metadata.BuildMethod) {
      throw new Error(
        `Function '${functionName}' is missing BuildMethod in Metadata. ` +
        `Supported values: 'esbuild' or 'makefile'. ` +
        `Example:\n  Metadata:\n    BuildMethod: esbuild`
      );
    }

    const supportedMethods = ['esbuild', 'makefile'];
    const buildMethod = functionConfig.Metadata.BuildMethod;
    
    if (!supportedMethods.includes(buildMethod)) {
      throw new Error(
        `Function '${functionName}' has unsupported BuildMethod: '${buildMethod}'. ` +
        `Supported methods are: ${supportedMethods.join(', ')}. ` +
        `Please update your template to use one of the supported build methods.`
      );
    }

    // Validate required properties exist
    if (!functionConfig.Properties) {
      throw new Error(
        `Function '${functionName}' is missing Properties section. ` +
        `Lambda functions require Properties with CodeUri, Handler, and Runtime.`
      );
    }

    const requiredProps = ['Handler', 'Runtime'];
    const missingProps = requiredProps.filter(prop => !functionConfig.Properties[prop]);
    
    if (missingProps.length > 0) {
      throw new Error(
        `Function '${functionName}' is missing required properties: ${missingProps.join(', ')}. ` +
        `Please add these properties to your function definition.`
      );
    }

    return true;
  }

  /**
   * Validate entire template structure
   * @param {Object} template - Parsed template object
   * @returns {Object} Validation result with errors and warnings
   */
  validateTemplate(template) {
    const errors = [];
    const warnings = [];

    if (!template) {
      errors.push('Template is null or undefined');
      return { valid: false, errors, warnings };
    }

    if (!template.Resources) {
      errors.push('Template is missing Resources section');
      return { valid: false, errors, warnings };
    }

    if (Object.keys(template.Resources).length === 0) {
      warnings.push('Template has no resources defined');
    }

    // Check for Lambda functions
    const lambdaFunctions = Object.entries(template.Resources).filter(([_, resource]) => 
      resource.Type === 'AWS::Serverless::Function' || 
      resource.Type === 'AWS::Lambda::Function'
    );

    if (lambdaFunctions.length === 0) {
      warnings.push('Template contains no Lambda functions');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      functionCount: lambdaFunctions.length
    };
  }

  /**
   * Extract and validate Lambda functions from parsed template
   * Filters out functions that don't have valid build metadata
   * 
   * @param {Array<Object>} functions - Array of function configurations from template
   * @returns {Array<Object>} Filtered array of valid function configurations
   * @fires TemplateParser#validationError
   * @example
   * const allFunctions = parser.parseTemplate('./template.yaml');
   * const validFunctions = parser.extractFunctions(allFunctions);
   * console.log(`${validFunctions.length} of ${allFunctions.length} functions are valid`);
   */
  extractFunctions(functions) {
    return functions.filter(func => {
      try {
        this.validateBuildMetadata(func);
        return true;
      } catch (error) {
        this.emit('validationError', { error, function: func.Name });
        return false;
      }
    });
  }
}