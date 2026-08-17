import { render, screen, fireEvent } from '@testing-library/react';
import ProductionChart from '../../../src/components/milking/ProductionChart.jsx';

// jsdom has no ResizeObserver and always reports a zero getBoundingClientRect,
// so recharts' ResponsiveContainer never sizes its chart children without this
// stub - not a component bug, just a jsdom limitation.
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.getBoundingClientRect = () => ({
    width: 600,
    height: 280,
    top: 0,
    left: 0,
    bottom: 280,
    right: 600,
    x: 0,
    y: 0,
    toJSON() {},
  });
});

const daily = [
  { date: '2026-08-10', totalMilk: 1024.5, recordCount: 150, byShift: { Morning: 342.1, Afternoon: 341.2, Evening: 341.2 } },
  { date: '2026-08-11', totalMilk: 998.2, recordCount: 148, byShift: { Morning: 330.0, Afternoon: 334.2, Evening: 334.0 } },
];

describe('ProductionChart', () => {
  it('renders the chart with daily data when not loading', () => {
    const { container } = render(<ProductionChart daily={daily} isLoading={false} />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelectorAll('.recharts-line-dot, .recharts-line-curve').length).toBeGreaterThan(0);
    expect(container.textContent).toMatch(/2026-08-1[01]/);
  });

  it('renders a skeleton, not a chart, when isLoading is true', () => {
    const { container } = render(<ProductionChart daily={daily} isLoading />);
    expect(container.querySelector('svg')).toBeFalsy();
  });

  it('renders the empty state, not a broken chart, when daily is an empty array', () => {
    const { container } = render(<ProductionChart daily={[]} isLoading={false} />);
    expect(screen.getByText('No milking records in this range.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeFalsy();
  });

  it('calls onToggleByShift when the toggle button is clicked', () => {
    const onToggleByShift = vi.fn();
    render(<ProductionChart daily={daily} isLoading={false} showByShift={false} onToggleByShift={onToggleByShift} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show by Shift' }));
    expect(onToggleByShift).toHaveBeenCalledTimes(1);
  });

  it('renders bar-chart elements and the "Show Total" label when showByShift is true', () => {
    const { container } = render(<ProductionChart daily={daily} isLoading={false} showByShift onToggleByShift={() => {}} />);
    expect(screen.getByRole('button', { name: 'Show Total' })).toBeInTheDocument();
    expect(container.querySelectorAll('.recharts-bar').length).toBeGreaterThan(0);
  });
});
