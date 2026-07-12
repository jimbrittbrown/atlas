import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ShellLayout } from '../components/ShellLayout';

describe('navigation foundation', () => {
  it('renders all planned module links', () => {
    render(
      <MemoryRouter>
        <ShellLayout
          connectionLabel="LIVE API"
          statusLine="Ready"
          onOpenSettings={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /Atlas CEO navigation/i })).toBeInTheDocument();
    expect(screen.getByText('Executive Overview')).toBeInTheDocument();
    expect(screen.getByText('CEO Decisions')).toBeInTheDocument();
    expect(screen.getByText('Mission Control')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('opens settings with keyboard interaction', async () => {
    const user = userEvent.setup();
    const onOpenSettings = vi.fn();

    render(
      <MemoryRouter>
        <ShellLayout
          connectionLabel="LIVE API"
          statusLine="Ready"
          onOpenSettings={onOpenSettings}
        />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /Connection Settings/i });
    button.focus();
    await user.keyboard('{Enter}');
    expect(onOpenSettings).toHaveBeenCalled();
    expect(button).toBeInTheDocument();
  });
});
