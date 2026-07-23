# 0004 — File storage (AWS S3 presigned URLs)

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Fillando team

## Context

Products and related entities need image/media uploads. The backend should not
proxy large binary payloads, and stored media should be servable directly.

## Decision

We will store uploaded files in **AWS S3**. Uploads use **presigned URLs**: the
backend issues a time-limited signed URL, the client uploads directly to S3, and
the object is served from a configured public URL. Supported formats and entity
types are defined in the FRD.

## Consequences

- The backend stays lightweight (no binary proxying); uploads scale with S3.
- AWS credentials, region, bucket, and public URL are environment config.
- Presigned-URL expiry and content-type/size validation must be enforced.
