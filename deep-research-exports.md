

# **Architecting a Scalable Database-to-S3 Export Pipeline in Node.js: A Deep Dive into Streaming, Cursors, and Multipart Uploads**

## **Introduction**

The requirement to export large volumes of data from an operational database to a durable storage layer like Amazon S3 is a common and critical business function. These exports serve a multitude of purposes, from creating analytical datasets and populating data warehouses to generating reports and archiving historical records. While seemingly straightforward for small datasets, this task presents significant technical challenges when scaled to tables containing millions or billions of rows. Naive approaches that attempt to load the entire dataset into an application's memory before processing are destined to fail, inevitably leading to OutOfMemory exceptions, application crashes, and unreliable data pipelines.1

A robust and scalable solution to this problem is to process data in manageable chunks. This report details the architecture and implementation of a data export pipeline that maintains a constant, low memory footprint, regardless of the total data volume. This is achieved by fetching data from the database in pages and streaming the transformation and upload processes.

The pipeline architecture consists of three distinct, composable stages:

1. **Data Source:** A paginated data-fetching loop that uses cursor-based queries to efficiently retrieve data from a PostgreSQL database in batches, without exhausting server resources.  
2. **In-Flight Transformation:** A Transform stream that intercepts the flow of data, converting it from its raw database format into CSV-formatted text on the fly.  
3. **Data Sink:** An abstraction over a Writable stream that efficiently uploads the transformed data to an Amazon S3 bucket, handling the complexities of large file uploads.

This report will serve as a comprehensive blueprint for building such a system in a Node.js and TypeScript environment. It leverages a curated set of best-in-class libraries—pg for database connectivity, @fast-csv/format for transformation, and the AWS SDK v3's @aws-sdk/lib-storage for uploads. The entire process is orchestrated by Node.js's modern stream.promises.pipeline API, which guarantees resilience and proper error handling for the streaming portion of the workflow, forming the robust backbone of our solution.

## **The End-to-End Streaming Paradigm: A Foundational Principle**

At the heart of any memory-efficient data processing application in Node.js lies the stream module. Understanding its principles is not merely a technical detail but the foundational architectural choice upon which the entire export service is built. This section establishes the core concepts of streaming and justifies the selection of stream.pipeline as the central orchestrator for our data flow.

### **What are Node.js Streams?**

Node.js provides four fundamental types of streams, each serving a specific role in the data processing lifecycle.2

* **Readable Streams:** These represent a source from which data can be consumed. Examples include reading from a file (fs.createReadStream), an incoming HTTP request on a server, or, in our case, the results of a database query.2 The stream emits data in chunks, which can be consumed by a listener or piped to another stream.  
* **Writable Streams:** These represent a destination to which data can be written. Examples include writing to a file (fs.createWriteStream), an outgoing HTTP response, or an upload process to cloud storage.2  
* **Duplex Streams:** These are streams that are both Readable and Writable, such as a TCP socket connection.2  
* **Transform Streams:** A special type of Duplex stream, Transform streams are designed to modify or transform the data as it passes through. The output of a Transform stream is computed based on its input. This makes them ideal for tasks like compression, encryption, or, as in our use case, data format conversion (e.g., from JavaScript objects to CSV strings).2

The fundamental advantage of this model is that data is processed piece by piece, rather than being loaded into memory all at once. This is the key to handling massive files and datasets with minimal resource consumption, preventing the common OutOfMemory errors that plague non-streaming approaches.5

### **The Power of .pipe() and the Peril of Error Handling**

The elegance of the stream module is most apparent in the .pipe() method. This method provides a simple, declarative way to connect the output of a Readable stream to the input of a Writable stream. A chain of pipes can be created to form a multi-stage processing pipeline.4 For example:

readableStream.pipe(transformStream).pipe(writableStream).

However, for any production-grade system, the standard .pipe() method has a critical, often fatal, flaw: its error handling mechanism is fragmented and unreliable. An error emitted on one stream in a pipe chain does not automatically propagate to the other streams.6 If an error occurs in the initial

readableStream, a listener attached only to the final writableStream will never be notified. This unhandled error event will bubble up the Node.js event loop and, by default, crash the entire process.7

The conventional workaround involves attaching a separate error listener to every single stream in the chain, which is verbose, error-prone, and clutters the application logic.6

TypeScript

// Verbose and error-prone error handling with.pipe()  
readableStream  
.on('error', handleError)  
.pipe(transformStream)  
.on('error', handleError)  
.pipe(writableStream)  
.on('error', handleError);

This approach is not just syntactically inconvenient; it represents a significant architectural liability. Forgetting a single handler can introduce a critical point of failure into the system.

### **The Modern Solution: stream.pipeline**

To address the inherent weaknesses of .pipe(), the Node.js core team introduced stream.pipeline (and its promise-based counterpart, stream.promises.pipeline). This utility function is the modern, robust, and recommended way to construct stream pipelines.7 It offers two transformative advantages over manual piping.

First, it provides **centralized error handling**. pipeline accepts a single callback function as its final argument (or returns a Promise that rejects), which is guaranteed to be called with an error if *any* stream in the pipeline fails. This consolidates error handling logic into one place, making the code cleaner and more resilient.7

Second, it ensures **guaranteed cleanup**. When an error occurs, pipeline automatically calls .destroy() on all streams in the pipeline. This is crucial for preventing resource leaks, such as open file descriptors or dangling network connections, which can occur if a stream fails midway through its operation.8

The primary intellectual property and business logic of this export service are not found in the boilerplate setup of a database client or an S3 connection. Instead, they are embodied in the composition and orchestration of the data flow itself. The choice to use a paginated fetching loop combined with stream.promises.pipeline for the processing and upload stages is the central architectural decision. This combination elevates the workflow from a simple sequence of operations to a transactional, self-cleaning unit of work. The pipeline function's robust error handling guarantees that the streaming portion will either complete successfully or fail cleanly, without leaving the system in an inconsistent state. This makes pipeline an indispensable part of our architecture.

