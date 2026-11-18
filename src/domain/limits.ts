/** Upload limits shared by the browser and the server. */

/** One request must stay under Netlify's ~6 MB body limit, with room for form overhead. */
export const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
