import { render, screen } from '@testing-library/react';
import StatCards from '../../../src/components/milking/StatCards.jsx';

const stats = {
  totalMilk: 30735.0,
  recordCount: 2433,
  cowsReporting: 35,
  groupsActive: 3,
  avgPerCow: 878.1,
};

describe('StatCards', () => {
  it('renders all 4 tiles with correct formatted values', () => {
    render(<StatCards stats={stats} isLoading={false} />);
    expect(screen.getByText('Total Milk')).toBeInTheDocument();
    expect(screen.getByText('30735.0 L')).toBeInTheDocument();
    expect(screen.getByText('Avg per Cow')).toBeInTheDocument();
    expect(screen.getByText('878.1 L')).toBeInTheDocument();
    expect(screen.getByText('Cows Reporting')).toBeInTheDocument();
    expect(screen.getByText('35')).toBeInTheDocument();
    expect(screen.getByText('Groups Active')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders skeletons instead of values when isLoading is true', () => {
    render(<StatCards stats={stats} isLoading />);
    expect(screen.queryByText('30735.0 L')).not.toBeInTheDocument();
    expect(screen.queryByText('35')).not.toBeInTheDocument();
    expect(screen.getByText('Total Milk')).toBeInTheDocument();
  });

  it('does not throw and renders fallback values when stats is undefined', () => {
    render(<StatCards stats={undefined} isLoading={false} />);
    expect(screen.getAllByText('0.0 L')).toHaveLength(2);
    expect(screen.getAllByText('0')).toHaveLength(2);
  });
});
