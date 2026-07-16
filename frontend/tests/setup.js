import '@testing-library/jest-dom/vitest';

if (!URL.createObjectURL) {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`;
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = () => {};
}
