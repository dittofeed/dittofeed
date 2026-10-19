import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { unwrap } from "isomorphic-lib/src/resultHandling/resultUtils";

import { AwsCredentialsProvider, Config } from "./config";

type ConfigOverrides = Partial<Config>;

let mockConfigOverrides: ConfigOverrides = {};

jest.mock("./config", () => {
  const actual: Record<string, unknown> = jest.requireActual("./config");
  return {
    __esModule: true,
    ...actual,
    default: jest.fn(() => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/consistent-type-assertions
      ...(actual.default as () => Config)(),
      ...mockConfigOverrides,
    })),
  };
});

// eslint-disable-next-line import/first
import {
  buildS3ClientConfig,
  createBucket,
  resetStorageClient,
  storage,
} from "./blobStorage";
// eslint-disable-next-line import/first
import {
  getSesClient,
  isAwsSesEndpoint,
  isValidSnsSubscribeUrl,
  resetSesClients,
  resolveSesSendConfig,
} from "./destinations/amazonses";

function s3Error(name: string, httpStatusCode: number, headers = {}) {
  const e = new S3ServiceException({
    name,
    $fault: "client",
    $metadata: { httpStatusCode },
  });
  Object.assign(e, { $response: { headers } });
  return e;
}

describe("AWS integrations", () => {
  afterEach(() => {
    mockConfigOverrides = {};
    resetStorageClient();
    resetSesClients();
  });

  describe("isValidSnsSubscribeUrl", () => {
    it.each([
      ["https://sns.us-west-2.amazonaws.com/?Action=ConfirmSubscription", true],
      [
        "https://sns.cn-north-1.amazonaws.com.cn/?Action=ConfirmSubscription",
        true,
      ],
      ["https://sns.us-gov-west-1.amazonaws.com/", true],
      ["http://sns.us-west-2.amazonaws.com/", false],
      ["https://sns.us-west-2.amazonaws.com:8443/", false],
      ["https://user:pw@sns.us-west-2.amazonaws.com/", false],
      ["https://sns.us-west-2.amazonaws.com.evil.com/", false],
      ["https://evil.com/?sns.us-east-1.amazonaws.com", false],
      ["https://169.254.169.254/latest/meta-data/", false],
      ["not a url", false],
    ])("%s -> %s", (url, expected) => {
      expect(isValidSnsSubscribeUrl(url)).toBe(expected);
    });
  });

  describe("isAwsSesEndpoint", () => {
    it.each([
      ["https://email.us-west-2.amazonaws.com", true],
      ["https://email-fips.us-east-1.amazonaws.com", true],
      ["https://email.cn-northwest-1.amazonaws.com.cn", true],
      ["https://vpce-0abc123-xyz.email.us-west-2.vpce.amazonaws.com", true],
      ["http://email.us-west-2.amazonaws.com", false],
      ["https://email.us-west-2.amazonaws.com.evil.com", false],
      ["https://abc.execute-api.us-east-1.amazonaws.com", false],
      ["https://attacker-bucket.s3.amazonaws.com", false],
      ["https://amazonaws.com", false],
      ["https://localhost:4566", false],
    ])("%s -> %s", (url, expected) => {
      expect(isAwsSesEndpoint(url)).toBe(expected);
    });
  });

  describe("resolveSesSendConfig", () => {
    describe("static mode (default, legacy behaviour)", () => {
      const allowDefaultCredentials = false;

      it("uses workspace keys, region and any custom endpoint", () => {
        const r = resolveSesSendConfig({
          settings: {
            accessKeyId: "AKID",
            secretAccessKey: "secret",
            region: "eu-west-1",
            endpoint: "http://localhost:4566",
          },
          allowDefaultCredentials,
          awsDefaultRegion: "us-west-2",
        });
        expect(unwrap(r)).toEqual({
          accessKeyId: "AKID",
          secretAccessKey: "secret",
          region: "eu-west-1",
          endpoint: "http://localhost:4566",
        });
      });

      it.each([
        [{ secretAccessKey: "s", region: "us-west-2" }],
        [{ accessKeyId: "a", region: "us-west-2" }],
        [{ accessKeyId: "a", secretAccessKey: "s" }],
        [{ accessKeyId: "a", secretAccessKey: "s", region: "" }],
        [{ accessKeyId: "", secretAccessKey: "", region: "us-west-2" }],
      ])(
        "rejects incomplete config %j (no AWS_REGION fallback)",
        (settings) => {
          const r = resolveSesSendConfig({
            settings,
            allowDefaultCredentials,
            awsDefaultRegion: "us-west-2",
          });
          expect(r.isErr()).toBe(true);
        },
      );

      it("treats an empty endpoint as unset", () => {
        const r = resolveSesSendConfig({
          settings: {
            accessKeyId: "a",
            secretAccessKey: "s",
            region: "us-west-2",
            endpoint: "",
          },
          allowDefaultCredentials,
        });
        expect(unwrap(r).endpoint).toBeUndefined();
      });
    });

    describe("default credential chain mode", () => {
      const allowDefaultCredentials = true;

      it("workspaces with keys keep using them (any endpoint)", () => {
        const r = resolveSesSendConfig({
          settings: {
            accessKeyId: "a",
            secretAccessKey: "s",
            region: "eu-west-1",
            endpoint: "http://localhost:4566",
          },
          allowDefaultCredentials,
          awsDefaultRegion: "us-west-2",
        });
        expect(unwrap(r)).toMatchObject({
          accessKeyId: "a",
          region: "eu-west-1",
          endpoint: "http://localhost:4566",
        });
      });

      it("uses the role and falls back to AWS_REGION when keys/region are empty", () => {
        const r = resolveSesSendConfig({
          settings: { accessKeyId: "", secretAccessKey: "", region: "" },
          allowDefaultCredentials,
          awsDefaultRegion: "us-west-2",
        });
        expect(unwrap(r)).toEqual({
          region: "us-west-2",
          endpoint: undefined,
        });
      });

      it("rejects a non-SES endpoint when signing with the role", () => {
        const r = resolveSesSendConfig({
          settings: {
            endpoint: "https://abc.execute-api.us-east-1.amazonaws.com",
          },
          allowDefaultCredentials,
          awsDefaultRegion: "us-west-2",
        });
        expect(r.isErr()).toBe(true);
      });

      it("accepts an SES VPC endpoint when signing with the role", () => {
        const r = resolveSesSendConfig({
          settings: {
            endpoint:
              "https://vpce-0abc-xyz.email.us-west-2.vpce.amazonaws.com",
          },
          allowDefaultCredentials,
          awsDefaultRegion: "us-west-2",
        });
        expect(r.isOk()).toBe(true);
      });

      it("rejects half-filled keys instead of silently using the role", () => {
        const r = resolveSesSendConfig({
          settings: { accessKeyId: "a", region: "us-west-2" },
          allowDefaultCredentials,
        });
        expect(r.isErr()).toBe(true);
      });

      it("errors when no region is available", () => {
        const r = resolveSesSendConfig({
          settings: {},
          allowDefaultCredentials,
        });
        expect(r.isErr()).toBe(true);
      });
    });
  });

  describe("buildS3ClientConfig", () => {
    it("keeps static keys + path style for the default (static) mode", () => {
      mockConfigOverrides = {
        blobStorageCredentialsProvider: AwsCredentialsProvider.StaticKeys,
        blobStorageAccessKeyId: "AKIDEXAMPLE",
        blobStorageSecretAccessKey: "secret",
        blobStorageEndpoint: "http://localhost:9010",
        blobStorageForcePathStyle: true,
        blobStorageRegion: "us-east-1",
      };
      const c = buildS3ClientConfig();
      expect(c.credentials).toEqual({
        accessKeyId: "AKIDEXAMPLE",
        secretAccessKey: "secret",
      });
      expect(c.endpoint).toBe("http://localhost:9010");
      expect(c.forcePathStyle).toBe(true);
    });

    it("omits credentials and endpoint in default-chain mode", () => {
      mockConfigOverrides = {
        blobStorageCredentialsProvider: AwsCredentialsProvider.DefaultChain,
        blobStorageEndpoint: undefined,
        blobStorageForcePathStyle: false,
        blobStorageRegion: "us-west-2",
      };
      const c = buildS3ClientConfig();
      expect(c.credentials).toBeUndefined();
      expect(c.endpoint).toBeUndefined();
      expect(c.forcePathStyle).toBe(false);
      expect(c.region).toBe("us-west-2");
    });

    it("reuses a single S3 client", () => {
      expect(storage()).toBe(storage());
    });
  });

  describe("createBucket", () => {
    function mockClient(impl: (cmd: unknown) => unknown) {
      const send = jest.fn((cmd: unknown) =>
        Promise.resolve().then(() => impl(cmd)),
      );
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      return { client: { send } as unknown as S3Client, send };
    }

    it("does nothing when the bucket exists", async () => {
      const { client, send } = mockClient(() => ({}));
      await createBucket(client, { bucketName: "b" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);
    });

    it("creates the bucket on 404 without LocationConstraint for a custom endpoint (MinIO)", async () => {
      mockConfigOverrides = {
        blobStorageEndpoint: "http://localhost:9010",
        blobStorageRegion: "local",
      };
      const { client, send } = mockClient((cmd) => {
        if (cmd instanceof HeadBucketCommand) throw s3Error("NotFound", 404);
        return {};
      });
      await createBucket(client, { bucketName: "b" });
      const create = send.mock.calls[1]?.[0];
      if (!(create instanceof CreateBucketCommand)) {
        throw new Error("expected CreateBucketCommand");
      }
      expect(create.input.CreateBucketConfiguration).toBeUndefined();
    });

    it("passes the region through as LocationConstraint for Amazon S3", async () => {
      mockConfigOverrides = {
        blobStorageEndpoint: undefined,
        blobStorageRegion: "il-central-1",
      };
      const { client, send } = mockClient((cmd) => {
        if (cmd instanceof HeadBucketCommand) throw s3Error("NotFound", 404);
        return {};
      });
      await createBucket(client, { bucketName: "b" });
      const create = send.mock.calls[1]?.[0];
      if (!(create instanceof CreateBucketCommand)) {
        throw new Error("expected CreateBucketCommand");
      }
      expect(create.input.CreateBucketConfiguration?.LocationConstraint).toBe(
        "il-central-1",
      );
    });

    it("falls back to CreateBucket on 403 and ignores BucketAlreadyOwnedByYou", async () => {
      const { client, send } = mockClient((cmd) => {
        if (cmd instanceof HeadBucketCommand) throw s3Error("Forbidden", 403);
        throw s3Error("BucketAlreadyOwnedByYou", 409);
      });
      await expect(
        createBucket(client, { bucketName: "b" }),
      ).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(2);
    });

    it("throws an actionable error on 301 (wrong region)", async () => {
      mockConfigOverrides = { blobStorageRegion: "us-east-1" };
      const { client } = mockClient(() => {
        throw s3Error("PermanentRedirect", 301, {
          "x-amz-bucket-region": "eu-west-1",
        });
      });
      await expect(createBucket(client, { bucketName: "b" })).rejects.toThrow(
        /bucket region: eu-west-1/,
      );
    });
  });

  describe("getSesClient", () => {
    it("caches clients per configuration", () => {
      const a = getSesClient({
        region: "us-west-2",
        accessKeyId: "a",
        secretAccessKey: "b",
      });
      const b = getSesClient({
        region: "us-west-2",
        accessKeyId: "a",
        secretAccessKey: "b",
      });
      const c = getSesClient({ region: "us-west-2" });
      expect(a).toBe(b);
      expect(a).not.toBe(c);
    });
  });
});
