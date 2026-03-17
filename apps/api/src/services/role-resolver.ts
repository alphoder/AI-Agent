import { logger } from '../config/logger';

interface RoleMappingConfig {
  role_mapping?: {
    source_field: string;
    admin_values: string[];
  };
}

/**
 * Resolves a user's role based on SSO groups/attributes and tenant role mapping config.
 * SECURITY: Never defaults to admin. Default is always 'learner'.
 */
export function resolveRole(
  groups: string[],
  ssoConfig: RoleMappingConfig | null,
): 'admin' | 'learner' {
  if (!ssoConfig?.role_mapping) {
    logger.info('No role mapping configured, defaulting to learner');
    return 'learner';
  }

  const { admin_values } = ssoConfig.role_mapping;

  if (!admin_values || admin_values.length === 0) {
    logger.info('No admin values configured, defaulting to learner');
    return 'learner';
  }

  const isAdmin = groups.some((group) =>
    admin_values.some(
      (adminValue) => adminValue.toLowerCase() === group.toLowerCase(),
    ),
  );

  const resolvedRole = isAdmin ? 'admin' : 'learner';

  logger.info(
    { groups, adminValues: admin_values, resolvedRole },
    'Role resolved',
  );

  return resolvedRole;
}
