// Mock logger
jest.mock('../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { resolveRole } from '../services/role-resolver';

describe('resolveRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns admin when groups match admin values', () => {
    const config = {
      role_mapping: {
        source_field: 'groups',
        admin_values: ['Platform-Admins', 'Super-Admins'],
      },
    };

    const result = resolveRole(['Platform-Admins', 'Users'], config);

    expect(result).toBe('admin');
  });

  it('returns learner when no admin groups match', () => {
    const config = {
      role_mapping: {
        source_field: 'groups',
        admin_values: ['Platform-Admins'],
      },
    };

    const result = resolveRole(['Users', 'Developers'], config);

    expect(result).toBe('learner');
  });

  it('returns learner when no groups provided', () => {
    const config = {
      role_mapping: {
        source_field: 'groups',
        admin_values: ['Platform-Admins'],
      },
    };

    const result = resolveRole([], config);

    expect(result).toBe('learner');
  });

  it('performs case-insensitive matching', () => {
    const config = {
      role_mapping: {
        source_field: 'groups',
        admin_values: ['platform-admins'],
      },
    };

    const result = resolveRole(['PLATFORM-ADMINS'], config);

    expect(result).toBe('admin');
  });

  it('returns learner when ssoConfig is null', () => {
    const result = resolveRole(['Platform-Admins'], null);

    expect(result).toBe('learner');
  });

  it('returns learner when role_mapping is not configured', () => {
    const result = resolveRole(['Platform-Admins'], {});

    expect(result).toBe('learner');
  });

  it('returns learner when admin_values is empty', () => {
    const config = {
      role_mapping: {
        source_field: 'groups',
        admin_values: [],
      },
    };

    const result = resolveRole(['Platform-Admins'], config);

    expect(result).toBe('learner');
  });

  it('never defaults to admin', () => {
    // No config
    expect(resolveRole([], null)).toBe('learner');
    // Empty config
    expect(resolveRole([], {})).toBe('learner');
    // Empty admin values
    expect(resolveRole(['anything'], { role_mapping: { source_field: 'groups', admin_values: [] } })).toBe('learner');
    // Non-matching groups
    expect(resolveRole(['users'], { role_mapping: { source_field: 'groups', admin_values: ['admins'] } })).toBe('learner');
  });
});
