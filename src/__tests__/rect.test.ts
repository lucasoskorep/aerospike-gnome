import { describe, test, expect } from '@jest/globals';
import type { Rect } from '../utils/rect';

describe('Rect Type Tests', () => {
  test('should create a valid Rect object', () => {
    const rect: Rect = {
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    };

    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(200);
  });

  test('should handle zero dimensions', () => {
    const rect: Rect = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
  });

  test('should handle negative coordinates', () => {
    const rect: Rect = {
      x: -50,
      y: -100,
      width: 200,
      height: 300,
    };

    expect(rect.x).toBe(-50);
    expect(rect.y).toBe(-100);
  });

  test('should calculate rect area correctly', () => {
    const rect: Rect = {
      x: 0,
      y: 0,
      width: 100,
      height: 50,
    };

    const area = rect.width * rect.height;
    expect(area).toBe(5000);
  });

  test('should determine if point is inside rect', () => {
    const rect: Rect = {
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    };

    const pointInside = { x: 50, y: 50 };
    const pointOutside = { x: 200, y: 200 };

    const isInside = (point: { x: number; y: number }, r: Rect) =>
      point.x >= r.x &&
      point.x <= r.x + r.width &&
      point.y >= r.y &&
      point.y <= r.y + r.height;

    expect(isInside(pointInside, rect)).toBe(true);
    expect(isInside(pointOutside, rect)).toBe(false);
  });
});
