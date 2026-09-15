export const calculateAge = (dob: Date): number => {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
};

export const isAtLeast18 = (dob: Date | string): boolean => {
  const date = typeof dob === 'string' ? new Date(dob) : dob;
  if (Number.isNaN(date.getTime())) return false;
  return calculateAge(date) >= 18;
};
