import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(uid: string, email: string, fullName?: string) {
  const name = fullName && fullName.trim() ? fullName.trim() : email.split('@')[0];
  const result = await db
    .insert(users)
    .values({
      uid,
      email,
      fullName: name,
      passwordHash: '',
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        uid,
        fullName: name,
      },
    })
    .returning();

  return result[0];
}
