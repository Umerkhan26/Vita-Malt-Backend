export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

export const validateName = (name: string): boolean => {
  const nameRegex = /^[A-Za-z][A-Za-z\s.'-]{1,79}$/;
  return nameRegex.test(name.trim());
};

export const validatePassword = (password: string): boolean => {
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return passwordRegex.test(password);
};

export const validateCodeFormat = (code: string): boolean => {
  const codeRegex = /^[A-Za-z0-9-]{4,32}$/;
  return codeRegex.test(code.trim());
};

export const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET must be set to a string of at least 16 characters');
  }
  return secret;
};
