export const API_UPLOAD_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

// Keep request admission at or below the scanner's process concurrency so a
// request cannot consume a complete memory buffer only to fail at that later gate.
export const API_UPLOAD_MAX_CONCURRENT_REQUESTS = 4;