## **The Data Source: High-Performance Pagination with Manual Cursors**

The performance and memory efficiency of the entire export pipeline begin at its source. How data is read from the database is arguably the most critical factor in achieving scalability. This section contrasts traditional pagination methods with the far superior cursor-based approach and details its implementation using manual, batched queries.

### **The Inefficiency of Traditional Pagination**

The most common method for retrieving large datasets in chunks is offset-based pagination, which relies on the SQL LIMIT and OFFSET clauses.10 A typical query to fetch the 101st "page" of 100 records would look like this:

SELECT \* FROM products ORDER BY created\_at DESC LIMIT 100 OFFSET 10000;

While intuitive and simple to implement, this approach suffers from two severe drawbacks that make it unsuitable for large-scale data export tasks.

First, it has debilitating performance degradation. To fulfill a query with a large OFFSET, the database cannot simply jump to the desired row. It must scan all the rows from the beginning of the result set, load them, and then discard the number of rows specified by the OFFSET before it can begin returning the requested LIMIT.12 As the offset grows, the amount of work the database must do increases linearly, leading to progressively slower query times. Fetching the last few pages of a multi-million-row table can take orders of magnitude longer than fetching the first few.11

Second, it suffers from data consistency issues in dynamic environments. If new rows are inserted or existing rows are deleted while a user or process is paginating through the data, the "window" of data can shift. This can lead to records being duplicated across pages or, worse, being skipped entirely, compromising the integrity of the export.11

### **The Superiority of Cursor-Based Pagination**

Cursor-based pagination, also known as keyset pagination, fundamentally solves the problems of the offset approach. Instead of telling the database how many rows to *skip*, it provides a stable "anchor" or "cursor" from the last record of the previous page and asks for the next set of rows *after* that anchor.10 This is typically implemented with a

WHERE clause on an indexed, unique column (or a combination of columns).

For a table sorted by a unique, sequential id, the query to get the next page after the last-seen ID of 10000 would be:

SELECT \* FROM products WHERE id \> 10000 ORDER BY id ASC LIMIT 100;

This approach leverages the power of database indexes. The database can perform a highly efficient index seek to locate the starting point of the query, resulting in consistently fast performance regardless of how "deep" into the dataset the query is.12 Because it relies on the absolute value of the anchor, it is also resilient to insertions and deletions occurring elsewhere in the table, ensuring a consistent and complete data export.11

The following table provides a clear justification for the architectural choice of a cursor-based approach for this ETL task.

| Feature | Offset-Based Pagination | Cursor-Based Pagination |
| :---- | :---- | :---- |
| **Performance** | Degrades linearly (or worse) with offset 12 | Consistent, high performance (index seek) 13 |
| **Data Consistency** | Prone to missed/duplicate items on write-heavy tables 11 | Resilient to data changes between fetches 13 |
| **Implementation** | Simpler, more intuitive 11 | More complex, requires careful key selection 12 |
| **Use Cases** | Admin UIs, small/static datasets 12 | Infinite scroll, API feeds, large-scale ETL 13 |
| **SQL Example** | SELECT... ORDER BY id LIMIT 100 OFFSET 100000; | SELECT... WHERE id \> 100000 ORDER BY id LIMIT 100; |

### **Implementing Manual Cursor-Based Pagination**

Instead of using a continuous database stream, we will implement a more traditional paginated fetching model. This involves a loop that repeatedly queries the database for the next "page" of data until all records have been retrieved. While this approach loads one full page into memory at a time, it still prevents the entire multi-million-row result set from being buffered, thus maintaining a low memory footprint.

The core of this implementation is a while loop that manages the pagination state. The state is simply the "cursor"—a set of values from the last row of the previously fetched page that uniquely identifies its position in the sorted dataset. 10 To ensure stable and correct ordering, especially when sorting by a non-unique column like a timestamp, a compound cursor is essential. This typically combines the primary sorting column (e.g.,

created\_at) with a unique key (e.g., id) to act as a tie-breaker. 10

The SQL query leverages this cursor in its WHERE clause. For PostgreSQL, this can be expressed elegantly using tuple comparison, which is both readable and highly efficient when backed by a corresponding compound index. 30

SQL

\-- Fetching a subsequent page using a compound cursor  
SELECT \* FROM users  
WHERE (created\_at, id) \< ($1, $2) \-- Using values from the last row of the previous page  
ORDER BY created\_at DESC, id DESC  
LIMIT $3; \-- The page size

The application logic will construct this query inside the loop, execute it to get a page of rows, write those rows into our transformation stream, and then extract the cursor from the last row of the page to prepare for the next iteration. The loop terminates when the database returns a page with fewer rows than requested, indicating the end of the dataset has been reached.

## **The Transformation Stage: Real-Time CSV Formatting**

Once the application fetches a page of database rows as an array of JavaScript objects, the next stage is to transform this data into the desired output format. For this task, the @fast-csv/format library provides a powerful and flexible Transform stream, designed specifically for converting structured data into CSV text in a memory-efficient manner.

### **Introducing @fast-csv/format**

The @fast-csv/format library is a purpose-built tool that fits perfectly into our stream-based architecture. It exposes a format function that returns a Transform stream. This stream is designed to consume JavaScript objects (or arrays) from an upstream source and, for each object it receives, produce a corresponding line of CSV-formatted string data to its downstream consumer.15 This on-the-fly conversion is essential for maintaining the pipeline's low memory profile, as it avoids the need to buffer the entire dataset before serialization.

### **Core Usage and Header Management**

The most common use case involves creating a formatter and specifying how headers should be handled. The headers option is particularly powerful.

When headers: true is used, the library will automatically inspect the keys of the first object it receives and use them to generate the header row of the CSV file.17

TypeScript

import { format } from '@fast-csv/format';

const csvFormatter \= format({ headers: true });

csvFormatter.pipe(process.stdout);

csvFormatter.write({ header1: 'value1a', header2: 'value1b' });  
csvFormatter.write({ header1: 'value2a', header2: 'value2b' });  
csvFormatter.end();

