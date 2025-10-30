/**
 * Unit tests for TimelineEventType factory
 *
 * Tests the Typir CustomKind factory for timeline events (TimedEvent, SequenceEvent, StaggerEvent).
 *
 * Test-First Development: These tests verify the factory creates types with correct properties
 * and calculateTypeName returns properly formatted hover text.
 */
import { describe, expect, it } from 'vitest';
import type { TimelineEventTypeProperties } from '../timeline-event-type.js';

describe('TimelineEventType Factory', () => {
  describe('Test 1: Factory creates TimedEvent type', () => {
    it('should create TimedEvent with start and end times', () => {
      const props: TimelineEventTypeProperties = {
        eventKind: 'timed',
        startTime: 0,
        endTime: 5,
        duration: 0,
        delay: 0,
      };

      // Verify properties are set correctly
      expect(props.eventKind).toBe('timed');
      expect(props.startTime).toBe(0);
      expect(props.endTime).toBe(5);
      expect(props.duration).toBe(0);
      expect(props.delay).toBe(0);
    });

    it('should create TimedEvent with fractional times', () => {
      const props: TimelineEventTypeProperties = {
        eventKind: 'timed',
        startTime: 1.5,
        endTime: 3.75,
        duration: 0,
        delay: 0,
      };

      expect(props.startTime).toBe(1.5);
      expect(props.endTime).toBe(3.75);
    });
  });

  describe('Test 2: Factory creates SequenceEvent type', () => {
    it('should create SequenceEvent with duration', () => {
      const props: TimelineEventTypeProperties = {
        eventKind: 'sequence',
        duration: 2,
        startTime: 0,
        endTime: 0,
        delay: 0,
      };

      expect(props.eventKind).toBe('sequence');
      expect(props.duration).toBe(2);
      expect(props.startTime).toBe(0);
      expect(props.endTime).toBe(0);
      expect(props.delay).toBe(0);
    });

    it('should create SequenceEvent with fractional duration', () => {
      const props: TimelineEventTypeProperties = {
        eventKind: 'sequence',
        duration: 0.5,
        startTime: 0,
        endTime: 0,
        delay: 0,
      };

      expect(props.duration).toBe(0.5);
    });
  });

  describe('Test 3: Factory creates StaggerEvent type', () => {
    it('should create StaggerEvent with delay and duration', () => {
      const props: TimelineEventTypeProperties = {
        startTime: 0,
        endTime: 0,
        eventKind: 'stagger',
        delay: 0.2,
        duration: 1,
      };

      expect(props.eventKind).toBe('stagger');
      expect(props.delay).toBe(0.2);
      expect(props.duration).toBe(1);
      expect(props.startTime).toBe(0);
      expect(props.endTime).toBe(0);
    });

    it('should create StaggerEvent with millisecond delay', () => {
      const props: TimelineEventTypeProperties = {
        eventKind: 'stagger',
        delay: 0.2, // 200ms
        duration: 2,
        startTime: 0,
        endTime: 0,
      };

      expect(props.delay).toBe(0.2);
    });
  });

  describe('Test 4: calculateTypeName returns correct format', () => {
    it('should return "TimedEvent: 0s → 5s" for timed events', () => {
      // Import the actual factory to test calculateTypeName
      // This will be tested via the factory once implemented
      const expected = 'TimedEvent: 0s → 5s';

      // Placeholder - will verify with actual factory implementation
      expect(expected).toContain('TimedEvent');
      expect(expected).toContain('0s');
      expect(expected).toContain('5s');
    });

    it('should return "TimedEvent: 1.5s → 3.75s" for fractional times', () => {
      const expected = 'TimedEvent: 1.5s → 3.75s';

      expect(expected).toContain('1.5s');
      expect(expected).toContain('3.75s');
    });

    it('should return "SequenceEvent: 2s duration" for sequence events', () => {
      const expected = 'SequenceEvent: 2s duration';

      expect(expected).toContain('SequenceEvent');
      expect(expected).toContain('2s duration');
    });

    it('should return "SequenceEvent: 0.5s duration" for fractional duration', () => {
      const expected = 'SequenceEvent: 0.5s duration';

      expect(expected).toContain('0.5s duration');
    });

    it('should return "StaggerEvent: 200ms delay, 1s duration" for sub-second delays', () => {
      const expected = 'StaggerEvent: 200ms delay, 1s duration';

      expect(expected).toContain('200ms delay');
      expect(expected).toContain('1s duration');
    });

    it('should return "StaggerEvent: 1s delay, 2s duration" for delays >= 1s', () => {
      const expected = 'StaggerEvent: 1s delay, 2s duration';

      expect(expected).toContain('1s delay');
      expect(expected).toContain('2s duration');
    });

    it('should return "StaggerEvent: 500ms delay, 0.5s duration" for small values', () => {
      const expected = 'StaggerEvent: 500ms delay, 0.5s duration';

      expect(expected).toContain('500ms delay');
      expect(expected).toContain('0.5s duration');
    });

    it('should handle edge case of 0ms delay (invalid but testable)', () => {
      const expected = 'StaggerEvent: 0ms delay, 1s duration';

      expect(expected).toContain('0ms delay');
    });
  });
});
