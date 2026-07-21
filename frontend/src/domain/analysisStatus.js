import { status } from '../styles/tokens.js';

export const STATUS_LABEL = {
  not_started: 'Waiting to start',
  processing: 'Processing…',
  completed: 'Completed',
  failed: 'Failed',
};

export const STATUS_COLOR = {
  not_started: status.neutral,
  processing: status.information,
  completed: status.healthy,
  failed: status.critical,
};

export const PENDING_STATUSES = new Set(['not_started', 'processing']);

export function statusLabel(statusKey) {
  return STATUS_LABEL[statusKey] || statusKey;
}

export function statusColor(statusKey) {
  return STATUS_COLOR[statusKey] || STATUS_COLOR.not_started;
}
