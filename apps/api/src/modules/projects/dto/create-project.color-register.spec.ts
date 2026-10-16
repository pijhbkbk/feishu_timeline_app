import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CreateProjectDto } from './create-project.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const transform = (body: unknown) => pipe.transform(body, { type: 'body', metatype: CreateProjectDto });
describe('project creation HTTP color identity contract', () => {
  it.each(['NEW', 'EXISTING'])('accepts bounded %s identity fields through the actual DTO whitelist', async colorMode => {
    const body = { name: '合成颜色项目', colorMode, colorName: '合成色', productionBaseId: 'base-a', existingColorId: colorMode === 'NEW' ? '' : 'color-a' };
    expect(await transform(body)).toMatchObject(body);
  });
  it('retains compatibility for legacy project clients without silently granting any status or role', async () => {
    expect(await transform({ name: '合成旧客户端' })).toMatchObject({ name: '合成旧客户端' });
    await expect(transform({ name: '合成项目', registerStatus: 'LISTED' })).rejects.toMatchObject({ status: 400 });
    await expect(transform({ name: '合成项目', isSystemAdmin: true })).rejects.toMatchObject({ status: 400 });
  });
  it.each([{ colorMode: 'GUESS' }, { colorName: 'x'.repeat(201) }, { productionBaseId: 'b'.repeat(65) }, { existingColorId: 123 }])('rejects invalid identity input %o', async extra => {
    await expect(transform({ name: '合成项目', ...extra })).rejects.toMatchObject({ status: 400 });
  });
});
