// The student ID is made from the email (sign up is name + email only): same email, same ID; always a valid ID.
import { describe, expect, it } from 'vitest';
import { altIdFromEmail, idFromEmail, normalizeEmail, normalizeId } from './identity';

describe('idFromEmail', () => {
  it('upper-cases the email; the same email in any case gives the same ID', () => {
    expect(idFromEmail('priya.sharma@gmail.com')).toBe('PRIYA.SHARMA@GMAIL.COM');
    expect(idFromEmail(normalizeEmail('  Priya.Sharma@Gmail.COM ')!)).toBe('PRIYA.SHARMA@GMAIL.COM');
  });
  it('characters the ID rule does not allow become "_", and the result is always a valid ID', () => {
    for (const e of ['a+b@x.in', "o'neil@mail.com", '_x@y.co', 'r.k-12@college.edu.in', `${'a'.repeat(110)}@gmail.com`]) {
      const id = idFromEmail(e);
      expect(normalizeId(id)).toBe(id);
    }
    expect(idFromEmail('a+b@x.in')).toBe('A_B@X.IN');
    expect(idFromEmail('_x@y.co')).toBe('E_X@Y.CO');
  });
  it('a very long email is cut to 64 characters with a hash, so two long emails stay apart', () => {
    const a = idFromEmail(`${'a'.repeat(100)}1@gmail.com`), b = idFromEmail(`${'a'.repeat(100)}2@gmail.com`);
    expect(a.length).toBe(64);
    expect(a).not.toBe(b);
  });
});

describe('altIdFromEmail', () => {
  it('has no "@" (the server finds it by ID), is a valid ID, and is the same for the same email', () => {
    expect(altIdFromEmail('rishuraj.singh@nxtwave.co.in')).toBe('RISHURAJ.SINGH.AT.NXTWAVE.CO.IN');
    expect(altIdFromEmail('Rishuraj.Singh@NxtWave.co.in')).toBe(altIdFromEmail('rishuraj.singh@nxtwave.co.in'));
    for (const e of ['a+b@x.in', `${'a'.repeat(110)}@gmail.com`]) { const id = altIdFromEmail(e); expect(normalizeId(id)).toBe(id); expect(id).not.toContain('@'); }
  });
});
