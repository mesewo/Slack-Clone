export const MAX_UPLOAD_SIZE: number;
export function performDirectUpload<T>(
  file: { name: string; type: string; size: number },
  dependencies: {
    presign: (request: { filename: string; content_type: string; size_bytes: number }) => Promise<{
      session_id: string; upload_url: string; filename: string; content_type: string; size_bytes: number;
    }>;
    put: (url: string, file: File, contentType: string) => Promise<{ ok: boolean; status: number }>;
    complete: (sessionId: string) => Promise<T>;
  },
): Promise<T>;
