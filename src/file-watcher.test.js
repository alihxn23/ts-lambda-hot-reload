/**
 * FileWatcher Property-Based Tests
 * Tests for file watcher configuration consistency and behavior
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { FileWatcher } from './file-watcher.js';

describe('FileWatcher Property-Based Tests', () => {
  let fileWatcher;

  afterEach(() => {
    if (fileWatcher && fileWatcher.isCurrentlyWatching()) {
      fileWatcher.stopWatching();
    }
    vi.clearAllTimers();
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 1: File watcher configuration consistency**
   * **Validates: Requirements 1.1**
   */
  it('should maintain configuration consistency for any valid configuration', () => {
    fc.assert(fc.property(
      fc.record({
        extensions: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 10 }),
        debounceDelay: fc.integer({ min: 0, max: 5000 }),
        verbose: fc.boolean(),
        ignorePatterns: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 20 }),
        legacyWatch: fc.boolean(),
        polling: fc.boolean()
      }),
      (config) => {
        // Create FileWatcher with generated configuration
        fileWatcher = new FileWatcher(config);
        const actualConfig = fileWatcher.getConfig();

        // Verify extensions are properly set
        expect(actualConfig.extensions).toEqual(config.extensions);
        
        // Verify debounce delay is set correctly
        expect(actualConfig.debounceDelay).toBe(config.debounceDelay);
        
        // Verify boolean flags are preserved
        expect(actualConfig.verbose).toBe(config.verbose);
        expect(actualConfig.legacyWatch).toBe(config.legacyWatch);
        expect(actualConfig.polling).toBe(config.polling);
        
        // Verify ignore patterns include both defaults and custom patterns
        const expectedIgnorePatterns = [
          'node_modules/**',
          '.git/**',
          '.aws-sam/**',
          '**/*.test.js',
          '**/*.test.ts',
          '**/test/**',
          '**/tests/**',
          '**/.DS_Store',
          '**/coverage/**',
          ...config.ignorePatterns
        ];
        expect(actualConfig.ignorePatterns).toEqual(expectedIgnorePatterns);
        
        // Verify exec command has a default
        expect(actualConfig.exec).toBeDefined();
        expect(typeof actualConfig.exec).toBe('string');
      }
    ), { numRuns: 100 });
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 2: Debouncing prevents excessive rebuilds**
   * **Validates: Requirements 1.2**
   */
  it('should debounce multiple rapid file changes into single event', () => {
    vi.useFakeTimers();
    
    fc.assert(fc.property(
      fc.integer({ min: 50, max: 1000 }), // debounce delay
      fc.array(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 10 }), // multiple change events
      (debounceDelay, changeEvents) => {
        fileWatcher = new FileWatcher({ debounceDelay });
        
        let emittedEvents = [];
        fileWatcher.on('filesChanged', (data) => {
          emittedEvents.push(data.files);
        });

        // Simulate multiple rapid file changes
        changeEvents.forEach((files, index) => {
          fileWatcher._handleFileChanges(files);
          
          // Advance time by less than debounce delay for all but the last event
          if (index < changeEvents.length - 1) {
            vi.advanceTimersByTime(debounceDelay - 10);
          }
        });

        // Before debounce delay expires, no events should be emitted
        expect(emittedEvents).toHaveLength(0);
        expect(fileWatcher.getPendingChangesCount()).toBeGreaterThan(0);

        // Advance time past debounce delay
        vi.advanceTimersByTime(debounceDelay + 10);

        // Should have exactly one emitted event
        expect(emittedEvents).toHaveLength(1);
        expect(fileWatcher.getPendingChangesCount()).toBe(0);

        // All unique files from all change events should be included
        const allFiles = [...new Set(changeEvents.flat())];
        expect(emittedEvents[0]).toEqual(expect.arrayContaining(allFiles));
        expect(emittedEvents[0]).toHaveLength(allFiles.length);
      }
    ), { numRuns: 50 });
    
    vi.useRealTimers();
  });

  /**
   * **Feature: lambda-hot-reload-improvements, Property 3: Build failure resilience**
   * **Validates: Requirements 1.3**
   */
  it('should continue monitoring after build failures with exponential backoff', () => {
    vi.useFakeTimers();
    
    fc.assert(fc.property(
      fc.integer({ min: 1, max: 5 }), // max restart attempts
      fc.integer({ min: 500, max: 2000 }), // base backoff delay
      (maxAttempts, baseDelay) => {
        fileWatcher = new FileWatcher({ 
          debounceDelay: 100 
        });
        fileWatcher.setMaxRestartAttempts(maxAttempts);
        fileWatcher.restartBackoffDelay = baseDelay;
        vi.spyOn(fileWatcher, 'startWatching').mockImplementation(() => {});

        let restartEvents = [];
        let errorEvents = [];
        
        fileWatcher.on('watcherRestarting', (data) => {
          restartEvents.push(data);
        });
        
        fileWatcher.on('watcherError', (data) => {
          errorEvents.push(data);
        });

        // Simulate multiple crashes
        for (let i = 0; i < maxAttempts + 1; i++) {
          fileWatcher.emit('nodemonCrash', new Error(`Crash ${i + 1}`));
          
          // Advance time to trigger restart attempts
          if (i < maxAttempts) {
            const expectedDelay = baseDelay * Math.pow(2, i);
            vi.advanceTimersByTime(expectedDelay + 100);
          }
        }

        // Should have attempted restart maxAttempts times
        expect(restartEvents).toHaveLength(maxAttempts);
        
        // Should have received error events for each crash plus final failure
        expect(errorEvents.length).toBeGreaterThanOrEqual(maxAttempts + 1);
        
        // Final error should be non-recoverable
        const finalError = errorEvents[errorEvents.length - 1];
        expect(finalError.recoverable).toBe(false);
        expect(finalError.error.message).toContain('Maximum restart attempts');
        
        // Verify exponential backoff delays
        for (let i = 0; i < Math.min(restartEvents.length, maxAttempts); i++) {
          const expectedDelay = baseDelay * Math.pow(2, i);
          expect(restartEvents[i].delay).toBe(expectedDelay);
          expect(restartEvents[i].attempt).toBe(i + 1);
        }
        
        // Restart status should reflect exhausted attempts
        const status = fileWatcher.getRestartStatus();
        expect(status.attempts).toBe(maxAttempts);
        expect(status.canRestart).toBe(false);
      }
    ), { numRuns: 50 });
    
    vi.useRealTimers();
  });

  it('should handle empty configuration gracefully', () => {
    fileWatcher = new FileWatcher({});
    const config = fileWatcher.getConfig();
    
    // Should have default values
    expect(config.extensions).toEqual(['js', 'ts', 'json', 'yaml', 'yml']);
    expect(config.debounceDelay).toBe(300);
    expect(config.verbose).toBe(false);
    expect(config.ignorePatterns).toContain('node_modules/**');
    expect(config.ignorePatterns).toContain('.git/**');
    expect(config.ignorePatterns).toContain('.aws-sam/**');
  });

  it('should preserve configuration when updating with partial config', () => {
    fc.assert(fc.property(
      fc.record({
        extensions: fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 1, maxLength: 5 }),
        debounceDelay: fc.integer({ min: 100, max: 1000 }),
        verbose: fc.boolean()
      }),
      fc.record({
        debounceDelay: fc.integer({ min: 50, max: 2000 }),
        polling: fc.boolean()
      }),
      (initialConfig, updateConfig) => {
        fileWatcher = new FileWatcher(initialConfig);
        fileWatcher.updateConfig(updateConfig);
        
        const finalConfig = fileWatcher.getConfig();
        
        // Original extensions should be preserved if not in update
        if (!updateConfig.extensions) {
          expect(finalConfig.extensions).toEqual(initialConfig.extensions);
        }
        
        // Updated values should be applied
        expect(finalConfig.debounceDelay).toBe(updateConfig.debounceDelay);
        if (updateConfig.polling !== undefined) {
          expect(finalConfig.polling).toBe(updateConfig.polling);
        }
        
        // Original verbose setting should be preserved if not updated
        if (updateConfig.verbose === undefined) {
          expect(finalConfig.verbose).toBe(initialConfig.verbose);
        }
      }
    ), { numRuns: 100 });
  });

  it('should maintain ignore pattern consistency when adding patterns', () => {
    fc.assert(fc.property(
      fc.array(fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 10 }),
      fc.array(fc.string({ minLength: 2, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
      (initialPatterns, additionalPatterns) => {
        // Remove duplicates to make test deterministic
        const uniqueInitial = [...new Set(initialPatterns)];
        const uniqueAdditional = [...new Set(additionalPatterns)];
        
        fileWatcher = new FileWatcher({ ignorePatterns: uniqueInitial });
        const configBefore = fileWatcher.getConfig();
        
        fileWatcher.addIgnorePattern(uniqueAdditional);
        const configAfter = fileWatcher.getConfig();
        
        // All original patterns should still be present
        uniqueInitial.forEach(pattern => {
          expect(configAfter.ignorePatterns).toContain(pattern);
        });
        
        // All additional patterns should be added (if not already present)
        uniqueAdditional.forEach(pattern => {
          expect(configAfter.ignorePatterns).toContain(pattern);
        });
        
        // Calculate how many new patterns were actually added (excluding duplicates)
        const newPatterns = uniqueAdditional.filter(pattern => 
          !configBefore.ignorePatterns.includes(pattern)
        );
        
        // Length should increase by the number of truly new patterns
        expect(configAfter.ignorePatterns.length).toBe(
          configBefore.ignorePatterns.length + newPatterns.length
        );
      }
    ), { numRuns: 100 });
  });

  it('should maintain ignore pattern consistency when removing patterns', () => {
    fc.assert(fc.property(
      fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 3, maxLength: 10 }),
      (patterns) => {
        fileWatcher = new FileWatcher({ ignorePatterns: patterns });
        
        // Pick some patterns to remove (ensure we have at least one)
        const patternsToRemove = patterns.slice(0, Math.max(1, Math.floor(patterns.length / 2)));
        const expectedRemainingPatterns = patterns.filter(p => !patternsToRemove.includes(p));
        
        fileWatcher.removeIgnorePattern(patternsToRemove);
        const configAfter = fileWatcher.getConfig();
        
        // Removed patterns should not be present
        patternsToRemove.forEach(pattern => {
          expect(configAfter.ignorePatterns).not.toContain(pattern);
        });
        
        // Remaining patterns should still be present
        expectedRemainingPatterns.forEach(pattern => {
          expect(configAfter.ignorePatterns).toContain(pattern);
        });
        
        // Default patterns should always be present
        expect(configAfter.ignorePatterns).toContain('node_modules/**');
        expect(configAfter.ignorePatterns).toContain('.git/**');
        expect(configAfter.ignorePatterns).toContain('.aws-sam/**');
      }
    ), { numRuns: 100 });
  });
});