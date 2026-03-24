import { SetMetadata } from '@nestjs/common';

import { ROLE_METADATA_KEY, type RoleCode } from './auth.constants';

export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLE_METADATA_KEY, roles);
