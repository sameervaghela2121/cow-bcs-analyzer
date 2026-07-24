// Marks an error as caused by a problem with the uploaded file itself (bad
// format, missing data) rather than a system fault - callers use `.status`
// to decide whether `.message` is safe to show directly to the end user.
class MilkingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MilkingValidationError';
    this.status = 400;
  }
}

module.exports = { MilkingValidationError };
