import { afterEach, beforeEach } from 'vitest';

// Setup DOM globals
beforeEach(() => {
  // Clear document body before each test
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});
