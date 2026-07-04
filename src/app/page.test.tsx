// Phase 0 harness smoke test — proves Vitest + Testing Library + jsdom + the `@/` alias work.
// Intentionally content-agnostic: it asserts the page renders, not what it says.
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Page from '@/app/page';

describe('test harness', () => {
  it('renders the home page without crashing', () => {
    const { container } = render(<Page />);
    expect(container.firstElementChild).toBeInTheDocument();
  });
});
