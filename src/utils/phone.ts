export const normalizePhone = (phone: string): string => {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    return `+${digits.slice(1).replace(/\D/g, '')}`;
  }
  return digits.replace(/\D/g, '');
};

export const validatePhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone);
  const digitsOnly = normalized.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
};
