import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { AuthProvider } from '../../components/auth-provider';
import LoginPage from './page';

describe('native username HTML constraint', () => {
  it('presents a text employee number without changing the compatible login field', () => {
    const html = renderToStaticMarkup(<AuthProvider><LoginPage /></AuthProvider>);
    expect(html).toContain('工号');
    expect(html).toContain('placeholder="请输入工号"');
    expect(html).not.toContain('用户名');
    expect(html).not.toContain('type="number"');
  });
  it.each(['v', 'u'])('keeps the rendered pattern valid with the %s flag', (flag) => {
    const html = renderToStaticMarkup(<AuthProvider><LoginPage /></AuthProvider>);
    const input = html.match(/<input\b[^>]*\bname="username"[^>]*>/)?.[0];
    expect(input).toBeDefined();
    const pattern = input?.match(/\bpattern="([^"]+)"/)?.[1];
    expect(pattern).toBeDefined();
    // HTML patterns use Unicode Sets (v); older browsers used Unicode (u).
    // Compiling the actual rendered attribute catches browser syntax failures.
    const constraint = new RegExp(`^(?:${pattern})$`, flag);
    for (const username of ['001234', 'abc', 'A9z', 'a.b', 'a_b', 'a-b', 'a'.repeat(64)]) {
      expect(constraint.test(username), username).toBe(true);
    }
    for (const username of ['', 'ab', 'a'.repeat(65), '-ab', '_ab', '.ab', 'a b', 'a/b', 'a@b', '用户名', 'a💙b']) {
      expect(constraint.test(username), username).toBe(false);
    }
  });
});
