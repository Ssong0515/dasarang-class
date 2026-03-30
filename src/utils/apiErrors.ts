const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const getDetailsMessage = (value: unknown): string | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const item of value) {
    const message = extractApiErrorMessage(item, '');
    if (message) {
      return message;
    }
  }

  return null;
};

export const extractApiErrorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && isNonEmptyString(value.message)) {
    return value.message.trim();
  }

  if (isNonEmptyString(value)) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    const arrayMessage = getDetailsMessage(value);
    return arrayMessage || fallback;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (record.error !== undefined) {
      const nestedErrorMessage = extractApiErrorMessage(record.error, '');
      if (nestedErrorMessage) {
        return nestedErrorMessage;
      }
    }

    if (isNonEmptyString(record.message)) {
      return record.message.trim();
    }

    const detailsMessage = getDetailsMessage(record.details);
    if (detailsMessage) {
      return detailsMessage;
    }
  }

  return fallback;
};
