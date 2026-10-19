import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";

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
  isAwsEndpoint,
  isValidSnsSubscribeUrl,
  resetSesClients,
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

  describe("isAwsEndpoint", () => {
    it.each([
      ["https://email.us-west-2.amazonaws.com", true],
      ["https://vpce-0abc-xyz.email.us-west-2.vpce.amazonaws.com", true],
      ["https://email.cn-northwest-1.amazonaws.com.cn", true],
      ["http://email.us-west-2.amazonaws.com", false],
      ["https://email.us-west-2.amazonaws.com.evil.com", false],
      ["https://localhost:4566", false],
    ])("%s -> %s", (url, expected) => {
      expect(isAwsEndpoint(url)).toBe(expected);
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
