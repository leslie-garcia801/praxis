import argon2 from 'argon2';

// RNF-06: passwords are hashed with argon2id (library defaults follow OWASP guidance).
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword({
  hash,
  password,
}: {
  hash: string;
  password: string;
}): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // Malformed or foreign hash: treat as a failed login, never as a server error.
    return false;
  }
}
