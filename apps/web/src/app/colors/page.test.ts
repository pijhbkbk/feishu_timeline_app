import { beforeEach, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import ColorsPage from './page';

vi.mock('next/navigation', () => ({ redirect: vi.fn((href: string) => { throw new Error(`REDIRECT:${href}`); }) }));
beforeEach(() => vi.clearAllMocks());

it('preserves a production record color identity through the legacy route', async () => {
  await expect(ColorsPage({ searchParams: Promise.resolve({ colorId: 'synthetic-color-17' }) })).rejects.toThrow('REDIRECT:/admin/color-database?view=records&colorId=synthetic-color-17');
  expect(redirect).toHaveBeenCalledTimes(1);
});

it('encodes the identity instead of turning its text into query controls', async () => {
  await expect(ColorsPage({ searchParams: Promise.resolve({ colorId: 'color&view=other/#' }) })).rejects.toThrow('colorId=color%26view%3Dother%2F%23');
  expect(redirect).toHaveBeenCalledTimes(1);
});

it.each([undefined, '', ['first', 'second'], 'a'.repeat(101)])('keeps the generic landing page for a missing or ambiguous identity %s', async colorId => {
  await expect(ColorsPage({ searchParams: Promise.resolve(colorId === undefined ? {} : { colorId }) })).rejects.toThrow('REDIRECT:/admin/color-database');
  expect(redirect).toHaveBeenCalledWith('/admin/color-database');
  expect(redirect).toHaveBeenCalledTimes(1);
});
