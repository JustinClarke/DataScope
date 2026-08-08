import { describe, expect, it } from "vitest";
import {
  findLikelySensitiveColumns,
  isLikelySensitiveColumnName,
} from "./sensitiveColumns";

describe("isLikelySensitiveColumnName", () => {
  it("matches common personal-data column-name shapes", () => {
    expect(isLikelySensitiveColumnName("email")).not.toBeNull();
    expect(isLikelySensitiveColumnName("user_email")).not.toBeNull();
    expect(isLikelySensitiveColumnName("contactEmail")).not.toBeNull();
    expect(isLikelySensitiveColumnName("phone_number")).not.toBeNull();
    expect(isLikelySensitiveColumnName("ssn")).not.toBeNull();
    expect(isLikelySensitiveColumnName("date_of_birth")).not.toBeNull();
    expect(isLikelySensitiveColumnName("dob")).not.toBeNull();
    expect(isLikelySensitiveColumnName("first_name")).not.toBeNull();
    expect(isLikelySensitiveColumnName("Name")).not.toBeNull();
    expect(isLikelySensitiveColumnName("name")).not.toBeNull();
    expect(isLikelySensitiveColumnName("home_address")).not.toBeNull();
    expect(isLikelySensitiveColumnName("credit_card_number")).not.toBeNull();
    expect(isLikelySensitiveColumnName("ip_address")).not.toBeNull();
    expect(isLikelySensitiveColumnName("password")).not.toBeNull();
  });

  it("does not flag ordinary structural or numeric columns", () => {
    expect(isLikelySensitiveColumnName("order_id")).toBeNull();
    expect(isLikelySensitiveColumnName("fare")).toBeNull();
    expect(isLikelySensitiveColumnName("created_at")).toBeNull();
    expect(isLikelySensitiveColumnName("quantity")).toBeNull();
  });

  it('flags a bare "name" column exactly, but not a compound structural column containing "name"', () => {
    expect(isLikelySensitiveColumnName("name")).not.toBeNull();
    expect(isLikelySensitiveColumnName("table_name")).toBeNull();
    expect(isLikelySensitiveColumnName("column_name")).toBeNull();
    expect(isLikelySensitiveColumnName("file_name")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(isLikelySensitiveColumnName("EMAIL")).not.toBeNull();
    expect(isLikelySensitiveColumnName("SSN")).not.toBeNull();
  });
});

describe("findLikelySensitiveColumns", () => {
  it("returns one finding per matching column, across tables", () => {
    const findings = findLikelySensitiveColumns([
      {
        tableName: "users",
        columns: [{ name: "id" }, { name: "email" }, { name: "ssn" }],
      },
      {
        tableName: "orders",
        columns: [{ name: "order_id" }, { name: "total" }],
      },
    ]);
    expect(findings).toEqual([
      { tableName: "users", columnName: "email", reason: expect.any(String) },
      { tableName: "users", columnName: "ssn", reason: expect.any(String) },
    ]);
  });

  it("returns an empty array when nothing matches — callers must render this as silence, never an all-clear", () => {
    const findings = findLikelySensitiveColumns([
      {
        tableName: "titanic",
        columns: [
          { name: "passenger_id" },
          { name: "fare" },
          { name: "survived" },
        ],
      },
    ]);
    expect(findings).toEqual([]);
  });
});
