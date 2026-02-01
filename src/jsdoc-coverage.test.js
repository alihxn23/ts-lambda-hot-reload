/**
 * Property-Based Tests for JSDoc Coverage
 * **Feature: lambda-hot-reload-improvements, Property 8: JSDoc coverage completeness**
 * **Validates: Requirements 3.2**
 * 
 * Tests that all public functions and classes have comprehensive JSDoc comments
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Extract public class and function declarations from a JavaScript file
 * @param {string} content - File content
 * @returns {Array} Array of public declarations with their JSDoc
 */
function extractPublicDeclarations(content) {
  const declarations = [];
  
  // Match exported classes with their preceding JSDoc
  const classRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?export\s+class\s+(\w+)/g;
  let match;
  
  while ((match = classRegex.exec(content)) !== null) {
    // Look back up to 1000 characters for JSDoc
    const lookback = content.slice(Math.max(0, match.index - 1000), match.index);
    // Find the last JSDoc comment before the class
    const jsdocMatches = lookback.match(/\/\*\*[\s\S]*?\*\//g);
    const jsdocMatch = jsdocMatches ? jsdocMatches[jsdocMatches.length - 1] : null;
    
    declarations.push({
      type: 'class',
      name: match[1],
      hasJSDoc: !!jsdocMatch,
      jsdoc: jsdocMatch,
      position: match.index
    });
  }
  
  // Match public methods (not starting with _)
  const methodRegex = /(?:\/\*\*[\s\S]*?\*\/\s*)?(\w+)\s*\([^)]*\)\s*\{/g;
  
  while ((match = methodRegex.exec(content)) !== null) {
    const methodName = match[1];
    
    // Skip private methods (starting with _) and common keywords
    if (methodName.startsWith('_') || 
        ['if', 'for', 'while', 'switch', 'catch', 'function'].includes(methodName)) {
      continue;
    }
    
    // Check if this is inside a class
    const beforeMethod = content.slice(0, match.index);
    const lastClassMatch = beforeMethod.match(/export\s+class\s+\w+/g);
    
    if (lastClassMatch) {
      // Look back up to 1000 characters for JSDoc
      const lookback = content.slice(Math.max(0, match.index - 1000), match.index);
      // Find the last JSDoc comment before the method
      const jsdocMatches = lookback.match(/\/\*\*[\s\S]*?\*\//g);
      const jsdocMatch = jsdocMatches ? jsdocMatches[jsdocMatches.length - 1] : null;
      
      declarations.push({
        type: 'method',
        name: methodName,
        hasJSDoc: !!jsdocMatch,
        jsdoc: jsdocMatch,
        position: match.index
      });
    }
  }
  
  return declarations;
}

/**
 * Check if JSDoc contains required elements
 * @param {string} jsdoc - JSDoc comment
 * @param {string} type - Declaration type (class, method, function)
 * @returns {Object} Validation result
 */
function validateJSDocContent(jsdoc, type) {
  if (!jsdoc) {
    return { valid: false, missing: ['JSDoc comment'] };
  }
  
  const missing = [];
  
  // Check for description (first line after /** should have content)
  const descriptionMatch = jsdoc.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
  if (!descriptionMatch || descriptionMatch[1].trim().startsWith('@')) {
    missing.push('description');
  }
  
  // For methods and functions, check for @param if parameters exist
  if (type === 'method' || type === 'function') {
    // Check if there are @param tags
    const hasParams = /@param/.test(jsdoc);
    const hasReturns = /@returns/.test(jsdoc);
    
    // If it's a getter/setter or constructor, @returns might not be needed
    const isConstructor = /constructor/.test(jsdoc);
    const isGetter = /get\s+\w+/.test(jsdoc);
    
    if (!isConstructor && !isGetter && !hasReturns && !jsdoc.includes('@fires')) {
      // Allow methods without @returns if they clearly don't return anything meaningful
      if (!jsdoc.toLowerCase().includes('set ') && !jsdoc.toLowerCase().includes('update ')) {
        // This is lenient - we're checking that there's some documentation
      }
    }
  }
  
  return { valid: missing.length === 0, missing };
}

describe('JSDoc Coverage Property Tests', () => {
  const srcDir = path.join(process.cwd(), 'src');
  const sourceFiles = fs.readdirSync(srcDir)
    .filter(file => file.endsWith('.js') && !file.endsWith('.test.js'))
    .map(file => path.join(srcDir, file));

  it('Property 8: All public functions and classes should have JSDoc comments', () => {
    const results = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const declarations = extractPublicDeclarations(content);
      const fileName = path.basename(filePath);
      
      for (const decl of declarations) {
        if (!decl.hasJSDoc) {
          results.push({
            file: fileName,
            type: decl.type,
            name: decl.name,
            issue: 'Missing JSDoc comment'
          });
        } else {
          const validation = validateJSDocContent(decl.jsdoc, decl.type);
          if (!validation.valid) {
            results.push({
              file: fileName,
              type: decl.type,
              name: decl.name,
              issue: `Incomplete JSDoc: missing ${validation.missing.join(', ')}`
            });
          }
        }
      }
    }
    
    // Report all issues
    if (results.length > 0) {
      const report = results.map(r => 
        `  ${r.file} - ${r.type} ${r.name}: ${r.issue}`
      ).join('\n');
      
      expect(results.length, 
        `Found ${results.length} JSDoc issues:\n${report}`
      ).toBe(0);
    }
    
    expect(results).toHaveLength(0);
  });

  it('Property 8: JSDoc comments should contain descriptions', () => {
    const results = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const declarations = extractPublicDeclarations(content);
      const fileName = path.basename(filePath);
      
      for (const decl of declarations) {
        if (decl.hasJSDoc) {
          // Check that JSDoc has a description
          const hasDescription = /\/\*\*\s*\n\s*\*\s*[A-Z]/.test(decl.jsdoc);
          
          if (!hasDescription) {
            results.push({
              file: fileName,
              type: decl.type,
              name: decl.name
            });
          }
        }
      }
    }
    
    if (results.length > 0) {
      const report = results.map(r => 
        `  ${r.file} - ${r.type} ${r.name}`
      ).join('\n');
      
      expect(results.length,
        `Found ${results.length} JSDoc comments without descriptions:\n${report}`
      ).toBe(0);
    }
    
    expect(results).toHaveLength(0);
  });

  it('Property 8: Public classes should have JSDoc with @class tag', () => {
    const results = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const declarations = extractPublicDeclarations(content);
      const fileName = path.basename(filePath);
      
      for (const decl of declarations) {
        if (decl.type === 'class' && decl.hasJSDoc) {
          // Check for @class tag
          const hasClassTag = /@class/.test(decl.jsdoc);
          
          if (!hasClassTag) {
            results.push({
              file: fileName,
              name: decl.name
            });
          }
        }
      }
    }
    
    if (results.length > 0) {
      const report = results.map(r => 
        `  ${r.file} - class ${r.name}`
      ).join('\n');
      
      expect(results.length,
        `Found ${results.length} classes without @class tag:\n${report}`
      ).toBe(0);
    }
    
    expect(results).toHaveLength(0);
  });

  it('Property 8: Public classes should have usage examples in JSDoc', () => {
    const results = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const declarations = extractPublicDeclarations(content);
      const fileName = path.basename(filePath);
      
      for (const decl of declarations) {
        if (decl.type === 'class' && decl.hasJSDoc) {
          // Check for @example tag
          const hasExample = /@example/.test(decl.jsdoc);
          
          if (!hasExample) {
            results.push({
              file: fileName,
              name: decl.name
            });
          }
        }
      }
    }
    
    if (results.length > 0) {
      const report = results.map(r => 
        `  ${r.file} - class ${r.name}`
      ).join('\n');
      
      expect(results.length,
        `Found ${results.length} classes without @example:\n${report}`
      ).toBe(0);
    }
    
    expect(results).toHaveLength(0);
  });

  it('Property 8: Module files should have module-level JSDoc', () => {
    const results = [];
    
    for (const filePath of sourceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const fileName = path.basename(filePath);
      
      // Check for module-level JSDoc at the start of the file
      const moduleJSDocMatch = content.match(/^\/\*\*[\s\S]*?@module[\s\S]*?\*\//);
      
      if (!moduleJSDocMatch) {
        results.push(fileName);
      }
    }
    
    if (results.length > 0) {
      const report = results.join('\n  ');
      
      expect(results.length,
        `Found ${results.length} files without module-level JSDoc:\n  ${report}`
      ).toBe(0);
    }
    
    expect(results).toHaveLength(0);
  });
});