// Output:  
// header1,header2  
// value1a,value1b  
// value2a,value2b

While convenient, a more robust and powerful pattern is to provide an explicit array of strings to the headers option. This provides several key benefits:

1. **Column Ordering:** It guarantees the columns in the output CSV will appear in the specified order, regardless of the key order in JavaScript objects.  
2. **Column Filtering:** Only the keys present in the headers array will be included in the output. Any other properties on the incoming objects will be ignored.  
3. **Column Renaming:** The strings in the headers array become the literal header names in the output file, allowing for easy renaming.

This capability is fundamental to creating a clean separation between the internal data structure (the database schema) and the public contract of the exported file. The export is no longer a raw dump of a table; it becomes a curated data product. For example, a database query might return objects with snake\_case keys like { user\_id: 1, first\_name: 'John' }. The application can use the headers option to transform this into a CSV with different names and ordering, such as First Name,User ID, without altering the underlying SQL query. This decoupling makes the system more flexible and maintainable, as different export formats can be generated from the same base data stream simply by changing the formatter's configuration.

### **On-the-Fly Data Manipulation with.transform()**

For more complex data manipulation beyond simple renaming or reordering, @fast-csv/format provides a .transform() method on the formatter stream.15 This function accepts a callback that is executed for every single row (object) that passes through the stream,

*before* it is converted to a CSV string. This allows for synchronous, row-by-row data manipulation.

This is extremely useful for tasks like:

* Formatting data (e.g., converting a Date object to a specific string representation).  
* Combining multiple fields into one.  
* Applying business logic or calculations to derive new fields.

The following example demonstrates using .transform() to remap the object's keys and values before they are formatted, effectively renaming the columns and modifying the data in one step.16

TypeScript

import { format } from '@fast-csv/format';

const transformStream \= format({ headers: true })  
.transform((row: { alpha: string; beta: string; }) \=\> ({  
    'New Alpha Header': row.alpha.toUpperCase(),  
    'New Beta Header': row.beta  
  }));

transformStream.pipe(process.stdout);

transformStream.write({ alpha: 'alphaRow1', beta: 'betaRow1' });  
transformStream.end();

// Output:  
// "New Alpha Header","New Beta Header"  
// "ALPHAROW1","betaRow1"

By combining explicit header control with the .transform() function, the application gains complete control over the structure and content of the output CSV, creating a powerful abstraction layer between the database schema and the final exported artifact.

## **The Data Sink: Mastering Large-Scale Uploads to Amazon S3**

The final stage of the pipeline is the data sink, responsible for writing the stream of CSV data to an object in an Amazon S3 bucket. Uploading large files to S3 introduces its own set of complexities, primarily managed through the S3 Multipart Upload protocol. This section explains the protocol and introduces the high-level AWS SDK library that abstracts these complexities away, providing a simple and efficient streaming interface.

### **The S3 Multipart Upload Protocol**

For objects larger than a certain threshold (typically 100MB, but configurable), S3 recommends using the multipart upload API. This process allows a single large object to be uploaded as a set of smaller, independent parts.19 The fundamental workflow involves three steps:

