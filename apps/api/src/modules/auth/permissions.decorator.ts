import { SetMetadata } from '@nestjs/common';

import { PERMISSION_METADATA_KEY } from './auth.constants';

export const Permissions = (...permissionCodes: string[]) =>
  SetMetadata(PERMISSION_METADATA_KEY, permissionCodes);
