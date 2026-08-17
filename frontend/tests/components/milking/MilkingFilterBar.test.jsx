import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import MilkingFilterBar from '../../../src/components/milking/MilkingFilterBar.jsx';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function mockGroupsAndCows({ groups = [], cows = [] } = {}) {
  server.use(
    http.get('http://localhost:4000/api/cow-groups', () => HttpResponse.json({ cowGroups: groups })),
    http.get('http://localhost:4000/api/cows', () => HttpResponse.json({ cows, total: cows.length }))
  );
}

function renderFilterBar(props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onFilterChange = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <MilkingFilterBar onFilterChange={onFilterChange} {...props} />
    </QueryClientProvider>
  );
  return { onFilterChange, ...utils };
}

describe('MilkingFilterBar', () => {
  it('fetches and renders group options', async () => {
    mockGroupsAndCows({
      groups: [
        { id: 'g1', name: '1.1' },
        { id: 'g2', name: '2.1' },
      ],
    });
    renderFilterBar();
    const groupSelect = await screen.findByLabelText('Group');
    await waitFor(() => {
      expect(within(groupSelect).getByText('1.1')).toBeInTheDocument();
      expect(within(groupSelect).getByText('2.1')).toBeInTheDocument();
    });
  });

  it('fetches and renders cow options', async () => {
    mockGroupsAndCows({ cows: [{ id: 'c1', cowsId: '232' }] });
    renderFilterBar();
    const cowSelect = await screen.findByLabelText('Cow');
    await waitFor(() => expect(within(cowSelect).getByText('232')).toBeInTheDocument());
  });

  it('calls onFilterChange when the start-date input changes', async () => {
    mockGroupsAndCows();
    const { onFilterChange } = renderFilterBar();
    const startInput = await screen.findByLabelText('From');
    fireEvent.change(startInput, { target: { value: '2026-02-01' } });
    expect(onFilterChange).toHaveBeenCalledWith('startDate', '2026-02-01');
  });

  it('calls onFilterChange with the group id when a group option is selected', async () => {
    mockGroupsAndCows({ groups: [{ id: 'g1', name: '1.1' }] });
    const { onFilterChange } = renderFilterBar();
    const groupSelect = await screen.findByLabelText('Group');
    await waitFor(() => expect(within(groupSelect).getByText('1.1')).toBeInTheDocument());
    fireEvent.change(groupSelect, { target: { value: 'g1' } });
    expect(onFilterChange).toHaveBeenCalledWith('groupId', 'g1');
  });

  it('calls onFilterChange with undefined groupId when re-selecting All Groups after a group was selected', async () => {
    mockGroupsAndCows({ groups: [{ id: 'g1', name: '1.1' }] });
    const { onFilterChange } = renderFilterBar({ groupId: 'g1' });
    const groupSelect = await screen.findByLabelText('Group');
    await waitFor(() => expect(within(groupSelect).getByText('1.1')).toBeInTheDocument());
    expect(groupSelect.value).toBe('g1');
    fireEvent.change(groupSelect, { target: { value: '' } });
    expect(onFilterChange).toHaveBeenCalledWith('groupId', undefined);
  });

  it('calls onFilterChange when a shift option is selected', async () => {
    mockGroupsAndCows();
    const { onFilterChange } = renderFilterBar();
    const shiftSelect = await screen.findByLabelText('Shift');
    fireEvent.change(shiftSelect, { target: { value: 'Morning' } });
    expect(onFilterChange).toHaveBeenCalledWith('shift', 'Morning');
  });

  it('renders the controlled startDate value in the date input', async () => {
    mockGroupsAndCows();
    renderFilterBar({ startDate: '2026-08-01' });
    const startInput = await screen.findByLabelText('From');
    expect(startInput.value).toBe('2026-08-01');
  });
});
