import { generateSecureKey } from "./crypto";
import { decrypt, encrypt, generateSecretKey } from "./secrets";

describe("secrets", () => {
  describe("encrypt and decrypt", () => {
    const plaintext = "Hello, world! This is a secret message.";
    let testSecretKey: string;

    beforeAll(() => {
      // Generate a single key for all tests in this describe block
      testSecretKey = generateSecretKey(32);
    });

    it("should encrypt a string and then decrypt it back successfully", () => {
      const encrypted = encrypt(plaintext, testSecretKey);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted.iv).toBe("string");
      expect(encrypted.iv.length).toBe(32); // 16 bytes in hex
      expect(typeof encrypted.encryptedData).toBe("string");
      expect(typeof encrypted.authTag).toBe("string");
      expect(encrypted.authTag.length).toBe(32); // 16 bytes in hex

      const decrypted = decrypt({ ...encrypted, secretKey: testSecretKey });
      expect(decrypted).toBe(plaintext);
    });

    it("should return null from decrypt if the wrong secret key is used", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const wrongSecretKey = generateSecureKey();
      const decrypted = decrypt({ ...encrypted, secretKey: wrongSecretKey });
      expect(decrypted).toBeNull();
    });

    it("should return null from decrypt if the IV is tampered", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const tamperedIv =
        encrypted.iv.slice(0, -1) + (encrypted.iv.endsWith("a") ? "b" : "a"); // Change last char
      const decrypted = decrypt({
        ...encrypted,
        iv: tamperedIv,
        secretKey: testSecretKey,
      });
      expect(decrypted).toBeNull();
    });

    it("should return null from decrypt if the encryptedData is tampered", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const tamperedData =
        encrypted.encryptedData.slice(0, -1) +
        (encrypted.encryptedData.endsWith("a") ? "b" : "a");
      const decrypted = decrypt({
        ...encrypted,
        encryptedData: tamperedData,
        secretKey: testSecretKey,
      });
      expect(decrypted).toBeNull();
    });

    it("should return null from decrypt if the authTag is tampered", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const tamperedAuthTag =
        encrypted.authTag.slice(0, -1) +
        (encrypted.authTag.endsWith("a") ? "b" : "a");
      const decrypted = decrypt({
        ...encrypted,
        authTag: tamperedAuthTag,
        secretKey: testSecretKey,
      });
      expect(decrypted).toBeNull();
    });

    it("encrypt should throw an error if the secret key is not 32 bytes after base64 decoding", () => {
      const shortKey = Buffer.from("too short key").toString("base64"); // Not 32 bytes
      expect(() => encrypt(plaintext, shortKey)).toThrow(
        /Invalid secret key length after encoding. Expected 32 bytes for AES-256-GCM/,
      );
    });

    it("decrypt should return null if the secret key is not 32 bytes after base64 decoding", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const shortKey = Buffer.from("too short key").toString("base64");
      const decrypted = decrypt({ ...encrypted, secretKey: shortKey });
      expect(decrypted).toBeNull();
    });

    it("encrypt should throw if secretKeyString is empty or invalid", () => {
      expect(() => encrypt(plaintext, "")).toThrow(
        "Secret key is not set in config or is not a string. Please ensure 'secretKey' is configured.",
      );
    });

    it("decrypt should return null if secretKeyString is empty or invalid", () => {
      const encrypted = encrypt(plaintext, testSecretKey);
      const decrypted = decrypt({ ...encrypted, secretKey: "" });
      expect(decrypted).toBeNull();
    });
  });
});
