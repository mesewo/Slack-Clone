export const MAX_UPLOAD_SIZE = 100 * 1024 * 1024;

function failure(stage, detail, cause) {
  return new Error(`Upload failed during ${stage}: ${detail}`, { cause });
}

function apiDetail(error) {
  const status = error?.response?.status;
  const message = error?.response?.data?.error ?? error?.response?.data?.message;
  const safeMessage = typeof message === "string" ? message.slice(0, 180) : "request was rejected";
  return `${status ? `HTTP ${status}: ` : ""}${safeMessage}`;
}

/** Direct upload orchestration is dependency-injected so its failure stages are testable. */
export async function performDirectUpload(file, { presign, put, complete }) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE) {
    throw failure("validation", "files must be between 1 byte and 100 MiB");
  }
  const contentType = file.type || "application/octet-stream";
  let session;
  try {
    session = await presign({ filename: file.name, content_type: contentType, size_bytes: file.size });
  } catch (error) {
    throw failure("presign", apiDetail(error), error);
  }
  if (!session?.session_id || !session?.upload_url || session.filename !== file.name ||
      session.content_type !== contentType || session.size_bytes !== file.size) {
    throw failure("presign validation", "the server returned mismatched upload metadata");
  }

  let response;
  try {
    response = await put(session.upload_url, file, contentType);
  } catch (error) {
    let origin = "the configured object storage endpoint";
    try {
      origin = new URL(session.upload_url).origin;
    } catch {
      throw failure("storage URL validation", "the presigned URL is invalid");
    }
    const cause = error instanceof TypeError
      ? "the browser received no response (possible CORS preflight, DNS, TLS, or connectivity failure)"
      : "the browser request failed before a response was received";
    throw failure("storage network request", `${cause} at ${origin}; inspect OPTIONS and PUT in the browser Network panel`, error);
  }
  if (!response.ok) {
    throw failure("storage PUT", `object storage returned HTTP ${response.status}`);
  }
  try {
    return await complete(session.session_id);
  } catch (error) {
    throw failure("completion", `object storage accepted the file, but the API did not register its attachment (${apiDetail(error)}). Do not retry automatically; check attachment state first.`, error);
  }
}
