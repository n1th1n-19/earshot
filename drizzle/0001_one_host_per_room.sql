-- Exactly one host per room, enforced by the database rather than by
-- application code. Drizzle's schema DSL cannot express a partial unique
-- index, so this is a tracked custom migration.
--
-- Note what this does and does not guarantee: it makes two hosts impossible,
-- but it cannot enforce "at least one host". That case is handled by the
-- host-disconnect grace logic, which promotes a co-host or ends the room.

CREATE UNIQUE INDEX IF NOT EXISTS "one_host_per_room"
  ON "room_members" ("room_id")
  WHERE "role" = 'host';
