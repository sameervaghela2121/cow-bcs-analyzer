export const STATUS_LABEL = {
  not_started: 'Waiting to start',
  processing: 'Processing…',
  completed: 'Completed',
  failed: 'Failed',
};

export const STATUS_COLOR = {
  not_started: '#82796a',
  processing: '#82796a',
  completed: '#166534',
  failed: '#b91c1c',
};

export const PENDING_STATUSES = new Set(['not_started', 'processing']);

export function statusLabel(status) {
  return STATUS_LABEL[status] || status;
}

export function statusColor(status) {
  return STATUS_COLOR[status] || '#82796a';
}
