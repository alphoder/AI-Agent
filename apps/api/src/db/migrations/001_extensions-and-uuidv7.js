/**
 * Migration 001: Enable extensions and create UUIDv7 function
 * UUIDv7 provides time-sortable UUIDs per RFC 9562
 */
exports.up = (pgm) => {
  // Enable extensions
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // UUIDv7 function (RFC 9562 time-sortable UUIDs)
  pgm.sql(`
    CREATE OR REPLACE FUNCTION generate_uuidv7()
    RETURNS uuid AS $$
    DECLARE
      unix_ts_ms bigint;
      uuid_bytes bytea;
    BEGIN
      unix_ts_ms = (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint;
      uuid_bytes = substring(int8send(unix_ts_ms) from 3);
      uuid_bytes = uuid_bytes || gen_random_bytes(10);
      -- Set version 7
      uuid_bytes = set_byte(uuid_bytes, 6, (b'0111' || get_byte(uuid_bytes, 6)::bit(4))::bit(8)::int);
      -- Set variant 10
      uuid_bytes = set_byte(uuid_bytes, 8, (b'10' || get_byte(uuid_bytes, 8)::bit(6))::bit(8)::int);
      RETURN encode(uuid_bytes, 'hex')::uuid;
    END;
    $$ LANGUAGE plpgsql VOLATILE;
  `);
};

exports.down = (pgm) => {
  pgm.sql('DROP FUNCTION IF EXISTS generate_uuidv7()');
  pgm.sql('DROP EXTENSION IF EXISTS "pgcrypto"');
  pgm.sql('DROP EXTENSION IF EXISTS "uuid-ossp"');
};
