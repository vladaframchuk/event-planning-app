import * as testingLibraryMatchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';

expect.extend(testingLibraryMatchers);

afterEach(() => {
  cleanup();
});