1. **Initiate Multipart Upload:** The application sends a CreateMultipartUpload request to S3. S3 responds with a unique UploadId that identifies this specific upload transaction.20  
2. **Upload Parts:** The application splits the large file into chunks (parts) and uploads each one using an UploadPart request. Each request must include the UploadId and a unique PartNumber (from 1 to 10,000). Upon successful upload of a part, S3 returns an ETag (an entity tag, essentially a checksum of the part's data), which the application must store along with the corresponding PartNumber.19  
3. **Complete Multipart Upload:** After all parts have been successfully uploaded, the application sends a CompleteMultipartUpload request. This request includes the UploadId and a manifest listing all the PartNumber and ETag pairs. S3 then uses this manifest to assemble the parts in the correct order on the server side to create the final object.22

This protocol has several key constraints, including a minimum part size of 5MB (except for the final part) and a maximum of 10,000 parts per upload.21 Managing this process manually—chunking the data, tracking ETags, handling parallel uploads, and retrying failed parts—is complex and error-prone.

### **The Power of @aws-sdk/lib-storage**

To simplify this process, the AWS SDK for JavaScript v3 provides a high-level utility library, @aws-sdk/lib-storage. The centerpiece of this library is the Upload class, which is the recommended abstraction for streaming large payloads to S3.23

This class completely encapsulates the multipart upload lifecycle and provides significant benefits:

* **Automatic Strategy Selection:** It intelligently decides whether to use a simple PutObject operation for smaller payloads or a full multipart upload for larger ones, making the process transparent to the developer.  
* **Stream Chunking:** It automatically reads from an incoming stream and chunks the data into parts of a configurable size (partSize), respecting the 5MB minimum.  
* **Parallelism:** It can upload multiple parts concurrently to maximize throughput and reduce the total upload time. The level of concurrency is configurable via the queueSize option.21  
* **Resilience:** It internally manages retries for failed part uploads, improving the reliability of the overall operation.

### **Implementation: Piping the Pipeline to S3**

Integrating the Upload class into our pipeline is remarkably simple. An instance of the class is created with the S3 client and the upload parameters (Bucket, Key, etc.). The Body parameter is the crucial integration point: it accepts a Readable stream. The final output of our CSV formatting stream is piped into this Body.23 The

upload.done() method returns a promise that resolves when the entire upload is successfully completed or rejects if an unrecoverable error occurs.

The use of the Upload class creates a powerful dynamic within the pipeline. It doesn't just passively consume data; it actively manages the flow of the entire system through a mechanism known as backpressure. When the Upload class's internal buffers are full (for example, while it waits for several concurrent network requests for part uploads to complete), it signals upstream that it cannot accept more data. This signal propagates backward through the pipeline: the Upload class stops reading from the CSV formatter, which in turn causes the formatter's own buffer to fill, leading it to stop accepting new data from our manual .write() calls.

This creates a self-regulating system where data is produced from the source only as fast as it can be consumed by the final sink (S3). The overall speed of the pipeline is governed by its slowest component—typically the network upload to S3—while memory usage remains low and constant throughout the operation. This elegant property of well-behaved stream pipelines is the key to building truly scalable and resilient data processing systems.

## **The Complete Implementation: A Production-Ready Export Service**

This section synthesizes the architectural principles discussed previously into a complete, modular, and production-ready Node.js/TypeScript application. The code is structured for clarity, maintainability, and operational readiness.

### **Project Setup**

First, initialize a new Node.js project and install the necessary dependencies. The package.json file should include the core libraries for streaming, database access, and AWS integration, along with TypeScript and its related tooling.

**package.json**

JSON

{  
  "name": "db-to-s3-exporter",  
  "version": "1.0.0",  
  "description": "A scalable service to export PostgreSQL data to S3 as CSV.",  
  "main": "dist/main.js",  
  "scripts": {  
    "start": "node dist/main.js",  
    "build": "tsc",  
    "dev": "ts-node src/main.ts"  
  },  
  "dependencies": {  
    "@aws-sdk/client-s3": "^3.540.0",  
    "@aws-sdk/lib-storage": "^3.540.0",  
    "@fast-csv/format": "^5.0.0",  
    "dotenv": "^16.4.5",  
    "pg": "^8.11.3"  
  },  
  "devDependencies": {  
    "@types/node": "^20.11.30",  
    "@types/pg": "^8.11.4",  
    "ts-node": "^10.9.2",  
    "typescript": "^5.4.3"  
  }  
}

Next, configure the TypeScript compiler via tsconfig.json for a modern Node.js environment.

**tsconfig.json**

JSON

{  
  "compilerOptions": {  
    "target": "ES2022",  
    "module": "commonjs",  
    "rootDir": "./src",  
    "outDir": "./dist",  
    "esModuleInterop": true,  
    "forceConsistentCasingInFileNames": true,  
    "strict": true,  
    "skipLibCheck": true  
  },  
  "include": \["src/\*\*/\*"\]  
}

### **Modular Code Structure**

The application logic is organized into distinct modules, each with a single responsibility. This promotes separation of concerns and makes the codebase easier to understand and maintain.

**src/config.ts**

This module centralizes all configuration, loading sensitive values and environmental parameters from a .env file or system environment variables. This practice prevents hardcoding credentials in the source code.

TypeScript

import \* as dotenv from 'dotenv';

// Load environment variables from a.env file  
dotenv.config();

export const config \= {  
  db: {  
    user: process.env.DB\_USER |

| 'postgres',  
    host: process.env.DB\_HOST |

| 'localhost',  
    database: process.env.DB\_NAME |

| 'mydatabase',  
    password: process.env.DB\_PASSWORD |

| 'password',  
    port: parseInt(process.env.DB\_PORT |

| '5432', 10),  
  },  
  s3: {  
    bucketName: process.env.S3\_BUCKET\_NAME\!,  
    region: process.env.AWS\_REGION |

| 'us-east-1',  
    exportKey: process.env.S3\_EXPORT\_KEY |

| \`exports/data-${Date.now()}.csv\`,  
  },  
  export: {  
    // Example of providing explicit headers for the CSV  
    csvHeaders:,  
  },  
};

// Validate that required environment variables are set  
if (\!config.s3.bucketName) {  
  throw new Error('S3\_BUCKET\_NAME environment variable is not set.');  
}

**src/s3-client.ts**

This module is responsible for creating and exporting a singleton instance of the S3 client.

TypeScript

import { S3Client } from '@aws-sdk/client-s3';  
import { config } from './config';

export const s3Client \= new S3Client({  
  region: config.s3.region,  
  // Credentials will be loaded automatically from the environment  
  // (e.g., AWS\_ACCESS\_KEY\_ID, AWS\_SECRET\_ACCESS\_KEY) or an IAM role.  
});

### **The Orchestrator (main.ts)**

This is the main entry point of the application, where the pipeline is assembled and executed. It brings together all the components into a cohesive workflow orchestrated by a pagination loop and stream.promises.pipeline.

To clarify the roles of the key components before presenting the code, the following table serves as a quick reference.

| Component | Role in Pipeline | Key Abstraction / Feature |
| :---- | :---- | :---- |
| pg | Database Driver | Manages connection to PostgreSQL and executes paginated queries.25 |
| Manual Pagination Loop | Data Source Logic | A while loop that repeatedly fetches pages of data using cursor-based pagination to avoid loading the entire dataset into memory. 10 |
| @fast-csv/format | Transform Stream | Converts JavaScript objects from each page into a stream of CSV-formatted strings.15 |
| @aws-sdk/client-s3 | AWS Service Client | Provides the low-level S3Client for communication with the S3 API.24 |
| @aws-sdk/lib-storage | Writable Sink | Provides the high-level Upload class that consumes the CSV stream and handles multipart uploads.23 |
| stream (Node.js Core) | Orchestrator | Provides pipeline for robustly connecting the CSV formatter to the S3 uploader and a PassThrough stream to bridge the paginated writes to the pipeline. 9 |

**src/main.ts**

TypeScript

import { pipeline } from 'stream/promises';  
import { Client } from 'pg';  
import { format, FormatterOptionsArgs } from '@fast-csv/format';  
import { Upload } from '@aws-sdk/lib-storage';  
import { PassThrough } from 'stream';

import { config } from './config';  
import { s3Client } from './s3-client';

// Define the structure of a database row for type safety  
interface UserRow {  
  id: number;  
  first\_name: string;  
  last\_name: string;  
  email: string;  
  created\_at: Date;  
}

// Define the structure for our cursor  
interface Cursor {  
  createdAt: string; // Use ISO string for consistency  
  id: number;  
}

/\*\*  
 \* Fetches a single page of data using cursor-based pagination.  
 \* @param dbClient \- The active PostgreSQL client.  
 \* @param cursor \- The cursor from the previous page, or null for the first page.  
 \* @param limit \- The number of rows to fetch.  
 \* @returns An object containing the rows for the page and the cursor for the next page.  
 \*/  
async function fetchPage(  
  dbClient: Client,  
  cursor: Cursor | null,  
  limit: number  
): Promise\<{ rows: UserRow; nextCursor: Cursor | null }\> {  
  let queryText: string;  
  let queryParams: any;

  // The query uses a compound key (created\_at, id) for stable pagination.  
  // We sort by created\_at DESC, then id DESC as a tie-breaker.  
  // The tuple comparison \`(created\_at, id) \< ($1, $2)\` is an efficient  
  // PostgreSQL feature for keyset pagination. \[30\]  
  if (cursor) {  
    // Subsequent page query  
    queryText \= \`  
      SELECT id, first\_name, last\_name, email, created\_at  
      FROM users  
      WHERE (created\_at, id) \< ($1, $2)  
      ORDER BY created\_at DESC, id DESC  
      LIMIT $3  
    \`;  
    queryParams \= \[cursor.createdAt, cursor.id, limit\];  
  } else {  
    // First page query  
    queryText \= \`  
      SELECT id, first\_name, last\_name, email, created\_at  
      FROM users  
      ORDER BY created\_at DESC, id DESC  
      LIMIT $1  
    \`;  
    queryParams \= \[limit\];  
  }

  const result \= await dbClient.query\<UserRow\>(queryText, queryParams);  
  const rows \= result.rows;

  let nextCursor: Cursor | null \= null;  
  if (rows.length \> 0) {  
    const lastRow \= rows\[rows.length \- 1\];  
    // The next cursor is based on the values of the last row of the current page  
    nextCursor \= {  
      createdAt: lastRow.created\_at.toISOString(),  
      id: lastRow.id,  
    };  
  }

  return { rows, nextCursor };  
}

async function exportDataToS3(): Promise\<void\> {  
  console.log('Starting database to S3 export process...');

  const dbClient \= new Client(config.db);  
  await dbClient.connect();  
  console.log('Database connection established.');

  // A PassThrough stream acts as a bridge between our manual writes and the S3 upload utility.  
  // It's a Writable stream for the CSV formatter and a Readable stream for the S3 Uploader. \[31, 32\]  
  const passThroughStream \= new PassThrough();

  // Setup the CSV formatter stream  
  const csvFormattingOptions: FormatterOptionsArgs\<UserRow, any\> \= {  
    headers: config.export.csvHeaders,  
    transform: (row: UserRow) \=\> ({  
      ID: row.id,  
      FirstName: row.first\_name,  
      LastName: row.last\_name,  
      Email: row.email,  
      RegistrationDate: row.created\_at.toISOString(),  
    }),  
  };  
  const csvFormatterStream \= format(csvFormattingOptions);

  // Setup the S3 upload utility  
  const s3Upload \= new Upload({  
    client: s3Client,  
    params: {  
      Bucket: config.s3.bucketName,  
      Key: config.s3.exportKey,  
      Body: passThroughStream,  
      ContentType: 'text/csv',  
    },  
    partSize: 5 \* 1024 \* 1024, // 5 MB  
    queueSize: 4,  
  });

  s3Upload.on('httpUploadProgress', (progress) \=\> {  
    const percent \= progress.loaded && progress.total? Math.round((progress.loaded / progress.total) \* 100) : 'unknown';  
    console.log(\`S3 Upload Progress: ${progress.loaded} bytes of ${progress.total} bytes (${percent}%)\`);  
  });

  try {  
    console.log(\`Starting export. Data will be uploaded to s3://${config.s3.bucketName}/${config.s3.exportKey}\`);

    // Concurrently run the S3 upload and the data processing pipeline.  
    // 1\. The S3 upload promise, which reads from the passThroughStream.  
    const s3UploadPromise \= s3Upload.done();

    // 2\. The data processing pipeline, which formats data and writes to the passThroughStream.  
    // We use stream.pipeline for robust error handling. \[7, 9\]  
    const dataProcessingPipeline \= pipeline(csvFormatterStream, passThroughStream);

    // 3\. The main loop for fetching data in pages.  
    let currentCursor: Cursor | null \= null;  
    let hasMore \= true;  
    const BATCH\_SIZE \= 10000; // Define the size of each page

    while (hasMore) {  
      const { rows, nextCursor } \= await fetchPage(dbClient, currentCursor, BATCH\_SIZE);  
      console.log(\`Fetched page with ${rows.length} rows.\`);

      for (const row of rows) {  
        // Write row to the CSV formatter. Backpressure is handled by the pipeline.  
        if (\!csvFormatterStream.write(row)) {  
          // If the stream's buffer is full, wait for it to drain.  
          await new Promise(resolve \=\> csvFormatterStream.once('drain', resolve));  
        }  
      }

      if (rows.length \< BATCH\_SIZE) {  
        hasMore \= false;  
      } else {  
        currentCursor \= nextCursor;  
      }  
    }

    console.log('All pages fetched. Finalizing CSV stream...');  
    // Signal that we are done writing to the CSV formatter.  
    csvFormatterStream.end();

    // Wait for both the data processing to finish and the S3 upload to complete.  
    await Promise.all(\[dataProcessingPipeline, s3UploadPromise\]);

    console.log('Export process completed successfully.');

  } catch (error) {  
    console.error('An error occurred during the export process:', error);  
    // Abort the S3 upload in case of an error during pagination  
    s3Upload.abort();  
    throw error;  
  } finally {  
    await dbClient.end();  
    console.log('Database connection closed.');  
  }  
}

// Execute the main function and handle top-level promise rejection  
exportDataToS3().catch((err) \=\> {  
  console.error('Export failed with unhandled error.');  
  process.exit(1);  
});

## **Operational Readiness: Configuration, Security, and Deployment**

A functional script is only the first step toward a production system. Operational readiness involves ensuring the application is secure, configurable, observable, and deployable.

### **Configuration Management**

As demonstrated in the implementation, all configuration must be externalized from the source code. Using environment variables, facilitated by a library like dotenv for local development, is a standard and portable practice.2 For production environments, these variables should be injected by the container orchestration system (e.g., Kubernetes, Amazon ECS) or the compute service (e.g., AWS Lambda environment variables). For highly sensitive data like database passwords, a dedicated secrets management service such as AWS Secrets Manager or HashiCorp Vault is strongly recommended. The application can be configured at startup to fetch these secrets directly from the service.26

### **IAM Security Best Practices**

The application should run under an IAM role that adheres to the principle of least privilege. This means granting only the permissions absolutely necessary for the task. Granting broad permissions like s3:\* is a significant security risk. A minimal, secure IAM policy for this export service is detailed below.

| Action | Resource | Rationale |
| :---- | :---- | :---- |
| s3:PutObject | arn:aws:s3:::\<YOUR\_BUCKET\_NAME\>/\* | Required for the Upload class to place the final object. This permission is used for both single-part and multipart uploads. |
| s3:AbortMultipartUpload | arn:aws:s3:::\<YOUR\_BUCKET\_NAME\>/\* | Allows the Upload class to clean up failed or cancelled uploads, preventing orphaned parts and avoiding unnecessary storage costs. |
| s3:ListMultipartUploadParts | arn:aws:s3:::\<YOUR\_BUCKET\_NAME\>/\* | Used by the Upload class to manage in-progress multipart uploads, potentially for resuming or verification. |
| s3:ListBucketMultipartUploads | arn:aws:s3:::\<YOUR\_BUCKET\_NAME\> | Allows the application to list all in-progress multipart uploads within the bucket, which can be useful for advanced recovery or cleanup logic. |

### **Logging and Monitoring**

Effective logging is crucial for debugging and operational visibility. The application should log key events:

* Start and end of the export process.  
* Confirmation of successful completion, including the final S3 object location.  
* Any errors encountered, with full stack traces.  
* Progress updates. The httpUploadProgress event on the @aws-sdk/lib-storage Upload class is invaluable for monitoring the progress of large uploads, providing data on bytes loaded and total bytes.23

In a cloud environment, these logs should be structured (e.g., as JSON) and sent to a centralized logging service like Amazon CloudWatch Logs for analysis and alerting.

### **Deployment Considerations**

The export application should be packaged into a container (e.g., using Docker) for portability and consistent deployments. This container can then be run in various AWS environments:

* **AWS Fargate or Amazon ECS:** Ideal for long-running or scheduled batch jobs. Fargate provides a serverless container experience, removing the need to manage underlying EC2 instances.  
* **Amazon EC2:** Provides maximum control over the compute environment but requires more management overhead.  
* **AWS Lambda:** Suitable for smaller exports. However, Lambda has a maximum execution timeout of 15 minutes, which may be insufficient for exporting extremely large tables from the database.26 If an export is expected to take longer, a container-based approach is more appropriate.

## **Advanced Concepts and Future Enhancements**

The core architecture presented is robust and scalable for many use cases, but it can be adapted and enhanced for specific requirements. This section explores a key performance trade-off and discusses strategies for extreme-scale scenarios.

### **High-Performance Alternative: PostgreSQL COPY Command**

For scenarios where maximum data transfer speed is the absolute priority and in-application data transformation is not required, PostgreSQL's native COPY command offers a significant performance advantage. The pg-copy-streams library provides a Node.js stream interface for this command.27

The command COPY (SELECT...) TO STDOUT WITH (FORMAT CSV, HEADER) instructs the PostgreSQL server itself to perform the CSV formatting. This process is highly optimized within the database engine and is almost always faster than fetching rows and formatting them in the application layer. The pg-copy-streams library then exposes the resulting raw CSV data as a Readable stream.

This presents a classic engineering trade-off between performance and flexibility.

* **pg-copy-streams (COPY) Approach:**  
  * **Pros:** Highest possible performance, as CSV generation is offloaded to the optimized database engine.  
  * **Cons:** Less flexible. The data is received as raw CSV text, bypassing the opportunity for row-by-row object manipulation in Node.js. All transformations must be achievable via SQL.  
* **Manual Pagination \+ @fast-csv/format Approach (our primary solution):**  
  * **Pros:** Highly flexible. The application receives JavaScript objects, allowing for complex, programmatic transformations, data enrichment, and validation before CSV formatting.  
  * **Cons:** Lower performance than COPY, as data serialization and transformation occur in the Node.js process.

The choice depends entirely on the requirements. For a pure, high-speed data dump, the COPY method is superior. For creating a curated data product that requires application-level logic, the object-processing approach provides the necessary flexibility. An expert-level system design requires evaluating this trade-off and selecting the appropriate tool for the job.

### **Handling Enormous Tables: Parallelization**

For tables containing billions of rows, even a single, highly optimized export process may not meet the required time constraints. In such extreme-scale scenarios, the workload can be parallelized. The core strategy involves partitioning the source table and running multiple instances of the export pipeline concurrently.

A common partitioning strategy is to divide the table by a numeric primary key range. For example, if a table has 1 billion rows, four parallel processes could be launched, with each responsible for a 250-million-row segment:

* Process 1: WHERE id BETWEEN 1 AND 250000000  
* Process 2: WHERE id BETWEEN 250000001 AND 500000000  
* And so on.

Each process would execute the full paginated pipeline, writing its segment to a separate S3 object (e.g., export\_part\_1.csv, export\_part\_2.csv, etc.). These parts can then be consumed by downstream analytical systems like Amazon Athena or Redshift Spectrum, which can read from multiple files as if they were a single table.

### **Adaptability to Other Databases and Formats**

The architectural pattern is highly adaptable. The three stages—source, transform, sink—are decoupled components. This means they can be swapped out to support different technologies without altering the core logic.

* **Changing the Database:** The manual PostgreSQL pagination logic could be replaced with a similar paginated fetching function for another database, such as MySQL or MongoDB.  
* **Changing the Output Format:** The @fast-csv/format transform stream could be replaced with a different formatter. For example, to create a JSON Lines file, one could use a simple Transform stream that calls JSON.stringify(row) \+ '\\n' for each object.28 For analytical formats like Apache Parquet, a library like  
  parquetjs could be used to create the appropriate transform stream.

This demonstrates that the pattern itself is more valuable than any single implementation. It provides a robust framework for building a wide variety of high-throughput data engineering solutions in the Node.js ecosystem.

## **Conclusion**

This report has detailed the architecture and implementation of a scalable, memory-efficient pipeline for exporting large datasets from a PostgreSQL database to Amazon S3 as a CSV file. By combining efficient, cursor-based pagination with a streaming approach for data transformation and uploading, the solution avoids the common pitfalls of in-memory processing and remains performant and stable regardless of the data volume.

The success of this architecture rests on a few core principles:

* **Paginate Reads, Stream Writes:** Data is fetched from the database in manageable pages, while the transformation and upload processes are fully streamed, ensuring a low and constant memory footprint.  
* **Use Manual Cursors for Reads:** Implementing cursor-based pagination with manual queries bypasses the performance bottlenecks of traditional offset-based pagination, enabling efficient reading of deep data.  
* **Leverage High-Level Abstractions for Uploads:** The @aws-sdk/lib-storage Upload class handles the complexities of S3 multipart uploads, providing a simple, resilient, and performant interface for streaming data to the cloud.  
* **Orchestrate with stream.pipeline:** The modern stream.promises.pipeline API is the cornerstone of the application's resilience for the streaming portion, providing centralized error handling and guaranteed resource cleanup.

The provided implementation is not merely a one-off script but a foundational pattern for building reliable data engineering services in Node.js. The decoupled nature of the source, transform, and sink stages allows for easy adaptation to different databases, output formats, and business requirements. By understanding the principles behind each architectural choice—from the performance theory of database cursors to the backpressure dynamics of stream pipelines—engineers can confidently build, deploy, and scale robust data solutions capable of meeting the demands of modern data-intensive applications.

#### **Works cited**

1. Streaming Millions of Rows from Postgres to AWS S3 | by Swati Yadav | OYOTech, accessed August 3, 2025, [https://tech.oyorooms.com/streaming-millions-of-rows-from-postgres-to-aws-s3-bcfbe859c0e5](https://tech.oyorooms.com/streaming-millions-of-rows-from-postgres-to-aws-s3-bcfbe859c0e5)  
2. Understanding Streams in Node.js: A Practical Guide | by Nirmal Kumar \- Medium, accessed August 3, 2025, [https://medium.com/@nirmalkumar30/understanding-streams-in-node-js-a-practical-guide-da4196b5f520](https://medium.com/@nirmalkumar30/understanding-streams-in-node-js-a-practical-guide-da4196b5f520)  
3. Understanding Streams in Node.js \- NodeSource, accessed August 3, 2025, [https://nodesource.com/blog/understanding-streams-in-nodejs](https://nodesource.com/blog/understanding-streams-in-nodejs)  
4. Use Streams to Extract, Transform, and Load CSV Data | HeyNode, accessed August 3, 2025, [https://heynode.com/tutorial/use-streams-extract-transform-and-load-csv-data/](https://heynode.com/tutorial/use-streams-extract-transform-and-load-csv-data/)  
5. Node.js Streams with TypeScript \- SitePoint, accessed August 3, 2025, [https://www.sitepoint.com/node-js-streams-with-typescript/](https://www.sitepoint.com/node-js-streams-with-typescript/)  
6. Error handling with node.js streams \- Stack Overflow, accessed August 3, 2025, [https://stackoverflow.com/questions/21771220/error-handling-with-node-js-streams](https://stackoverflow.com/questions/21771220/error-handling-with-node-js-streams)  
7. Catching errors in NodeJS stream pipes | by MrManafon | Homullus ..., accessed August 3, 2025, [https://medium.com/homullus/catching-errors-in-nodejs-stream-pipes-3ba9d258cc68](https://medium.com/homullus/catching-errors-in-nodejs-stream-pipes-3ba9d258cc68)  
8. Stream | Node.js v24.5.0 Documentation, accessed August 3, 2025, [https://nodejs.org/api/stream.html](https://nodejs.org/api/stream.html)  
9. Stream | Node.js v24.5.0 Documentation, accessed August 3, 2025, [https://nodejs.org/api/stream.html\#stream\_stream\_pipeline\_source\_transforms\_destination\_callback](https://nodejs.org/api/stream.html#stream_stream_pipeline_source_transforms_destination_callback)  
10. Efficient Pagination with PostgreSQL Using Cursors | by Ini Etienam \- Medium, accessed August 3, 2025, [https://medium.com/@ietienam/efficient-pagination-with-postgresql-using-cursors-83e827148118](https://medium.com/@ietienam/efficient-pagination-with-postgresql-using-cursors-83e827148118)  
11. Understanding Offset and Cursor-Based Pagination in Node.js \- AppSignal Blog, accessed August 3, 2025, [https://blog.appsignal.com/2024/05/15/understanding-offset-and-cursor-based-pagination-in-nodejs.html](https://blog.appsignal.com/2024/05/15/understanding-offset-and-cursor-based-pagination-in-nodejs.html)  
12. Understanding Cursor Pagination and Why It's So Fast (Deep Dive) \- Milan Jovanović, accessed August 3, 2025, [https://www.milanjovanovic.tech/blog/understanding-cursor-pagination-and-why-its-so-fast-deep-dive](https://www.milanjovanovic.tech/blog/understanding-cursor-pagination-and-why-its-so-fast-deep-dive)  
13. Comparing Limit-Offset and Cursor Pagination \- DEV Community, accessed August 3, 2025, [https://dev.to/jacktt/comparing-limit-offset-and-cursor-pagination-1n81](https://dev.to/jacktt/comparing-limit-offset-and-cursor-pagination-1n81)  
14. Cursor-based vs. Offset Pagination for an Infinite Scroll Book Library – Which is Better?, accessed August 3, 2025, [https://www.reddit.com/r/dotnet/comments/1jxlu89/cursorbased\_vs\_offset\_pagination\_for\_an\_infinite/](https://www.reddit.com/r/dotnet/comments/1jxlu89/cursorbased_vs_offset_pagination_for_an_infinite/)  
15. Quick Examples | Fast-CSV \- C2FO, accessed August 3, 2025, [https://c2fo.github.io/fast-csv/docs/introduction/example/](https://c2fo.github.io/fast-csv/docs/introduction/example/)  
16. fast-csv for CSV files \- DEV Community, accessed August 3, 2025, [https://dev.to/chriscmuir/fast-csv-for-csv-files-21a1](https://dev.to/chriscmuir/fast-csv-for-csv-files-21a1)  
17. Examples | Fast-CSV \- C2FO, accessed August 3, 2025, [https://c2fo.github.io/fast-csv/docs/formatting/examples/](https://c2fo.github.io/fast-csv/docs/formatting/examples/)  
18. fast-csv/documentation/docs/formatting/examples.mdx at main \- GitHub, accessed August 3, 2025, [https://github.com/C2FO/fast-csv/blob/master/documentation/docs/formatting/examples.mdx](https://github.com/C2FO/fast-csv/blob/master/documentation/docs/formatting/examples.mdx)  
19. Multipart Amazon S3 uploads using AWS SDK for Swift, accessed August 3, 2025, [https://docs.aws.amazon.com/sdk-for-swift/latest/developer-guide/using-multipart-uploads.html](https://docs.aws.amazon.com/sdk-for-swift/latest/developer-guide/using-multipart-uploads.html)  
20. CreateMultipartUploadCommand \- AWS SDK for JavaScript v3, accessed August 3, 2025, [https://docs.aws.amazon.com/goto/SdkForJavaScriptV3/s3-2006-03-01/CreateMultipartUpload](https://docs.aws.amazon.com/goto/SdkForJavaScriptV3/s3-2006-03-01/CreateMultipartUpload)  
21. All about uploading large amounts of data to S3 in Node.js | by Branden Lee | Medium, accessed August 3, 2025, [https://medium.com/@bdleecs95/all-about-uploading-large-amounts-of-data-to-s3-in-node-js-a1b17a98e9f7](https://medium.com/@bdleecs95/all-about-uploading-large-amounts-of-data-to-s3-in-node-js-a1b17a98e9f7)  
22. aws-sdk/client-s3, accessed August 3, 2025, [https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/CompleteMultipartUploadCommand/](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-s3/Class/CompleteMultipartUploadCommand/)  
23. file-upload.ts \- aws/aws-sdk-js-v3 \- GitHub, accessed August 3, 2025, [https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/example-code/file-upload.ts](https://github.com/aws/aws-sdk-js-v3/blob/main/lib/lib-storage/example-code/file-upload.ts)  
24. How to Use AWS S3 in NodeJS | Mohammad Faisal \- Blog ..., accessed August 3, 2025, [https://www.mdfaisal.com/blog/how-to-use-aws-s3-in-nodejs](https://www.mdfaisal.com/blog/how-to-use-aws-s3-in-nodejs)  
25. How to access a PostgreSQL from Node.js application? \- OVHcloud, accessed August 3, 2025, [https://us.ovhcloud.com/community/tutorials/how-to-acces-pg-nodejs-app/](https://us.ovhcloud.com/community/tutorials/how-to-acces-pg-nodejs-app/)  
26. Exporting Data from RDS Postgres to S3 with NodeJs & Lambda \- Tony Tannous \- Medium, accessed August 3, 2025, [https://anthony-f-tannous.medium.com/exporting-data-from-rds-postgres-to-s3-with-nodejs-lambda-f37b4dac578f](https://anthony-f-tannous.medium.com/exporting-data-from-rds-postgres-to-s3-with-nodejs-lambda-f37b4dac578f)  
27. How to export a Postgresql table as CSV with Node.js Streams | by Geoblink Tech blogger, accessed August 3, 2025, [https://medium.com/geoblinktech/how-to-export-a-postgresql-table-as-csv-with-node-js-streams-578d53434e80](https://medium.com/geoblinktech/how-to-export-a-postgresql-table-as-csv-with-node-js-streams-578d53434e80)  
28. streamin data from postgresql database to s3 · GitHub, accessed August 3, 2025, [https://gist.github.com/maksimr/72f274a8bd69ba10ad1a6ec01f07e8f3](https://gist.github.com/maksimr/72f274a8bd69ba10ad1a6ec01f07e8f3)  
29. GraphQL Cursor Pagination with PostgreSQL | Hive, accessed August 3, 2025, [https://the-guild.dev/graphql/hive/blog/graphql-cursor-pagination-with-postgresql](https://the-guild.dev/graphql/hive/blog/graphql-cursor-pagination-with-postgresql)  
30. Node library for easily implementing Relay cursor pagination with Knex queries \- Reddit, accessed August 3, 2025, [https://www.reddit.com/r/node/comments/1c27oai/node\_library\_for\_easily\_implementing\_relay\_cursor/](https://www.reddit.com/r/node/comments/1c27oai/node_library_for_easily_implementing_relay_cursor/)  
31. Node.js Streams in Action with the AWS CDK, accessed August 3, 2025, [https://www.dennisokeeffe.com/blog/2024-07-14-nodejs-streams-in-action-with-the-aws-cdk](https://www.dennisokeeffe.com/blog/2024-07-14-nodejs-streams-in-action-with-the-aws-cdk)  
32. Stream File Uploads to S3 Object Storage and Reduce Costs \- Austin Gil, accessed August 3, 2025, [https://austingil.com/upload-to-s3/](https://austingil.com/upload-to-s3/)