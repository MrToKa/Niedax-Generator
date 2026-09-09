import type { Pool, PoolClient } from "pg";

/** Test-only fault at the driver boundary, after PostgreSQL has accepted a real write.
 * Production transaction handling must undo it; no trigger, grant or repository is changed.
 */
export function failAfterWrite(pool: Pool, statement: RegExp) {
  let failures = 0;
  const fault = new Error("Controlled Stage 10 post-write failure");
  const proxy = new Proxy(pool, {
    get(target, property) {
      if (property === "connect") {
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, member) {
              if (member === "query") {
                return async (...args: unknown[]) => {
                  const result: unknown = await Reflect.apply(connection.query, connection, args);
                  if (failures === 0 && typeof args[0] === "string" && statement.test(args[0])) {
                    failures += 1;
                    throw fault;
                  }
                  return result;
                };
              }
              const value: unknown = Reflect.get(connection, member);
              return typeof value === "function" ? value.bind(connection) : value;
            }
          }) as PoolClient;
        };
      }
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { pool: proxy, fault, failures: () => failures };
}

/** Both transactions reach their project row lock before it is released by the test. */
export function coordinateProjectLock(pool: Pool) {
  let arrivals = 0;
  let release!: () => void;
  const unlocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const proxy = new Proxy(pool, {
    get(target, property) {
      if (property === "connect")
        return async () => {
          const client = await target.connect();
          return new Proxy(client, {
            get(connection, member) {
              if (member === "query")
                return async (...args: unknown[]) => {
                  if (
                    typeof args[0] === "string" &&
                    /FROM projects[\s\S]*FOR UPDATE/u.test(args[0])
                  ) {
                    arrivals += 1;
                    await unlocked;
                  }
                  return Reflect.apply(connection.query, connection, args);
                };
              const value: unknown = Reflect.get(connection, member);
              return typeof value === "function" ? value.bind(connection) : value;
            }
          }) as PoolClient;
        };
      const value: unknown = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  return { pool: proxy, arrivals: () => arrivals, release };
}
