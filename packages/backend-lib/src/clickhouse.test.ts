import {
  executeWithSettingsFallback,
  isUnsupportedClickhouseSettingsError,
  resetClickhouseSettingsSupportCache,
  stripUnsupportedClickhouseSettings,
} from "./clickhouse";

const DELETE_USER_EVENTS = `DELETE FROM user_events_v2 WHERE workspace_id = 'ws'
 settings mutations_sync = 0, lightweight_deletes_sync = 0;`;

function unknownSettingError(): Error {
  const error = new Error(
    "Setting lightweight_deletes_sync is neither a builtin setting nor started with the prefix 'SQL_' registered for user-defined settings.",
  );
  Object.assign(error, { code: "115", type: "UNKNOWN_SETTING" });
  return error;
}

describe("stripUnsupportedClickhouseSettings", () => {
  it("leaves statements that don't reference the setting untouched", () => {
    const statement = "DELETE FROM t WHERE a = 1 settings mutations_sync = 0;";
    expect(stripUnsupportedClickhouseSettings(statement)).toEqual(statement);
  });

  it("removes the setting when it trails mutations_sync", () => {
    expect(stripUnsupportedClickhouseSettings(DELETE_USER_EVENTS)).toEqual(
      `DELETE FROM user_events_v2 WHERE workspace_id = 'ws'
 settings mutations_sync = 0;`,
    );
  });

  it("removes the setting when it precedes mutations_sync", () => {
    expect(
      stripUnsupportedClickhouseSettings(
        "DELETE FROM t WHERE a = 1 settings lightweight_deletes_sync = 0, mutations_sync = 0;",
      ),
    ).toEqual("DELETE FROM t WHERE a = 1 settings mutations_sync = 0;");
  });

  it("removes the setting from an uppercase settings clause without a trailing semicolon", () => {
    expect(
      stripUnsupportedClickhouseSettings(
        "DELETE FROM t WHERE a = 1 SETTINGS mutations_sync = 0, lightweight_deletes_sync = 0",
      ),
    ).toEqual("DELETE FROM t WHERE a = 1 SETTINGS mutations_sync = 0");
  });

  it("drops a settings clause that only contained the setting", () => {
    expect(
      stripUnsupportedClickhouseSettings(
        "DELETE FROM t WHERE a = 1 settings lightweight_deletes_sync = 0;",
      ),
    ).toEqual("DELETE FROM t WHERE a = 1;");
  });
});

describe("isUnsupportedClickhouseSettingsError", () => {
  it("recognizes an unknown setting error for lightweight_deletes_sync", () => {
    expect(isUnsupportedClickhouseSettingsError(unknownSettingError())).toEqual(
      true,
    );
  });

  it("recognizes the error by its type", () => {
    expect(
      isUnsupportedClickhouseSettingsError({
        type: "UNKNOWN_SETTING",
        message: "unknown setting lightweight_deletes_sync",
      }),
    ).toEqual(true);
  });

  it("ignores unrelated errors", () => {
    expect(
      isUnsupportedClickhouseSettingsError(
        Object.assign(new Error("Timeout error"), { code: "159" }),
      ),
    ).toEqual(false);
    expect(
      isUnsupportedClickhouseSettingsError(
        new Error("Setting mutations_sync is unknown"),
      ),
    ).toEqual(false);
    expect(isUnsupportedClickhouseSettingsError("boom")).toEqual(false);
    expect(isUnsupportedClickhouseSettingsError(undefined)).toEqual(false);
  });
});

describe("executeWithSettingsFallback", () => {
  beforeEach(() => {
    resetClickhouseSettingsSupportCache();
  });

  it("sends the statement unchanged when the server supports the setting", async () => {
    const statements: string[] = [];
    const result = await executeWithSettingsFallback({
      statement: DELETE_USER_EVENTS,
      queryId: "query-id",
      execute: (statement) => {
        statements.push(statement);
        return Promise.resolve("ok");
      },
    });

    expect(result).toEqual("ok");
    expect(statements).toEqual([DELETE_USER_EVENTS]);
  });

  it("retries without the setting when the server rejects it", async () => {
    const statements: string[] = [];
    const execute = (statement: string) => {
      statements.push(statement);
      if (statement.includes("lightweight_deletes_sync")) {
        return Promise.reject(unknownSettingError());
      }
      return Promise.resolve("ok");
    };

    const result = await executeWithSettingsFallback({
      statement: DELETE_USER_EVENTS,
      queryId: "query-id",
      execute,
    });

    expect(result).toEqual("ok");
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("lightweight_deletes_sync");
    expect(statements[1]).not.toContain("lightweight_deletes_sync");
    expect(statements[1]).toContain("mutations_sync = 0");

    // the rejection is remembered, so later statements are stripped up front
    await executeWithSettingsFallback({
      statement: DELETE_USER_EVENTS,
      queryId: "query-id",
      execute,
    });

    expect(statements).toHaveLength(3);
    expect(statements[2]).not.toContain("lightweight_deletes_sync");
  });

  it("does not retry a statement that never referenced the setting", async () => {
    const statements: string[] = [];

    await executeWithSettingsFallback({
      statement: "SELECT 1",
      queryId: "query-id",
      execute: (statement) => {
        statements.push(statement);
        return Promise.reject(unknownSettingError());
      },
    }).catch(() => undefined);

    expect(statements).toEqual(["SELECT 1"]);
  });

  it("does not retry unrelated failures", async () => {
    let calls = 0;

    const failure = executeWithSettingsFallback({
      statement: DELETE_USER_EVENTS,
      queryId: "query-id",
      execute: () => {
        calls += 1;
        return Promise.reject(
          Object.assign(new Error("Timeout error"), { code: "159" }),
        );
      },
    });

    await expect(failure).rejects.toThrow("Timeout error");
    expect(calls).toEqual(1);
  });
});
